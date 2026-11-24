# Installation Guide — Maheep News Portal

## Prerequisites
- Node.js 20+ (with `npm.cmd` on Windows)
- Optional: Supabase account & project (PostgreSQL + Storage + Edge Functions)
- Optional: Gemini API key (`GEMINI_API_KEY`) for AI editorial tools
- Optional: SMTP credentials (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`) for email alerts to `maheepmedia@gmail.com`

## Local Setup (Windows PowerShell)
```powershell
npm.cmd install
copy .env.example .env
npm.cmd run dev
```
Open `http://localhost:3000`.

## First-Run Admin Setup
1. Navigate to `http://localhost:3000/admin`.
2. If `ADMIN_PASSCODE` is not set in `.env`, complete the one-time **Claim Primary Admin Account** form for `maheepmedia@gmail.com`.
3. Once claimed, public registration is permanently locked and only existing administrators can add new editorial roles.
