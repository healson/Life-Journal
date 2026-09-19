from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .database import Base, SessionLocal, engine
from .models import User
from .routers import auth, backup, entries, todos

# 建表
Base.metadata.create_all(bind=engine)


def _ensure_columns():
    """轻量迁移：create_all 只会新建缺失的表，不会给已存在的旧表补列。
    升级到多用户版本后，旧库的 users 表缺少 is_admin 列，启动前需补上，
    否则 _bootstrap_admin / 注册登录查询 is_admin 会抛 no such column，导致容器崩溃(502)。"""
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        cols = {row["name"] for row in conn.execute(text("PRAGMA table_info(users)")).mappings()}
        if cols and "is_admin" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0"))
            conn.commit()


_ensure_columns()


def _bootstrap_admin():
    """确保至少存在一个管理员：若没有，提升最早创建的用户为管理员。"""
    db = SessionLocal()
    try:
        if db.query(User).filter(User.is_admin == True).count() == 0:
            first = db.query(User).order_by(User.id).first()
            if first is not None:
                first.is_admin = True
                db.commit()
    finally:
        db.close()


_bootstrap_admin()

app = FastAPI(title="人生记趣录 API", version="1.1.0")

# 允许前端（含 vite dev server 5173）跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(entries.router)
app.include_router(todos.router)
app.include_router(backup.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
