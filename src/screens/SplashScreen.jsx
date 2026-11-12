import React, {
  useEffect,
} from "react";

import {
  View,
  Image,
  ActivityIndicator,
} from "react-native";

import {
  getSession,
} from "../utils/session";

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../utils/firebaseConfig";

export default function SplashScreen({
  navigation,
}) {

  useEffect(() => {

    checkLogin();

  }, []);

  const checkLogin = async () => {

    // ✅ local session
    const session =
      await getSession();

    // ❌ no session
    if (!session) {

      navigation.replace(
        "Onboarding"
      );

      return;
    }

    // If session is a staff account (waiter, kitchen, or employee)
    if (session.staffId) {
      if (session.role === "waiter") {
        navigation.replace("WaiterOrder");
      } else if (session.role === "kitchen") {
        navigation.replace("KitchenDisplay");
      } else {
        navigation.replace("Dashboard");
      }
      return;
    }

    onAuthStateChanged(auth, (user) => {
      if (user) {
        navigation.reset({
          index: 0,
          routes: [
            {
              name: "Dashboard",
            },
          ],
        });
      } else {
        navigation.replace("Login");
      }
    });

  };

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#fff",
      }}
    >
      <Image
        source={require("../assets/logo.png")}
        style={{
          width: 150,
          height: 150,
          resizeMode: "contain",
          marginBottom: 24,
        }}
      />
      <ActivityIndicator
        size="large"
        color="#2563eb"
      />
    </View>
  );
}