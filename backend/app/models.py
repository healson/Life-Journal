from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import relationship

from .database import Base


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=utcnow)

    entries = relationship("JournalEntry", back_populates="owner", cascade="all, delete-orphan")
    todos = relationship("Todo", back_populates="owner", cascade="all, delete-orphan")


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False, default="无标题")
    content = Column(String, nullable=False, default="")       # Markdown 原文
    plain_text = Column(String, nullable=False, default="")    # 纯文本预览
    mood = Column(String(32), nullable=True)
    tags = Column(JSON, nullable=False, default=list)          # list[str]
    entry_type = Column(String(32), nullable=False, default="daily")  # daily/inspiration/behavior
    is_pinned = Column(Boolean, nullable=False, default=False)
    date = Column(String(10), nullable=True)                   # 逻辑日期 YYYY-MM-DD（可空）
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    owner = relationship("User", back_populates="entries")


class Todo(Base):
    __tablename__ = "todos"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    entry_id = Column(Integer, nullable=True, index=True)      # 关联日记（转待办）
    title = Column(String(255), nullable=False)
    description = Column(String(512), nullable=True)
    priority = Column(Integer, nullable=False, default=2)      # 1高 2中 3低
    status = Column(String(16), nullable=False, default="pending")  # pending/in_progress/done
    due_date = Column(String(10), nullable=True)               # YYYY-MM-DD
    remind_at = Column(DateTime, nullable=True)
    synced_to_calendar = Column(Boolean, nullable=False, default=False)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    owner = relationship("User", back_populates="todos")
