import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import FastImage from "react-native-fast-image";

import { saveSession } from "../utils/session";
import { auth, db } from "../utils/firebaseConfig";

import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";

import { doc, getDoc } from "firebase/firestore";
import { saveSellerFCMToken } from "../utils/fcmToken";

export default function LoginScreen({ navigation }) {
  const passwordRef = useRef(null);

  const [activeRole, setActiveRole] = useState("master"); // 'master' | 'employee'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleRoleChange = (role) => {
    setActiveRole(role);
    if (role === "employee") {
      navigation.navigate("StaffLogin");
    }
  };

  const handleLogin = async () => {
    Keyboard.dismiss();
    setError("");
    setLoading(true);

    try {
      // 1. Firebase Authentication
      const result = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const uid = result.user.uid;

      console.log("✅ LOGIN SUCCESS");
      console.log("👤 SELLER UID:", uid);

      // 2. Check seller document
      const snap = await getDoc(doc(db, "users", uid));

      if (!snap.exists()) {
        await auth.signOut();
        setError("User not registered ❌");
        setLoading(false);
        return;
      }

      const userData = snap.data();
      const now = Date.now();

      try {
        console.log("🔔 Starting seller FCM setup...");
        await saveSellerFCMToken(uid);
        console.log("✅ Seller FCM setup completed");
      } catch (fcmError) {
        console.log("⚠️ FCM setup failed:", fcmError);
      }

      // 3. Existing subscription logic
      if (userData.subscriptionExpiry > now) {
        await saveSession({
          route: "Dashboard",
          uid: uid,
        });
        navigation.replace("Dashboard");
      } else {
        await saveSession({
          route: "Subscription",
          uid: uid,
        });
        navigation.replace("Subscription");
      }
    } catch (e) {
      console.log("❌ LOGIN ERROR:", e);

      if (e.code === "auth/user-not-found") {
        setError("User not found ❌");
      } else if (e.code === "auth/wrong-password") {
        setError("Wrong password ❌");
      } else if (e.code === "auth/invalid-credential") {
        setError("Invalid credential ❌");
      } else {
        setError(e.message);
      }
    }

    setLoading(false);
  };

  const handleForgotPassword = async () => {
    Keyboard.dismiss();
    setError("");
    setMessage("");

    if (!email) {
      setError("Enter email first ⚠");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Reset link sent 📩");
    } catch (e) {
      setError("Failed ❌");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.mainWrapper}>
            <View style={styles.card}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.cardScrollContent}
              >
                {/* TOP ROLE SWITCH TABS */}
                <View style={styles.roleTabContainer}>
                  <TouchableOpacity
                    style={[
                      styles.roleTab,
                      activeRole === "master" && styles.roleTabActive,
                    ]}
                    onPress={() => handleRoleChange("master")}
                    activeOpacity={0.8}
                  >
                    <Icon
                      name="shield-account"
                      size={18}
                      color={activeRole === "master" ? "#ffffff" : "#64748b"}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.roleTabText,
                        activeRole === "master" && styles.roleTabTextActive,
                      ]}
                    >
                      Master
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.roleTab,
                      activeRole === "employee" && styles.roleTabActive,
                    ]}
                    onPress={() => handleRoleChange("employee")}
                    activeOpacity={0.8}
                  >
                    <Icon
                      name="account-tie"
                      size={18}
                      color={activeRole === "employee" ? "#ffffff" : "#64748b"}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.roleTabText,
                        activeRole === "employee" && styles.roleTabTextActive,
                      ]}
                    >
                      Employee
                    </Text>
                  </TouchableOpacity>
                </View>

                <FastImage
                  source={require("../assets/Bag.gif")}
                  style={styles.topImage}
                  resizeMode={FastImage.resizeMode.contain}
                />

                <Text style={styles.title}>Sign In</Text>

                <Text style={styles.subtitle}>
                  Enter valid email & password to continue
                </Text>

                <TextInput
                  placeholder="Email"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />

                <TextInput
                  ref={passwordRef}
                  placeholder="Password"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />

                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Text style={styles.showText}>
                    {showPassword ? "Hide Password" : "Show Password"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.button}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnText}>Login</Text>
                  )}
                </TouchableOpacity>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                {message ? <Text style={styles.success}>{message}</Text> : null}

                <TouchableOpacity onPress={handleForgotPassword}>
                  <Text style={styles.link}>Forgot Password?</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    backgroundColor: "#16a34a",
                    padding: 17,
                    borderRadius: 18,
                    alignItems: "center",
                    marginTop: 12,
                  }}
                  onPress={() => navigation.navigate("DemoLogin")}
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontWeight: "bold",
                      fontSize: 16,
                    }}
                  >
                    🚀 Try Demo
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => navigation.navigate("Register")}
                >
                  <Text style={styles.link}>Register →</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#eef2ff",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  mainWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  card: {
    width: "100%",
    height: "99%",
    backgroundColor: "#ffffff",
    borderRadius: 35,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 6,
  },
  cardScrollContent: {
    padding: 25,
    paddingBottom: 35,
  },
  roleTabContainer: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 18,
    padding: 4,
    marginBottom: 16,
  },
  roleTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 14,
  },
  roleTabActive: {
    backgroundColor: "#2563eb",
    shadowColor: "#2563eb",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  roleTabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
  },
  roleTabTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  topImage: {
    width: 350,
    height: 180,
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
    marginBottom: 20,
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