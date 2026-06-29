import asyncio
import os

import aiohttp
import discord


ANYSOLVER_API_BASE_URL = "https://api.anysolver.com"
ANYSOLVER_DEFAULT_WEBSITE_URL = "https://discord.com/login"
ANYSOLVER_POLL_INTERVAL_SECONDS = 3
ANYSOLVER_TIMEOUT_SECONDS = 180

bot_state = None


def set_bot_state(state) -> None:
    global bot_state
    bot_state = state


def get_anysolver_task_type(exc: discord.CaptchaRequired, proxy: str | None) -> str:
    proxy_suffix = "" if proxy else "ProxyLess"
    if exc.service == "hcaptcha":
        if exc.rqdata or exc.rqtoken:
            if exc.should_serve_invisible:
                return f"PopularCaptchaEnterpriseInvisibleToken{proxy_suffix}"
            return f"PopularCaptchaEnterpriseToken{proxy_suffix}"
        if exc.should_serve_invisible:
            return f"PopularCaptchaInvisibleToken{proxy_suffix}"
        return f"PopularCaptchaToken{proxy_suffix}"
    if exc.service == "recaptcha_enterprise":
        return f"ReCaptchaV2EnterpriseToken{proxy_suffix}"
    return f"ReCaptchaV2Token{proxy_suffix}"


async def post_anysolver(session: aiohttp.ClientSession, endpoint: str, payload: dict) -> dict:
    async with session.post(f"{ANYSOLVER_API_BASE_URL}/{endpoint}", json=payload) as response:
        response.raise_for_status()
        data = await response.json()
    if data.get("errorId"):
        raise RuntimeError(f"{data.get('errorCode', 'UNKNOWN_ERROR')}: {data.get('errorDescription', 'AnySolver request failed.')}")
    return data


async def solve_captcha_with_anysolver(exc: discord.CaptchaRequired, client: discord.Client) -> str:
    if bot_state is None:
        raise RuntimeError("Bot state is not initialized.")
    config = await bot_state.db.fetch_config()
    api_key = (config.get("captchaKey") or config.get("anysolverKey") or os.getenv("ANYSOLVER_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("AnySolver key is missing.")

    proxy = (config.get("captchaProxy") or os.getenv("CAPTCHA_PROXY") or "").strip() or None
    task = {
        "type": get_anysolver_task_type(exc, proxy),
        "websiteURL": os.getenv("ANYSOLVER_WEBSITE_URL", ANYSOLVER_DEFAULT_WEBSITE_URL).strip(),
        "websiteKey": exc.sitekey,
    }
    if proxy:
        task["proxy"] = proxy
    if exc.rqdata:
        task["rqdata"] = exc.rqdata

    timeout = aiohttp.ClientTimeout(total=ANYSOLVER_TIMEOUT_SECONDS)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        created = await post_anysolver(session, "createTask", {"clientKey": api_key, "task": task})
        task_id = created["taskId"]
        deadline = asyncio.get_running_loop().time() + ANYSOLVER_TIMEOUT_SECONDS
        while True:
            await asyncio.sleep(ANYSOLVER_POLL_INTERVAL_SECONDS)
            result = await post_anysolver(session, "getTaskResult", {"clientKey": api_key, "taskId": task_id})
            if result.get("status") == "ready":
                token = (result.get("solution") or {}).get("token")
                if not token:
                    raise RuntimeError("AnySolver returned no solution token.")
                return token
            if result.get("status") == "failed":
                raise RuntimeError(f"{result.get('errorCode', 'CAPTCHA_FAILED')}: {result.get('errorDescription', 'CAPTCHA solve failed.')}")
            if asyncio.get_running_loop().time() >= deadline:
                raise TimeoutError(f"AnySolver task timed out: {task_id}")
