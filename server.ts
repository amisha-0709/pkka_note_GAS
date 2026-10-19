/**
 * Pakka Note - Full-Stack Express Server with Vite Middleware
 */

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { healthRouter } from './src/server/routes/health.ts';
import { captureRouter } from './src/server/routes/capture.ts';
import { readbackRouter } from './src/server/routes/readback.ts';
import { confirmationRouter } from './src/server/routes/confirmation.ts';
import { correctionRouter } from './src/server/routes/correction.ts';
import { recordsRouter } from './src/server/routes/records.ts';
import { benchmarkRouter } from './src/server/routes/benchmark.ts';
import { testConnectionRouter } from './src/server/routes/testConnection.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isProduction = process.env.NODE_ENV === 'production';

  // Body parsers for JSON and URL-encoded
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Mount API routers
  app.use(healthRouter);
  app.use(captureRouter);
  app.use(readbackRouter);
  app.use(confirmationRouter);
  app.use(correctionRouter);
  app.use(recordsRouter);
  app.use(benchmarkRouter);
  app.use(testConnectionRouter);
  
  // Guarantee that any unhandled /api/* route returns JSON, never Vite HTML fallback
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      success: false,
      errorCode: 'API_ROUTE_NOT_FOUND',
      message: `API endpoint ${req.method} ${req.path} not found.`,
    });
  });

  // Global error handler for API routes
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api')) {
      console.error('[API Server Error]', err);
      return res.status(200).json({
        success: false,
        errorCode: 'INTERNAL_SERVER_ERROR',
        message: err.message || 'Internal server error occurred.',
      });
    }
    next(err);
  });

  if (!isProduction) {
    // Development mode: Mount Vite middleware
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production mode: Serve static dist assets
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Pakka Note] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Pakka Note] Failed to start server:', err);
  process.exit(1);
});
