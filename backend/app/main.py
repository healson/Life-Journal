from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from .routers import auth, entries, todos

# 建表
Base.metadata.create_all(bind=engine)

app = FastAPI(title="人生记趣录 API", version="1.0.0")

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


@app.get("/api/health")
def health():
    return {"status": "ok"}
