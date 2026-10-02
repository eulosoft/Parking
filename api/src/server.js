import 'dotenv/config';
import app from './app.js';
import { initializeStore } from './data/store.js';
import { startReminderCron } from './services/reminder-worker.js';

const PORT = Number(process.env.PORT || 4000);
const REMINDER_INTERVAL_MS = Number(process.env.REMINDER_INTERVAL_MS || 60 * 60 * 1000);

async function startServer() {
  const driver = process.env.STORAGE_DRIVER || 'sqlite';
  if (process.env.NODE_ENV === 'production' && driver !== 'firestore') {
    throw new Error('STORAGE_DRIVER=firestore is required in production; SQLite is not persistent on Vercel.');
  }
  if (!process.env.ADMIN_EMAIL?.trim() || !process.env.ADMIN_PASSWORD
    || process.env.ADMIN_PASSWORD.length < 16 || process.env.ADMIN_PASSWORD.length > 128) {
    throw new Error('Valid ADMIN_EMAIL and ADMIN_PASSWORD (16–128 characters) are required.');
  }
  const reminderSecret = process.env.REMINDER_JOB_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (process.env.NODE_ENV === 'production' && (!reminderSecret || reminderSecret.length < 32)) {
    throw new Error('REMINDER_JOB_SECRET (or Vercel CRON_SECRET) must contain at least 32 characters in production.');
  }
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  if (!Number.isFinite(REMINDER_INTERVAL_MS) || REMINDER_INTERVAL_MS < 60 * 1000) {
    throw new Error('REMINDER_INTERVAL_MS must be at least 60000 milliseconds.');
  }

  if (driver === 'sqlite') {
    const { initializeDatabase } = await import('./database/db.js');
    await initializeDatabase();
  }
  await initializeStore();

  app.listen(PORT, () => {
    console.log(`Parking API running on port ${PORT}`);
    if (!process.env.VERCEL && driver === 'sqlite') startReminderCron(REMINDER_INTERVAL_MS);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error?.name || 'Error');
  process.exit(1);
});
