# Made for MadeToFight

This project is ready for render.com.

It has one repo and three Render parts.

Dashboard is a web service.

Bot is a background worker.

Database is postgres.

## Easy setup with blueprint

Open Render.

Click new.

Choose blueprint.

Choose this repo.

Render will read this file.

```text
render.yaml
```

It will create these services.

```text
customer404-dashboard
customer404-bot
customer404-db
```

The dashboard and bot will use the same database url.

You do not need to paste the database url by hand if you use the blueprint.

## Manual setup

You can also create everything by hand.

First create postgres.

Use this name.

```text
customer404-db
```

Leave database and user empty if you want Render to generate them.

Keep the same region for the services and the database.

Then create dashboard as a web service.

Use the same repo.

Use docker.

Set dockerfile path to this.

```text
Dockerfile.dashboard
```

Add this env variable.

```text
DATABASE_URL=your render postgres internal database url
```

Then create bot as a background worker.

Use the same repo.

Use docker.

Set dockerfile path to this.

```text
Dockerfile.bot
```

Add the same env variable.

```text
DATABASE_URL=your render postgres internal database url
```

## Secrets

Do not put real tokens in github.

Put secrets only in Render env.

Add these only if you use them.

```text
GEMINI_API_KEY=
ANYSOLVER_KEY=
CAPSOLVER_KEY=
```

Discord accounts are added from the dashboard.

Proxy settings are also added from the dashboard.

## After deploy

Open the dashboard service url.

Do not open the worker url.

The worker is only for the bot process.

The bot creates the database tables on startup.

In logs you should see this.

```text
Database schema is ready.
```

If the dashboard cannot load then check `DATABASE_URL`.

If the bot cannot start then check the worker logs.
