import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import fs from 'node:fs';
import 'dotenv/config';

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const hasEnvironmentCredentials = Boolean(
  firebaseProjectId || firebaseClientEmail || firebasePrivateKey,
);

if (
  hasEnvironmentCredentials &&
  !(firebaseProjectId && firebaseClientEmail && firebasePrivateKey)
) {
  throw new Error('Configure all Firebase credential environment variables or none of them.');
}

let credential;
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

const firebaseApp = credential
  ? getApps()[0] || initializeApp({ credential })
  : null;

export const firebaseAdmin = firebaseApp
  ? { messaging: () => getMessaging(firebaseApp) }
  : null;
export const firebaseFirestore = firebaseApp ? getFirestore(firebaseApp) : null;
