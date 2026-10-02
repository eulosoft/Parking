/**
 * @format
 */

import 'react-native';
import React, { act } from 'react';
import { expect, it, jest } from '@jest/globals';
import renderer from 'react-test-renderer';

jest.setTimeout(25000);

jest.mock('@react-native-firebase/messaging', () => ({
  AuthorizationStatus: {
    AUTHORIZED: 1,
    DENIED: 0,
    NOT_DETERMINED: -1,
    PROVISIONAL: 2,
  },
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(() => Promise.resolve('mock_device_token')),
  requestPermission: jest.fn(() => Promise.resolve(1)),
  onMessage: jest.fn(() => () => {}),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/services/auth', () => ({
  signOutFirebase: jest.fn(() => Promise.resolve()),
  isGoogleSignInConfigured: jest.fn(() => false),
  isFacebookSignInConfigured: jest.fn(() => false),
  isMicrosoftSignInConfigured: jest.fn(() => false),
}));

jest.mock('react-native-config', () => ({
  API_URL: 'https://api.test.example/api',
}));

import App from '../App';

it('renders correctly', async () => {
  let root: any;
  await act(async () => {
    root = renderer.create(<App />);
    await Promise.resolve();
  });
  expect(root).toBeDefined();
}, 25000);
