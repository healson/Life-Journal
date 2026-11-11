"""本地日记检索：关键词/日期过滤、空结果兜底索引与上下文拼装。"""

import json
import re
from typing import Optional

import anyio
from sqlalchemy import or_

from .database import SessionLocal
from .models import JournalEntry

# 多关键词拆分：空格与中英文标点
TERMS_SPLIT_RE = re.compile(r"[\s,，、;；]+")


def _date_of(row: JournalEntry) -> str:
    """逻辑日期优先，缺失则用 created_at 推导 YYYY-MM-DD 兜底，始终给 AI 一个日期。"""
    if row.date:
        return row.date
    if row.created_at:
        # SQLite 读出的 created_at 是 naive UTC
        return row.created_at.strftime("%Y-%m-%d")
    return "未知日期"


def search_entries(
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


def recent_index(user_id: int, limit: int = 40) -> list[dict]:
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


def build_context(
    keywords: str,
    date_from: Optional[str],
    date_to: Optional[str],
    hits: list[dict],
    index: Optional[list[dict]] = None,
) -> str:
    """把检索结果拼成给总结模型的上下文；命中为空时改用最近日记索引。"""
    if hits:
        context = f"检索条件：关键词={keywords or '（无）'}，日期={date_from}~{date_to}\n"
        context += "日记（JSON 数组，snippet 为正文摘要，空表示锁定或无正文）：\n"
        context += json.dumps(hits, ensure_ascii=False)
        return context
    context = (
        "按条件没有检索到匹配日记。以下是最近的日记索引"
        "（JSON 数组，snippet 为正文摘要，空表示锁定或无正文），"
        "请根据标题与摘要归纳可能相关的线索：\n"
    )
    context += json.dumps(index or [], ensure_ascii=False)
    return context


async def retrieve(
    user_id: int,
    keywords: str,
    date_from: Optional[str],
    date_to: Optional[str],
) -> tuple[list[dict], str]:
    """检索并生成上下文：命中则用命中结果，未命中则兜底最近日记索引。

    同步 SQL 放线程执行，避免阻塞事件循环。
    """
    hits = await anyio.to_thread.run_sync(
        search_entries, user_id, keywords, date_from, date_to
    )
    index = None
    if not hits:
        index = await anyio.to_thread.run_sync(recent_index, user_id)
    return hits, build_context(keywords, date_from, date_to, hits, index)
