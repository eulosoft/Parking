import test from 'node:test';
import assert from 'node:assert/strict';
import { after, before } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  calculateDaysRemaining,
  getServiceStatus,
  validatePurchaseInput,
} from '../src/services/parking.service.js';

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'parking-api-test-'));
process.env.DATABASE_PATH = path.join(temporaryDirectory, 'parking-test.db');

const { initializeDatabase, run, get, db } = await import('../src/database/db.js');
const { hashPassword, verifyPassword } = await import('../src/services/password.js');
const {
  createVehicle,
  getServiceSummaryForVehicle,
  listVehiclesForUser,
} = await import('../src/data/store.js');

before(async () => {
  await initializeDatabase();
  await run(
    'INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)',
    ['test_user', 'Test User', 'test@example.com', await hashPassword('test-password-123')],
  );
});

after(() => {
  db.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('validatePurchaseInput rejects missing required fields', () => {
  assert.throws(() => validatePurchaseInput({ vehicleId: 'veh_001', amount: 45000 }), /Missing required purchase fields/);
  assert.throws(() => validatePurchaseInput({ planId: 'plan_monthly_car', paymentMethod: 'CARD', amount: 45000 }), /Missing required purchase fields/);
});

test('calculateDaysRemaining returns positive interval from date end', () => {
  const current = new Date('2026-09-20T12:00:00Z');
  const end = new Date('2026-09-27T12:00:00Z');

  assert.equal(calculateDaysRemaining(end, current), 7);
});

test('getServiceStatus marks near-expiration services as PENDING', () => {
  assert.equal(getServiceStatus(5), 'PENDING');
  assert.equal(getServiceStatus(12), 'ACTIVE');
  assert.equal(getServiceStatus(0), 'EXPIRED');
});

test('password hashes are verifiable and do not retain the original password', async () => {
  const password = 'a-secure-test-password';
  const hashedPassword = await hashPassword(password);

  assert.notEqual(hashedPassword, password);
  assert.equal(await verifyPassword(password, hashedPassword), true);
  assert.equal(await verifyPassword('incorrect-password', hashedPassword), false);
  assert.equal(await verifyPassword(password, 'legacy-plaintext'), false);
});

test('database initialization does not create the demo account', async () => {
  assert.equal(await get('SELECT id FROM users WHERE email = ?', ['user@demo.com']), null);
});

test('database initialization hashes legacy plaintext passwords', async () => {
  await run(
    'INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)',
    ['legacy_user', 'Legacy User', 'legacy@example.com', 'legacy-password'],
  );

  await initializeDatabase();
  const user = await get('SELECT password FROM users WHERE id = ?', ['legacy_user']);

  assert.notEqual(user.password, 'legacy-password');
  assert.equal(await verifyPassword('legacy-password', user.password), true);
});

test('createVehicle stores a vehicle for a user and listVehiclesForUser returns it', async () => {
  const vehicle = await createVehicle({
    userId: 'test_user',
    type: 'CAR',
    plate: 'XYZ-999',
    brand: 'Mazda',
    model: '3',
    ownerName: 'Vehicle Owner',
    ownerEmail: 'vehicle-owner@example.com',
  });

  assert.equal(vehicle.user_id, 'test_user');
  assert.equal(vehicle.type, 'CAR');
  assert.equal(vehicle.plate, 'XYZ-999');

  const vehicles = listVehiclesForUser('test_user');
  assert.ok(vehicles.some((item) => item.id === vehicle.id));
});

test("vehicle summaries do not reveal another user's plate", async () => {
  await run(
    'INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)',
    ['other_user', 'Other User', 'other@example.com', await hashPassword('other-password-123')],
  );
  const otherVehicle = await createVehicle({
    userId: 'other_user',
    type: 'CAR',
    plate: 'PRIVATE-1',
    ownerName: 'Other Owner',
    ownerEmail: 'other-owner@example.com',
  });

  const summary = getServiceSummaryForVehicle('test_user', otherVehicle.id);

  assert.equal(summary.vehiclePlate, null);
  assert.equal(summary.message, 'No active service found');
});
