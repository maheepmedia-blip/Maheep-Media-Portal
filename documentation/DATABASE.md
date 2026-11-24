# Database Architecture — Maheep Media / Maheep News Portal

## Persistent Storage Layout (`DATA_DIR`)
All persistent runtime artifacts resolve from `DATA_DIR` (`process.env.DATA_DIR || process.env.RENDER_DISK_PATH || ./data`):
- SQLite database (WAL mode + `foreign_keys = ON`): `$DATA_DIR/maheep.db` (override via `DB_PATH`)
- Uploaded editorial & ad images: `$DATA_DIR/uploads` (served at `/uploads/*`)
- Verified SQLite backups: `$DATA_DIR/backups`

Backups use `better-sqlite3`'s online `db.backup()` API followed by read-only `PRAGMA integrity_check(1)`. Restores verify the target backup first and automatically create a pre-restore snapshot.

## Core & Upgraded Tables
- `categories`: 10 primary editorial desks (`national`, `international`, `state`, `business`, `sports`, `technology`, `education`, `science`, `entertainment`, `editorial`).
- `states`: All 28 Indian States and 8 Union Territories with `type` (`state` | `ut`), `slug`, and official 2-letter `code`.
- `articles`: Bilingual (`en` | `hi`) news items with `status` (`draft`, `pending`, `published`, `archived`), `featured`, `breaking`, `breaking_candidate`, `ai_assisted`, `ai_audit_json`, `scheduled_at`, `unpublish_at`, `reviewed_by`, `reviewed_at`, `preview_token`, `source_url`, and view counts.
- `article_revisions`: Snapshot revision history for editorial audit and one-click rollback.
- `editions`: Daily multi-page digital broadsheet editions indexed by `edition_date`.
- `rss_sources` & `rss_import_logs`: Automated RSS 2.0/Atom feed registry, failure tracking, and per-run audit history.
- `ads`: Banner/sidebar/inline advertisement slots with scheduling and impression/click tracking.
- `admin_users` & `admin_audit_logs`: Role-based editorial accounts (`super_admin`, `admin`, `editor`) and tamper-evident audit logs.
- `cron_job_runs` & `job_locks`: Persistent scheduler run history and concurrency locks to prevent duplicate scheduled executions.
- `ai_usage_logs`: Server-side Gemini request telemetry (task, latency, status, token usage).
- `contacts`, `newsletter_subscribers` (with double opt-in `confirmed`, `confirm_token`, `unsubscribe_token`, `language_pref`, `digest_frequency`), & `email_logs` (delivery + retry queue).
- `reader_users`, `reader_bookmarks`, `reader_history`, & `comments` (moderated reader comments).
- `push_subscriptions`: Web Push endpoint subscriptions (`endpoint`, `p256dh`, `auth`, language/category preferences).
- `analytics_events`: Lightweight first-party article view and reader interaction events.
- `site_settings`: Publishing mode (`manual_approval` default on fresh installs), scheduler intervals, taglines, VAPID keys, and admin email configuration.

## Supabase PostgreSQL Migration
Run `supabase/migrations/001_initial_schema.sql` followed by `supabase/seed.sql` in the Supabase SQL Editor. Row Level Security (RLS) ensures public visitors can only query `published` articles and editions, while write/admin operations require verified `admin_users` records.

