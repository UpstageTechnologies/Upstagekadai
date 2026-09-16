import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Modal,
  StatusBar,
  Platform,
} from "react-native";
import { db, auth } from "../utils/firebaseConfig";
import { doc, setDoc, getDoc, collection, getDocs, deleteDoc, updateDoc } from "firebase/firestore";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

export default function StaffCreationScreen({ navigation }) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [staffList, setStaffList] = useState([]);
  
  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertType, setAlertType] = useState("success");
  const [confirmCallback, setConfirmCallback] = useState(null);

  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [createdStaffInfo, setCreatedStaffInfo] = useState({ id: "", password: "" });

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [editName, setEditName] = useState("");
  const [editMobile, setEditMobile] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [userRole, setUserRole] = useState("master");

  const showAlert = (title, message, type = "success", onConfirm = null) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertType(type);
    setConfirmCallback(() => onConfirm);
    setAlertModalVisible(true);
  };

  const fetchStaffsAndShop = async () => {
    const masterUid = auth?.currentUser?.uid;
    if (!masterUid) return;

    try {
      const querySnapshot = await getDocs(collection(db, "users", masterUid, "staffs"));
      const list = [];
      querySnapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setStaffList(list);
    } catch (error) {
      console.log("Error fetching staffs:", error);
    }
  };

  // Fixed: Fetch user role correctly from Firestore instead of calling undefined getSession()
  useEffect(() => {
    const fetchUserRole = async () => {
      const currentUid = auth?.currentUser?.uid;
      if (!currentUid) return;
      try {
        const userDoc = await getDoc(doc(db, "users", currentUid));
        if (userDoc.exists() && userDoc.data().role) {
          setUserRole(userDoc.data().role);
        }
      } catch (error) {
        console.log("Error fetching user role:", error);
      }
    };

    fetchUserRole();
    fetchStaffsAndShop();
  }, []);

  if (userRole === "employee") {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Icon name="lock-alert" size={60} color="#dc2626" />
        <Text style={{ fontSize: 20, fontWeight: "bold", color: "#1e3a8a", marginTop: 15 }}>Restricted Access</Text>
        <Text style={{ color: "#64748b", textAlign: "center", paddingHorizontal: 40, marginTop: 5 }}>
          This section is locked for staff accounts. Only the master user can view this page.
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const generatePassword = () => {
    return Math.random().toString(36).slice(-8) + Math.floor(10 + Math.random() * 90);
  };

  const handleCreateStaff = async () => {
    if (!name || !mobile || !address) {
      showAlert("Validation Error", "Please fill in all required fields.", "error");
      return;
    }

    setLoading(true);
    try {
      const currentYear = new Date().getFullYear();
      let shopInitials = "MP"; 

      const masterUid = auth?.currentUser?.uid;
      if (!masterUid) {
        showAlert("Error", "Master user not authenticated.", "error");
        setLoading(false);
        return;
      }

      const userSnap = await getDoc(doc(db, "users", masterUid));
      if (userSnap.exists()) {
        const sName = userSnap.data().shopName || userSnap.data().cashDisplayName || userSnap.data().global_shopName || "";
        if (sName) {
          const words = sName.trim().split(" ");
          if (words.length > 1) {
            shopInitials = words.map(w => w[0]).join("").toUpperCase();
          } else {
            shopInitials = sName.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase();
          }
        }
      }

      const staffsQuery = await getDocs(collection(db, "users", masterUid, "staffs"));
      const totalStaffs = staffsQuery.size; 
      const nextNum = totalStaffs + 1; 
      const paddedNum = String(nextNum).padStart(3, '0');

      const staffId = `${currentYear}${shopInitials}${paddedNum}`;
      const generatedPassword = generatePassword();

      const staffData = {
        staffId,
        name,
        mobile,
        address,
        password: generatedPassword,
        masterUid, 
        createdAt: new Date(),
        role: "employee",
      };

      await setDoc(doc(db, "users", masterUid, "staffs", staffId), staffData);
      await setDoc(doc(db, "staffs", staffId), staffData);

      setCreatedStaffInfo({ id: staffId, password: generatedPassword });
      setSuccessModalVisible(true);

      setName("");
      setMobile("");
      setAddress("");
      fetchStaffsAndShop();
    } catch (error) {
      showAlert("Error", error.message, "error");
    }
    setLoading(false);
  };

  const handleDeleteStaff = (staffId) => {
    showAlert(
      "Confirm Deletion",
      "Are you sure you want to delete this staff account?",
      "confirm",
      async () => {
        try {
          const masterUid = auth?.currentUser?.uid;
          await deleteDoc(doc(db, "users", masterUid, "staffs", staffId));
          await deleteDoc(doc(db, "staffs", staffId));
          showAlert("Success", "Staff account deleted successfully.", "success");
          fetchStaffsAndShop();
        } catch (error) {
          showAlert("Error", error.message, "error");
        }
      }
    );
  };

  const openEditModal = (staff) => {
    setSelectedStaff(staff);
    setEditName(staff.name || "");
    setEditMobile(staff.mobile || "");
    setEditAddress(staff.address || "");
    setEditPassword(staff.password || "");
    setEditModalVisible(true);
  };

  const handleUpdateStaff = async () => {
    if (!editName || !editMobile || !editAddress || !editPassword) {
      showAlert("Validation Error", "Please fill in all fields before updating.", "error");
      return;
    }

    try {
      const masterUid = auth?.currentUser?.uid;
      const staffId = selectedStaff.staffId;

      const updatedData = {
        name: editName,
        mobile: editMobile,
        address: editAddress,
        password: editPassword,
      };

      await updateDoc(doc(db, "users", masterUid, "staffs", staffId), updatedData);
      await updateDoc(doc(db, "staffs", staffId), updatedData);

      setEditModalVisible(false);
      showAlert("Success", "Staff details updated successfully.", "success");
      fetchStaffsAndShop();
    } catch (error) {
      showAlert("Error", error.message, "error");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#f8fafc" barStyle="dark-content" />
      
      {/* HEADER WITH BACK BUTTON */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color="#1e3a8a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Staff Management</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Create Staff Account</Text>
        <Text style={styles.subtitle}>Fill employee details to generate Login ID & Password</Text>

        <TextInput
          placeholder="Staff Name"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={name}
          onChangeText={setName}
        />

        <TextInput
          placeholder="Mobile Number"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          keyboardType="phone-pad"
          value={mobile}
          onChangeText={setMobile}
        />

        <TextInput
          placeholder="Address"
          placeholderTextColor="#94a3b8"
          style={[styles.input, { height: 70, textAlignVertical: "top" }]}
          multiline
          value={address}
          onChangeText={setAddress}
        />

        <TouchableOpacity style={styles.button} onPress={handleCreateStaff} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Generate Staff ID & Password</Text>}
        </TouchableOpacity>

        <Text style={styles.tableHeaderTitle}>Created Staff List (This Shop Only)</Text>
        
        <View style={styles.tableContainer}>
          <View style={[styles.tableRow, styles.tableHead]}>
            <Text style={[styles.tableCell, styles.headText, { flex: 1.2 }]}>Staff ID</Text>
            <Text style={[styles.tableCell, styles.headText, { flex: 0.8 }]}>Name</Text>
            <Text style={[styles.tableCell, styles.headText, { flex: 1 }]}>Mobile</Text>
            <Text style={[styles.tableCell, styles.headText, { flex: 0.9 }]}>Password</Text>
            <Text style={[styles.tableCell, styles.headText, { flex: 0.6, textAlign: "center" }]}>Action</Text>
          </View>

          {staffList.length === 0 ? (
            <Text style={styles.noDataText}>No staff accounts created for this shop yet.</Text>
          ) : (
            staffList.map((item, index) => (
              <View key={index} style={[styles.tableRow, index % 2 === 0 ? styles.evenRow : styles.oddRow]}>
                <Text style={[styles.tableCell, { flex: 1.2, fontWeight: "bold", color: "#6366f1", fontSize: 11 }]}>
                  {item.staffId}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.8, fontSize: 12 }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, fontSize: 12 }]} numberOfLines={1}>
                  {item.mobile}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.9, color: "#16a34a", fontWeight: "600", fontSize: 12 }]} numberOfLines={1}>
                  {item.password}
                </Text>
                <View style={{ flex: 0.6, flexDirection: "row", justifyContent: "space-around" }}>
                  <TouchableOpacity onPress={() => openEditModal(item)}>
                    <Icon name="pencil-outline" size={18} color="#2563eb" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteStaff(item.staffId)}>
                    <Icon name="delete-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Universal Alert Modal */}
      <Modal visible={alertModalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.successModalBox}>
            <View style={[
              styles.successIconCircle, 
              { backgroundColor: alertType === "error" ? "#fee2e2" : alertType === "confirm" ? "#fef3c7" : "#dcfce7" }
            ]}>
              <Icon 
                name={alertType === "error" ? "alert-circle" : alertType === "confirm" ? "help-circle" : "check-bold"} 
                size={30} 
                color={alertType === "error" ? "#dc2626" : alertType === "confirm" ? "#d97706" : "#16a34a"} 
              />
            </View>
            <Text style={styles.successTitle}>{alertTitle}</Text>
            <Text style={styles.successSub}>{alertMessage}</Text>

            {alertType === "confirm" ? (
              <View style={{ flexDirection: "row", width: "100%", justifyContent: "space-between" }}>
                <TouchableOpacity 
                  style={[styles.successBtn, { backgroundColor: "#94a3b8", flex: 0.48 }]} 
                  onPress={() => setAlertModalVisible(false)}
                >
                  <Text style={styles.btnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.successBtn, { backgroundColor: "#dc2626", flex: 0.48 }]} 
                  onPress={() => {
                    setAlertModalVisible(false);
                    if (confirmCallback) confirmCallback();
                  }}
                >
                  <Text style={styles.btnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity 
                style={styles.successBtn} 
                onPress={() => setAlertModalVisible(false)}
              >
                <Text style={styles.btnText}>OK</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal visible={successModalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.successModalBox}>
            <View style={styles.successIconCircle}>
              <Icon name="check-bold" size={32} color="#16a34a" />
            </View>
            <Text style={styles.successTitle}>Staff Created Successfully!</Text>
            <Text style={styles.successSub}>Please save the login credentials securely.</Text>

            <View style={styles.credentialBox}>
              <View style={styles.credentialRow}>
                <Text style={styles.credentialLabel}>Staff ID:</Text>
                <Text style={styles.credentialValue}>{createdStaffInfo.id}</Text>
              </View>
              <View style={[styles.credentialRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.credentialLabel}>Password:</Text>
                <Text style={[styles.credentialValue, { color: "#16a34a" }]}>{createdStaffInfo.password}</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.successBtn} 
              onPress={() => setSuccessModalVisible(false)}
            >
              <Text style={styles.btnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={editModalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Edit Staff Details</Text>
            <Text style={styles.modalSub}>Staff ID: {selectedStaff?.staffId}</Text>

            <TextInput
              placeholder="Staff Name"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
            />

            <TextInput
              placeholder="Mobile Number"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              keyboardType="phone-pad"
              value={editMobile}
              onChangeText={setEditMobile}
            />

            <TextInput
              placeholder="Address"
              placeholderTextColor="#94a3b8"
              style={[styles.input, { height: 60, textAlignVertical: "top" }]}
              multiline
              value={editAddress}
              onChangeText={setEditAddress}
            />

            <TextInput
              placeholder="Password"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={editPassword}
              onChangeText={setEditPassword}
            />

            <TouchableOpacity style={styles.button} onPress={handleUpdateStaff}>
              <Text style={styles.btnText}>Update Staff Details</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditModalVisible(false)}>
              <Text style={{ color: "#64748b", fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#f8fafc",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0 
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1e3a8a",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  title: { fontSize: 24, fontWeight: "bold", color: "#1e3a8a", marginBottom: 5 },
  subtitle: { color: "#64748b", marginBottom: 20, fontSize: 14 },
  input: { backgroundColor: "#fff", padding: 15, marginBottom: 12, borderRadius: 14, borderWidth: 1, borderColor: "#e2e8f0", fontSize: 15 },
  button: { backgroundColor: "#6366f1", padding: 16, borderRadius: 14, alignItems: "center", marginTop: 5, marginBottom: 15 },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  
  tableHeaderTitle: { fontSize: 18, fontWeight: "bold", color: "#1e3a8a", marginBottom: 10, marginTop: 10 },
  tableContainer: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#e2e8f0", overflow: "hidden", marginBottom: 30 },
  tableRow: { flexDirection: "row", paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#f1f5f9", alignItems: "center" },
  tableHead: { backgroundColor: "#1e293b" },
  headText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  tableCell: { fontSize: 12, color: "#334155" },
  evenRow: { backgroundColor: "#ffffff" },
  oddRow: { backgroundColor: "#f8fafc" },
  noDataText: { textAlign: "center", padding: 20, color: "#94a3b8", fontSize: 14 },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalBox: { width: "100%", backgroundColor: "#fff", borderRadius: 20, padding: 20, elevation: 10 },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#1e3a8a", marginBottom: 5, textAlign: "center" },
  modalSub: { fontSize: 13, color: "#64748b", marginBottom: 15, textAlign: "center" },
  cancelBtn: { alignItems: "center", padding: 10, marginTop: 10 },

  successModalBox: { width: "90%", backgroundColor: "#fff", borderRadius: 24, padding: 24, alignItems: "center", elevation: 15, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10 },
  successIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#dcfce7", justifyContent: "center", alignItems: "center", marginBottom: 15 },
  successTitle: { fontSize: 20, fontWeight: "bold", color: "#1e293b", marginBottom: 5, textAlign: "center" },
  successSub: { fontSize: 13, color: "#64748b", marginBottom: 20, textAlign: "center" },
  credentialBox: { width: "100%", backgroundColor: "#f8fafc", borderRadius: 14, borderWidth: 1, borderColor: "#e2e8f0", padding: 15, marginBottom: 20 },
  credentialRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  credentialLabel: { fontSize: 14, fontWeight: "600", color: "#475569" },
  credentialValue: { fontSize: 14, fontWeight: "bold", color: "#6366f1" },
  successBtn: { width: "100%", backgroundColor: "#6366f1", padding: 16, borderRadius: 14, alignItems: "center" }
});