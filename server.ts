import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { recordSystemError } from './server/audit.ts';
import { initDatabase } from './server/db.ts';
import { ensureAllEditionsDetailed25Pages } from './server/epaper.ts';
import { startUnifiedScheduler } from './server/jobs.ts';
import { registerApiRoutes } from './server/routes.ts';
import { injectRouteSeoMeta, resolveCanonicalBaseUrl } from './server/seoMiddleware.ts';

async function startServer() {
  initDatabase();
  ensureAllEditionsDetailed25Pages();
  startUnifiedScheduler();

  const app = express();
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  // Security headers (preserve iframe compatibility for preview environments)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
    next();
  });

  app.use(express.json({ limit: '6mb' }));

  registerApiRoutes(app);

  // Ensure API errors always return structured JSON rather than HTML
  app.use('/api', (err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('API Error:', err);
    recordSystemError({ source: 'express', route: `${req.method} ${req.originalUrl}`, error: err });
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
    app.use(async (req, res, next) => {
      const reqPath = req.path || '/';
      const isDocumentRequest =
        req.method === 'GET' &&
        !reqPath.startsWith('/@') &&
        !reqPath.startsWith('/src/') &&
        !reqPath.startsWith('/node_modules/') &&
        !reqPath.startsWith('/assets/') &&
        !reqPath.startsWith('/uploads/') &&
        !/\.[a-zA-Z0-9]{1,8}$/.test(reqPath);
      if (!isDocumentRequest) {
        next();
        return;
      }
      try {
        const rawHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        const finalHtml = injectRouteSeoMeta(transformed, req.originalUrl, resolveCanonicalBaseUrl());
        res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').end(finalHtml);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(distDir, {
        index: false,
        maxAge: '7d',
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    let cachedProdTemplate = '';
    app.get('*', (req, res) => {
      if (!cachedProdTemplate) {
        cachedProdTemplate = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
      }
      const finalHtml = injectRouteSeoMeta(cachedProdTemplate, req.originalUrl, resolveCanonicalBaseUrl());
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').end(finalHtml);
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Maheep News Portal running on http://localhost:${PORT}`);
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  recordSystemError({ source: 'process', route: 'unhandledRejection', error: reason });
});

startServer().catch((err) => {
  console.error('Failed to start Maheep News Portal server:', err);
  recordSystemError({ source: 'startup', route: 'startServer', error: err });
  process.exit(1);
});
