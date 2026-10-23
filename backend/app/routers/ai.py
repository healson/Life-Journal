"""AI 对话：抽取检索条件 → 本地检索日记 → 流式总结（DeepSeek，OpenAI 兼容）。"""

import json
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

import anyio
import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import or_

from ..database import SessionLocal
from ..deps import get_current_user
from ..models import JournalEntry, User

router = APIRouter(prefix="/api/ai", tags=["ai"])

# 与 auth/database 同风格：直接读环境变量（NAS 端配置在 .env，不入库）
AI_API_KEY = os.environ.get("AI_API_KEY", "")
AI_BASE_URL = os.environ.get("AI_BASE_URL", "https://api.deepseek.com").rstrip("/")
AI_MODEL = os.environ.get("AI_MODEL", "deepseek-chat")

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# 多关键词拆分：空格与中英文标点
TERMS_SPLIT_RE = re.compile(r"[\s,，、;；]+")

SYSTEM_SUMMARY = (
    "你是「人生记趣录」的日记助手。基于下方提供的日记检索结果回答用户问题：\n"
    "1. 用中文回答，简洁有条理，必要时分点；\n"
    "2. 不要在正文里写任何引用标记（如 [日期]、标题、[1]、脚注等），"
    "用于点击跳转的参考列表已在上方独立呈现；\n"
    "3. 若检索结果为空，如实告知没有找到相关日记，不要编造内容；\n"
    "4. 检索结果中某篇的摘要为空，只表示没有可展示的摘要，不要断言它被锁定、"
    "也不要猜测任何原因，基于日期与标题正常引用即可；\n"
    "5. 若给的是索引或摘要形式，根据标题与摘要尽量归纳出可提供的线索，不要仅因没有完整正文就放弃总结。"
)


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _friendly_upstream_error(status_code: int) -> str:
    if status_code == 401:
        return "AI 服务认证失败：请检查服务器 .env 中的 AI_API_KEY"
    if status_code == 429:
        return "AI 服务请求过于频繁，请稍后再试"
    if status_code >= 500:
        return "AI 服务暂时不可用，请稍后再试"
    return f"AI 服务返回错误（HTTP {status_code}）"


def _search_sync(
    user_id: int,
    keywords: str,
    date_from: Optional[str],
    date_to: Optional[str],
    limit: int = 20,
) -> list[dict]:
    """同步检索（在线程中执行），返回紧凑日记摘要；锁定日记正文置空。

    keywords 按空格/标点拆成多个词，任意一个词命中即算匹配（OR），
    多个词同时命中的日记排在前面，再按日期倒序。
    """
    db = SessionLocal()
    try:
        query = db.query(JournalEntry).filter(JournalEntry.owner_id == user_id)
        terms = [t for t in TERMS_SPLIT_RE.split(keywords) if t]
        if terms:
            conditions = [
                or_(
                    JournalEntry.title.ilike(f"%{t}%"),
                    JournalEntry.content.ilike(f"%{t}%"),
                    JournalEntry.plain_text.ilike(f"%{t}%"),
                )
                for t in terms
            ]
            query = query.filter(or_(*conditions))
        if date_from:
            query = query.filter(JournalEntry.date >= date_from)
        if date_to:
            query = query.filter(JournalEntry.date <= date_to)
        # 多取一些候选项，再按命中词数重排（全字段 ilike 无法在 SQL 里计数）
        rows = query.order_by(JournalEntry.date.desc()).limit(100).all()

        def hit_count(row: JournalEntry) -> int:
            text = f"{row.title or ''} {row.plain_text or ''}".lower()
            return sum(1 for t in terms if t.lower() in text)

        if terms:
            rows = sorted(rows, key=lambda r: (hit_count(r), r.date), reverse=True)
        rows = rows[:limit]
        return [
            {
                "id": row.id,
                "date": _date_of(row),
                "title": row.title,
                "tags": row.tags or [],
                "mood": row.mood,
                "snippet": "" if row.is_locked else (row.plain_text or "")[:300],
            }
            for row in rows
        ]
    finally:
        db.close()


def _recent_index_sync(user_id: int, limit: int = 40) -> list[dict]:
    """检索为空时的兜底：最近日记索引（含正文摘要，锁定日记正文置空）。"""
    db = SessionLocal()
    try:
        rows = (
            db.query(JournalEntry)
            .filter(JournalEntry.owner_id == user_id)
            .order_by(JournalEntry.date.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": r.id,
                "date": _date_of(r),
                "title": r.title,
                "snippet": "" if r.is_locked else (r.plain_text or "")[:300],
            }
            for r in rows
        ]
    finally:
        db.close()


def _date_of(row: JournalEntry) -> str:
    """逻辑日期优先，缺失则用 created_at 推导 YYYY-MM-DD 兜底，始终给 AI 一个日期。"""
    if row.date:
        return row.date
    if row.created_at:
        # SQLite 读出的 created_at 是 naive UTC
        return row.created_at.strftime("%Y-%m-%d")
    return "未知日期"


def _extract_params(text: str) -> Optional[dict]:
    """从抽取模型的回复中解析 JSON；失败返回 None（调用方降级）。"""
    if not text:
        return None
    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = re.sub(r"^```[a-z]*\n?|\n?```$", "", candidate).strip()
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", candidate, re.S)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    if not isinstance(data, dict):
        return None
    date_from = data.get("date_from")
    date_to = data.get("date_to")
    if not (isinstance(date_from, str) and DATE_RE.match(date_from)):
        date_from = None
    if not (isinstance(date_to, str) and DATE_RE.match(date_to)):
        date_to = None
    keywords = data.get("keywords")
    keywords = keywords.strip() if isinstance(keywords, str) else ""
    return {"keywords": keywords, "date_from": date_from, "date_to": date_to}


async def _extract_query(client: httpx.AsyncClient, question: str) -> Optional[dict]:
    """非流式轻量调用：从问题中抽取关键词与日期范围。失败返回 None。"""
    # 用户时区（容器通常为 UTC，直接 today() 在凌晨到早上 8 点会算成前一天，
    # 导致「今天」类问题抽取错误日期）
    today = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
    system = (
        "你是查询条件解析器。根据用户的日记查询问题，抽取用于全文搜索与日期过滤的条件，"
        f"只输出一个 JSON 对象，不要输出其他内容。今天是 {today}，相对日期据此换算。\n"
        '格式：{"keywords": "1~3 个独立关键词，用空格分隔。只保留人名、地名、事物、事件等实体词，'
        "例如把“我和小杨交往的怎么样”抽成“小杨”，把“上次去北京吃了什么”抽成“北京 吃”；"
        '去掉“和/与/的/怎么样/最近”等虚词与整句，没有合适关键词则为空字符串", '
        '"date_from": "YYYY-MM-DD 或 null", "date_to": "YYYY-MM-DD 或 null"}'
    )
    try:
        resp = await client.post(
            f"{AI_BASE_URL}/chat/completions",
            json={
                "model": AI_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": question},
                ],
                "temperature": 0,
                "max_tokens": 200,
                "response_format": {"type": "json_object"},
            },
            timeout=30.0,
        )
    except httpx.HTTPError:
        return None
    if resp.status_code != 200:
        return None
    try:
        content = resp.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError):
        return None
    return _extract_params(content)


async def _stream_summary(
    client: httpx.AsyncClient,
    question: str,
    context: str,
):
    """流式调用 DeepSeek，逐段产出 delta 文本；产出 error 事件时返回错误信息。"""
    try:
        async with client.stream(
            "POST",
            f"{AI_BASE_URL}/chat/completions",
            json={
                "model": AI_MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_SUMMARY},
                    {"role": "user", "content": f"日记检索结果：\n{context}\n\n用户问题：{question}"},
                ],
                "temperature": 0.5,
                "max_tokens": 1500,
                "stream": True,
            },
            timeout=httpx.Timeout(10.0, read=60.0),
        ) as resp:
            if resp.status_code != 200:
                await resp.aread()
                yield ("error", {"message": _friendly_upstream_error(resp.status_code)})
                return
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                try:
                    delta = json.loads(payload)["choices"][0]["delta"].get("content")
                except (KeyError, IndexError, TypeError, ValueError):
                    continue
                if delta:
                    yield ("delta", {"content": delta})
    except httpx.TimeoutException:
        yield ("error", {"message": "AI 服务请求超时，请稍后再试"})
    except httpx.HTTPError:
        yield ("error", {"message": "无法连接 AI 服务，请检查服务器网络"})


@router.post("/ask")
async def ask(
    body: AskRequest,
    user: User = Depends(get_current_user),
):
    """单次 AI 提问（无历史）：抽取 → 检索 → SSE 流式回答。"""

    async def event_stream():
        if not AI_API_KEY:
            yield _sse("error", {"message": "AI 服务未配置：请在服务器 .env 中设置 AI_API_KEY"})
            return

        yield _sse("searching", {})

        headers = {"Authorization": f"Bearer {AI_API_KEY}"}
        async with httpx.AsyncClient(headers=headers, timeout=30.0) as client:
            # 1. 抽取检索条件（失败降级：关键词=原问题、无日期过滤）
            extracted = await _extract_query(client, body.question)
            if extracted is None:
                extracted = {
                    "keywords": body.question[:50],
                    "date_from": None,
                    "date_to": None,
                }

            # 2. 本地检索（同步 SQL 放线程，避免阻塞事件循环）
            hits = await anyio.to_thread.run_sync(
                _search_sync,
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
            if hits:
                context = f"检索条件：关键词={extracted['keywords'] or '（无）'}，日期={extracted['date_from']}~{extracted['date_to']}\n"
                context += "日记（JSON 数组，snippet 为正文摘要，空表示锁定或无正文）：\n"
                context += json.dumps(hits, ensure_ascii=False)
            else:
                index = await anyio.to_thread.run_sync(_recent_index_sync, user.id)
                context = (
                    "按条件没有检索到匹配日记。以下是最近的日记索引"
                    "（JSON 数组，snippet 为正文摘要，空表示锁定或无正文），"
                    "请根据标题与摘要归纳可能相关的线索：\n"
                )
                context += json.dumps(index, ensure_ascii=False)

            # 3. 流式总结
            async for kind, data in _stream_summary(client, body.question, context):
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
