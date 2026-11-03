"""AI 助手配置：设置页保存的数据库值优先，.env 环境变量兜底。

键名约定（settings 表）：ai_base_url / ai_api_key / ai_model。
任何字段读取为空（未保存或保存为空）时回退 .env 对应变量，
因此设置页保存空值 = 恢复服务器 .env 配置；DELETE 接口可一键清除全部覆盖。
"""

import os

from .database import SessionLocal
from .models import Setting

DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"

# 设置项 key → (env 变量名, 默认值)
_FIELDS = {
    "base_url": ("ai_base_url", "AI_BASE_URL", DEFAULT_BASE_URL),
    "api_key": ("ai_api_key", "AI_API_KEY", ""),
    "model": ("ai_model", "AI_MODEL", DEFAULT_MODEL),
}


def get_ai_config(db=None) -> dict:
    """返回生效配置 {base_url, api_key, model, source}。
    source: db=全部来自设置页 / env=全部来自 .env / mixed=混合。"""
    own = db is None
    if own:
        db = SessionLocal()
    try:
        rows = {
            r.key: r.value or ""
            for r in db.query(Setting)
            .filter(Setting.key.in_([f[0] for f in _FIELDS.values()]))
            .all()
        }
    finally:
        if own:
            db.close()

    cfg: dict = {}
    sources = set()
    for field, (db_key, env_name, default) in _FIELDS.items():
        saved = rows.get(db_key)
        if saved is not None and saved.strip():
            cfg[field] = saved.strip().rstrip("/") if field == "base_url" else saved.strip()
            sources.add("db")
        else:
            env_val = os.environ.get(env_name, "").strip()
            cfg[field] = (env_val or default).rstrip("/") if field == "base_url" else (env_val or default)
            sources.add("env")
    cfg["source"] = sources.pop() if len(sources) == 1 else "mixed"
    return cfg


def save_ai_config(db, base_url: str, api_key: str, model: str) -> None:
    """全量保存三个字段（空白值也落库，表示显式回退 .env）。"""
    values = {
        "ai_base_url": (base_url or "").strip().rstrip("/"),
        "ai_api_key": (api_key or "").strip(),
        "ai_model": (model or "").strip(),
    }
    for key, value in values.items():
        row = db.get(Setting, key)
        if row:
            row.value = value
        else:
            db.add(Setting(key=key, value=value))
    db.commit()


def clear_ai_config(db) -> None:
    """删除设置页保存的 AI 配置，全部回退 .env。"""
    db.query(Setting).filter(
        Setting.key.in_([f[0] for f in _FIELDS.values()])
    ).delete(synchronize_session=False)
    db.commit()
