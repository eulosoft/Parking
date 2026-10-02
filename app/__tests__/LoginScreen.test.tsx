import React, {act} from 'react';
import {TextInput} from 'react-native';
import {expect, it, jest} from '@jest/globals';
import renderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LoginScreen from '../src/screens/LoginScreen';

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
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(JSON.stringify(responseBody)),
  });
  global.fetch = fetchMock;
  const onLoginSuccess = jest.fn();
  let root: renderer.ReactTestRenderer;

  await act(async () => {
    root = renderer.create(<LoginScreen onLoginSuccess={onLoginSuccess} />);
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
