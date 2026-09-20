from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import relationship
from sqlalchemy.types import DateTime as SADateTime

from .database import Base


def utcnow():
    # 存的是 UTC（保留时区标记，序列化时自动带 +00:00）
    return datetime.now(timezone.utc)


class UTCDateTime(SADateTime):
    """读出时间列时统一补充 UTC 时区，保证前端 new Date() 按 UTC 正确换算本地时间。"""

    def result_processor(self, dialect, coltype):
        origin = getattr(SADateTime, "result_processor")(self, dialect, coltype)

        def process(value):
            value = origin(value) if origin else value
            if value is not None and value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
            return value

        return process


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    is_admin = Column(Boolean, nullable=False, default=False)
    created_at = Column(UTCDateTime, default=utcnow)

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
    lock_password_hash = Column(String(255), nullable=True)   # 单篇密码锁定（bcrypt hash，空=未锁定）
    date = Column(String(10), nullable=True)                   # 逻辑日期 YYYY-MM-DD（可空）
    created_at = Column(UTCDateTime, default=utcnow)
    updated_at = Column(UTCDateTime, default=utcnow, onupdate=utcnow)

    @property
    def is_locked(self) -> bool:
        return bool(self.lock_password_hash)

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
    remind_at = Column(UTCDateTime, nullable=True)
    synced_to_calendar = Column(Boolean, nullable=False, default=False)
    completed_at = Column(UTCDateTime, nullable=True)
    created_at = Column(UTCDateTime, default=utcnow)

    owner = relationship("User", back_populates="todos")