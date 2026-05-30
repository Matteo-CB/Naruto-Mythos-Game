# Cron / scheduled jobs

The simulator is hosted on a self-managed VPS (no Vercel Cron), so scheduled jobs
ship as systemd timer + service unit files in this folder. Pair each `*.service`
with its `*.timer`.

## Daily quest rotation

Rotates the global daily quest at midnight UTC. Idempotent: the underlying
`ensureTodaysDailyQuest()` no-ops if today's `DailyQuestAssignment` row already exists.

### Install on the VPS

```
sudo cp cron/naruto-mythos-daily-quest.service /etc/systemd/system/
sudo cp cron/naruto-mythos-daily-quest.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now naruto-mythos-daily-quest.timer
```

Tweak `WorkingDirectory`, `EnvironmentFile`, `User`, `Group` in the `.service`
file if the deploy layout differs from `/opt/naruto-mythos` and the `naruto`
service user.

### Verify

```
systemctl list-timers --all | grep naruto-mythos-daily-quest
journalctl -u naruto-mythos-daily-quest.service --since today
```

### Manual trigger

```
sudo systemctl start naruto-mythos-daily-quest.service
```

Or, equivalent and not requiring sudo, hit the cron endpoint:

```
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/daily-quest
```

Or, for admin debugging in the browser console, the `/api/admin/quests/rotate-daily`
route does the same and is gated by the admin whitelist instead of the bearer
token. It also accepts `{date: "YYYY-MM-DD"}` to backfill a missed day.

## CRON_SECRET environment variable

The cron endpoint requires `CRON_SECRET` to be set in the server environment.
Generate one with `openssl rand -hex 32` and store it in `.env`:

```
CRON_SECRET="abcd1234...somehexvalue"
```

Without `CRON_SECRET`, the cron endpoint returns 401 for every request, so
nothing can rotate the daily quest by mistake.
