# Deployment Guide — Maheep News Portal

## 1. Build Verification
```powershell
npm.cmd run build
npm.cmd run lint
```

## 2. Full-Stack Node Deployment
Set environment variables in your host (Cloud Run / VPS / Render / Railway):
- `PORT=3000`
- `NODE_ENV=production`
- `GEMINI_API_KEY` (server-side secret)
- `ADMIN_PASSCODE` (optional override)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ADMIN_EMAIL=maheepmedia@gmail.com`

Start command:
```powershell
npm.cmd run start
```

## 3. Cloudflare Pages + Supabase Deployment
1. Push repository to GitHub.
2. In Cloudflare Pages, connect the GitHub repository with build command `npm run build` and output directory `dist` (configured in `wrangler.toml` and `public/_redirects`).
3. Apply `supabase/migrations/001_initial_schema.sql` and `supabase/seed.sql` in Supabase.
4. Deploy Edge Functions (`supabase functions deploy collect-rss`, `ai-assistant`, `submit-contact`) and set `GEMINI_API_KEY` in Supabase Secrets.
5. Connect your custom domain inside Cloudflare Pages -> Custom Domains.
