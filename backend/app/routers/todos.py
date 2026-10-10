from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import auth as auth_mod
from ..database import get_db
from ..deps import get_current_user
from ..models import Todo, User
from ..schemas import TodoCreate, TodoOut, TodoUpdate

router = APIRouter(prefix="/api/todos", tags=["todos"])


def _get_owned_todo(db: Session, user: User, todo_id: int) -> Todo:
    todo = db.query(Todo).filter(Todo.id == todo_id, Todo.owner_id == user.id).first()
    if todo is None:
        raise HTTPException(status_code=404, detail="待办不存在")
    return todo


@router.get("", response_model=list[TodoOut])
def list_todos(
    status_: Optional[str] = Query(None, alias="status"),
    priority: Optional[int] = None,
    due_from: Optional[str] = None,
    due_to: Optional[str] = None,
    entry_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(Todo).filter(Todo.owner_id == user.id)
    if status_:
        query = query.filter(Todo.status == status_)
    if priority is not None:
        query = query.filter(Todo.priority == priority)
    if due_from:
        query = query.filter(Todo.due_date >= due_from)
    if due_to:
        query = query.filter(Todo.due_date <= due_to)
    if entry_id is not None:
        query = query.filter(Todo.entry_id == entry_id)
    rows = query.order_by(Todo.created_at.desc()).all()
    return rows


@router.post("", response_model=TodoOut, status_code=status.HTTP_201_CREATED)
def create_todo(
    body: TodoCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    todo = Todo(owner_id=user.id, **body.model_dump())
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


@router.put("/{todo_id}", response_model=TodoOut)
def update_todo(
    todo_id: int,
    body: TodoUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    todo = _get_owned_todo(db, user, todo_id)
    data = body.model_dump(exclude_unset=True)
    if "status" in data:
        from ..models import utcnow
        todo.status = data["status"]
        todo.completed_at = utcnow() if data["status"] == "done" else None
        del data["status"]
    for key, value in data.items():
        setattr(todo, key, value)
    db.commit()
    db.refresh(todo)
    return todo


@router.delete("/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_todo(
    todo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    todo = _get_owned_todo(db, user, todo_id)
    db.delete(todo)
    db.commit()
    return None


@router.post("/{todo_id}/complete", response_model=TodoOut)
def complete_todo(
    todo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from ..models import utcnow
    todo = _get_owned_todo(db, user, todo_id)
    if todo.status == "done":
        todo.status = "pending"
        todo.completed_at = None
    else:
        todo.status = "done"
        todo.completed_at = utcnow()
    db.commit()
    db.refresh(todo)
    return todo


# ── ICS 日历订阅 ──

_PRIORITY_NAMES = {1: "高", 2: "中", 3: "低"}


def _ics_escape(s: str) -> str:
    """RFC 5545 TEXT 转义：反斜杠、分号、逗号、换行。"""
    return (
        s.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _ics_fold(line: str) -> str:
    """RFC 5545 折行：每行不超过 75 字节，续行以单个空格开头，且不在 UTF-8 多字节字符中间截断。"""
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return line
    parts = []
    start, limit = 0, 75
    while start < len(raw):
        end = min(start + limit, len(raw))
        while end < len(raw) and (raw[end] & 0xC0) == 0x80:
            end -= 1
        parts.append(raw[start:end].decode("utf-8"))
        start, limit = end, 74
    return "\r\n ".join(parts)


def _ics_stamp_utc(dt: datetime) -> str:
    """DTSTAMP 用 UTC：created_at 由服务端 utcnow() 生成，naive 即 UTC 墙钟。"""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _build_ics(todos: list[Todo]) -> str:
    """把待办渲染为 ICS 日历：
    - 有提醒时间 → 提醒时刻的事件（附到点触发的 DISPLAY 闹钟）
    - 仅有截止日期 → 全天事件
    - 无日期 / 已完成 → 不进日历

    时区说明（SQLite 读出的时间均为 naive）：
    - remind_at 来自前端 datetime-local，是用户输入的本地墙上时间 → 用浮游时间
      （不带时区后缀），手机按设备时区渲染，所见即输入；带时区的入参则转 UTC 输出 Z。
    - created_at 是服务端 UTC 墙钟 → 当作 UTC 处理。"""
    now = datetime.now(timezone.utc)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Life Journal//Todo Calendar//CN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:人生记趣录·待办",
    ]
    for t in todos:
        if t.status == "done" or (t.remind_at is None and not t.due_date):
            continue
        dtstamp = _ics_stamp_utc(t.created_at or now)
        desc_parts = [f"优先级：{_PRIORITY_NAMES.get(t.priority, '中')}"]
        if t.description:
            desc_parts.append(t.description)

        lines += [
            "BEGIN:VEVENT",
            f"UID:todo-{t.id}@life-journal",
            f"DTSTAMP:{dtstamp}",
        ]
        if t.remind_at is not None:
            if t.remind_at.tzinfo is None:
                start = t.remind_at
                lines.append("DTSTART:" + start.strftime("%Y%m%dT%H%M%S"))
                lines.append("DTEND:" + (start + timedelta(minutes=30)).strftime("%Y%m%dT%H%M%S"))
            else:
                start = t.remind_at.astimezone(timezone.utc)
                lines.append("DTSTART:" + start.strftime("%Y%m%dT%H%M%SZ"))
                lines.append("DTEND:" + (start + timedelta(minutes=30)).strftime("%Y%m%dT%H%M%SZ"))
        else:
            lines.append(f"DTSTART;VALUE=DATE:{t.due_date.replace('-', '')}")
            due_end = datetime.strptime(t.due_date, "%Y-%m-%d").date() + timedelta(days=1)
            lines.append(f"DTEND;VALUE=DATE:{due_end.strftime('%Y%m%d')}")
        lines.append(f"SUMMARY:{_ics_escape(t.title)}")
        lines.append(f"DESCRIPTION:{_ics_escape(chr(10).join(desc_parts))}")
        if t.remind_at is not None:
            lines += [
                "BEGIN:VALARM",
                "ACTION:DISPLAY",
                f"DESCRIPTION:{_ics_escape(t.title)}",
                "TRIGGER:-PT0M",
                "END:VALARM",
            ]
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(_ics_fold(x) for x in lines) + "\r\n"


@router.get("/calendar.ics")
def calendar_ics(
    request: Request,
    token: Optional[str] = Query(None, description="JWT 访问令牌（日历客户端无法带请求头，用查询参数鉴权）"),
    db: Session = Depends(get_db),
):
    """ICS 订阅源：手机「日历 → 设置 → 添加订阅日历」粘贴此地址，
    带截止日期/提醒的待办会显示在系统日历中。也兼容 Authorization: Bearer 头。"""
    if not token:
        header = request.headers.get("Authorization", "")
        if header.lower().startswith("bearer "):
            token = header[7:].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="缺少访问令牌")
    try:
        # 订阅地址需长期有效（日历客户端周期性拉取），仅验签、不校验令牌有效期
        payload = auth_mod.decode_token(token, verify_exp=False)
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的令牌")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")

    todos = db.query(Todo).filter(Todo.owner_id == user.id).order_by(Todo.id).all()
    return Response(
        content=_build_ics(todos),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="life-journal.ics"'},
    )