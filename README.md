# GreediestButt

Daily run leaderboards for The Binding of Isaac (all versions).

## Stack

- **Backend**: FastAPI · SQLAlchemy (async) · PostgreSQL · Alembic · httpx · defusedxml
- **Frontend**: React 18 · Vite · TypeScript · TanStack Query · Tailwind CSS

---

## Production deployment

The full stack runs as four Docker containers: Postgres, backend, frontend, and Caddy (reverse proxy / TLS termination).

### 1. Configure

```bash
cp .env.example .env
```

Edit `.env` and fill in the required variables (see [Configuration](#configuration) for the full reference).

### 2. Obtain a Cloudflare Origin Certificate

The site is designed to sit behind Cloudflare with **Full (Strict)** SSL mode. Caddy terminates TLS using a Cloudflare Origin Certificate rather than Let's Encrypt.

In the Cloudflare dashboard: **SSL/TLS → Origin Server → Create Certificate**. Leave defaults (RSA, 15 years) and copy the certificate and private key into the `certs/` directory:

```bash
mkdir -p certs
nano certs/origin.pem   # paste the certificate block
nano certs/origin.key   # paste the private key block
chmod 600 certs/origin.key
```

Then update `Caddyfile` with your actual domain name (replace `yourdomain.com`).

### 3. Build and start

```bash
docker compose up -d --build
```

All four services start. Database migrations run automatically when the backend starts. Caddy listens on ports 80 and 443 and proxies to the frontend container internally.

### 4. Set the first admin

The first admin must be set from the command line:

```bash
docker compose exec backend python set_role.py <steam_id> admin
```

The user must have logged in via the site at least once first.

### Redeploying

```bash
docker compose up -d --build
```

Migrations are applied automatically on restart. Postgres data persists in the `pgdata` Docker volume across deploys.

### Firewall

Docker modifies `iptables` directly and bypasses UFW by default. The solution has two parts: hook into Docker's `DOCKER-USER` chain via `after.rules`, and keep UFW's allow-list restricted to Cloudflare IP ranges.

#### 1. Allow SSH and enable UFW

```bash
ufw allow 22
ufw enable
```

#### 2. Configure the DOCKER-USER chain

Append the following block to `/etc/ufw/after.rules`. It installs the `DOCKER-USER` chain, uses connection tracking to permit related/established traffic and accept inter-container traffic, and returns early for RFC-1918 source addresses while logging and dropping everything else.

```
# BEGIN UFW AND DOCKER
*filter
:ufw-user-forward - [0:0]
:ufw-docker-logging-deny - [0:0]
:DOCKER-USER - [0:0]
-A DOCKER-USER -j ufw-user-forward

-A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
-A DOCKER-USER -m conntrack --ctstate INVALID -j DROP
-A DOCKER-USER -i docker0 -o docker0 -j ACCEPT

-A DOCKER-USER -j RETURN -s 10.0.0.0/8
-A DOCKER-USER -j RETURN -s 172.16.0.0/12
-A DOCKER-USER -j RETURN -s 192.168.0.0/16

-A DOCKER-USER -j ufw-docker-logging-deny -m conntrack --ctstate NEW -d 10.0.0.0/8
-A DOCKER-USER -j ufw-docker-logging-deny -m conntrack --ctstate NEW -d 172.16.0.0/12
-A DOCKER-USER -j ufw-docker-logging-deny -m conntrack --ctstate NEW -d 192.168.0.0/16

-A DOCKER-USER -j RETURN

-A ufw-docker-logging-deny -m limit --limit 3/min --limit-burst 10 -j LOG --log-prefix "[UFW DOCKER BLOCK] "
-A ufw-docker-logging-deny -j DROP

COMMIT
# END UFW AND DOCKER
```

#### 3. Restrict inbound traffic to Cloudflare IPs

Save the following script to `/usr/local/sbin/cf-ufw.sh` and make it executable. It fetches Cloudflare's current IP ranges and issues `ufw allow` and `ufw route allow` rules for ports 80 and 443. UFW skips any rule that already exists, so the script is safe to re-run.

```bash
#!/bin/sh
#
#  UFW rule updater to only allow HTTP and HTTPS traffic from Cloudflare IP addresses.
#  Readme: https://github.com/jakejarvis/cloudflare-ufw-updater/blob/master/README.md
#
#  Inspired by https://github.com/Paul-Reed/cloudflare-ufw/blob/master/cloudflare-ufw.sh
#
#  To run as a daily cron job:
#    1. sudo crontab -e
#    2. Add this line to the end:
#        @daily /this/file/location/cf-ufw.sh &> /dev/null
#

# Fetch latest IP range lists (both v4 and v6) from Cloudflare
curl -s https://www.cloudflare.com/ips-v4 -o /tmp/cf_ips
echo "" >> /tmp/cf_ips
curl -s https://www.cloudflare.com/ips-v6 >> /tmp/cf_ips

# Restrict traffic to ports 80 (TCP) & 443 (TCP)
# UFW will skip a subnet if a rule already exists (which it probably does)
for ip in $(cat /tmp/cf_ips)
do
    ufw allow from "$ip" to any port 80,443 proto tcp comment 'Cloudflare'
    ufw route allow proto tcp from "$ip" to any port 443 comment 'Cloudflare'
done

# Delete downloaded lists from above
rm /tmp/cf_ips

# Need to reload UFW before new rules take effect
ufw reload
```

```bash
sudo chmod +x /usr/local/sbin/cf-ufw.sh
sudo /usr/local/sbin/cf-ufw.sh
```

#### 4. Schedule daily IP range updates

Cloudflare's IP ranges change occasionally. Run the script on a daily cron to keep rules current:

```bash
sudo crontab -e
```

Add:

```
@daily /usr/local/sbin/cf-ufw.sh &> /dev/null
```

#### Attribution

- DOCKER-USER chain approach: [chaifeng/ufw-docker](https://github.com/chaifeng/ufw-docker)
- Cloudflare IP updater script: [jakejarvis/cloudflare-ufw-updater](https://github.com/jakejarvis/cloudflare-ufw-updater/blob/master/README.md)

---

## CI/CD

A GitHub Actions workflow is included at `.github/workflows/deploy.yml`. On every push to `main` it:

1. Builds the frontend and checks for TypeScript errors
2. Installs backend dependencies and checks all Python files for syntax errors
3. If both pass, SSHs into the VPS and runs `git pull && docker compose up -d --build`

Add three secrets to the GitHub repository (Settings → Secrets → Actions):

| Secret | Value |
|--------|-------|
| `VPS_HOST` | IP or hostname of your VPS |
| `VPS_USER` | SSH username |
| `VPS_SSH_KEY` | Private key whose public key is in `~/.ssh/authorized_keys` on the VPS |

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

Config is read from the root `.env` file by Docker Compose. Copy `.env.example` as a starting point.

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_URL` | Yes | Public URL of the site — used for Steam OpenID redirects. |
| `SESSION_SECRET` | Yes | Long random string used to sign JWTs. Generate with: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `DOMAIN` | Yes | Your domain name — used by Caddy for the HTTPS virtual host (e.g. `yourdomain.com`). |
| `STEAM_API_KEY` | Recommended | Resolves player names and avatars. Without it, entries show raw Steam IDs. Get one at <https://steamcommunity.com/dev/apikey> |
| `DB_PASSWORD` | No | Postgres password (default: `postgres` — change in production). |
| `*_PATTERN` | No | Regex patterns for matching Steam leaderboard names to versions. Leave blank to use built-in defaults. See [Configuring version detection](#configuring-version-detection). |

### Local development

Config is read from `backend/.env`. Copy `backend/.env.example` as a starting point.

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

The backend runs three scheduled jobs automatically:

- **Every 10 minutes** — scrapes today's and yesterday's leaderboards for all versions and refreshes overall-leaderboard stats for any players whose scores changed.
- **Every 15 minutes** — resolves up to 70,312 player names that are missing from the cache, prioritising players with the most recent runs (≤ 704 Steam API calls per run, ≤ 67,500/day).
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

### Authentication for scrape endpoints

All scrape and admin endpoints require an admin account. Authenticate with either:

- **Browser session** (JWT): log in to the site as an admin and use the browser session normally.
- **API key** (for curl/scripts): visit the Admin panel to get your API key, then pass it as a header:

```bash
curl -X POST https://yourdomain.com/api/scrape/today \
  -H "X-API-Key: gbt_your_key_here"
```

API keys are per-admin, expire after 1 hour, and can be regenerated from the Admin panel. A new key immediately invalidates the previous one.

### Seed all historical data

```bash
# All history since Isaac launch (slow — may take hours)
curl -X POST "https://yourdomain.com/api/scrape/seed" \
  -H "X-API-Key: gbt_your_key_here"

# Limit to a specific start date
curl -X POST "https://yourdomain.com/api/scrape/seed?from_date=2024-01-01" \
  -H "X-API-Key: gbt_your_key_here"
```

The endpoint returns immediately with a `run_id`. The seed runs in the background in three phases:

1. **Entries** — fetches all leaderboard entries, skipping boards already in the database
2. **Names** — resolves player names for all Steam IDs not yet in the name cache
3. **Stats** — rebuilds the overall leaderboard stats cache

If interrupted, calling the endpoint again resumes from the phase that was in progress. The current phase is stored in the database and cleared automatically when seeding completes.

Track progress by filtering server logs for the run ID:

```bash
docker compose logs -f backend | grep <first-8-chars-of-run-id>
```

### Other manual endpoints

All three endpoints below return 202 immediately and run in the background. Progress is visible in the Admin panel's Scheduled Jobs section.

```bash
# Scrape today's runs (runs in background, returns 202)
curl -X POST https://yourdomain.com/api/scrape/today \
  -H "X-API-Key: gbt_your_key_here"

# Resolve missing player names without re-scraping (runs in background, returns run_id)
curl -X POST https://yourdomain.com/api/scrape/backfill-names \
  -H "X-API-Key: gbt_your_key_here"

# Rebuild overall stats cache for all versions/sort types (runs in background, returns 202)
curl -X POST https://yourdomain.com/api/scrape/refresh-stats \
  -H "X-API-Key: gbt_your_key_here"
```

### Suggested cron job (optional)

If the server is not running continuously, a cron job can supplement the built-in scheduler. Use a time that avoids 02:00 UTC:

```cron
# Scrape today's leaderboards every day at 03:00 UTC
0 3 * * * curl -s -X POST https://yourdomain.com/api/scrape/today -H "X-API-Key: gbt_your_key_here" >> /var/log/gbtwopointoh.log 2>&1
```

---

## Configuring version detection

Isaac daily run leaderboards on Steam follow a naming convention that may differ from the defaults. After starting the backend:

1. Call the discovery endpoint to see a sample of detected leaderboards:

   ```bash
   curl -H "X-API-Key: gbt_your_key_here" \
     "https://yourdomain.com/api/admin/leaderboard-discovery?sample_size=50"
   ```

2. Inspect the `name` field of returned leaderboards and note which patterns correspond to each version.

3. Update the `*_PATTERN` variables in `.env` and redeploy.

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
| Unban a player (restore all hidden scores) | — | ✓ |
| View and respond to user feedback | — | ✓ |
| Reopen closed feedback threads | — | ✓ |
| Admin panel (including API key) | — | ✓ |

### Assigning the first admin via command line

Since the admin panel requires an existing admin to manage roles, the first admin must be set directly from the command line:

```bash
docker compose exec backend python set_role.py <steam_id> admin
```

Other valid roles:

```bash
docker compose exec backend python set_role.py <steam_id> moderator   # grant moderator
docker compose exec backend python set_role.py <steam_id> none        # remove any role
```

The user must have logged in at least once before this command will work (their Steam ID must exist in the `users` table).

### Managing roles via the admin panel

Once an admin is set, additional moderators can be managed through the in-app **Admin** panel (visible in the header when logged in as admin). The panel lets you search for any player who has appeared on a leaderboard and grant or revoke their moderator role.

### Hiding scores

Moderators and admins can hide individual scores from leaderboards using the **✕** button that appears on each row when logged in with a privileged role. Hidden scores are excluded from rankings and the ranks of remaining scores are renumbered without gaps.

### Auto-moderation

During every scrape, entries with field values that are physically impossible on their version are automatically hidden with source `automod`. The current rules apply to **all versions** (Repentance+, Repentance, Afterbirth+, and Afterbirth):

| Field | Maximum allowed |
|-------|----------------|
| `time_penalty` | 2,147,483,647 |
| `schwag_bonus` | 19,150 |

Automod-hidden entries count toward the auto-ban threshold the same as manually hidden ones.

To retroactively apply these rules to scores already in the database:

```bash
docker compose exec db psql -U postgres -d greediest_butt -c "
UPDATE leaderboard_entries le
SET    hidden = true,
       hidden_at = now(),
       hidden_source = 'automod'
FROM   daily_runs dr
WHERE  le.daily_run_id = dr.id
  AND  dr.version IN ('repentance', 'repentance_plus_solo', 'repentance_plus_coop', 'afterbirth_plus', 'afterbirth')
  AND  le.hidden = false
  AND  (le.time_penalty > 2147483647 OR le.schwag_bonus > 19150);
"
```

### Auto-ban

If a player accumulates **5 or more hidden scores**, all of their scores are automatically hidden and they are excluded from all leaderboards. This threshold is defined by `AUTO_BAN_THRESHOLD` in `backend/app/api/filters.py`.

### Unbanning a player

Admins can unban a player from the player's profile page. Clicking **Unban** restores all of their hidden scores to visibility and removes them from the auto-ban exclusion list. The button is only shown when the player currently meets the auto-ban threshold.

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
| `GET` | `/api/entry/{id}` | Full detail for a single leaderboard entry (rank, score/time, bonuses, penalties, date, version) |
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
| `GET` | `/api/mod/players/{steam_id}/hidden-runs` | Hidden runs for a specific player (`?version=&sort_type=`) |
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
| `POST` | `/api/mod/players/{steam_id}/unban` | Restore all hidden scores for a player |
| `GET` | `/api/admin/api-key` | Get current API key (auto-generates if expired) |
| `POST` | `/api/admin/api-key/regenerate` | Issue a new API key, invalidating the current one |
| `GET` | `/api/admin/scheduler` | Current status of all scheduled jobs (last run, next run, running flag) |

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

### Scrape / admin endpoints (admin only)

All scrape endpoints require admin authentication — pass `Authorization: Bearer <jwt>` or `X-API-Key: <key>`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/scrape/today` | Scrape today's runs for all versions — returns 202, runs in background |
| `POST` | `/api/scrape/seed` | Start background seed of all historical data — returns 202 with `run_id` (resumable) |
| `POST` | `/api/scrape/backfill-names` | Start background player name resolution — returns 202 with `run_id`. Optional `?limit=N` caps the number resolved. |
| `POST` | `/api/scrape/backfill-rp-time` | Populate `time_taken` for Repentance+ time-sort entries that have NULL (safe to re-run) |
| `POST` | `/api/scrape/refresh-stats` | Recompute overall-leaderboard stats for all versions and sort types — returns 202, runs in background |
| `GET` | `/api/admin/leaderboard-discovery` | Inspect raw Steam leaderboard names |

### `GET /api/leaderboard` parameters

| Param | Default | Values |
|-------|---------|--------|
| `version` | `repentance_plus_solo` | `afterbirth` · `afterbirth_plus` · `repentance` · `repentance_plus_solo` · `repentance_plus_coop` |
| `sort_type` | `score` | `score` · `time` |
| `date` | latest available | `YYYY-MM-DD` |
| `page` | `1` | ≥ 1 |
| `page_size` | `20` | 1 – 200 |
