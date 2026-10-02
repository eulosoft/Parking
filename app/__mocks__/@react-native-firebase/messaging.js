const messaging = {};

module.exports = {
  AuthorizationStatus: {AUTHORIZED: 1, PROVISIONAL: 2},
  getMessaging: jest.fn(() => messaging),
  requestPermission: jest.fn(async () => 1),
  getToken: jest.fn(async () => 'test-fcm-token'),
  onMessage: jest.fn(() => jest.fn()),
};
