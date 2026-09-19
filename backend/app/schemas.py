from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Auth ──
class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    username: str
    is_admin: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    is_admin: bool = False


class UserPasswordResetRequest(BaseModel):
    new_password: str = Field(min_length=6, max_length=128)


class UpdateUsernameRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)


# ── Backup ──
class ImportRequest(BaseModel):
    entries: list[dict] = []
    todos: list[dict] = []


# ── Journal Entry ──
class EntryBase(BaseModel):
    title: str = "无标题"
    content: str = ""
    plain_text: str = ""
    mood: Optional[str] = None
    tags: list[str] = []
    entry_type: str = "daily"
    is_pinned: bool = False
    date: Optional[str] = None  # YYYY-MM-DD


class EntryCreate(EntryBase):
    pass


class EntryUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    plain_text: Optional[str] = None
    mood: Optional[str] = None
    tags: Optional[list[str]] = None
    entry_type: Optional[str] = None
    is_pinned: Optional[bool] = None
    date: Optional[str] = None


class EntryOut(EntryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Todo ──
class TodoCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: int = 2
    status: str = "pending"
    due_date: Optional[str] = None
    remind_at: Optional[datetime] = None
    entry_id: Optional[int] = None


class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[int] = None
    status: Optional[str] = None
    due_date: Optional[str] = None
    remind_at: Optional[datetime] = None
    entry_id: Optional[int] = None


class TodoOut(BaseModel):
    id: int
    entry_id: Optional[int]
    title: str
    description: Optional[str]
    priority: int
    status: str
    due_date: Optional[str]
    remind_at: Optional[datetime]
    synced_to_calendar: bool
    completed_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}
