import React, {
  useState,
  useRef,
} from "react";import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { saveSession  } from "../../utils/session";
import { auth, db } from "../firebaseConfig";

import {
  signInWithEmailAndPassword,
} from "firebase/auth";


import { doc, getDoc } from "firebase/firestore";

export default function LoginScreen({ navigation }) {

  const passwordRef = useRef(null);

 const [email] =
  useState("demo@gmail.com");

const [password] =
  useState("123456");

const [loading, setLoading] =
  useState(false);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);


    const handleDemoLogin = async () => {

  try {

    const result =
      await signInWithEmailAndPassword(
        auth,
        "demo@gmail.com",
        "123456"
      );

    await saveSession({
      route: "Dashboard",
      uid: result.user.uid,
      isDemo: true,
      demoExpiry:
        Date.now() +
        (10 * 60 * 1000)
    });

    navigation.replace(
      "Dashboard"
    );

  } catch (e) {

    console.log(
      "DEMO LOGIN ERROR =>",
      e
    );

  }

};


  return (

    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={
        Platform.OS === "ios"
          ? "padding"
          : undefined
      }
    >

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
      >

        <View style={styles.container}>

          <View style={styles.card}>

            <Image
              source={require("../assets/shopping1.jpg")}
              style={styles.topImage}
              resizeMode="contain"
            />

            <Text style={styles.title}>
              Sign In
            </Text>

            <Text style={styles.subtitle}>
              Enter valid email & password
              to continue
            </Text>

            <TextInput
              value={email}
              editable={false}
              style={styles.input}
            />

           <TextInput
            value={password}
            editable={false}
            secureTextEntry
            style={styles.input}
          />
            <TouchableOpacity
              onPress={() =>
                setShowPassword(
                  !showPassword
                )
              }
            >

              <Text style={styles.showText}>
                {
                  showPassword
                    ? "Hide Password"
                    : "Show Password"
                }
              </Text>

            </TouchableOpacity>

                <TouchableOpacity
          style={styles.button}
          onPress={handleDemoLogin}
        >

          {loading ? (
            <ActivityIndicator color="#fff"/>
          ) : (
            <Text style={styles.btnText}>
              Login Demo
            </Text>
          )}

        </TouchableOpacity>

            {error ? (

              <Text style={styles.error}>
                {error}
              </Text>

            ) : null}

            {message ? (

              <Text style={styles.success}>
                {message}
              </Text>

            ) : null}

          </View>

        </View>

      </ScrollView>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    justifyContent: "center",
    padding: 25,
    backgroundColor: "#eef2ff",
  },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 35,
    padding: 25,

    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 6,
  },

  topImage: {
    width: 220,
    height: 220,
    alignSelf: "center",
    marginBottom: 5,
  },

  title: {
    fontSize: 34,
    color: "#1e3a8a",
    marginBottom: 8,
    textAlign: "center",
    fontWeight: "bold",
  },

  subtitle: {
    textAlign: "center",
    color: "#64748b",
    marginBottom: 30,
    fontSize: 15,
  },

  input: {
    backgroundColor: "#f8fafc",
    color: "#111827",
    padding: 16,
    marginBottom: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    fontSize: 15,
  },

  showText: {
    color: "#2563eb",
    marginBottom: 15,
    fontWeight: "600",
    textAlign: "right",
  },

  button: {
    backgroundColor: "#2563eb",
    padding: 17,
    borderRadius: 18,
    alignItems: "center",

    shadowColor: "#2563eb",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },

  btnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },

  error: {
    color: "#ef4444",
    marginTop: 15,
    textAlign: "center",
    fontWeight: "600",
  },

  success: {
    color: "#16a34a",
    marginTop: 15,
    textAlign: "center",
    fontWeight: "600",
  },

  link: {
    color: "#2563eb",
    marginTop: 18,
    textAlign: "center",
    fontWeight: "600",
  },

});