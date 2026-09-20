from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_admin, get_current_user
from ..models import JournalEntry, Todo, User
from ..schemas import ImportRequest

router = APIRouter(prefix="/api/backup", tags=["backup"])


def _entry_dict(e: JournalEntry) -> dict:
    return {
        "id": e.id,
        "title": e.title,
        "content": e.content,
        "plain_text": e.plain_text,
        "mood": e.mood,
        "tags": e.tags or [],
        "entry_type": e.entry_type,
        "is_pinned": e.is_pinned,
        "date": e.date,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "updated_at": e.updated_at.isoformat() if e.updated_at else None,
    }


def _todo_dict(t: Todo) -> dict:
    return {
        "id": t.id,
        "entry_id": t.entry_id,
        "title": t.title,
        "description": t.description,
        "priority": t.priority,
        "status": t.status,
        "due_date": t.due_date,
        "remind_at": t.remind_at.isoformat() if t.remind_at else None,
        "synced_to_calendar": t.synced_to_calendar,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def _dt(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value)


@router.get("/export")
def export_data(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entries = db.query(JournalEntry).filter(JournalEntry.owner_id == user.id).all()
    todos = db.query(Todo).filter(Todo.owner_id == user.id).all()
    return {
        "version": 1,
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "entries": [_entry_dict(e) for e in entries],
        "todos": [_todo_dict(t) for t in todos],
    }


@router.post("/import")
def import_data(
    body: ImportRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # 覆盖导入：先清空当前用户所有数据，再按备份恢复。
    # 注意保留原时间戳，但不保留原 id（id 全局唯一，可能与其它用户冲突），
    # 待办的 entry_id 关联通过新 id 重新映射。
    db.query(Todo).filter(Todo.owner_id == user.id).delete(synchronize_session=False)
    db.query(JournalEntry).filter(JournalEntry.owner_id == user.id).delete(
        synchronize_session=False
    )
    pending: list[tuple[int | None, JournalEntry]] = []
    for e in body.entries:
        obj = JournalEntry(
            owner_id=user.id,
            title=e.get("title") or "无标题",
            content=e.get("content") or "",
            plain_text=e.get("plain_text") or "",
            mood=e.get("mood"),
            tags=e.get("tags") or [],
            entry_type=e.get("entry_type") or "daily",
            is_pinned=bool(e.get("is_pinned")),
            date=e.get("date"),
            created_at=_dt(e.get("created_at")),
            updated_at=_dt(e.get("updated_at")),
        )
        db.add(obj)
        pending.append((e.get("id"), obj))
    db.flush()  # 物化新 entry id，供待办的 entry_id 重映射
    id_map = {old: obj.id for old, obj in pending if old is not None}
    for t in body.todos:
        old_entry_id = t.get("entry_id")
        db.add(
            Todo(
                owner_id=user.id,
                entry_id=id_map.get(old_entry_id) if old_entry_id is not None else None,
                title=t.get("title") or "",
                description=t.get("description"),
                priority=t.get("priority") or 2,
                status=t.get("status") or "pending",
                due_date=t.get("due_date"),
                remind_at=_dt(t.get("remind_at")),
                synced_to_calendar=bool(t.get("synced_to_calendar")),
                completed_at=_dt(t.get("completed_at")),
                created_at=_dt(t.get("created_at")),
            )
        )
    db.commit()
    return {"ok": True, "entries": len(body.entries), "todos": len(body.todos)}


@router.delete("/all")
def clear_all(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """管理员专用：清空所有用户的日记与待办数据（保留账号）"""
    db.query(Todo).delete(synchronize_session=False)
    db.query(JournalEntry).delete(synchronize_session=False)
    db.commit()
    return {"ok": True}