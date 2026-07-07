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
  sendPasswordResetEmail,
} from "firebase/auth";

import { doc, getDoc } from "firebase/firestore";

export default function LoginScreen({ navigation }) {

  const passwordRef = useRef(null);

  const [email, setEmail] = useState("");

  const [password, setPassword] =
    useState("");

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [showPassword, setShowPassword] =
    useState(false);

  const handleLogin = async () => {

    setError("");
    setLoading(true);

    try {

      const result =
        await signInWithEmailAndPassword(
          auth,
          email,
          password
        );

console.log(
  "LOGIN USER =>",
  auth.currentUser
);

      const snap = await getDoc(
        doc(db, "users", result.user.uid)
      );

      if (!snap.exists()) {

        await auth.signOut();

        setError(
          "User not registered ❌"
        );

        setLoading(false);

        return;
      }

      const userData = snap.data();

      const now = Date.now();

     if (
  userData.subscriptionExpiry > now
) {

  // ✅ SAVE LOGIN
await saveSession({

  route: "Dashboard",

  uid: result.user.uid,

});

  navigation.replace(
    "Dashboard"
  );

} else {

  // ✅ SAVE LOGIN
await saveSession({

  route: "Subscription",

  uid: result.user.uid,

});

  navigation.replace(
    "Subscription"
  );
}

    } catch (e) {

  console.log("LOGIN ERROR =>", e);

  if (e.code === "auth/user-not-found") {
    setError("User not found ❌");
  }

  else if (e.code === "auth/wrong-password") {
    setError("Wrong password ❌");
  }

  else if (e.code === "auth/invalid-credential") {
    setError("Invalid credential ❌");
  }

  else {
    setError(e.message);
  }
}

    setLoading(false);
  };

  const handleForgotPassword =
    async () => {

      setError("");
      setMessage("");

      if (!email) {

        setError(
          "Enter email first ⚠"
        );

        return;
      }

      try {

        await sendPasswordResetEmail(
          auth,
          email
        );

        setMessage(
          "Reset link sent 📩"
        );

      } catch (e) {

        setError("Failed ❌");
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
              placeholder="Email"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={email}
              onChangeText={(text) =>
                setEmail(text)
              }
              returnKeyType="next"
              onSubmitEditing={() =>
                passwordRef.current.focus()
              }
            />

            <TextInput
              ref={passwordRef}
              placeholder="Password"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={(text) =>
                setPassword(text)
              }
              returnKeyType="done"
              onSubmitEditing={handleLogin}
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
              onPress={handleLogin}
            >

              {loading ? (

                <ActivityIndicator
                  color="#fff"
                />

              ) : (

                <Text style={styles.btnText}>
                  Login
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

            <TouchableOpacity
              onPress={
                handleForgotPassword
              }
            >

              <Text style={styles.link}>
                Forgot Password?
              </Text>

            </TouchableOpacity>

<TouchableOpacity
  style={{
    backgroundColor:"#16a34a",
    padding:17,
    borderRadius:18,
    alignItems:"center",
    marginTop:12
  }}
  onPress={() =>
    navigation.navigate(
      "DemoLogin"
    )
  }
>
  <Text
    style={{
      color:"#fff",
      fontWeight:"bold",
      fontSize:16
    }}
  >
    🚀 Try Demo
  </Text>
</TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                navigation.navigate(
                  "Register"
                )
              }
            >

              <Text style={styles.link}>
                Register →
              </Text>

            </TouchableOpacity>

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