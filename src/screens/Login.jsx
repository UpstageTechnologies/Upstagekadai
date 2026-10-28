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
import { useTheme } from "../theme/ThemeContext";
import { LightTheme } from "../theme/colors";
import useKeyboardFocusScroll from "../hooks/useKeyboardFocusScroll";

export default function LoginScreen({ navigation }) {
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const themeContext = useTheme() || {};
  const theme = themeContext.theme || LightTheme;
  const darkMode = Boolean(themeContext.darkMode);
  const { scrollRef, onScroll, inputRef, focusInput } = useKeyboardFocusScroll();

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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkMode ? theme.background : "#eef2ff", paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0 }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.mainWrapper}>
            <View style={[styles.card, { backgroundColor: darkMode ? theme.card : "#ffffff", shadowColor: "#000" }]}>
              <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                onScroll={onScroll}
                scrollEventThrottle={16}
                contentContainerStyle={styles.cardScrollContent}
              >
                {/* TOP ROLE SWITCH TABS */}
                <View style={[styles.roleTabContainer, { backgroundColor: darkMode ? theme.background : "#f1f5f9" }]}>
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
                      color={activeRole === "master" ? "#ffffff" : (darkMode ? theme.subText : "#64748b")}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.roleTabText,
                        activeRole === "master" && styles.roleTabTextActive,
                        { color: activeRole === "master" ? "#ffffff" : (darkMode ? theme.subText : "#64748b") },
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
                      color={activeRole === "employee" ? "#ffffff" : (darkMode ? theme.subText : "#64748b")}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.roleTabText,
                        activeRole === "employee" && styles.roleTabTextActive,
                        { color: activeRole === "employee" ? "#ffffff" : (darkMode ? theme.subText : "#64748b") },
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

                <Text style={[styles.eyebrow, { color: "#2563eb" }]}>WELCOME BACK</Text>
                <Text style={[styles.title, { color: darkMode ? theme.text : "#1e3a8a" }]}>Sign In</Text>

                <Text style={[styles.subtitle, { color: darkMode ? theme.subText : "#64748b" }]}>
                  Sign in to continue to your shop dashboard.
                </Text>

                <View style={[styles.inputShell, { backgroundColor: darkMode ? theme.card : "#f8fafc", borderColor: darkMode ? theme.border : "#e2e8f0" }]}>
                  <Icon name="email-outline" size={20} color={darkMode ? theme.subText : "#64748b"} style={styles.inputIcon} />
                  <TextInput
                    ref={node => { emailRef.current = node; inputRef("email")(node); }}
                    placeholder="Email address"
                    placeholderTextColor={darkMode ? theme.subText : "#94a3b8"}
                    style={[styles.input, { color: darkMode ? theme.text : "#111827" }]}
                    value={email}
                    onChangeText={setEmail}
                    onFocus={() => focusInput("email")}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />
                </View>

                <View style={[styles.inputShell, { backgroundColor: darkMode ? theme.card : "#f8fafc", borderColor: darkMode ? theme.border : "#e2e8f0" }]}>
                  <Icon name="lock-outline" size={20} color={darkMode ? theme.subText : "#64748b"} style={styles.inputIcon} />
                  <TextInput
                    ref={node => { passwordRef.current = node; inputRef("password")(node); }}
                    placeholder="Password"
                    placeholderTextColor={darkMode ? theme.subText : "#94a3b8"}
                    style={[styles.input, { color: darkMode ? theme.text : "#111827" }]}
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => focusInput("password")}
                    textContentType="password"
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(value => !value)} accessibilityRole="button" accessibilityLabel={showPassword ? "Hide password" : "Show password"} style={styles.passwordToggle}>
                    <Icon name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={darkMode ? theme.subText : "#64748b"} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnText}>Login</Text>
                  )}
                </TouchableOpacity>

                {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

                {message ? <Text accessibilityRole="alert" style={styles.success}>{message}</Text> : null}

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
  },
  mainWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 28,
    overflow: "hidden",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  cardScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 140,
  },
  roleTabContainer: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 14,
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
    width: 220,
    height: 118,
    alignSelf: "center",
    marginBottom: 8,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.8,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 7,
  },
  title: {
    fontSize: 30,
    color: "#1e3a8a",
    marginBottom: 6,
    textAlign: "center",
    fontWeight: "bold",
  },
  subtitle: {
    textAlign: "center",
    color: "#64748b",
    marginBottom: 22,
    fontSize: 14,
  },
  inputShell: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    marginBottom: 13,
    shadowColor: "#0f172a",
    shadowOpacity: 0.025,
    shadowRadius: 4,
    elevation: 1,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    color: "#111827",
    paddingVertical: 14,
    fontSize: 15,
  },
  passwordToggle: { padding: 7, marginLeft: 4 },
  button: {
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#2563eb",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    marginTop: 5,
  },
  buttonDisabled: { opacity: 0.7 },
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
