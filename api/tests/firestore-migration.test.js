import test from 'node:test';
import assert from 'node:assert/strict';
import { toFirestoreDocument } from '../src/data/migration-mapper.js';

test('SQLite migration copies only a valid scrypt hash, never a plaintext password field', () => {
  const hash = `scrypt$${'a'.repeat(32)}$${'b'.repeat(128)}`;
  const migrated = toFirestoreDocument('users', {
    id: 'admin_1',
    name: 'Admin',
    email: 'admin@example.com',
    role: 'ADMIN',
    created_at: '2026-01-01T00:00:00.000Z',
    password_hash: hash,
    password: hash,
  });
  assert.deepEqual(migrated, {
    id: 'admin_1',
    name: 'Admin',
    email: 'admin@example.com',
    role: 'ADMIN',
    created_at: '2026-01-01T00:00:00.000Z',
    password_hash: hash,
  });
  assert.equal(migrated.password, undefined);
  assert.equal(migrated.password_hash, hash);
});

test('SQLite migration rejects plaintext passwords rather than syncing them', () => {
  assert.throws(() => toFirestoreDocument('users', {
    id: 'user_1', name: 'User', email: 'user@example.com', password_hash: 'plaintext-password',
  }), /valid scrypt password hash/);
});

test('SQLite migration preserves vehicle, service, notification and token identifiers', () => {
  assert.equal(toFirestoreDocument('vehicles', { id: 'v1' }).id, 'v1');
  assert.equal(toFirestoreDocument('services', { id: 's1' }).id, 's1');
  assert.equal(toFirestoreDocument('notifications', { id: 'n1' }).id, 'n1');
  assert.equal(toFirestoreDocument('device_tokens', { id: 17 }).id, '17');
});
