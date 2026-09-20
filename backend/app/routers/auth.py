from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import auth
from ..database import get_db
from ..deps import get_current_admin, get_current_user
from ..models import User
from ..schemas import (
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UpdateUsernameRequest,
    UserCreateRequest,
    UserOut,
    UserPasswordResetRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if auth.get_user_by_username(db, body.username):
        raise HTTPException(status_code=409, detail="用户名已存在")
    # 第一个注册用户自动成为管理员
    is_first = db.query(User).count() == 0
    user = User(
        username=body.username,
        hashed_password=auth.hash_password(body.password),
        is_admin=is_first,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = auth.create_access_token(user.id, user.username)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = auth.get_user_by_username(db, body.username)
    if not user or not auth.verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    token = auth.create_access_token(user.id, user.username)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    return current


@router.post("/change-password", response_model=dict)
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not auth.verify_password(body.old_password, current.hashed_password):
        raise HTTPException(status_code=400, detail="原密码错误")
    current.hashed_password = auth.hash_password(body.new_password)
    db.commit()
    return {"ok": True}


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(get_current_admin)):
    return db.query(User).order_by(User.id).all()


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    if auth.get_user_by_username(db, body.username):
        raise HTTPException(status_code=409, detail="用户名已存在")
    user = User(
        username=body.username,
        hashed_password=auth.hash_password(body.password),
        is_admin=body.is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/password", response_model=dict)
def reset_user_password(
    user_id: int,
    body: UserPasswordResetRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.hashed_password = auth.hash_password(body.new_password)
    db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/username", response_model=dict)
def update_username(
    user_id: int,
    body: UpdateUsernameRequest,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    # 仅允许修改自己的用户名，或由管理员修改任意用户
    if user.id != current.id and not current.is_admin:
        raise HTTPException(status_code=403, detail="仅管理员可修改他人用户名")
    existing = auth.get_user_by_username(db, body.username)
    if existing is not None and existing.id != user.id:
        raise HTTPException(status_code=409, detail="用户名已存在")
    user.username = body.username
    db.commit()
    return {"ok": True}


@router.delete("/users/{user_id}", response_model=dict)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="不能删除当前登录账号")
    admin_count = db.query(User).filter(User.is_admin == True).count()
    if user.is_admin and admin_count <= 1:
        raise HTTPException(status_code=400, detail="不能删除最后一个管理员")
    db.delete(user)  # 级联清空该用户的日记与待办
    db.commit()
    return {"ok": True}