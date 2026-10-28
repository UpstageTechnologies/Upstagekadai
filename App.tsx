import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  StatusBar,
  useColorScheme,
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  AppState,
} from "react-native";

import {
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";

import notifee, { EventType } from "@notifee/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider } from "./src/theme/ThemeContext";

import {
  getMessaging,
  onMessage,
  onNotificationOpenedApp,
  getInitialNotification as getFCMInitialNotification,
} from "@react-native-firebase/messaging";

import NetInfo from "@react-native-community/netinfo";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

// ======================================================
// Screens
// ======================================================

import Login from "./src/screens/Login";
import Register from "./src/screens/Register";
import Dashboard from "./src/screens/Dashboard";
import ScanScreen from "./src/screens/ScanScreen";
import SalesScreen from "./src/screens/SalesScreen";
import SalesHistory from "./src/screens/SalesHistory";
import PurchaseHistory from "./src/screens/PurchaseHistory";
import InventoryScreen from "./src/screens/InventoryScreen";
import SubscriptionScreen from "./src/screens/SubscriptionScreen";
import TrialScreen from "./src/screens/TrialScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import SplashScreen from "./src/screens/SplashScreen";
import JournalEntry from "./src/screens/JournalEntry";
import DemoLogin from "./src/screens/DemoLogin";
import OrdersScreen from "./src/screens/OrdersScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import StaffCreationScreen from "./src/screens/StaffCreation";
import StaffLoginScreen from "./src/screens/StaffLogin";

// ======================================================
// Notification Service
// ======================================================

import {
  createNotificationChannel,
  displayNotification,
  PENDING_NOTIFICATION_PRESS_KEY,
} from "./src/utils/notification/notifications";

type RootStackParamList = {
  Onboarding: undefined;
  Splash: undefined;
  LoginRoleSelection: undefined;
  Login: undefined;
  StaffLogin: undefined;
  Register: undefined;
  Trial: undefined;
  Dashboard: undefined;
  JournalEntry: undefined;
  Scan: undefined;
  Sales: undefined;
  SalesHistory: { appMode?: string } | undefined;
  PurchaseHistory: { appMode?: string } | undefined;
  Inventory: { appMode?: string } | undefined;
  Subscription: undefined;
  DemoLogin: undefined;
  StaffCreation: undefined;
  Profile: undefined;
  Settings: undefined;
  Orders: { orderId?: string; status?: string; appMode?: string };
};

type PendingNotificationNavigation = {
  name: "Orders";
  params: { orderId: string; status: string };
};

// ======================================================
// Global Offline Banner Component
// ======================================================

function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const slideAnim = useRef(new Animated.Value(-120)).current;

  const updateNetworkStatus = useCallback((state: {
    isConnected: boolean | null;
    isInternetReachable: boolean | null;
  }) => {
    const offline =
      state.isConnected === false ||
      (state.isConnected === true && state.isInternetReachable === false);
    setIsOffline(offline);

    Animated.spring(slideAnim, {
      toValue: offline ? 0 : -120,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
  }, [slideAnim]);

  useEffect(() => {
    NetInfo.fetch().then(updateNetworkStatus);
    const unsubscribe = NetInfo.addEventListener(updateNetworkStatus);

    return () => unsubscribe();
  }, [slideAnim, updateNetworkStatus]);

  return (
    <Animated.View
      pointerEvents={isOffline ? "auto" : "none"}
      style={[
        styles.offlineBanner,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.offlineContent}>
        <Icon
          name="wifi-off"
          size={17}
          color="#ffffff"
          style={styles.offlineIcon}
        />
        <Text style={styles.offlineText}>
          You are offline • Check your connection
        </Text>
      </View>
    </Animated.View>
  );
}

// ======================================================
// Navigation Reference & Helpers
// ======================================================

const Stack = createNativeStackNavigator();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

let pendingNotificationNavigation: PendingNotificationNavigation | null = null;
const recentNotificationPresses = new Map();

function flushPendingNotificationNavigation() {
  if (!pendingNotificationNavigation || !navigationRef.isReady()) return;

  const currentRoute = navigationRef.getCurrentRoute()?.name;
  // Wait for Splash/auth routing to settle. That provides the proper base route
  // (Dashboard) for a cold-start deep link and avoids bypassing sign-in.
  if (currentRoute !== "Dashboard" && currentRoute !== "Orders") return;

  const { name, params } = pendingNotificationNavigation;
  pendingNotificationNavigation = null;
  const rootState = navigationRef.getRootState();
  if (currentRoute === "Orders" && rootState.routes.length === 1) {
    // Repair a root-only Orders state from an older app session so Back has a
    // valid fallback instead of exiting the application.
    navigationRef.resetRoot({
      index: 1,
      routes: [{ name: "Dashboard" }, { name, params }],
    });
    console.log("✅ Notification navigation restored Dashboard fallback", params);
    return;
  }
  navigationRef.navigate(name, params);
  console.log("✅ Notification navigation opened", name, params);
}

function openNotificationDestination(
  data?: Record<string, unknown> | null,
  notificationId = "",
  coldStart = false
) {
  const screen = String(data?.screen || "");
  const orderId = String(data?.orderId || "").trim();
  const status = String(data?.status || "");

  if (screen !== "Orders" || !orderId) {
    console.log("⚠️ Unsupported or incomplete notification payload:", data);
    return;
  }

  const dedupeKeys = [
    String(data?.messageId || notificationId || `${screen}:${orderId}:${status}`),
    `${screen}:${orderId}:${status}`,
  ];
  const now = Date.now();
  const alreadyHandled = dedupeKeys.find(key => {
    const lastHandledAt = recentNotificationPresses.get(key);
    return lastHandledAt && now - lastHandledAt < 5000;
  });
  if (alreadyHandled) {
    console.log("ℹ️ Duplicate notification press ignored:", alreadyHandled);
    return;
  }
  dedupeKeys.forEach(key => recentNotificationPresses.set(key, now));
  for (const [key, timestamp] of recentNotificationPresses) {
    if (now - timestamp > 30000) recentNotificationPresses.delete(key);
  }

  const params = { orderId, status };
  if (!navigationRef.isReady() || coldStart) {
    pendingNotificationNavigation = { name: screen, params };
    flushPendingNotificationNavigation();
    return;
  }

  const currentRoute = navigationRef.getCurrentRoute()?.name;
  if (["Splash", "Onboarding", "Login", "LoginRoleSelection", "StaffLogin", "Register"].includes(currentRoute || "")) {
    pendingNotificationNavigation = { name: screen, params };
    flushPendingNotificationNavigation();
    return;
  }

  // navigate reuses an existing Orders route when present, preserving the
  // user's current stack and avoiding duplicate Orders screens.
  navigationRef.navigate("Orders", params);
  console.log("✅ Notification destination opened", screen, params);
}

function App() {
  const isDarkMode = useColorScheme() === "dark";

  // ====================================================
  // 🔔 NOTIFICATION SETUP
  // ====================================================
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setupNotifications = async () => {
      try {
        console.log("=================================");
        console.log("🔔 APP NOTIFICATION SETUP");
        console.log("=================================");

        await createNotificationChannel();

        const messagingInstance = getMessaging();

        unsubscribe = onMessage(messagingInstance, async (remoteMessage) => {
          try {
            const title = String(
              remoteMessage?.notification?.title ||
              remoteMessage?.data?.title ||
              "🛒 New Order"
            );

            const body = String(
              remoteMessage?.notification?.body ||
              remoteMessage?.data?.body ||
              "You have received a new order"
            );

            const orderId = String(remoteMessage?.data?.orderId || "");
            const status = String(remoteMessage?.data?.status || "");

            await displayNotification({
              title,
              body,
              orderId,
              status,
              screen: String(remoteMessage?.data?.screen || ""),
              messageId: remoteMessage?.messageId || "",
            });
          } catch (error) {
            console.log("❌ Foreground notification error:", error);
          }
        });
      } catch (error) {
        console.log("❌ Notification setup error:", error);
      }
    };

    setupNotifications();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // ======================================================
  // 🔔 NOTIFICATION PRESS - APP ALREADY RUNNING OR RETURNING FROM BACKGROUND
  // ======================================================
  useEffect(() => {
    const messagingInstance = getMessaging();

    const unsubscribeNotifee = notifee.onForegroundEvent(
      async ({ type, detail }) => {
        try {
          if (type !== EventType.PRESS) return;
          try {
            await AsyncStorage.removeItem(PENDING_NOTIFICATION_PRESS_KEY);
          } catch (storageError) {
            console.log("⚠️ Could not clear queued notification press:", storageError);
          }
          openNotificationDestination(
            detail.notification?.data,
            detail.notification?.id || ""
          );
        } catch (error) {
          console.log("❌ Notifee notification click error:", error);
        }
      }
    );

    const unsubscribeFCM = onNotificationOpenedApp(
      messagingInstance,
      (remoteMessage) => {
        try {
          openNotificationDestination(
            remoteMessage?.data,
            remoteMessage?.messageId || ""
          );
        } catch (error) {
          console.log("❌ FCM notification click error:", error);
        }
      }
    );

    return () => {
      unsubscribeNotifee();
      unsubscribeFCM();
    };
  }, []);

  // ======================================================
  // 🚀 INITIAL / BACKGROUND NOTIFICATION PRESS
  // ======================================================
  useEffect(() => {
    let active = true;

    const consumeStoredNotifeePress = async () => {
      try {
        const storedPress = await AsyncStorage.getItem(PENDING_NOTIFICATION_PRESS_KEY);
        if (!storedPress) return;
        try {
          await AsyncStorage.removeItem(PENDING_NOTIFICATION_PRESS_KEY);
        } catch (storageError) {
          console.log("⚠️ Could not clear stored notification press:", storageError);
        }
        if (!active) return;

        const parsed = JSON.parse(storedPress);
        openNotificationDestination(
          parsed?.data,
          parsed?.notificationId || "",
          !navigationRef.isReady()
        );
      } catch (error) {
        console.log("❌ Stored notification press error:", error);
      }
    };

    const checkInitialNotification = async () => {
      try {
        const notifeeInitial = await notifee.getInitialNotification();
        if (notifeeInitial) {
          openNotificationDestination(
            notifeeInitial.notification?.data,
            notifeeInitial.notification?.id || "",
            true
          );
        }

        await consumeStoredNotifeePress();

        const messagingInstance = getMessaging();
        const fcmInitial = await getFCMInitialNotification(messagingInstance);
        if (fcmInitial) {
          openNotificationDestination(
            fcmInitial.data,
            fcmInitial.messageId || "",
            true
          );
        }
      } catch (error) {
        console.log("❌ Initial notification error:", error);
      }
    };

    const appStateSubscription = AppState.addEventListener("change", nextState => {
      if (nextState === "active") consumeStoredNotifeePress();
    });

    checkInitialNotification();
    return () => {
      active = false;
      appStateSubscription.remove();
    };
  }, []);

  // ======================================================
  // UI & NAVIGATION STACK
  // ======================================================
  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />

      <ThemeProvider>
        {/* 🌐 Global Offline Bar Across All Pages */}
        <OfflineBanner />

        <NavigationContainer
          ref={navigationRef}
          onReady={flushPendingNotificationNavigation}
          onStateChange={flushPendingNotificationNavigation}
        >
          <Stack.Navigator
            initialRouteName="Splash"
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Splash" component={SplashScreen} />
            
            {/* Prevents crashes if any screen replaces to LoginRoleSelection */}
            <Stack.Screen name="LoginRoleSelection" component={Login} />
            
            <Stack.Screen name="Login" component={Login} />
            <Stack.Screen name="StaffLogin" component={StaffLoginScreen} />
            <Stack.Screen name="Register" component={Register} />
            <Stack.Screen name="Trial" component={TrialScreen} />
            <Stack.Screen name="Dashboard" component={Dashboard} />
            <Stack.Screen name="JournalEntry" component={JournalEntry} />
            <Stack.Screen name="Scan" component={ScanScreen} />
            <Stack.Screen name="Sales" component={SalesScreen} />
            <Stack.Screen name="SalesHistory" component={SalesHistory} />
            <Stack.Screen name="PurchaseHistory" component={PurchaseHistory} />
            <Stack.Screen name="Inventory" component={InventoryScreen} />
            <Stack.Screen name="Subscription" component={SubscriptionScreen} />
            <Stack.Screen name="DemoLogin" component={DemoLogin} />
            <Stack.Screen name="StaffCreation" component={StaffCreationScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Orders" component={OrdersScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  offlineBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99999999,
    elevation: 9999,
    backgroundColor: "#dc2626",
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 8 : 50,
    paddingBottom: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  offlineContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  offlineIcon: {
    marginRight: 6,
  },
  offlineText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});

export default App;
