import asyncio
import logging
import os

from dotenv import load_dotenv

import captcha
from api import start_http_server
from db import Database
from state import BotState


LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"


def get_database_url() -> str:
    value = os.getenv("DATABASE_URL", "").strip()
    if not value:
        raise RuntimeError("DATABASE_URL is required.")
    return value


async def main_async() -> int:
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)

    state = BotState(Database(get_database_url()))
    captcha.set_bot_state(state)
    await state.start()
    await start_http_server(state)

    while True:
        await asyncio.sleep(3600)


def main() -> int:
    try:
        return asyncio.run(main_async())
    except KeyboardInterrupt:
        return 0
    except Exception:
        logging.exception("PYTHON_BOT_FATAL")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
