import asyncio
import logging
import os
from urllib.parse import quote

from dotenv import load_dotenv

import captcha
from api import start_http_server
from db import Database
from state import BotState


LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
DATABASE_URL_KEYS = (
    "DATABASE_URL",
    "DATABASE_PRIVATE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRIVATE_URL",
)


def get_database_url() -> str:
    for key in DATABASE_URL_KEYS:
        value = os.getenv(key, "").strip()
        if value:
            logging.info("Using database connection from %s.", key)
            return value

    host = os.getenv("PGHOST", "").strip()
    user = os.getenv("PGUSER", "").strip()
    password = os.getenv("PGPASSWORD", "").strip()
    database = os.getenv("PGDATABASE", "").strip()
    port = os.getenv("PGPORT", "5432").strip() or "5432"
    if host and user and database:
        auth = quote(user)
        if password:
            auth = f"{auth}:{quote(password)}"
        logging.info("Using database connection from PGHOST/PGUSER/PGDATABASE.")
        return f"postgresql://{auth}@{host}:{port}/{quote(database)}"

    raise RuntimeError(
        "Database connection is missing. Set DATABASE_URL on the Railway bot service "
        "or attach/reference the Railway Postgres database variables."
    )


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
