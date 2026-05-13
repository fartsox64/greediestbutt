# GreediestButt

Daily run leaderboards for The Binding of Isaac (all versions).

## Stack

- **Backend**: FastAPI · SQLAlchemy (async) · PostgreSQL · Alembic · httpx · defusedxml
- **Frontend**: React 18 · Vite · TypeScript · TanStack Query · Tailwind CSS

---

## Production deployment

The full stack (Postgres, backend, frontend) runs as three Docker containers.

### 1. Configure

```bash
cp .env.example .env
```

Edit `.env` and fill in the required variables (see [Configuration](#configuration) for the full reference).

### 2. Build and start

```bash
docker compose up -d --build
```

This starts all three services. Database migrations run automatically when the backend starts — the app is ready as soon as all containers are healthy.

### 3. Set the first admin

The first admin must be set from the command line (see [User roles and moderation](#user-roles-and-moderation)):

```bash
docker compose exec backend python set_role.py <steam_id> admin
```

### Redeploying

Pull new code and rebuild:

```bash
docker compose up -d --build
```

Migrations are applied automatically on each restart. Postgres data persists in the `pgdata` Docker volume across deploys.

### HTTPS

The frontend container listens on plain HTTP. To serve over HTTPS, put a reverse proxy in front of it — [Caddy](https://caddyserver.com/) is the easiest option as it handles certificate provisioning automatically:

```
yourdomain.com {
    reverse_proxy localhost:80
}
```

---

## Local development

### 1. Start PostgreSQL

```bash
docker compose up -d db
```

### 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Copy and edit config
cp .env.example .env

# Run the database migrations
alembic upgrade head

# Start the API server
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

---

## Configuration

### Docker (production)

Config is read from the root `.env` file by Docker Compose. Copy `.env.example` as a starting point:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_URL` | Yes | Public URL of the site — used for Steam OpenID redirects. |
| `SESSION_SECRET` | Yes | Long random string used to sign JWTs. Generate with: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `STEAM_API_KEY` | Recommended | Resolves player names and avatars. Without it, entries show raw Steam IDs. Get one at <https://steamcommunity.com/dev/apikey> |
| `DB_PASSWORD` | No | Postgres password (default: `postgres` — change in production). |
| `PORT` | No | Host port to expose the app on (default: `80`). |
| `*_PATTERN` | No | Regex patterns for matching Steam leaderboard names to versions. Leave blank to use built-in defaults. See [Configuring version detection](#configuring-version-detection). |

### Local development

Config is read from `backend/.env`. Copy `backend/.env.example` as a starting point:

```bash
cp backend/.env.example backend/.env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string. |
| `APP_URL` | Yes | Base URL the browser uses to reach the app — set to your Vite dev server (e.g. `http://localhost:5173`). |
| `SESSION_SECRET` | Yes | Secret used to sign JWTs. |
| `STEAM_API_KEY` | Recommended | Resolves player names and avatars. |
| `*_PATTERN` | No | Regex patterns for matching Steam leaderboard names to versions. See [Configuring version detection](#configuring-version-detection). |

---

## Scraping data

### Built-in scheduler

The backend runs two scheduled jobs automatically:

- **Every 10 minutes** — scrapes today's and yesterday's leaderboards for all versions and refreshes overall-leaderboard stats for any players whose scores changed.
- **Daily at 02:00 UTC** — runs a full overall-leaderboard stats refresh across all versions and sort types, catching any drift that the incremental updates may have missed.

No external cron job is required for normal operation. The scheduler starts with the server and logs each run.

### Pre-release date filtering

Entries dated before each version's official launch are automatically discarded during scraping:

| Version | Release date |
|---------|-------------|
| Afterbirth | 2015-10-30 |
| Afterbirth+ | 2017-01-03 |
| Repentance | 2021-03-31 |
| Repentance+ (Solo & Coop) | 2024-11-19 |

### Manual scrape endpoints

The backend also exposes scrape endpoints for on-demand use. Call them with `curl` or any HTTP client.

In Docker, the backend is not exposed on the host by default; use `docker compose exec`:

```bash
docker compose exec backend curl -s -X POST http://localhost:8000/api/scrape/today
```

### Today's runs

```bash
curl -X POST http://localhost:8000/api/scrape/today
```

### Seed all historical data

```bash
# All history since Isaac launch (slow — may take hours)
curl -X POST "http://localhost:8000/api/scrape/seed"

# Limit to a specific start date
curl -X POST "http://localhost:8000/api/scrape/seed?from_date=2024-01-01"
```

The seed scrape is split into two phases to avoid slow Steam API retries stalling
the leaderboard fetch:

1. **Phase 1** — fetches all leaderboard entries and stores them
2. **Phase 2** — finds every Steam ID not yet in the player name cache and resolves
   names via the Steam API

### Backfill player names (standalone)

If the Steam API was unavailable during seeding, or you want to re-run just the
name resolution pass:

```bash
curl -X POST http://localhost:8000/api/scrape/backfill-names
```

This is safe to run at any time — it only touches Steam IDs that are absent from
the player name cache or have a NULL name there.

### Suggested cron job (optional)

If the server is not running continuously, a cron job can supplement the built-in scheduler to ensure today's data is captured. Use a time that avoids 02:00 UTC, which the built-in scheduler already uses for its full stats refresh:

```cron
# Scrape today's leaderboards every day at 03:00 UTC
0 3 * * * curl -s -X POST http://localhost:8000/api/scrape/today >> /var/log/gbtwopointoh.log 2>&1
```

---

## Configuring version detection

Isaac daily run leaderboards on Steam follow a naming convention that may differ
from the defaults. After starting the backend:

1. Call the discovery endpoint to see a sample of detected leaderboards:

   ```bash
   curl http://localhost:8000/api/admin/leaderboard-discovery?sample_size=50
   ```

2. Inspect the `name` field of returned leaderboards and note which patterns
   correspond to each version.

3. Update the `*_PATTERN` variables in `backend/.env` and restart the server.

---

## User roles and moderation

### Roles

There are two privileged roles: `admin` and `moderator`. Admins can do everything moderators can, plus manage who is a moderator.

| Feature | Moderator | Admin |
|---------|-----------|-------|
| Hide / unhide leaderboard scores | ✓ | ✓ |
| View hidden scores (mod panel) | ✓ | ✓ |
| Review and dismiss user reports | ✓ | ✓ |
| Grant / revoke moderator role | — | ✓ |
| View and respond to user feedback | — | ✓ |
| Reopen closed feedback threads | — | ✓ |
| Admin panel | — | ✓ |

### Assigning the first admin via command line

Since the admin panel requires an existing admin to manage roles, the first admin must be set directly from the command line. Run this from the `backend/` directory with the virtualenv active:

```bash
python set_role.py <steam_id> admin
```

Other valid roles:

```bash
python set_role.py <steam_id> moderator   # grant moderator
python set_role.py <steam_id> none        # remove any role
```

The user must have logged in at least once before this command will work (their Steam ID must exist in the `users` table). Log in via the site first, then run the command.

### Managing roles via the admin panel

Once an admin is set, additional moderators can be managed through the in-app **Admin** panel (visible in the header when logged in as admin). The panel lets you search for any player who has appeared on a leaderboard and grant or revoke their moderator role.

### Hiding scores

Moderators and admins can hide individual scores from leaderboards using the **✕** button that appears on each row when logged in with a privileged role. Hidden scores are excluded from rankings and the ranks of remaining scores are renumbered without gaps.

### Auto-ban

If a player accumulates **5 or more hidden scores**, all of their scores are automatically hidden and they are excluded from all leaderboards. This threshold is defined by `AUTO_BAN_THRESHOLD` in `backend/app/api/filters.py`.

### User reports

Any logged-in user who does not hold a moderator or admin role can report a suspicious score using the flag button on a leaderboard row. Reports include a free-text reason and are queued in the mod panel under **Pending Reports**.

Moderators can either **dismiss** a report (no action taken) or **Hide Score** (hides the entry and resolves all pending reports for it simultaneously). The mod panel tracks whether a score was hidden directly by a moderator or as a result of handling a report.

### About page

The site has an **About** page accessible from the footer. Its content is stored in the database and editable by admins — clicking **Edit** on the About page opens a WYSIWYG rich-text editor with a formatting toolbar (bold, italic, headings, lists, links, code blocks, and more). Changes are saved immediately to the database and reflected for all visitors.

### User feedback

Logged-in users can submit feedback, bug reports, or suggestions using the **Feedback** button in the header. Each submission opens a threaded discussion — admins can reply from the **Admin** panel, and the user can respond in turn from their Feedback view.

- A badge on the user's Feedback button shows the number of threads awaiting their reply.
- A badge on the admin's Admin button shows the number of open feedback threads.
- Either party can close a thread; only admins can reopen a closed thread.
- Admin and moderator names are anonymised in the user-facing thread view — replies appear as coming from **Site Admins**.

---

## Time values

Isaac stores daily run completion times as a **frame count at 30 fps**. The frontend converts these automatically — e.g. `5400` frames → `3:00`.

---

## API reference

### Public endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/leaderboard` | Paginated daily leaderboard |
| `GET` | `/api/overall-leaderboard` | All-time aggregate rankings |
| `GET` | `/api/player/{steam_id}` | All runs for a specific player |
| `GET` | `/api/profile/{steam_id}` | Player profile with aggregate stats |
| `GET` | `/api/search` | Search players by name or Steam ID |
| `GET` | `/api/available-dates` | Dates with data for a version/sort |
| `GET` | `/api/avatars` | Batch-fetch Steam avatars |
| `GET` | `/api/stats` | Total entry count, unique player count, and last scrape timestamp |
| `GET` | `/api/stats/daily-counts` | Per-version daily participant counts over time (score sort only) |

### Auth endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/auth/steam` | Initiate Steam OpenID login |
| `GET` | `/api/auth/steam/callback` | Steam login callback (redirects with JWT) |
| `GET` | `/api/auth/me` | Current logged-in user |
| `GET` | `/api/follows` | List of Steam IDs the current user follows |
| `POST` | `/api/follows/{steam_id}` | Follow a player |
| `DELETE` | `/api/follows/{steam_id}` | Unfollow a player |
| `GET` | `/api/friends-leaderboard` | Today's leaderboard filtered to followed players |

### Report endpoints (any logged-in user)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/reports/{entry_id}` | Submit a report for a leaderboard entry |

### Moderation endpoints (moderator or admin)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/mod/hidden-entries` | Paginated list of all hidden scores |
| `POST` | `/api/mod/entries/{id}/hide` | Hide a score (`?source=direct\|report`) |
| `DELETE` | `/api/mod/entries/{id}/hide` | Unhide a score |
| `GET` | `/api/mod/reports` | Pending report queue |
| `POST` | `/api/mod/reports/{id}/dismiss` | Dismiss a report without action |

### Admin endpoints (admin only)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/mod/all-reports` | All reports across all statuses (`?status=pending\|resolved\|dismissed`) |
| `GET` | `/api/mod/moderators` | List all moderators |
| `GET` | `/api/mod/players/search` | Search all known players |
| `POST` | `/api/mod/users/{steam_id}/moderator` | Grant moderator role |
| `DELETE` | `/api/mod/users/{steam_id}/moderator` | Revoke moderator role |

### Feedback endpoints (any logged-in user)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/feedback` | Submit new feedback |
| `GET` | `/api/feedback/mine` | Current user's own feedback threads |
| `GET` | `/api/feedback/{id}` | Full thread (accessible to author or admin) |
| `POST` | `/api/feedback/{id}/messages` | Add a reply to a thread |
| `POST` | `/api/feedback/{id}/close` | Close a thread (author or admin) |

### Feedback endpoints (admin only)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/feedback` | All feedback threads (`?status=open\|closed`) |
| `POST` | `/api/feedback/{id}/reopen` | Reopen a closed thread |

### About page endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/about` | Fetch about page markdown content (public) |
| `PUT` | `/api/about` | Update about page content (admin only) |

### Scrape / admin endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/scrape/today` | Scrape today's runs for all versions |
| `POST` | `/api/scrape/seed` | Seed all historical data (two-phase: entries then names) |
| `POST` | `/api/scrape/backfill-names` | Resolve missing player names without re-scraping |
| `POST` | `/api/scrape/backfill-rp-time` | Populate `time_taken` for Repentance+ time-sort entries that have NULL (safe to re-run) |
| `POST` | `/api/scrape/refresh-stats` | Recompute overall-leaderboard stats for all versions and sort types |
| `GET` | `/api/admin/leaderboard-discovery` | Inspect raw Steam leaderboard names |

### `GET /api/leaderboard` parameters

| Param | Default | Values |
|-------|---------|--------|
| `version` | `repentance_plus_solo` | `afterbirth` · `afterbirth_plus` · `repentance` · `repentance_plus_solo` · `repentance_plus_coop` |
| `sort_type` | `score` | `score` · `time` |
| `date` | latest available | `YYYY-MM-DD` |
| `page` | `1` | ≥ 1 |
| `page_size` | `20` | 1 – 200 |
