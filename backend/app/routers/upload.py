import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..database import BASE_DIR
from ..deps import get_current_user
from ..models import User

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

# 上传目录：默认 backend/uploads；Docker 下通过 UPLOAD_DIR 指向挂载卷 /data/uploads 以持久化
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", str(BASE_DIR / "uploads")))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


@router.post("")
def upload_image(
    file: UploadFile = File(...),
    _: User = Depends(get_current_user),
):
    """上传图片：仅允许图片类型，以 uuid 重命名存盘，返回可直接引用的 URL。"""
    suffix = Path((file.filename or "").lower()).suffix
    if suffix not in ALLOWED:
        raise HTTPException(status_code=400, detail="仅支持 png / jpg / jpeg / gif / webp 图片")
    name = f"{uuid.uuid4().hex}{suffix}"
    dest = UPLOAD_DIR / name
    with dest.open("wb") as f:
        f.write(file.file.read())
    return {"url": f"/api/uploads/{name}"}


@router.get("/{name}")
def get_upload(name: str):
    """公开读取图片（<img> 标签无法附带认证头，故不加鉴权）"""
    # 防目录穿越：只允许纯文件名
    safe = Path(name).name
    dest = UPLOAD_DIR / safe
    if not dest.is_file():
        raise HTTPException(status_code=404, detail="找不到图片")
    return FileResponse(dest)
