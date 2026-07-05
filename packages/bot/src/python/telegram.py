import html

import aiohttp


TELEGRAM_API_BASE = "https://api.telegram.org"


def escape_html(value: object) -> str:
    return html.escape(str(value or ""), quote=False)


async def send_telegram_message(config: dict, text: str) -> bool:
    token = str(config.get("telegramBotToken") or "").strip()
    chat_id = str(config.get("telegramChatId") or "").strip()
    if not token or not chat_id:
        return False

    timeout = aiohttp.ClientTimeout(total=15)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            f"{TELEGRAM_API_BASE}/bot{token}/sendMessage",
            json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
        ) as response:
            if response.status >= 400:
                body = await response.text()
                raise RuntimeError(f"Telegram API returned {response.status}: {body[:300]}")
            return True


def build_reply_notification(
    username: str,
    user_id: str,
    content: str,
    result: dict | None = None,
    include_ai_footer: bool = False,
) -> str:
    lines = [
        "<b>New Discord reply</b>",
        f"User: {escape_html(username)} (<code>{escape_html(user_id)}</code>)",
        "",
        escape_html(content),
    ]
    if include_ai_footer and result:
        lines.extend(
            [
                "",
                f"AI: {escape_html(result.get('interestLevel'))} "
                f"({float(result.get('interestScore') or 0):.2f}), {escape_html(result.get('sentiment'))}",
            ]
        )
    return "\n".join(lines)
