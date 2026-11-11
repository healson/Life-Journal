"""AI 上游调用：查询条件抽取与流式总结（OpenAI 兼容协议）。"""

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

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


def friendly_upstream_error(status_code: int) -> str:
    if status_code == 401:
        return "AI 服务认证失败：请在设置 → AI 中检查 API Key"
    if status_code == 429:
        return "AI 服务请求过于频繁，请稍后再试"
    if status_code >= 500:
        return "AI 服务暂时不可用，请稍后再试"
    return f"AI 服务返回错误（HTTP {status_code}）"


def extract_params(text: str) -> Optional[dict]:
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


async def extract_query(
    client: httpx.AsyncClient,
    question: str,
    base_url: str,
    model: str,
) -> Optional[dict]:
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
            f"{base_url}/chat/completions",
            json={
                "model": model,
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
    return extract_params(content)


async def stream_summary(
    client: httpx.AsyncClient,
    question: str,
    context: str,
    base_url: str,
    model: str,
):
    """流式调用 DeepSeek，逐段产出 delta 文本；产出 error 事件时返回错误信息。"""
    try:
        async with client.stream(
            "POST",
            f"{base_url}/chat/completions",
            json={
                "model": model,
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
                yield ("error", {"message": friendly_upstream_error(resp.status_code)})
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
