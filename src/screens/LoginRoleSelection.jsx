import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

export default function LoginRoleSelection({ navigation }) {
  const [selectedRole, setSelectedRole] = useState("master"); // 'master' or 'employee'
  const [showDropdown, setShowDropdown] = useState(false);

  const handleProceed = () => {
    if (selectedRole === "master") {
      navigation.navigate("Login"); // Ungaloda original Master Login page name
    } else {
      navigation.navigate("StaffLogin"); // Staff Login Screen
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0f172a" barStyle="light-content" />
      <View style={styles.card}>
        <Text style={styles.title}>Welcome Back 👋</Text>
        <Text style={styles.subtitle}>Select your role to continue login</Text>

        <Text style={styles.label}>Login As:</Text>
        <TouchableOpacity style={styles.dropdownSelector} onPress={() => setShowDropdown(!showDropdown)}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Icon name={selectedRole === "master" ? "shield-account" : "account-tie"} size={22} color="#6366f1" />
            <Text style={styles.dropdownText}>{selectedRole === "master" ? "Master (Admin)" : "Employee (Staff)"}</Text>
          </View>
          <Icon name="chevron-down" size={20} color="#64748b" />
        </TouchableOpacity>

        {showDropdown && (
          <View style={styles.dropdownList}>
            <TouchableOpacity 
              style={[styles.dropdownItem, selectedRole === "master" && styles.activeItem]} 
              onPress={() => { setSelectedRole("master"); setShowDropdown(false); }}
            >
              <Icon name="shield-account" size={20} color="#6366f1" />
              <Text style={styles.itemText}>Master (Admin)</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.dropdownItem, selectedRole === "employee" && styles.activeItem]} 
              onPress={() => { setSelectedRole("employee"); setShowDropdown(false); }}
            >
              <Icon name="account-tie" size={20} color="#16a34a" />
              <Text style={styles.itemText}>Employee (Staff)</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.button} onPress={handleProceed}>
          <Text style={styles.btnText}>Continue →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", justifyContent: "center", padding: 20 },
  card: { backgroundColor: "#ffffff", borderRadius: 30, padding: 25, elevation: 10 },
  title: { fontSize: 28, color: "#1e3a8a", marginBottom: 5, textAlign: "center", fontWeight: "bold" },
  subtitle: { textAlign: "center", color: "#64748b", marginBottom: 25, fontSize: 14 },
  label: { fontSize: 14, fontWeight: "600", color: "#334155", marginBottom: 8 },
  dropdownSelector: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", padding: 16, borderRadius: 16, marginBottom: 15 },
  dropdownText: { fontSize: 16, fontWeight: "600", color: "#1e293b", marginLeft: 10 },
  dropdownList: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#5a9aecff", borderRadius: 16, marginBottom: 15, overflow: "hidden", elevation: 4 },
  dropdownItem: { flexDirection: "row", alignItems: "center", padding: 15, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  activeItem: { backgroundColor: "#f1f5f9" },
  itemText: { fontSize: 15, fontWeight: "600", color: "#334155", marginLeft: 10 },
  button: { backgroundColor: "#6366f1", padding: 18, borderRadius: 18, alignItems: "center", marginTop: 10 },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});