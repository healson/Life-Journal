from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import JournalEntry, User
from ..schemas import EntryCreate, EntryOut, EntryUpdate

router = APIRouter(prefix="/api/entries", tags=["entries"])


def _get_owned_entry(db: Session, user: User, entry_id: int) -> JournalEntry:
    entry = (
        db.query(JournalEntry)
        .filter(JournalEntry.id == entry_id, JournalEntry.owner_id == user.id)
        .first()
    )
    if entry is None:
        raise HTTPException(status_code=404, detail="日记不存在")
    return entry


@router.get("", response_model=list[EntryOut])
def list_entries(
    q: Optional[str] = None,
    tag: Optional[str] = None,
    mood: Optional[str] = None,
    entry_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    pinned: Optional[bool] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(JournalEntry).filter(JournalEntry.owner_id == user.id)

    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                JournalEntry.title.ilike(like),
                JournalEntry.content.ilike(like),
                JournalEntry.plain_text.ilike(like),
            )
        )
    if tag:
        # tags 是 JSON 数组，SQLite 用 LIKE 做简单包含匹配
        query = query.filter(JournalEntry.tags.contains(f'"{tag}"'))
    if mood:
        query = query.filter(JournalEntry.mood == mood)
    if entry_type:
        query = query.filter(JournalEntry.entry_type == entry_type)
    if date_from:
        query = query.filter(JournalEntry.date >= date_from)
    if date_to:
        query = query.filter(JournalEntry.date <= date_to)
    if pinned is not None:
        query = query.filter(JournalEntry.is_pinned == pinned)

    # 逻辑日期分组主要由前端完成，这里按最后更新时间倒序
    rows = query.order_by(JournalEntry.updated_at.desc()).all()
    return rows


@router.post("", response_model=EntryOut, status_code=status.HTTP_201_CREATED)
def create_entry(
    body: EntryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = JournalEntry(owner_id=user.id, **body.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/{entry_id}", response_model=EntryOut)
def get_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _get_owned_entry(db, user, entry_id)


@router.put("/{entry_id}", response_model=EntryOut)
def update_entry(
    entry_id: int,
    body: EntryUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = _get_owned_entry(db, user, entry_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(entry, key, value)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = _get_owned_entry(db, user, entry_id)
    db.delete(entry)
    db.commit()
    return None


@router.post("/{entry_id}/pin", response_model=EntryOut)
def toggle_pin(
    entry_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = _get_owned_entry(db, user, entry_id)
    entry.is_pinned = not entry.is_pinned
    db.commit()
    db.refresh(entry)
    return entry
