"""服务器设置（管理员）：AI 助手 base_url / api_key / model 的在线配置。"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..ai_config import clear_ai_config, get_ai_config, save_ai_config
from ..database import get_db
from ..deps import get_current_admin
from ..models import User

router = APIRouter(prefix="/api/settings", tags=["settings"])


class AIConfigUpdate(BaseModel):
    base_url: str = Field(default="", max_length=512)
    api_key: str = Field(default="", max_length=512)
    model: str = Field(default="", max_length=128)


@router.get("/ai")
def read_ai_config(_: User = Depends(get_current_admin)):
    """当前生效的 AI 配置（含来源 db/env/mixed，供设置页展示）。"""
    return get_ai_config()


@router.put("/ai")
def update_ai_config(
    body: AIConfigUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """保存 AI 配置；字段留空表示回退到服务器 .env 值。立即生效，无需重启。"""
    save_ai_config(db, body.base_url, body.api_key, body.model)
    return get_ai_config(db)


@router.delete("/ai")
def reset_ai_config(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """清除设置页保存的 AI 配置，全部回退 .env。"""
    clear_ai_config(db)
    return get_ai_config(db)
