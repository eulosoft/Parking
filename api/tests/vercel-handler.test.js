import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-characters';
process.env.STORAGE_DRIVER = 'sqlite';
process.env.NODE_ENV = 'test';
process.env.CRON_SECRET = '';
process.env.REMINDER_JOB_SECRET = '';

const { default: handler } = await import('../api/index.js');

test('Vercel initialization failures log safe configuration reasons', async () => {
  const originalConsoleError = console.error;
  const loggedErrors = [];
  console.error = (...args) => loggedErrors.push(args);
  const response = new EventEmitter();
  response.status = (statusCode) => {
    response.statusCode = statusCode;
    return response;
  };
  response.json = (body) => {
    response.body = body;
    return response;
  };

  try {
    await handler({}, response);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { message: 'Service temporarily unavailable' });
  assert.deepEqual(loggedErrors, [[
    'API initialization failed:',
    { name: 'Error', reason: 'A production reminder secret is required.' },
  ]]);
});
