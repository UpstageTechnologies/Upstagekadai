import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Modal,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { db } from "../utils/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { saveSession } from "../utils/session";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

export default function StaffLoginScreen({ navigation }) {
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertModalVisible(true);
  };

  const handleStaffLogin = async () => {
    Keyboard.dismiss();
    if (!staffId || !password) {
      showAlert("Validation Error", "Please enter Staff ID and Password.");
      return;
    }

    setLoading(true);
    try {
      const trimmedId = staffId.trim();

      // Database collection 'staffs'
      const staffDocRef = doc(db, "staffs", trimmedId);
      const staffSnap = await getDoc(staffDocRef);

      if (!staffSnap.exists()) {
        showAlert("Login Failed", "Invalid Staff ID. Account not found.");
        setLoading(false);
        return;
      }

      const staffData = staffSnap.data();

      if (staffData.password === password) {
        await saveSession({
          route: "Dashboard",
          uid: staffData.masterUid,
          staffId: staffData.staffId,
          role: "employee",
        });
        navigation.replace("Dashboard");
      } else {
        showAlert("Login Failed", "Incorrect password. Please try again.");
      }
    } catch (e) {
      showAlert("Error", e.message);
    }
    setLoading(false);
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
                    style={styles.roleTab}
                    onPress={() => navigation.navigate("Login")}
                    activeOpacity={0.8}
                  >
                    <Icon
                      name="shield-account"
                      size={18}
                      color="#64748b"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.roleTabText}>Master</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.roleTab, styles.roleTabActive]}
                    activeOpacity={0.8}
                  >
                    <Icon
                      name="account-tie"
                      size={18}
                      color="#ffffff"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.roleTabText, styles.roleTabTextActive]}>
                      Employee
                    </Text>
                  </TouchableOpacity>
                </View>

                <Image
                  source={require("../assets/shopping1.jpg")}
                  style={styles.topImage}
                  resizeMode="contain"
                />

                <Text style={styles.title}>Staff Portal</Text>
                <Text style={styles.subtitle}>Enter your Staff ID & Password</Text>

                <TextInput
                  placeholder="Staff ID (e.g., MP2026001)"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  value={staffId}
                  onChangeText={setStaffId}
                  autoCapitalize="characters"
                />

                {/* Password Container with Show/Hide Toggle */}
                <View style={styles.passwordContainer}>
                  <TextInput
                    placeholder="Password"
                    placeholderTextColor="#94a3b8"
                    style={styles.passwordInput}
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                    activeOpacity={0.7}
                  >
                    <Icon
                      name={showPassword ? "eye-outline" : "eye-off-outline"}
                      size={20}
                      color="#64748b"
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.button}
                  onPress={handleStaffLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnText}>Staff Login</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => navigation.navigate("Login")}
                  style={{ marginTop: 20 }}
                >
                  <Text style={styles.link}>← Switch to Master Login</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <Modal visible={alertModalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.successModalBox}>
            <View
              style={[
                styles.successIconCircle,
                { backgroundColor: "#fee2e2" },
              ]}
            >
              <Icon name="alert-circle" size={30} color="#dc2626" />
            </View>
            <Text style={styles.successTitle}>{alertTitle}</Text>
            <Text style={styles.successSub}>{alertMessage}</Text>

            <TouchableOpacity
              style={styles.successBtn}
              onPress={() => setAlertModalVisible(false)}
            >
              <Text style={styles.btnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    width: 170,
    height: 170,
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
    padding: 16,
    marginBottom: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    fontSize: 15,
    color: "#111827",
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 15,
    paddingHorizontal: 16,
  },
  passwordInput: {
    flex: 1,
    color: "#111827",
    paddingVertical: 16,
    fontSize: 15,
  },
  eyeBtn: {
    paddingLeft: 10,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  button: {
    backgroundColor: "#16a34a",
    padding: 17,
    borderRadius: 18,
    alignItems: "center",
    shadowColor: "#16a34a",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  btnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  link: {
    color: "#2563eb",
    marginTop: 18,
    textAlign: "center",
    fontWeight: "600",
  },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  successModalBox: {
    width: "90%",
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    elevation: 15,
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 5,
    textAlign: "center",
  },
  successSub: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 20,
    textAlign: "center",
  },
  successBtn: {
    width: "100%",
    backgroundColor: "#6366f1",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
  },
});