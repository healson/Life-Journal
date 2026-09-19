from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, SessionLocal, engine
from .models import User
from .routers import auth, backup, entries, todos

# 建表
Base.metadata.create_all(bind=engine)


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
