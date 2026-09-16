import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView, Modal } from "react-native";
import { db } from "../utils/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { saveSession } from "../utils/session";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

export default function StaffLoginScreen({ navigation }) {
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
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
    if (!staffId || !password) {
      showAlert("Validation Error", "Please enter Staff ID and Password.");
      return;
    }

    setLoading(true);
    try {
      const trimmedId = staffId.trim();

      // 🌟 Corrected collection name from 'employees' to 'staffs' matching your database
      const staffDocRef = doc(db, "staffs", trimmedId);
      const staffSnap = await getDoc(staffDocRef);

      if (!staffSnap.exists()) {
        showAlert("Login Failed", "Invalid Staff ID. Account not found.");
        setLoading(false);
        return;
      }

      const staffData = staffSnap.data();

      if (staffData.password === password) {
        // Save session with master store context (masterUid)
        await saveSession({ 
          route: "Dashboard", 
          uid: staffData.masterUid, 
          staffId: staffData.staffId,
          role: "employee" 
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
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
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

        <TextInput
          placeholder="Password"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.button} onPress={handleStaffLogin}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Staff Login</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
          <Text style={styles.link}>← Back to Role Selection</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={alertModalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.successModalBox}>
            <View style={[styles.successIconCircle, { backgroundColor: "#fee2e2" }]}>
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
  container: { flex: 1, backgroundColor: "#eef2ff", justifyContent: "center", padding: 25 },
  card: { backgroundColor: "#ffffff", borderRadius: 30, padding: 25, elevation: 6 },
  title: { fontSize: 30, color: "#1e3a8a", marginBottom: 8, textAlign: "center", fontWeight: "bold" },
  subtitle: { textAlign: "center", color: "#64748b", marginBottom: 25, fontSize: 14 },
  input: { backgroundColor: "#f8fafc", padding: 16, marginBottom: 15, borderRadius: 16, borderWidth: 1, borderColor: "#e2e8f0", fontSize: 15 },
  button: { backgroundColor: "#16a34a", padding: 17, borderRadius: 18, alignItems: "center", marginTop: 5 },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  link: { color: "#2563eb", textAlign: "center", fontWeight: "600" },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 20 },
  successModalBox: { width: "90%", backgroundColor: "#fff", borderRadius: 24, padding: 24, alignItems: "center", elevation: 15 },
  successIconCircle: { width: 64, height: 64, borderRadius: 32, justifyContent: "center", alignItems: "center", marginBottom: 15 },
  successTitle: { fontSize: 20, fontWeight: "bold", color: "#1e293b", marginBottom: 5, textAlign: "center" },
  successSub: { fontSize: 13, color: "#64748b", marginBottom: 20, textAlign: "center" },
  successBtn: { width: "100%", backgroundColor: "#6366f1", padding: 16, borderRadius: 14, alignItems: "center" }
});