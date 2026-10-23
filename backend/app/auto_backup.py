"""自动定时备份：用 SQLite Backup API 生成一致性快照，保留最近 10 份。

快照写到数据库同目录的 backups/ 下（容器内 /data/backups，即宿主机 ./data/backups），
文件名 app-YYYY-MM-DD.db（按北京时间命名）。后台线程每分钟检查：到达设定时间（北京时间，
默认 03:00，环境变量 BACKUP_TIME=HH:MM）且距最近一份快照已满设定周期（默认 1 天，
环境变量 BACKUP_INTERVAL_DAYS=N）时生成；当天/该周期已存在快照则跳过，因此启动补做与
进程重启均幂等。传输到异地（飞牛同步/网盘）应同步 backups/ 目录里的静态快照，而非运行中的 app.db。
"""

import logging
import os
import re
import sqlite3
import threading
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .database import DATABASE_URL

logger = logging.getLogger("lifejournal.backup")

KEEP = 10  # 快照保留份数
CHECK_INTERVAL = 60  # 检查间隔（秒）
BJT = timezone(timedelta(hours=8))  # 北京时间（命名与判定不依赖容器时区）

# 备份时间（北京时间 HH:MM，默认凌晨 3 点）
BACKUP_TIME = os.environ.get("BACKUP_TIME", "03:00").strip()
# 备份周期：距最近一份快照满 N 天才生成下一份（默认每天）
try:
    BACKUP_INTERVAL_DAYS = max(1, int(os.environ.get("BACKUP_INTERVAL_DAYS", "1")))
except ValueError:
    logger.warning("BACKUP_INTERVAL_DAYS 无效，回退为每天备份")
    BACKUP_INTERVAL_DAYS = 1


def _parse_backup_time() -> tuple[int, int]:
    m = re.match(r"^(\d{1,2}):(\d{2})$", BACKUP_TIME)
    if m and int(m.group(1)) <= 23 and int(m.group(2)) <= 59:
        return int(m.group(1)), int(m.group(2))
    logger.warning("BACKUP_TIME 格式无效（应为 HH:MM）：%r，回退 03:00", BACKUP_TIME)
    return 3, 0


def _db_path():
    """解析 sqlite URL 中的本地文件路径；非 SQLite 返回 None（跳过备份）。"""
    if not DATABASE_URL.startswith("sqlite:///"):
        return None
    return DATABASE_URL[len("sqlite:///"):]


def _backup_dir(db_path: str) -> Path:
    return Path(db_path).resolve().parent / "backups"


def _prune(backup_dir: Path) -> None:
    """按文件名（日期序）清理，只保留最近 KEEP 份。"""
    files = sorted(backup_dir.glob("app-????-??-??.db"))
    for old in files[:-KEEP]:
        try:
            old.unlink()
            logger.info("清理过期备份：%s", old)
        except OSError:
            logger.warning("清理过期备份失败：%s", old)


def backup_once(db_path: str, date_str: str) -> bool:
    """生成当天一致性快照（已存在则跳过），返回是否新生成。"""
    backup_dir = _backup_dir(db_path)
    backup_dir.mkdir(parents=True, exist_ok=True)
    target = backup_dir / f"app-{date_str}.db"
    if target.exists():
        return False
    tmp = backup_dir / f"app-{date_str}.db.tmp"
    try:
        src = sqlite3.connect(db_path, timeout=10)
        dst = sqlite3.connect(str(tmp))
        try:
            # SQLite Backup API：事务一致的在线快照，无需停服
            src.backup(dst)
        finally:
            dst.close()
            src.close()
        # 先写临时文件再原子改名，避免同步任务抓到半成品
        tmp.replace(target)
        logger.info("备份完成：%s", target)
        _prune(backup_dir)
        return True
    except Exception:
        logger.exception("备份失败：%s", target)
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        return False


def _latest_backup_date(backup_dir: Path):
    """返回现有快照中的最新日期（按文件名解析），无快照返回 None。"""
    dates = []
    for f in backup_dir.glob("app-????-??-??.db"):
        try:
            dates.append(date.fromisoformat(f.name[4:-3]))
        except ValueError:
            continue
    return max(dates) if dates else None


def _loop() -> None:
    db_path = _db_path()
    if not db_path:
        logger.info("非 SQLite 数据库，自动备份未启用")
        return
    if not os.path.exists(db_path):
        logger.warning("数据库文件不存在，自动备份未启用：%s", db_path)
        return
    at_hour, at_minute = _parse_backup_time()
    while True:
        try:
            now_bj = datetime.now(BJT)
            # 过了设定时间，且距最近一份快照已满周期 → 生成（重复检查幂等）
            due = (now_bj.hour, now_bj.minute) >= (at_hour, at_minute)
            latest = _latest_backup_date(_backup_dir(db_path))
            interval_ok = latest is None or (now_bj.date() - latest).days >= BACKUP_INTERVAL_DAYS
            if due and interval_ok:
                backup_once(db_path, now_bj.strftime("%Y-%m-%d"))
        except Exception:
            logger.exception("定时备份检查异常")
        time.sleep(CHECK_INTERVAL)


def start_backup_thread() -> None:
    threading.Thread(target=_loop, name="auto-backup", daemon=True).start()
    logger.info(
        "自动备份已启动：北京时间 %s 后每 %d 天生成快照至 backups/，保留 %d 份",
        BACKUP_TIME, BACKUP_INTERVAL_DAYS, KEEP,
    )
