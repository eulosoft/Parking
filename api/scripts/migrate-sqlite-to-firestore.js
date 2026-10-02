import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { FieldValue } from 'firebase-admin/firestore';
import { firebaseFirestore } from '../src/config/firebase.js';
import { FIRESTORE_COLLECTION_BY_TABLE, toFirestoreDocument } from '../src/data/migration-mapper.js';
import { hashPassword, isPasswordHash } from '../src/services/password.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(process.env.DATABASE_PATH || path.join(here, '../parking.db'));
const tables = Object.keys(FIRESTORE_COLLECTION_BY_TABLE);
const maxConcurrentCreates = 20;

async function createIfAbsent(collection, id, payload) {
  try {
    await firebaseFirestore.collection(collection).doc(id).create(payload);
    return 'created';
  } catch (error) {
    if (error?.code === 6 || error?.code === 'already-exists') return 'present';
    throw error;
  }
}

async function upsertMigratedUser(id, payload) {
  const ref = firebaseFirestore.collection('users').doc(id);
  try {
    await ref.create(payload);
    return 'created';
  } catch (error) {
    if (error?.code !== 6 && error?.code !== 'already-exists') throw error;
  }
  // Earlier deployments mirrored user profiles without password hashes.
  // Update only the validated hash so an existing document's profile is kept.
  await ref.update({
    password_hash: payload.password_hash,
    password: FieldValue.delete(),
    passwordHash: FieldValue.delete(),
  });
  return 'present';
}

async function migrate() {
  if (process.env.STORAGE_DRIVER !== 'firestore') {
    throw new Error('Set STORAGE_DRIVER=firestore to select the migration destination.');
  }
  if (!firebaseFirestore) throw new Error('Firestore credentials are not configured.');
  if (!fs.existsSync(sourcePath)) throw new Error('Configured SQLite source file does not exist.');

  // Read-only mode: migration cannot update, initialize, or delete source data.
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const counts = Object.fromEntries(tables.map((table) => [table, { created: 0, present: 0 }]));
  try {
    const availableTables = new Set(source.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    ).all().map((row) => row.name));
    for (const table of tables) {
      if (!availableTables.has(table)) continue;
      const columns = new Set(source.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
      // Read the SQLite password only in-process to preserve auth; convert legacy
      // plaintext to scrypt before the allow-listed Firestore write.
      const fields = {
        users: ['id', 'name', 'email', 'role', 'created_at', 'password'],
        vehicles: ['id', 'user_id', 'type', 'plate', 'brand', 'model', 'owner_name', 'owner_email', 'created_at'],
        services: ['id', 'user_id', 'vehicle_id', 'vehicle_type', 'plan_id', 'payment_method', 'amount', 'status', 'date_start', 'date_end', 'created_at'],
        notifications: ['id', 'user_id', 'type', 'message', 'status', 'created_at'],
        device_tokens: ['id', 'user_id', 'token', 'created_at'],
      }[table].filter((field) => columns.has(field));
      if (!columns.has('id')) throw new Error('A source table has no primary key.');
      if (table === 'users' && !columns.has('password')) {
        throw new Error('The SQLite users table has no password hash column; migration cannot preserve authentication.');
      }
      const rows = source.prepare(`SELECT ${fields.join(', ')} FROM ${table}`).all();
      const collection = FIRESTORE_COLLECTION_BY_TABLE[table];
      for (let offset = 0; offset < rows.length; offset += maxConcurrentCreates) {
        const group = rows.slice(offset, offset + maxConcurrentCreates);
        const results = await Promise.all(group.map(async (row) => {
          let sourceRow = row;
          if (table === 'users') {
            // SQLite initialization normally already converted legacy plaintext.
            // For older DBs, hash it in-process before any Firestore write.
            if (typeof row.password !== 'string' || !row.password
              || (!isPasswordHash(row.password) && row.password.length > 128)) {
              throw new Error('A SQLite user credential is missing or outside supported limits.');
            }
            const passwordHash = isPasswordHash(row.password)
              ? row.password
              : await hashPassword(String(row.password));
            sourceRow = { ...row, password_hash: passwordHash };
            delete sourceRow.password;
          }
          const document = toFirestoreDocument(table, sourceRow);
          if (table === 'users') return upsertMigratedUser(String(row.id), document);
          return createIfAbsent(collection, String(row.id), document);
        }));
        for (const result of results) counts[table][result] += 1;
      }
    }
  } finally {
    source.close();
  }
  const total = Object.values(counts).reduce((sum, row) => sum + row.created + row.present, 0);
  console.log(JSON.stringify({ result: 'completed', totalDocuments: total, collections: counts }));
}

migrate().catch((error) => {
  // Error messages from SDK/source files can contain private configuration.
  console.error(`Migration stopped safely (${error?.name || 'Error'}). No sensitive values or record contents were logged.`);
  process.exitCode = 1;
});
