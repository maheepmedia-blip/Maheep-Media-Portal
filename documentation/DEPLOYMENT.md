# Deployment Guide — Maheep Media / Maheep News Portal

## 1. Build & Lint Verification
```bash
npm run build
npm run lint
```

## 2. Render Production Deployment (Recommended)
A production `render.yaml` blueprint is included at the repository root.
- **Node Version**: `.nvmrc` (`22`) and `package.json` `engines` (`>=22.14.0`).
- **Build Command**: `npm ci && npm run build`
- **Start Command**: `npm start` (`tsx server.ts`)
- **Health Check Path**: `/api/health`
- **Persistent Disk**: Mount a Render Persistent Disk at `/var/data/maheep` and set `DATA_DIR=/var/data/maheep`. This persists:
  - SQLite database (`$DATA_DIR/maheep.db` in WAL mode)
  - Uploaded editorial and ad media (`$DATA_DIR/uploads`)
  - Verified database backups (`$DATA_DIR/backups`)

### Required & Optional Environment Variables
- `NODE_ENV=production`
- `PORT=3000`
- `APP_URL=https://your-domain.onrender.com`
- `DATA_DIR=/var/data/maheep` (or `DB_PATH` for an explicit SQLite file path)
- `SESSION_SECRET` (required in production for stable admin and reader JWT signing across restarts)
- `CRON_SECRET` (secret header token for authenticated external cron triggers)
- `GEMINI_API_KEY` (server-side Gemini AI key; never exposed to browser clients)
- `ADMIN_PASSCODE` (initial bootstrap passcode if claiming/resetting `maheepmedia@gmail.com`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `ADMIN_EMAIL=maheepmedia@gmail.com`
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (optional; auto-generated and stored in `site_settings` if omitted)

## 3. External Cron Triggers (Free via GitHub Actions)
A workflow at `.github/workflows/cron.yml` triggers all scheduled newsroom jobs at **$0/month** via GitHub Actions (avoiding paid Render Cron Jobs):
1. In GitHub Repository **Settings → Secrets and variables → Actions**, add:
   - `APP_URL` = your live Render URL (e.g. `https://maheep-news-portal.onrender.com`)
   - `CRON_SECRET` = matching `CRON_SECRET` from Render Environment Variables
2. Supported jobs at `POST /api/cron/<jobName>`: `rss_collect`, `rss_retry_failed`, `publish_scheduled`, `ai_audit_pending`, `epaper_daily`, `digest_daily`, `email_retry`, `db_backup`, `health_monitor`, `weekly_report`, `cleanup_weekly`.

> **Render Free vs Paid Plan Note**: `render.yaml` specifies `plan: starter` + a 5 GB Persistent Disk (`/var/data/maheep`) so SQLite data and uploaded images survive redeploys. Render's Free Web Service plan does not support Persistent Disks (its local disk resets on redeploy). If you prefer $0/month free-tier database persistence, use the included Supabase PostgreSQL schema (`supabase/migrations/001_initial_schema.sql`).

## 4. Cloudflare Pages + Supabase Option
1. Push repository to GitHub.
2. Connect GitHub repository in Cloudflare Pages with build command `npm run build` and output directory `dist`.
3. Apply `supabase/migrations/001_initial_schema.sql` and `supabase/seed.sql` in Supabase.
4. Deploy Edge Functions (`collect-rss`, `ai-assistant`, `submit-contact`) and configure `GEMINI_API_KEY` in Supabase Secrets.

