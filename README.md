# Discord Selfbot Onboarding System

Automated welcome system for Discord servers: friend requests, DMs, AI analysis, captcha solving, alt rotation, and a web dashboard.

## Railway Setup

### 1. Deploy

1. Fork this repo
2. Go to [Railway](https://railway.app) → New Project → Deploy from GitHub
3. Select your fork

### 2. Add PostgreSQL Database

1. In Railway dashboard → **New** → **Database** → **PostgreSQL**
2. Copy the **Database URL** from the PostgreSQL service
3. Add it as env var to your bot service: `DATABASE_URL` = `<paste URL>`

### 3. Bot Service Env Vars

If Railway asks for a root directory for the bot service, set it to `packages/bot`.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string from step 2 |
| `BOT_API_PORT` | No | HTTP control server port (default: `8080`) |

That's it — no token or API keys needed in env vars. Everything is configured from the Dashboard.

### 4. Dashboard Service

1. Railway → **New** → **Service** → **GitHub Repo** (same repo)
2. Set root directory to `packages/dashboard`
3. Add env var: `DATABASE_URL` = same as bot service
4. Railway auto-detects Next.js and deploys

### 5. Initial Setup

1. Open your Dashboard URL
2. Go to **Settings** tab
3. Configure:
   - **User Token** — your Discord user token (selfbot)
   - **Webhook URL** — Discord webhook for notifications
   - **CAPTCHA Solver** — select `2Captcha`
   - **CAPTCHA API Key** — your 2Captcha key
   - **Captcha Proxy** — residential proxy (e.g. `http://user:pass@host:port`)
4. Click **Save**

### 6. Alt Accounts

1. Go to **Accounts** tab
2. Click **+ Add Account**
3. Enter Discord user token
4. The bot will auto-login on next restart

### 7. Server Join

1. Go to **Simulator** tab
2. Paste a Discord invite link
3. Click **Join Server**

## Captcha Solving (Important)

Discord's hCaptcha **requires a residential proxy** to solve. Datacenter proxies get rejected with `invalid-response`.

### Free Residential Proxy Options

| Provider | Free | Credit Card | Link |
|----------|------|-------------|------|
| OkeyProxy | 1GB / 24h | No | [okeyproxy.com](https://www.okeyproxy.com/register) |
| Webshare | 1GB / month | No | [webshare.io](https://www.webshare.io/features/free-proxy) |

### Getting OkeyProxy Free Trial

1. Register at [okeyproxy.com](https://www.okeyproxy.com/register)
2. Use live chat on the site
3. Say: "I need 1GB residential proxy free trial for Discord captcha solving"
4. They'll give you credentials
5. Set in Dashboard → Settings → Captcha Proxy:
   ```
   http://username:password@proxy.okeyproxy.com:port
   ```

## How It Works

```
Member joins server
        ↓
Friend request (if enabled)
        ↓
Captcha solved (2Captcha + proxy)
        ↓
Initial DM (after delay)
        ↓
AI analyzes reply → webhook notification
        ↓
Follow-up DM (if no reply, after 24h)
        ↓
Ping / mention (if no reply, after 48h)
```

## Features

- **Automated DMs** — welcome, follow-up, ping system
- **Alt rotation** — LRU-based account switching on rate limit
- **AI analysis** — Gemini AI or heuristic fallback
- **Webhook notifications** — with full DM conversation log
- **Captcha solving** — 2Captcha with proxy support
- **Web Dashboard** — light/dark theme, all settings configurable
- **Server joiner** — join via invite link from dashboard
- **Friend requests** — automated with captcha handling

## Tech Stack

- **Bot:** Python + discord.py-self
- **Database:** PostgreSQL (Supabase)
- **Dashboard:** Next.js 14
- **AI:** Google Gemini
- **Captcha:** 2Captcha
- **Hosting:** Railway
