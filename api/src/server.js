import 'dotenv/config';
import app from './app.js';
import { initializeDatabase } from './database/db.js';
import { initializeStore } from './data/store.js';
import { startReminderCron } from './services/reminder-worker.js';

const PORT = Number(process.env.PORT || 4000);
const REMINDER_INTERVAL_MS = Number(process.env.REMINDER_INTERVAL_MS || 60 * 60 * 1000);

async function startServer() {
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_PATH?.trim()) {
    throw new Error('DATABASE_PATH must point to persistent storage in production.');
  }
  if (process.env.NODE_ENV === 'production' && (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be configured in production.');
  }
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  if (!Number.isFinite(REMINDER_INTERVAL_MS) || REMINDER_INTERVAL_MS < 60 * 1000) {
    throw new Error('REMINDER_INTERVAL_MS must be at least 60000 milliseconds.');
  }

  await initializeDatabase();
  await initializeStore();

  app.listen(PORT, () => {
    console.log(`Parking API running on port ${PORT}`);
    startReminderCron(REMINDER_INTERVAL_MS);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
