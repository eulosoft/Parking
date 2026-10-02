import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import fs from 'node:fs';
import 'dotenv/config';

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const firestoreDriver = (process.env.STORAGE_DRIVER || 'sqlite') === 'firestore';
const hasEnvironmentCredentials = Boolean(
  firebaseClientEmail || firebasePrivateKey,
);

if (
  hasEnvironmentCredentials &&
  !(firebaseProjectId && firebaseClientEmail && firebasePrivateKey)
) {
  throw new Error('Configure all Firebase credential environment variables or none of them.');
}
if (firestoreDriver && !firebaseProjectId) {
  throw new Error('FIREBASE_PROJECT_ID is required when STORAGE_DRIVER=firestore.');
}
if (firestoreDriver && !serviceAccountPath && !hasEnvironmentCredentials
  && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error('Firebase credentials are required when STORAGE_DRIVER=firestore.');
}

let credential;
try {
  if (serviceAccountPath) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    credential = cert(serviceAccount);
  } else if (hasEnvironmentCredentials) {
    credential = cert({
      projectId: firebaseProjectId,
      clientEmail: firebaseClientEmail,
      privateKey: firebasePrivateKey,
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credential = applicationDefault();
  }
} catch {
  throw new Error('Unable to initialize Firebase credentials; verify the configured credential source.');
}

const firebaseApp = credential
  ? getApps()[0] || initializeApp({ credential, ...(firebaseProjectId ? { projectId: firebaseProjectId } : {}) })
  : null;

export const firebaseAdmin = firebaseApp
  ? {
      auth: () => getAuth(firebaseApp),
      messaging: () => getMessaging(firebaseApp),
    }
  : null;
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
export const firebaseFirestore = firebaseApp ? getFirestore(firebaseApp) : null;
