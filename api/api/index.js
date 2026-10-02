import app from '../src/app.js';
import { initializeStore } from '../src/data/store.js';

const safeInitializationMessages = new Set([
  'A production reminder secret is required.',
  'Valid ADMIN_EMAIL and ADMIN_PASSWORD (16–128 characters) are required.',
  'Configure all Firebase credential environment variables or none of them.',
  'FIREBASE_PROJECT_ID is required when STORAGE_DRIVER=firestore.',
  'Firebase credentials are required when STORAGE_DRIVER=firestore.',
  'Unable to initialize Firebase credentials; verify the configured credential source.',
  'Firestore is required when STORAGE_DRIVER=firestore.',
]);

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
    const code = typeof error?.code === 'string' || typeof error?.code === 'number'
      ? error.code
      : undefined;
    const message = safeInitializationMessages.has(error?.message) ? error.message : undefined;
    console.error('API initialization failed:', {
      name: error?.name || 'Error',
      ...(code !== undefined ? { code } : {}),
      ...(message ? { reason: message } : {}),
    });
    return res.status(503).json({ message: 'Service temporarily unavailable' });
  }
}
