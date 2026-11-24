import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { initDatabase } from './server/db.ts';
import { registerApiRoutes } from './server/routes.ts';
import { startRssScheduler } from './server/rss.ts';

async function startServer() {
  initDatabase();
  startRssScheduler();

  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '6mb' }));

  registerApiRoutes(app);

  // Ensure API errors always return structured JSON rather than HTML
  app.use('/api', (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('API Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  });

  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd || !fs.existsSync(distDir)) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Maheep News Portal running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Maheep News Portal server:', err);
  process.exit(1);
});
