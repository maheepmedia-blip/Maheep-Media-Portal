# Database Architecture — Maheep News Portal

## Tables
- `categories`: 10 primary editorial desks (`national`, `international`, `state`, `business`, `sports`, `technology`, `education`, `science`, `entertainment`, `editorial`).
- `states`: All 28 Indian States and 8 Union Territories with `type` (`state` | `ut`), `slug`, and official 2-letter `code`.
- `articles`: Bilingual (`en` | `hi`) news items with `status` (`draft`, `pending`, `published`, `archived`), `featured`, `breaking`, `ai_assisted`, `source_url`, and view counts.
- `editions`: Daily multi-page digital broadsheet editions indexed by `edition_date`.
- `rss_sources` & `rss_import_logs`: Automated RSS/Atom feed registry and per-run audit history.
- `admin_users`: Role-based editorial accounts (`super_admin`, `admin`, `editor`).
- `contacts`: Reader & consultation inquiries with delivery status.
- `newsletter_subscribers`: Morning briefing email subscribers.
- `site_settings`: Publishing mode, scheduler intervals, taglines, and admin email configuration.

## Supabase PostgreSQL Migration
Run `supabase/migrations/001_initial_schema.sql` followed by `supabase/seed.sql` in the Supabase SQL Editor. Row Level Security (RLS) ensures public visitors can only query `published` articles and editions, while write/admin operations require verified `admin_users` records.
