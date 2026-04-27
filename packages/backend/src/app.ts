import { Hono } from 'hono';
import { sharedSecret, withCors } from './middleware';
import { analyzeRoutes } from './routes/analyze';
import { historyRoutes } from './routes/history';
import { quotaRoutes } from './routes/quota';
import { reportRoutes } from './routes/report';

export function createApp() {
  const app = new Hono();
  app.use('*', withCors());
  app.get('/', (c) => c.json({ status: 'ok', service: 'criticus' }));
  app.use('*', sharedSecret());
  app.route('/quota', quotaRoutes);
  app.route('/analyze', analyzeRoutes);
  app.route('/history', historyRoutes);
  app.route('/report', reportRoutes);
  return app;
}
