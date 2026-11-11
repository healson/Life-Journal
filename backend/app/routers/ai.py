"""AI 对话：抽取检索条件 → 本地检索日记 → 流式总结（DeepSeek，OpenAI 兼容）。

上游调用见 ai_client.py，本地检索见 ai_search.py，本模块只负责编排与 SSE 输出。
"""

import json

import anyio
import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..ai_client import extract_query, stream_summary
from ..ai_config import get_ai_config
from ..ai_search import retrieve
from ..deps import get_current_user
from ..models import User

router = APIRouter(prefix="/api/ai", tags=["ai"])


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/ask")
async def ask(
    body: AskRequest,
    user: User = Depends(get_current_user),
):
    """单次 AI 提问（无历史）：抽取 → 检索 → SSE 流式回答。"""

    async def event_stream():
        # 每次请求读一次配置：设置页保存后立即生效，无需重启容器
        cfg = await anyio.to_thread.run_sync(get_ai_config)
        if not cfg["api_key"]:
            yield _sse("error", {"message": "AI 服务未配置：请在 设置 → AI 中填写 API Key（或服务器 .env 的 AI_API_KEY）"})
            return

        yield _sse("searching", {})

        headers = {"Authorization": f"Bearer {cfg['api_key']}"}
        async with httpx.AsyncClient(headers=headers, timeout=30.0) as client:
            # 1. 抽取检索条件（失败降级：关键词=原问题、无日期过滤）
            extracted = await extract_query(client, body.question, cfg["base_url"], cfg["model"])
            if extracted is None:
                extracted = {
                    "keywords": body.question[:50],
                    "date_from": None,
                    "date_to": None,
                }

            # 2. 本地检索 + 上下文（未命中时自动降级为最近日记索引）
            hits, context = await retrieve(
                user.id,
                extracted["keywords"],
                extracted["date_from"],
                extracted["date_to"],
            )
            # 推送引用列表，供前端展示可跳转的日记卡片
            yield _sse(
                "refs",
                {
                    "items": [
                        {"id": h["id"], "date": h["date"], "title": h["title"]}
                        for h in hits
                    ]
                },
            )

            # 3. 流式总结
            async for kind, data in stream_summary(client, body.question, context, cfg["base_url"], cfg["model"]):
                yield _sse(kind, data)

        yield _sse("done", {})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # 防 nginx 对 SSE 做缓冲
            "X-Accel-Buffering": "no",
        },
    )
