import React, { useEffect, useState } from "react";
import { StatusBar, useColorScheme } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ThemeProvider } from "./src/theme/ThemeContext";

// Screens
import Login from "./src/screens/Login";
import Register from "./src/screens/Register";
import Dashboard from "./src/screens/Dashboard";
import ScanScreen from "./src/screens/ScanScreen";
import SalesScreen from "./src/screens/SalesScreen";
import SalesHistory from "./src/screens/SalesHistory";
import PurchaseHistory from "./src/screens/PurchaseHistory";
import InventoryScreen from "./src/screens/InventoryScreen";
import SubscriptionScreen from "./src/screens/SubscriptionScreen";
import { auth, db } from "./src/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import TrialScreen from "./src/screens/TrialScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import SplashScreen from "./src/screens/SplashScreen";
import JournalEntry from "./src/screens/JournalEntry";
import DemoLogin from "./src/screens/DemoLogin";
import OrdersScreen from "./src/screens/OrdersScreen";
// 🌟 NEW IMPORT
import SettingsScreen from "./src/screens/SettingsScreen"; 

import {
  doc,
  getDoc,
} from "firebase/firestore";

const Stack = createNativeStackNavigator<any>();

function App() {
  const isDarkMode = useColorScheme() === "dark";

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      <ThemeProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Splash"
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Login" component={Login} />
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
            
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
              options={{ headerShown: false }}
            />

            {/* 🌟 NEW SETTINGS SCREEN REGISTERED */}
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ headerShown: false }}
            />
            
            <Stack.Screen name="Orders" component={OrdersScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default App;