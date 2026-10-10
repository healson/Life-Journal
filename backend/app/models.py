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
    """时间列类型（名义上声明 UTC 语义）。

    【重要】SQLite 方言的 type_descriptor 会沿 MRO 把本类适配回原生 DATETIME，
    任何自定义 result_processor 都不会执行，读出的时间一律是 naive。
    当前全链路约定（时区由序列化层负责，勿在此处再加处理器）：
    - created_at / updated_at / completed_at：服务端 utcnow() 生成，存 UTC 墙钟，
      由 schemas 序列化时经 iso_utc() 输出带 Z 的 ISO 串；
    - remind_at：存前端 datetime-local 输入的本地墙上时间，原样存取，
      输出保持 naive 由前端按本地解析（ICS 订阅按浮游时间输出）。
    若未来更换数据库方言，需同步重新审视序列化层的时区处理。"""


def iso_utc(dt: datetime | None) -> str | None:
    """把 UTC 墙钟时间序列化为带 Z 的 ISO 串（naive 按 UTC 解释）。
    前端 new Date() 认识 Z 后缀，才能正确换算成本地时间显示。"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


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