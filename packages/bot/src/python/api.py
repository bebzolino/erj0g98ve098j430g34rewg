import os
import hmac

from aiohttp import web

from status import MEMBER_FAILED_DM, MEMBER_FIRST_DM_SENT


def create_app(state) -> web.Application:
    app = web.Application(client_max_size=64 * 1024)
    api_key = os.getenv("BOT_API_KEY") or ""
    production_like = bool(os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RAILWAY_SERVICE_NAME") or os.getenv("NODE_ENV") == "production")

    def is_authorized(request: web.Request) -> bool:
        if not api_key:
            return True
        provided = request.headers.get("x-bot-api-key", "")
        return hmac.compare_digest(provided, api_key)

    async def handle_health(request: web.Request) -> web.Response:
        return web.json_response({
            "service": "bot",
            "status": "ok",
            "message": "This is the bot API service. Open the dashboard service URL for the web panel.",
        })

    async def handle_api(request: web.Request) -> web.Response:
        if production_like and not api_key:
            return web.json_response({"error": "BOT_API_KEY is not configured"}, status=503)
        if not is_authorized(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

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
            created = await state.db.upsert_member_join(user_id, username, bool(config.get("enableFriendRequests")), process_rejoins=bool(config.get("processRejoins")))
            return web.json_response({"success": True, "created": created})
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
        if action == "runtime_start":
            await state.resume_runtime()
            return web.json_response({"success": True, "status": "started"})
        if action == "runtime_stop":
            await state.pause_runtime()
            return web.json_response({"success": True, "status": "stopped"})
        if action == "runtime_restart":
            await state.restart_runtime()
            return web.json_response({"success": True, "status": "restarted"})
        return web.json_response({"error": "Unknown action"}, status=400)

    app.router.add_get("/", handle_health)
    app.router.add_get("/health", handle_health)
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
