import os

from aiohttp import web

from status import MEMBER_FAILED_DM, MEMBER_FIRST_DM_SENT


def create_app(state) -> web.Application:
    app = web.Application()

    async def handle_api(request: web.Request) -> web.Response:
        try:
            payload = await request.json()
        except Exception:
            return web.json_response({"error": "Invalid JSON"}, status=400)

        action = payload.get("action")
        user_id = str(payload.get("userId") or "")
        username = payload.get("username") or user_id
        message = payload.get("message") or ""

        if not action:
            return web.json_response({"error": "Missing action"}, status=400)
        if action == "join":
            config = await state.db.fetch_config()
            await state.db.upsert_member_join(user_id, username, bool(config.get("enableFriendRequests")))
            return web.json_response({"success": True})
        if action == "reply":
            await state.handle_user_reply(user_id, username, message)
            return web.json_response({"success": True})
        if action == "trigger_initial":
            return web.json_response({"success": await state.send_initial_dm(user_id)})
        if action == "trigger_followup":
            return web.json_response({"success": await state.send_followup_dm(user_id)})
        if action == "trigger_ping":
            return web.json_response({"success": await state.send_ping(user_id)})
        if action == "trigger_friend_request":
            return web.json_response({"success": await state.send_friend_request(user_id)})
        if action == "trigger_custom_dm":
            ok = await state.send_dm(user_id, message, MEMBER_FIRST_DM_SENT, MEMBER_FAILED_DM, "Custom DM")
            return web.json_response({"success": ok}, status=200 if ok else 500)
        return web.json_response({"error": "Unknown action"}, status=400)

    app.router.add_post("/", handle_api)
    return app


async def start_http_server(state) -> None:
    config = await state.db.fetch_config()
    port = int(os.getenv("PORT") or os.getenv("BOT_API_PORT") or config.get("botPort") or 3001)
    runner = web.AppRunner(create_app(state))
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    await state.db.log(f"Python bot HTTP server running on port {port}.", "success")
