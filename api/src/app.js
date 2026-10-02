import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import authRoutes from './routes/auth.routes.js';
import serviceRoutes from './routes/service.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import vehicleRoutes from './routes/vehicle.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { timingSafeEqual } from 'node:crypto';
import { asyncHandler } from './middleware/async-handler.js';
import { checkAndDispatchReminders } from './services/reminder-worker.js';
import { checkStorageHealth } from './data/store.js';

const app = express();
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : false }));
app.use(express.json({ limit: '10kb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? ':method :status :response-time ms' : 'dev'));

app.get('/health', asyncHandler(async (req, res) => {
  try {
    if (await checkStorageHealth()) {
      return res.status(200).json({ status: 'ok', service: 'parking-api' });
    }
  } catch {
    console.warn('Storage health check failed.');
  }
  return res.status(503).json({ status: 'unavailable', service: 'parking-api' });
}));

app.get('/api/jobs/reminders', asyncHandler(async (req, res) => {
  const suppliedSecret = (req.headers.authorization || '').startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : '';
  const supplied = Buffer.from(suppliedSecret);
  const configuredSecrets = [process.env.REMINDER_JOB_SECRET, process.env.CRON_SECRET].filter(Boolean);
  const authenticated = configuredSecrets.some((secret) => {
    const expected = Buffer.from(secret);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  });
  if (!authenticated) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  return res.status(200).json(await checkAndDispatchReminders());
}));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/notifications', notificationRoutes);

app.use((err, req, res, next) => {
  console.error('Unhandled API error:', {
    name: err?.name || 'Error',
    code: typeof err?.code === 'string' || typeof err?.code === 'number' ? err.code : undefined,
  });
  const code = String(err?.code || '').toLowerCase();
  const transientStorageFailure = ['unavailable', 'deadline-exceeded', 'resource-exhausted', '14', '4', '8', 'sqlite_busy'].includes(code);
  const status = transientStorageFailure ? 503
    : Number.isInteger(err.status) && err.status >= 400 && err.status < 500
    ? err.status
    : 500;
  res.status(status).json({
    message: status === 500
      ? 'Internal server error'
      : status === 503
        ? 'Service temporarily unavailable'
        : err.message,
  });
});

export default app;
