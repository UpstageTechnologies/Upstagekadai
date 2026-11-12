/**
 * @format
 */

import { AppRegistry, LogBox } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from './App';
import { name as appName } from './app.json';
import { PENDING_NOTIFICATION_PRESS_KEY } from './src/utils/notification/notifications';

// 🛡️ Suppress dev overlays for clean video recording
LogBox.ignoreAllLogs(true);

notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type !== EventType.PRESS) return;

    const data = detail.notification?.data;
    if (!data) {
        console.log('⚠️ Notification press had no data');
        return;
    }

    try {
        await AsyncStorage.setItem(
            PENDING_NOTIFICATION_PRESS_KEY,
            JSON.stringify({ data, notificationId: detail.notification?.id || '' })
        );
    } catch (error) {
        console.log('❌ Could not persist background notification press:', error);
    }
});

AppRegistry.registerComponent(appName, () => App);
