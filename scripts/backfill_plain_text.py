#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一次性工具：修复存量日记的 plain_text 字段。
此前前端保存日记时不发送 plain_text，导致已有记录的该字段为空，
刷新页面后按内容关键词搜索全部失效。此脚本用与前端一致的转换逻辑补算。
用法: python scripts/backfill_plain_text.py
"""
import re
import sqlite3
import sys
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "backend" / "app.db"

TAG_RE = re.compile(r"<[^>]*>")
MD_RE = re.compile(r"[#*`>\-_!()\[\]]")
NL_RE = re.compile(r"\n+")


def to_plain(md: str) -> str:
    text = TAG_RE.sub("", md)
    text = MD_RE.sub("", text)
    text = NL_RE.sub(" ", text)
    return text.strip()


def main() -> int:
    if not DB.exists():
        print("数据库不存在:", DB)
        return 1
    conn = sqlite3.connect(str(DB))
    rows = conn.execute(
        "SELECT id, content, plain_text FROM journal_entries"
    ).fetchall()
    fixed = 0
    for eid, content, pt in rows:
        content = content or ""
        pt = (pt or "").strip()
        if content.strip() and not pt:
            conn.execute(
                "UPDATE journal_entries SET plain_text=? WHERE id=?",
                (to_plain(content), eid),
            )
            fixed += 1
    conn.commit()
    conn.close()
    print(f"共扫描 {len(rows)} 条，修复 {fixed} 条")
    return 0


if __name__ == "__main__":
    sys.exit(main())
