import React, { useEffect } from "react";
import { StatusBar, useColorScheme } from "react-native";

import {
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";

import notifee, {
  EventType,
} from "@notifee/react-native";

import {
  createNativeStackNavigator,
} from "@react-navigation/native-stack";

import {
  SafeAreaProvider,
} from "react-native-safe-area-context";

import {
  ThemeProvider,
} from "./src/theme/ThemeContext";

import {
  getMessaging,
  onMessage,
  onNotificationOpenedApp,
  getInitialNotification as getFCMInitialNotification,
} from "@react-native-firebase/messaging";


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
import LoginRoleSelection from "./src/screens/LoginRoleSelection";
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
// Navigation
// ======================================================

const Stack = createNativeStackNavigator();

export const navigationRef =
  createNavigationContainerRef();

  const openOrdersFromNotification = (
  orderId,
  status = ""
) => {
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
  let unsubscribe: (() => void) | undefined;

  const setupNotifications = async () => {
    try {
      console.log("=================================");
      console.log("🔔 APP NOTIFICATION SETUP");
      console.log("=================================");

      // 1. Create notification channel
      await createNotificationChannel();

      console.log(
        "✅ Notification channel ready"
      );

      // 2. Firebase Messaging instance
      const messagingInstance =
        getMessaging();

      console.log(
        "✅ Firebase Messaging instance ready"
      );

      // 3. Foreground FCM listener
      unsubscribe = onMessage(
        messagingInstance,
        async remoteMessage => {
          try {
            console.log(
              "================================="
            );

            console.log(
              "📩 FOREGROUND FCM MESSAGE"
            );

            console.log(
              "REMOTE MESSAGE:",
              remoteMessage
            );

            console.log(
              "================================="
            );

            const title =
              remoteMessage?.notification?.title ||
              remoteMessage?.data?.title ||
              "🛒 New Order";

            const body =
              remoteMessage?.notification?.body ||
              remoteMessage?.data?.body ||
              "You have received a new order";

            const orderId =
              remoteMessage?.data?.orderId ||
              "";

            const status =
              remoteMessage?.data?.status ||
              "";

            console.log(
              "🔔 TITLE:",
              title
            );

            console.log(
              "🔔 BODY:",
              body
            );

            console.log(
              "🧾 ORDER ID:",
              orderId
            );

            console.log(
              "📦 STATUS:",
              status
            );

            // 4. Show Notifee notification
            await displayNotification({
              title,
              body,
              orderId,
              status,
            });

            console.log(
              "✅ Foreground notification displayed"
            );
          } catch (error) {
            console.log(
              "❌ Foreground notification error:",
              error
            );
          }
        }
      );

      console.log(
        "✅ Foreground FCM listener registered"
      );
    } catch (error) {
      console.log(
        "❌ Notification setup error:",
        error
      );
    }
  };

  setupNotifications();

  // Cleanup
  return () => {
    if (unsubscribe) {
      unsubscribe();

      console.log(
        "🧹 Foreground FCM listener removed"
      );
    }
  };
}, []);

// ======================================================
// 🔔 NOTIFICATION CLICK - APP OPEN / BACKGROUND
// ======================================================

useEffect(() => {
  const messagingInstance = getMessaging();

  // A) Notifee Foreground/Background Event Press Handler
  const unsubscribeNotifee = notifee.onForegroundEvent(
    async ({ type, detail }) => {
      try {
        if (type !== EventType.PRESS) {
          return;
        }

        console.log("=================================");
        console.log("👆 NOTIFEE NOTIFICATION CLICKED");
        console.log("=================================");

        const orderId = detail.notification?.data?.orderId;
        const status = detail.notification?.data?.status;
        const screen = detail.notification?.data?.screen;

        console.log("🧾 CLICKED ORDER ID:", orderId);
        console.log("📦 CLICKED STATUS:", status);
        console.log("📱 CLICKED SCREEN:", screen);

        if (screen === "Orders" && orderId) {
          openOrdersFromNotification(orderId, status);
        }
      } catch (error) {
        console.log(
          "❌ Notifee notification click error:",
          error
        );
      }
    }
  );

  // B) FCM Background Notification Click Handler
  const unsubscribeFCM = onNotificationOpenedApp(
    messagingInstance,
    remoteMessage => {
      try {
        console.log("=================================");
        console.log("👆 FCM BACKGROUND NOTIFICATION CLICKED");
        console.log("=================================");

        const orderId = remoteMessage?.data?.orderId;
        const status = remoteMessage?.data?.status;
        const screen = remoteMessage?.data?.screen;

        console.log("🧾 FCM CLICKED ORDER ID:", orderId);
        console.log("📦 FCM CLICKED STATUS:", status);
        console.log("📱 FCM CLICKED SCREEN:", screen);

        if (screen === "Orders" && orderId) {
          openOrdersFromNotification(orderId, status);
        }
      } catch (error) {
        console.log(
          "❌ FCM notification click error:",
          error
        );
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
      // ---------------------------------------------
      // 1️⃣ NOTIFEE INITIAL NOTIFICATION
      // ---------------------------------------------

      const notifeeInitial =
        await notifee.getInitialNotification();

      if (notifeeInitial) {
        const orderId =
          notifeeInitial.notification?.data?.orderId;

        const status =
          notifeeInitial.notification?.data?.status;

        const screen =
          notifeeInitial.notification?.data?.screen;

        console.log(
          "🚀 NOTIFEE INITIAL ORDER:",
          orderId
        );

        if (screen === "Orders" && orderId) {
          openOrdersFromNotification(
            orderId,
            status
          );

          return;
        }
      }

      // ---------------------------------------------
      // 2️⃣ FCM INITIAL NOTIFICATION
      // ---------------------------------------------

      const messagingInstance =
        getMessaging();

      const fcmInitial =
        await getFCMInitialNotification(
          messagingInstance
        );

      if (fcmInitial) {
        const orderId =
          fcmInitial?.data?.orderId;

        const status =
          fcmInitial?.data?.status;

        const screen =
          fcmInitial?.data?.screen;

        console.log(
          "🚀 FCM INITIAL NOTIFICATION"
        );

        console.log(
          "🧾 ORDER ID:",
          orderId
        );

        console.log(
          "📦 STATUS:",
          status
        );

        console.log(
          "📱 SCREEN:",
          screen
        );

        if (
          screen === "Orders" &&
          orderId
        ) {
          openOrdersFromNotification(
            orderId,
            status
          );
        }
      }

    } catch (error) {
      console.log(
        "❌ Initial notification error:",
        error
      );
    }
  };

  checkInitialNotification();
}, []);




  // ======================================================
  // UI
  // ======================================================

  return (
    <SafeAreaProvider>

      <StatusBar
        barStyle={
          isDarkMode
            ? "light-content"
            : "dark-content"
        }
      />


      <ThemeProvider>

        <NavigationContainer ref={navigationRef}>

          <Stack.Navigator
            initialRouteName="Splash"
            screenOptions={{
              headerShown: false,
            }}
          >

            {/* Onboarding */}
            <Stack.Screen
              name="Onboarding"
              component={OnboardingScreen}
            />


            {/* Splash */}
            <Stack.Screen
              name="Splash"
              component={SplashScreen}
            />


            {/* Login Role Selection */}
            <Stack.Screen
              name="LoginRoleSelection"
              component={LoginRoleSelection}
            />


            {/* Login */}
            <Stack.Screen
              name="Login"
              component={Login}
            />


            {/* Staff Login */}
            <Stack.Screen
              name="StaffLogin"
              component={StaffLoginScreen}
            />


            {/* Register */}
            <Stack.Screen
              name="Register"
              component={Register}
            />


            {/* Trial */}
            <Stack.Screen
              name="Trial"
              component={TrialScreen}
            />


            {/* Dashboard */}
            <Stack.Screen
              name="Dashboard"
              component={Dashboard}
            />


            {/* Journal */}
            <Stack.Screen
              name="JournalEntry"
              component={JournalEntry}
            />


            {/* Scan */}
            <Stack.Screen
              name="Scan"
              component={ScanScreen}
            />


            {/* Sales */}
            <Stack.Screen
              name="Sales"
              component={SalesScreen}
            />


            {/* Sales History */}
            <Stack.Screen
              name="SalesHistory"
              component={SalesHistory}
            />


            {/* Purchase History */}
            <Stack.Screen
              name="PurchaseHistory"
              component={PurchaseHistory}
            />


            {/* Inventory */}
            <Stack.Screen
              name="Inventory"
              component={InventoryScreen}
            />


            {/* Subscription */}
            <Stack.Screen
              name="Subscription"
              component={SubscriptionScreen}
            />


            {/* Demo Login */}
            <Stack.Screen
              name="DemoLogin"
              component={DemoLogin}
            />


            {/* Staff Creation */}
            <Stack.Screen
              name="StaffCreation"
              component={StaffCreationScreen}
            />


            {/* Profile */}
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
            />


            {/* Settings */}
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
            />


            {/* Orders */}
            <Stack.Screen
              name="Orders"
              component={OrdersScreen}
            />

          </Stack.Navigator>

        </NavigationContainer>

      </ThemeProvider>

    </SafeAreaProvider>
  );
}


export default App;