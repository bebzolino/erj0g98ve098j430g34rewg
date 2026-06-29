import json

import aiohttp


GEMINI_MODEL = "gemini-2.5-flash-lite"
GEMINI_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"


def _extract_json(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end >= start:
        cleaned = cleaned[start : end + 1]
    return json.loads(cleaned)


def _normalize_result(data: dict) -> dict:
    interest_level = str(data.get("interestLevel") or "low").lower()
    if interest_level not in {"low", "medium", "high"}:
        interest_level = "low"

    sentiment = str(data.get("sentiment") or "neutral").lower()
    if sentiment not in {"negative", "neutral", "positive"}:
        sentiment = "neutral"

    try:
        score = float(data.get("interestScore", 0))
    except (TypeError, ValueError):
        score = 0.0
    score = max(0.0, min(1.0, score))

    tags = data.get("tags")
    if not isinstance(tags, list):
        tags = []
    tags = [str(tag)[:32] for tag in tags[:6]]

    return {
        "interestLevel": interest_level,
        "interestScore": score,
        "sentiment": sentiment,
        "isToxic": bool(data.get("isToxic", False)),
        "tags": tags,
    }


async def classify_reply(config: dict, username: str, message: str) -> dict | None:
    if not config.get("enableAi"):
        return None
    api_key = str(config.get("geminiApiKey") or "").strip()
    if not api_key:
        return None

    prompt = f"""
You classify Discord outreach replies. Return only valid JSON.

Schema:
{{
  "interestLevel": "low" | "medium" | "high",
  "interestScore": number from 0 to 1,
  "sentiment": "negative" | "neutral" | "positive",
  "isToxic": boolean,
  "tags": string[]
}}

Rules:
- high: the user clearly wants help, access, details, a link, or asks how to start.
- medium: the user sounds somewhat interested but vague.
- low: no interest, spam, unrelated, refusal, or unclear.
- toxic: insults, threats, harassment, or aggressive abuse.

Username: {username}
Reply: {message}
""".strip()

    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
        },
    }
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(f"{GEMINI_ENDPOINT}?key={api_key}", json=payload) as response:
            response.raise_for_status()
            data = await response.json()

    text = data["candidates"][0]["content"]["parts"][0]["text"]
    return _normalize_result(_extract_json(text))
