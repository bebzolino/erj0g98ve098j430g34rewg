# Made for MadeToFight

This is a short setup guide for railway.

The project has two services.

One service is the dashboard.

The second service is the bot.

Both services must use the same postgres database.

## 1. Create the database

Open your railway project.

Click add.

Choose database.

Choose postgres.

Wait until railway creates it.

Open the postgres service.

Go to variables.

Copy the database url.

You will need it for both services.

## 2. Create the dashboard service

Click add.

Choose github repo.

Choose this repo.

For the dashboard service leave root directory empty.

This means railway will use the main folder of the repo.

The dashboard uses this file.

```text
railway.toml
```

This file points railway to this dockerfile.

```text
Dockerfile.dashboard
```

Now open variables for the dashboard service.

Add this variable.

```text
DATABASE_URL=your postgres database url
```

Deploy the dashboard.

After deploy finishes open the public url from the dashboard service.

If you see the web panel then this part is fine.

## 3. Create the bot service

Click add again.

Choose github repo.

Choose the same repo.

For the bot service set root directory to this.

```text
packages/bot
```

This is important.

If you do not set this then railway can start the wrong app.

The bot uses this file.

```text
packages/bot/railway.toml
```

This file points railway to this dockerfile.

```text
packages/bot/Dockerfile
```

Now open variables for the bot service.

Add the same database url.

```text
DATABASE_URL=your postgres database url
```

Deploy the bot.

The bot will create the database tables by itself when it starts.

In the logs you should see this.

```text
Database schema is ready.
```

## 4. Check the public url

Only the dashboard needs a public url.

The bot does not need a public url.

If you open the bot url by mistake you will only see a small json message.

That is normal.

Use the dashboard url for the web panel.

## 5. First setup in the dashboard

Open the dashboard.

Go to settings.

Set your messages.

Set your delays.

Set captcha settings if you use captcha solving.

Set gemini key if you use ai classification.

Save settings.

Then go to accounts.

Add your account token.

The bot can load accounts without restarting.

## 6. If something crashes

Open the service logs in railway.

If the dashboard crashes then check the dashboard service.

If the bot crashes then check the bot service.

If you see a database error then check that both services have the same `DATABASE_URL`.

If you see `relation does not exist` then redeploy the bot.

The bot should create the tables on startup.

If you see that the dashboard shows a bot json message then the public url is attached to the bot service.

Move the public url to the dashboard service.

## 7. Important settings

Dashboard service root directory should be empty.

Bot service root directory should be this.

```text
packages/bot
```

Both services need this variable.

```text
DATABASE_URL=your postgres database url
```

Do not upload real secrets to github.

Put secrets only in railway variables.
