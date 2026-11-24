# MAHEEP MEDIA — MAHEEP NEWS PORTAL

**सच के साथ, जनता के विश्वास के साथ** · *News from India & Beyond*

A production-ready bilingual (Hindi & English) digital newspaper platform covering National affairs, all 28 Indian States & 8 Union Territories, Business, Sports, Technology, Education, Science, Entertainment, daily printable A4 E-Paper editions, reader accounts, moderated comments, Web Push breaking alerts, and an automated newsroom desk.

## Architecture
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Lucide Icons, jsPDF
- **Backend**: Express + Vite middleware (`server.ts`), WAL SQLite persistence (`better-sqlite3`) on Render Persistent Disk (`DATA_DIR`), verified online backups, RSS 2.0/Atom collector (`fast-xml-parser`), server-side Gemini AI editorial assistant (`@google/genai`), SMTP delivery & retry queue (`nodemailer`), Web Push (`web-push`)
- **Cloud & Hosting**: Render blueprint (`render.yaml`), external/internal lock-safe scheduler (`/api/cron/:jobName`), plus Supabase PostgreSQL migration & Cloudflare Pages support

## Quick Start
```bash
npm install
cp .env.example .env
npm run dev
```

See `/documentation/` for `INSTALLATION.md`, `DATABASE.md`, `DEPLOYMENT.md`, `ADMIN-GUIDE.md`, and `MIGRATION.md`.

