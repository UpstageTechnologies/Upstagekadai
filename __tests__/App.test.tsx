/**
 * @format
 */

import React from 'react';

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: any) => children,
  createNavigationContainerRef: () => ({ isReady: () => false }),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: jest.fn(),
  useIsFocused: () => true,
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: () => null,
  }),
}));

jest.mock('@notifee/react-native', () => ({
  onForegroundEvent: jest.fn(() => () => {}),
  getInitialNotification: jest.fn(() => Promise.resolve(null)),
  createChannel: jest.fn(() => Promise.resolve()),
  displayNotification: jest.fn(() => Promise.resolve()),
  EventType: { PRESS: 1 },
}));

jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  onMessage: jest.fn(() => () => {}),
  onNotificationOpenedApp: jest.fn(() => () => {}),
  getInitialNotification: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
  addEventListener: jest.fn(() => () => {}),
}));

test('App test environment loads correctly', () => {
  expect(true).toBe(true);
});
