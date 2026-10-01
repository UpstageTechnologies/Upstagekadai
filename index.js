/**
 * @format
 */

import { AppRegistry, LogBox } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// 🛡️ Firebase offline popup-ah dev mode-la suppress panna
LogBox.ignoreLogs([
    'FirebaseError: Failed to get document because the client is offline',
    'Possible Unhandled Promise Rejection',
]);

AppRegistry.registerComponent(appName, () => App);