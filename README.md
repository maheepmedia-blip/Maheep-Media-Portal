# MAHEEP NEWS PORTAL

**सच के साथ, जनता के विश्वास के साथ** · *News from India & Beyond*

A complete, production-ready bilingual (Hindi & English) digital newspaper platform covering National affairs, all 28 Indian States & 8 Union Territories, Business, Sports, Technology, Education, Science, Entertainment, and daily printable A4 E-Paper editions.

## Architecture
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Lucide Icons, jsPDF
- **Backend**: Express + Vite middleware (`server.ts`), SQLite persistence (`better-sqlite3`), RSS 2.0/Atom parser (`fast-xml-parser`), Gemini AI News Assistant (`@google/genai`), SMTP notifications (`nodemailer`)
- **Cloud Migration Ready**: Full Supabase PostgreSQL schema (`supabase/migrations/001_initial_schema.sql`), Edge Functions (`supabase/functions/*`), and Cloudflare Pages config (`wrangler.toml`)

## Quick Start (Windows PowerShell)
```powershell
npm.cmd install
copy .env.example .env
npm.cmd run dev
```

See `/documentation/` for `INSTALLATION.md`, `DATABASE.md`, `DEPLOYMENT.md`, `ADMIN-GUIDE.md`, and `MIGRATION.md`.
