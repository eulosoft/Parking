import app from '../src/app.js';
import { initializeStore } from '../src/data/store.js';

let initialization;
async function ensureInitialized() {
  if (!initialization) {
    initialization = (async () => {
      const cronSecret = process.env.CRON_SECRET?.trim() || process.env.REMINDER_JOB_SECRET?.trim();
      if (!cronSecret || cronSecret.length < 32) {
        throw new Error('A production reminder secret is required.');
      }
      await initializeStore();
    })().catch((error) => {
      initialization = undefined;
      throw error;
    });
  }
  return initialization;
}

export default async function handler(req, res) {
  try {
    await ensureInitialized();
    await new Promise((resolve) => {
      res.once('finish', resolve);
      res.once('close', resolve);
      app(req, res);
    });
  } catch (error) {
    // Do not log environment values, Firebase errors, or document data.
    console.error('API initialization failed:', error?.name || 'Error');
    return res.status(503).json({ message: 'Service temporarily unavailable' });
  }
}
