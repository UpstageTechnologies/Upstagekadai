import React, { useEffect, useRef, useState } from "react";
import {
  StatusBar,
  useColorScheme,
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
} from "react-native";

import {
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";

import notifee, { EventType } from "@notifee/react-native";

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
} from "./src/utils/notification/notifications";

// ======================================================
// Global Offline Banner Component
// ======================================================

function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const slideAnim = useRef(new Animated.Value(-120)).current;

  const updateNetworkStatus = (state) => {
    const offline =
      state.isConnected === false ||
      (state.isConnected === true && state.isInternetReachable === false);
    setIsOffline(offline);

    Animated.spring(slideAnim, {
      toValue: offline ? 0 : -120,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
  };

  useEffect(() => {
    NetInfo.fetch().then(updateNetworkStatus);
    const unsubscribe = NetInfo.addEventListener(updateNetworkStatus);

    return () => unsubscribe();
  }, [slideAnim]);

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

export const navigationRef = createNavigationContainerRef();

const openOrdersFromNotification = (orderId, status = "") => {
  if (!orderId) {
    console.log("⚠️ No orderId from notification");
    return;
  }

  const navigate = () => {
    if (!navigationRef.isReady()) {
      return false;
    }

    console.log("=================================");
    console.log("🛒 OPENING ORDERS FROM NOTIFICATION");
    console.log("🧾 ORDER ID:", orderId);
    console.log("📦 STATUS:", status);
    console.log("=================================");

    navigationRef.reset({
      index: 0,
      routes: [
        {
          name: "Orders",
          params: {
            orderId: String(orderId),
            status: String(status || ""),
          },
        },
      ],
    });

    console.log("✅ RESET TO ORDERS SCREEN");
    return true;
  };

  if (navigate()) {
    return;
  }

  const timer = setInterval(() => {
    if (navigate()) {
      clearInterval(timer);
    }
  }, 300);

  setTimeout(() => {
    clearInterval(timer);
  }, 10000);
};

function App() {
  const isDarkMode = useColorScheme() === "dark";

  // ====================================================
  // 🔔 NOTIFICATION SETUP
  // ====================================================
  useEffect(() => {
    let unsubscribe;

    const setupNotifications = async () => {
      try {
        console.log("=================================");
        console.log("🔔 APP NOTIFICATION SETUP");
        console.log("=================================");

        await createNotificationChannel();

        const messagingInstance = getMessaging();

        unsubscribe = onMessage(messagingInstance, async (remoteMessage) => {
          try {
            const title =
              remoteMessage?.notification?.title ||
              remoteMessage?.data?.title ||
              "🛒 New Order";

            const body =
              remoteMessage?.notification?.body ||
              remoteMessage?.data?.body ||
              "You have received a new order";

            const orderId = remoteMessage?.data?.orderId || "";
            const status = remoteMessage?.data?.status || "";

            await displayNotification({
              title,
              body,
              orderId,
              status,
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
  // 🔔 NOTIFICATION CLICK - APP OPEN / BACKGROUND
  // ======================================================
  useEffect(() => {
    const messagingInstance = getMessaging();

    const unsubscribeNotifee = notifee.onForegroundEvent(
      async ({ type, detail }) => {
        try {
          if (type !== EventType.PRESS) return;

          const orderId = detail.notification?.data?.orderId;
          const status = detail.notification?.data?.status;
          const screen = detail.notification?.data?.screen;

          if (screen === "Orders" && orderId) {
            openOrdersFromNotification(orderId, status);
          }
        } catch (error) {
          console.log("❌ Notifee notification click error:", error);
        }
      }
    );

    const unsubscribeFCM = onNotificationOpenedApp(
      messagingInstance,
      (remoteMessage) => {
        try {
          const orderId = remoteMessage?.data?.orderId;
          const status = remoteMessage?.data?.status;
          const screen = remoteMessage?.data?.screen;

          if (screen === "Orders" && orderId) {
            openOrdersFromNotification(orderId, status);
          }
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
  // 🚀 NOTIFICATION CLICK - APP COMPLETELY CLOSED
  // ======================================================
  useEffect(() => {
    const checkInitialNotification = async () => {
      try {
        const notifeeInitial = await notifee.getInitialNotification();
        if (notifeeInitial) {
          const orderId = notifeeInitial.notification?.data?.orderId;
          const status = notifeeInitial.notification?.data?.status;
          const screen = notifeeInitial.notification?.data?.screen;

          if (screen === "Orders" && orderId) {
            openOrdersFromNotification(orderId, status);
            return;
          }
        }

        const messagingInstance = getMessaging();
        const fcmInitial = await getFCMInitialNotification(messagingInstance);
        if (fcmInitial) {
          const orderId = fcmInitial?.data?.orderId;
          const status = fcmInitial?.data?.status;
          const screen = fcmInitial?.data?.screen;

          if (screen === "Orders" && orderId) {
            openOrdersFromNotification(orderId, status);
          }
        }
      } catch (error) {
        console.log("❌ Initial notification error:", error);
      }
    };

    checkInitialNotification();
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

        <NavigationContainer ref={navigationRef}>
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