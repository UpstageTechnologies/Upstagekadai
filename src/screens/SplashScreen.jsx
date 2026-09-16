import React, {
  useEffect,
} from "react";

import {
  View,
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

onAuthStateChanged(auth, (user) => {

  if (user) {

    navigation.reset({
      index: 0,
      routes: [
        {
         name:"Dashboard",
        },
      ],
    });

  } else {

    navigation.replace(
      "Login"
    );

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

      <ActivityIndicator
        size="large"
        color="#2563eb"
      />

    </View>
  );
}