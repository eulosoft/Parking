import React, {act} from 'react';
import {TextInput} from 'react-native';
import {expect, it, jest} from '@jest/globals';
import renderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LoginScreen from '../src/screens/LoginScreen';
import {
  loginWithEmail,
  requestPasswordReset,
} from '../src/services/auth';

jest.setTimeout(25000);

jest.mock('../src/services/auth', () => ({
  loginWithEmail: jest.fn(),
  loginWithGoogle: jest.fn(),
  loginWithFacebook: jest.fn(),
  loginWithMicrosoft: jest.fn(),
  isGoogleSignInConfigured: jest.fn(() => false),
  isFacebookSignInConfigured: jest.fn(() => false),
  isMicrosoftSignInConfigured: jest.fn(() => false),
  registerWithEmail: jest.fn(),
  requestPasswordReset: jest.fn(),
}));

jest.mock('react-native-config', () => ({
  API_URL: 'https://parking-api.test/api',
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

it('delegates administrator login to the API service', async () => {
  const user = {id: 'admin-1', name: 'Admin', email: 'admin@example.com'};
  const responseBody = {token: 'test-token', user};
  const fetchMock = jest.fn(
    async (): Promise<Response> => ({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(responseBody)),
    } as Response),
  );
  global.fetch = fetchMock;
  const onLoginSuccess = jest.fn();
  let root: renderer.ReactTestRenderer;

  await act(async () => {
    root = renderer.create(<LoginScreen onLoginSuccess={onLoginSuccess} />);
  });

  const adminLink = root!.root.findAll(
    instance => typeof instance.props.onPress === 'function',
  ).at(-1);
  await act(async () => {
    adminLink!.props.onPress();
  });

  const inputs = root!.root.findAllByType(TextInput);
  await act(async () => {
    inputs[0].props.onChangeText('admin@example.com');
    inputs[1].props.onChangeText('correct-horse-battery-staple');
  });

  await act(async () => {
    const submitButton = root!.root.findAll(
      instance => typeof instance.props.onPress === 'function',
    )[0];
    await submitButton.props.onPress();
  });

  expect(fetchMock).toHaveBeenCalledWith('https://parking-api.test/api/auth/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email: 'admin@example.com', password: 'correct-horse-battery-staple'}),
  });
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('parking_auth_token', '"test-token"');
  expect(onLoginSuccess).toHaveBeenCalledWith(user);
});

it('authenticates the standard email login with Firebase and returns the Parking user', async () => {
  const user = {id: 'user-1', name: 'Parking User', email: 'user@example.com', role: 'USER'};
  jest.mocked(loginWithEmail).mockResolvedValue(user);
  const onLoginSuccess = jest.fn();
  let root: renderer.ReactTestRenderer;

  await act(async () => {
    root = renderer.create(<LoginScreen onLoginSuccess={onLoginSuccess} />);
  });
  const inputs = root!.root.findAllByType(TextInput);
  await act(async () => {
    inputs[0].props.onChangeText('user@example.com');
    inputs[1].props.onChangeText('password-1234');
  });
  await act(async () => {
    await root!.root.findAll(instance => typeof instance.props.onPress === 'function')[0]
      .props.onPress();
  });

  expect(loginWithEmail).toHaveBeenCalledWith('user@example.com', 'password-1234');
  expect(onLoginSuccess).toHaveBeenCalledWith(user);
});

it('routes password recovery to Firebase Auth', async () => {
  const resetPassword = jest.mocked(requestPasswordReset);
  resetPassword.mockResolvedValue();
  let root: renderer.ReactTestRenderer;

  await act(async () => {
    root = renderer.create(<LoginScreen onLoginSuccess={jest.fn()} />);
  });
  const input = root!.root.findAllByType(TextInput)[0];
  await act(async () => {
    input.props.onChangeText('user@example.com');
  });
  const pressables = root!.root.findAll(instance => typeof instance.props.onPress === 'function');
  await act(async () => {
    pressables[1].props.onPress();
  });
  await act(async () => {
    await root!.root.findAll(instance => typeof instance.props.onPress === 'function')[0]
      .props.onPress();
  });

  expect(resetPassword).toHaveBeenCalledWith('user@example.com');
});
