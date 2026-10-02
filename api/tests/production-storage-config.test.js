import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runModuleWith = (modulePath, overrides) => {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    JWT_SECRET: 'test-only-jwt-secret-with-at-least-32-chars',
    ...overrides,
  };
  return spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    `import(${JSON.stringify(modulePath)}).catch((error) => { console.error(error.message); process.exitCode = 1; });`,
  ], { cwd: fileURLToPath(new URL('..', import.meta.url)), env, encoding: 'utf8' });
};

test('production refuses SQLite as a storage driver', () => {
  const result = runModuleWith('./src/data/store.js', { STORAGE_DRIVER: 'sqlite' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /STORAGE_DRIVER=firestore is required in production/);
});

test('Firestore mode refuses to initialize without an explicit project ID', () => {
  const result = runModuleWith('./src/config/firebase.js', {
    STORAGE_DRIVER: 'firestore',
    FIREBASE_PROJECT_ID: '',
    FIREBASE_CLIENT_EMAIL: '',
    FIREBASE_PRIVATE_KEY: '',
    FIREBASE_SERVICE_ACCOUNT_PATH: '',
    GOOGLE_APPLICATION_CREDENTIALS: '',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /FIREBASE_PROJECT_ID is required/);
});

test('Firestore mode refuses to initialize without any credential source', () => {
  const result = runModuleWith('./src/config/firebase.js', {
    STORAGE_DRIVER: 'firestore',
    FIREBASE_PROJECT_ID: 'test-project',
    FIREBASE_CLIENT_EMAIL: '',
    FIREBASE_PRIVATE_KEY: '',
    FIREBASE_SERVICE_ACCOUNT_PATH: '',
    GOOGLE_APPLICATION_CREDENTIALS: '',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Firebase credentials are required/);
});
