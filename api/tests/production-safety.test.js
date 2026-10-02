import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import path from 'node:path';
import { tmpdir } from 'node:os';

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'parking-api-safety-'));
process.env.DATABASE_PATH = path.join(temporaryDirectory, 'parking-safety.db');
process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ADMIN_PASSWORD = 'admin-password-for-tests-1234';
process.env.NODE_ENV = 'test';
process.env.STORAGE_DRIVER = 'sqlite';

const { default: app } = await import('../src/app.js');
const { initializeDatabase, get, db, run } = await import('../src/database/db.js');
const { initializeStore, upsertFirebaseUser } = await import('../src/data/store.js');
const { hashPassword } = await import('../src/services/password.js');
const { default: jwt } = await import('jsonwebtoken');

let server;
let port;
let adminToken;
let vehicleId;

before(async () => {
  await initializeDatabase();
  const userPassword = await hashPassword('a-user-password-for-tests-1234');
  await run(
    "INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, 'USER')",
    ['test_user', 'Test User', 'user@example.com', userPassword],
  );
  await initializeStore();
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  port = server.address().port;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  db.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('only the configured administrator can log in and restore a session', async () => {
  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'ADMIN@example.com',
      password: process.env.ADMIN_PASSWORD,
    }),
  });
  assert.equal(login.status, 200);
  const loginData = await login.json();
  adminToken = loginData.token;
  assert.equal(loginData.user.role, 'ADMIN');

  const session = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.role, 'ADMIN');

  const userLogin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@example.com', password: 'a-user-password-for-tests-1234' }),
  });
  assert.equal(userLogin.status, 401);

  const registration = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Public User', email: 'public@example.com', password: 'some-password' }),
  });
  assert.equal(registration.status, 404);
  assert.equal(await get('SELECT id FROM users WHERE email = ?', ['public@example.com']), null);
});

test('Firebase profile synchronization assigns USER and preserves an existing role', async () => {
  const created = await upsertFirebaseUser({
    id: 'firebase_new_user',
    name: 'New Firebase User',
    email: 'new-firebase@example.com',
  });
  assert.equal(created.id, 'firebase_new_user');
  assert.equal(created.role, 'USER');
  assert.equal(Object.hasOwn(created, 'password'), false);
  assert.equal((await get('SELECT role FROM users WHERE id = ?', [created.id])).role, 'USER');

  const linkedAdmin = await upsertFirebaseUser({
    id: 'firebase_admin_identity',
    name: 'Firebase Administrator',
    email: 'ADMIN@example.com',
  });
  assert.equal(linkedAdmin.role, 'ADMIN');
  assert.notEqual(linkedAdmin.id, 'firebase_admin_identity');

  const linkedUser = await upsertFirebaseUser({
    id: 'firebase_existing_user',
    name: 'Updated Firebase User',
    email: 'USER@example.com',
  });
  assert.equal(linkedUser.id, 'test_user');
  assert.equal(linkedUser.role, 'USER');
  assert.equal(linkedUser.name, 'Updated Firebase User');
});

test('Firebase login is unavailable until server-side Firebase Auth is configured', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/firebase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: 'not-verified-in-tests' }),
  });
  assert.equal(response.status, 503);
});

test('only administrators can manually activate and deactivate vehicle services', async () => {
  const create = await fetch(`http://127.0.0.1:${port}/api/admin/vehicles`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'CAR',
      plate: 'abc123',
      brand: 'Test',
      model: 'Car',
      ownerName: 'Test Owner',
      ownerEmail: 'owner@example.com',
    }),
  });
  assert.equal(create.status, 201);
  const createdVehicle = (await create.json()).vehicle;
  vehicleId = createdVehicle.id;
  assert.ok(vehicleId);
  assert.equal(createdVehicle.owner_name, 'Test Owner');
  assert.equal(createdVehicle.owner_email, 'owner@example.com');

  const vehiclesResponse = await fetch(`http://127.0.0.1:${port}/api/admin/vehicles`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(vehiclesResponse.status, 200);
  const listedVehicle = (await vehiclesResponse.json()).vehicles.find((vehicle) => vehicle.id === vehicleId);
  assert.equal(listedVehicle.owner.name, 'Test Owner');
  assert.equal(listedVehicle.owner.email, 'owner@example.com');

  const noToken = await fetch(`http://127.0.0.1:${port}/api/admin/vehicles`);
  assert.equal(noToken.status, 401);

  const nonAdminToken = jwt.sign({ sub: 'test_user' }, process.env.JWT_SECRET);
  const forbidden = await fetch(`http://127.0.0.1:${port}/api/admin/vehicles`, {
    headers: { Authorization: `Bearer ${nonAdminToken}` },
  });
  assert.equal(forbidden.status, 403);

  const activate = () => fetch(
    `http://127.0.0.1:${port}/api/admin/vehicles/${vehicleId}/service`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ active: true, days: 30 }),
    },
  );

  const firstActivation = await activate();
  assert.equal(firstActivation.status, 200);
  const firstService = (await firstActivation.json()).service;
  assert.equal(firstService.isActive, true);
  assert.equal(firstService.daysRemaining, 30);

  const repeatedActivation = await activate();
  assert.equal(repeatedActivation.status, 200);
  assert.equal((await repeatedActivation.json()).service.id, firstService.id);
  assert.equal((await get('SELECT COUNT(*) AS count FROM services')).count, 1);

  const historyResponse = await fetch(`http://127.0.0.1:${port}/api/admin/services/history`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(historyResponse.status, 200);
  const historyItem = (await historyResponse.json()).services[0];
  assert.equal(historyItem.vehiclePlate, 'ABC123');
  assert.equal(historyItem.owner.email, 'owner@example.com');

  const deactivate = await fetch(
    `http://127.0.0.1:${port}/api/admin/vehicles/${vehicleId}/service`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ active: false }),
    },
  );
  assert.equal(deactivate.status, 200);
  assert.equal((await deactivate.json()).service.status, 'INACTIVE');
  assert.equal((await get('SELECT status FROM services WHERE id = ?', [firstService.id])).status, 'INACTIVE');

  const repeatedDeactivation = await fetch(
    `http://127.0.0.1:${port}/api/admin/vehicles/${vehicleId}/service`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ active: false }),
    },
  );
  assert.equal(repeatedDeactivation.status, 200);
  assert.equal((await repeatedDeactivation.json()).service.id, firstService.id);

  const invalidDuration = await fetch(
    `http://127.0.0.1:${port}/api/admin/vehicles/${vehicleId}/service`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ active: true, days: 0 }),
    },
  );
  assert.equal(invalidDuration.status, 400);
});

test('service purchases cannot activate parking without a configured payment provider', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/api/services/purchase`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      vehicleId,
      planId: 'monthly',
      paymentMethod: 'CARD',
      amount: 100,
    }),
  });

  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'PAYMENTS_NOT_CONFIGURED');
  assert.equal((await get('SELECT COUNT(*) AS count FROM services')).count, 1);
});

test('login requests are rate limited after ten attempts from one IP', async () => {
  let lastResponse;
  for (let attempt = 0; attempt < 9; attempt += 1) {
    lastResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'incorrect-password' }),
    });
  }

  assert.equal(lastResponse.status, 429);
  assert.match((await lastResponse.json()).message, /Demasiados intentos/);
});
