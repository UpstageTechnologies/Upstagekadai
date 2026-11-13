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
import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

const ROLE_OPTIONS = [
  {
    id: "waiter",
    label: "Waiter / Captain",
    icon: "silverware-fork-knife",
    badge: "🍽️ Waiter",
    color: "#0284c7",
    bgColor: "#e0f2fe",
    desc: "Takes table orders & sends KOT to kitchen (No Billing)",
  },
  {
    id: "kitchen",
    label: "Kitchen Staff",
    icon: "chef-hat",
    badge: "👨‍🍳 Kitchen",
    color: "#ea580c",
    bgColor: "#ffedd5",
    desc: "Receives live orders & marks Dish Ready (No Billing)",
  },
  {
    id: "delivery",
    label: "Delivery Boy / Driver",
    icon: "moped",
    badge: "🛵 Delivery Boy",
    color: "#16a34a",
    bgColor: "#dcfce7",
    desc: "Delivers orders to customer door using Delivery App",
  },
  {
    id: "employee",
    label: "General Staff",
    icon: "account-tie",
    badge: "💼 Staff",
    color: "#4f46e5",
    bgColor: "#ede9fe",
    desc: "General store employee",
  },
];

export default function StaffCreationScreen({ navigation }) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [selectedRole, setSelectedRole] = useState("waiter");
  const [customStaffId, setCustomStaffId] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [staffList, setStaffList] = useState([]);

  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertType, setAlertType] = useState("success");
  const [confirmCallback, setConfirmCallback] = useState(null);

  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [createdStaffInfo, setCreatedStaffInfo] = useState({
    id: "",
    password: "",
    role: "waiter",
    name: "",
  });

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [editName, setEditName] = useState("");
  const [editMobile, setEditMobile] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("waiter");

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
      const querySnapshot = await getDocs(
        collection(db, "users", masterUid, "staffs")
      );
      const list = [];
      querySnapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setStaffList(list);
    } catch (error) {
      console.log("Error fetching staffs:", error);
    }
  };

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

  // Auto-generate password helper
  const generatePassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    let pwd = "";
    for (let i = 0; i < 6; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd + Math.floor(10 + Math.random() * 89);
  };

  // Auto-generate staff ID helper
  const handleAutoGenerateId = async (role = selectedRole) => {
    const masterUid = auth?.currentUser?.uid;
    const currentYear = new Date().getFullYear();
    let prefix = "EMP";
    if (role === "waiter") prefix = "WTR";
    else if (role === "kitchen") prefix = "KIT";
    else if (role === "delivery") prefix = "DEL";

    try {
      let nextNum = 1;
      if (masterUid) {
        const staffsQuery = await getDocs(
          collection(db, "users", masterUid, "staffs")
        );
        nextNum = staffsQuery.size + 1;
      }
      const paddedNum = String(nextNum).padStart(3, "0");
      setCustomStaffId(`${currentYear}${prefix}${paddedNum}`);
    } catch (e) {
      const random3 = Math.floor(100 + Math.random() * 900);
      setCustomStaffId(`${currentYear}${prefix}${random3}`);
    }
  };

  // Pre-generate password when user taps Generate
  const handleGeneratePassword = () => {
    setPassword(generatePassword());
  };

  // If locked for staff
  if (
    userRole === "employee" ||
    userRole === "waiter" ||
    userRole === "kitchen"
  ) {
    return (
      <SafeAreaView
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <Icon name="lock-alert" size={60} color="#dc2626" />
        <Text
          style={{
            fontSize: 20,
            fontWeight: "bold",
            color: "#1e3a8a",
            marginTop: 15,
          }}
        >
          Restricted Access
        </Text>
        <Text
          style={{
            color: "#64748b",
            textAlign: "center",
            paddingHorizontal: 40,
            marginTop: 5,
          }}
        >
          Staff accounts cannot access or create logins. Only the Restaurant Owner
          (Master) can manage staff accounts.
        </Text>
        <TouchableOpacity
          style={[styles.button, { marginTop: 20, paddingHorizontal: 30 }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.btnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const handleCreateStaff = async () => {
    if (!name.trim() || !mobile.trim()) {
      showAlert(
        "Validation Error",
        "Please provide staff name and mobile number.",
        "error"
      );
      return;
    }

    setLoading(true);
    try {
      const masterUid = auth?.currentUser?.uid;
      if (!masterUid) {
        showAlert("Error", "Master user not authenticated.", "error");
        setLoading(false);
        return;
      }

      // Determine final Staff ID
      let finalStaffId = customStaffId.trim();
      if (!finalStaffId) {
        const currentYear = new Date().getFullYear();
        let prefix = "EMP";
        if (selectedRole === "waiter") prefix = "WTR";
        else if (selectedRole === "kitchen") prefix = "KIT";
        else if (selectedRole === "delivery") prefix = "DEL";

        const staffsQuery = await getDocs(
          collection(db, "users", masterUid, "staffs")
        );
        const nextNum = staffsQuery.size + 1;
        const paddedNum = String(nextNum).padStart(3, "0");
        finalStaffId = `${currentYear}${prefix}${paddedNum}`;
      }

      // Determine final Password
      let finalPassword = password.trim();
      if (!finalPassword) {
        finalPassword = generatePassword();
      }

      const staffData = {
        staffId: finalStaffId,
        name: name.trim(),
        mobile: mobile.trim(),
        address: address.trim(),
        password: finalPassword,
        role: selectedRole, // "waiter" | "kitchen" | "employee"
        masterUid,
        createdAt: new Date(),
      };

      await setDoc(
        doc(db, "users", masterUid, "staffs", finalStaffId),
        staffData
      );
      await setDoc(doc(db, "staffs", finalStaffId), staffData);

      setCreatedStaffInfo({
        id: finalStaffId,
        password: finalPassword,
        role: selectedRole,
        name: name.trim(),
      });
      setSuccessModalVisible(true);

      setName("");
      setMobile("");
      setAddress("");
      setCustomStaffId("");
      setPassword("");
      fetchStaffsAndShop();
    } catch (error) {
      showAlert("Error", error.message, "error");
    }
    setLoading(false);
  };

  const handleDeleteStaff = (staffId) => {
    showAlert(
      "Confirm Deletion",
      `Are you sure you want to delete staff account ${staffId}?`,
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
    setEditRole(staff.role || "employee");
    setEditModalVisible(true);
  };

  const handleUpdateStaff = async () => {
    if (!editName.trim() || !editMobile.trim() || !editPassword.trim()) {
      showAlert(
        "Validation Error",
        "Please fill in all fields before updating.",
        "error"
      );
      return;
    }

    try {
      const masterUid = auth?.currentUser?.uid;
      const staffId = selectedStaff.staffId;

      const updatedData = {
        name: editName.trim(),
        mobile: editMobile.trim(),
        address: editAddress.trim(),
        password: editPassword.trim(),
        role: editRole,
      };

      await updateDoc(
        doc(db, "users", masterUid, "staffs", staffId),
        updatedData
      );
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

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-left" size={24} color="#1e3a8a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Staff & Role Management</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Create Staff Account</Text>
        <Text style={styles.subtitle}>
          Create Waiter, Kitchen, or Staff accounts with custom ID & Password
        </Text>

        {/* ROLE SELECTION */}
        <Text style={styles.fieldLabel}>Select Staff Role:</Text>
        <View style={styles.rolePickerContainer}>
          {ROLE_OPTIONS.map((opt) => {
            const isSelected = selectedRole === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.roleCard,
                  isSelected && {
                    borderColor: opt.color,
                    backgroundColor: opt.bgColor,
                  },
                ]}
                onPress={() => {
                  setSelectedRole(opt.id);
                  handleAutoGenerateId(opt.id);
                }}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.roleIconWrap,
                    {
                      backgroundColor: isSelected ? opt.color : "#e2e8f0",
                    },
                  ]}
                >
                  <Icon
                    name={opt.icon}
                    size={20}
                    color={isSelected ? "#ffffff" : "#64748b"}
                  />
                </View>
                <Text
                  style={[
                    styles.roleCardLabel,
                    isSelected && { color: opt.color, fontWeight: "800" },
                  ]}
                >
                  {opt.label}
                </Text>
                <Text style={styles.roleCardDesc} numberOfLines={2}>
                  {opt.desc}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* INPUT FIELDS */}
        <Text style={styles.fieldLabel}>Staff Personal Details:</Text>
        <TextInput
          placeholder="Staff Full Name (e.g. Ramesh Kumar)"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={name}
          onChangeText={setName}
        />

        <TextInput
          placeholder="Mobile Number (e.g. 9876543210)"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          keyboardType="phone-pad"
          value={mobile}
          onChangeText={setMobile}
        />

        <TextInput
          placeholder="Address / Station (Optional)"
          placeholderTextColor="#94a3b8"
          style={[styles.input, { height: 60, textAlignVertical: "top" }]}
          multiline
          value={address}
          onChangeText={setAddress}
        />

        {/* LOGIN ID & PASSWORD (OWNER CUSTOM OR AUTO) */}
        <Text style={styles.fieldLabel}>Staff Login Credentials:</Text>

        {/* Staff ID with Auto Button */}
        <View style={styles.inputWithAction}>
          <TextInput
            placeholder="Staff Login ID (or leave blank for auto)"
            placeholderTextColor="#94a3b8"
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            value={customStaffId}
            onChangeText={setCustomStaffId}
            autoCapitalize="characters"
          />
          <TouchableOpacity
            style={styles.actionAddonBtn}
            onPress={() => handleAutoGenerateId(selectedRole)}
          >
            <Icon name="refresh" size={16} color="#4f46e5" />
            <Text style={styles.actionAddonText}>Auto ID</Text>
          </TouchableOpacity>
        </View>

        {/* Password with Auto Button */}
        <View style={[styles.inputWithAction, { marginTop: 12 }]}>
          <TextInput
            placeholder="Staff Password (or tap Auto Generate)"
            placeholderTextColor="#94a3b8"
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity
            style={styles.actionAddonBtn}
            onPress={handleGeneratePassword}
          >
            <Icon name="dice-multiple" size={16} color="#4f46e5" />
            <Text style={styles.actionAddonText}>Generate</Text>
          </TouchableOpacity>
        </View>

        {/* CREATE BUTTON */}
        <TouchableOpacity
          style={styles.button}
          onPress={handleCreateStaff}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Icon
                name="account-plus"
                size={20}
                color="#ffffff"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.btnText}>Create Staff Account</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* CREATED STAFF LIST */}
        <Text style={styles.tableHeaderTitle}>
          Registered Staff Accounts ({staffList.length})
        </Text>

        <View style={styles.tableContainer}>
          <View style={[styles.tableRow, styles.tableHead]}>
            <Text style={[styles.tableCell, styles.headText, { flex: 1.1 }]}>
              ID
            </Text>
            <Text style={[styles.tableCell, styles.headText, { flex: 0.9 }]}>
              Name
            </Text>
            <Text style={[styles.tableCell, styles.headText, { flex: 1 }]}>
              Role
            </Text>
            <Text style={[styles.tableCell, styles.headText, { flex: 0.9 }]}>
              Password
            </Text>
            <Text
              style={[
                styles.tableCell,
                styles.headText,
                { flex: 0.7, textAlign: "center" },
              ]}
            >
              Action
            </Text>
          </View>

          {staffList.length === 0 ? (
            <Text style={styles.noDataText}>
              No staff accounts created for this shop yet.
            </Text>
          ) : (
            staffList.map((item, index) => {
              const roleMeta =
                ROLE_OPTIONS.find((r) => r.id === item.role) ||
                ROLE_OPTIONS[2];

              return (
                <View
                  key={item.staffId || index}
                  style={[
                    styles.tableRow,
                    index % 2 === 0 ? styles.evenRow : styles.oddRow,
                  ]}
                >
                  <Text
                    style={[
                      styles.tableCell,
                      {
                        flex: 1.1,
                        fontWeight: "700",
                        color: "#3b82f6",
                        fontSize: 11,
                      },
                    ]}
                  >
                    {item.staffId}
                  </Text>
                  <Text
                    style={[styles.tableCell, { flex: 0.9, fontSize: 12 }]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <View
                      style={[
                        styles.roleBadgePill,
                        { backgroundColor: roleMeta.bgColor },
                      ]}
                    >
                      <Text
                        style={[
                          styles.roleBadgeText,
                          { color: roleMeta.color },
                        ]}
                      >
                        {roleMeta.badge}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.tableCell,
                      {
                        flex: 0.9,
                        color: "#16a34a",
                        fontWeight: "600",
                        fontSize: 11,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {item.password}
                  </Text>
                  <View
                    style={{
                      flex: 0.7,
                      flexDirection: "row",
                      justifyContent: "space-around",
                    }}
                  >
                    <TouchableOpacity onPress={() => openEditModal(item)}>
                      <Icon name="pencil-outline" size={18} color="#2563eb" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteStaff(item.staffId)}
                    >
                      <Icon name="delete-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Universal Alert Modal */}
      <Modal visible={alertModalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.successModalBox}>
            <View
              style={[
                styles.successIconCircle,
                {
                  backgroundColor:
                    alertType === "error"
                      ? "#fee2e2"
                      : alertType === "confirm"
                      ? "#fef3c7"
                      : "#dcfce7",
                },
              ]}
            >
              <Icon
                name={
                  alertType === "error"
                    ? "alert-circle"
                    : alertType === "confirm"
                    ? "help-circle"
                    : "check-bold"
                }
                size={30}
                color={
                  alertType === "error"
                    ? "#dc2626"
                    : alertType === "confirm"
                    ? "#d97706"
                    : "#16a34a"
                }
              />
            </View>
            <Text style={styles.successTitle}>{alertTitle}</Text>
            <Text style={styles.successSub}>{alertMessage}</Text>

            {alertType === "confirm" ? (
              <View
                style={{
                  flexDirection: "row",
                  width: "100%",
                  justifyContent: "space-between",
                }}
              >
                <TouchableOpacity
                  style={[
                    styles.successBtn,
                    { backgroundColor: "#94a3b8", flex: 0.48 },
                  ]}
                  onPress={() => setAlertModalVisible(false)}
                >
                  <Text style={styles.btnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.successBtn,
                    { backgroundColor: "#dc2626", flex: 0.48 },
                  ]}
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

      {/* SUCCESS CREDENTIAL MODAL */}
      <Modal visible={successModalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.successModalBox}>
            <View style={styles.successIconCircle}>
              <Icon name="check-bold" size={32} color="#16a34a" />
            </View>
            <Text style={styles.successTitle}>Staff Account Created!</Text>
            <Text style={styles.successSub}>
              Share these credentials with your employee for logging in.
            </Text>

            <View style={styles.credentialBox}>
              <View style={styles.credentialRow}>
                <Text style={styles.credentialLabel}>Name:</Text>
                <Text style={styles.credentialValue}>
                  {createdStaffInfo.name}
                </Text>
              </View>
              <View style={styles.credentialRow}>
                <Text style={styles.credentialLabel}>Assigned Role:</Text>
                <Text
                  style={[
                    styles.credentialValue,
                    {
                      color:
                        createdStaffInfo.role === "waiter"
                          ? "#0284c7"
                          : createdStaffInfo.role === "kitchen"
                          ? "#ea580c"
                          : "#4f46e5",
                    },
                  ]}
                >
                  {createdStaffInfo.role === "waiter"
                    ? "🍽️ Waiter / Captain"
                    : createdStaffInfo.role === "kitchen"
                    ? "👨‍🍳 Kitchen Staff"
                    : "💼 General Staff"}
                </Text>
              </View>
              <View style={styles.credentialRow}>
                <Text style={styles.credentialLabel}>Staff Login ID:</Text>
                <Text style={[styles.credentialValue, { color: "#4f46e5" }]}>
                  {createdStaffInfo.id}
                </Text>
              </View>
              <View style={[styles.credentialRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.credentialLabel}>Password:</Text>
                <Text style={[styles.credentialValue, { color: "#16a34a" }]}>
                  {createdStaffInfo.password}
                </Text>
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

      {/* EDIT MODAL */}
      <Modal visible={editModalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Edit Staff Details</Text>
            <Text style={styles.modalSub}>
              Staff ID: {selectedStaff?.staffId}
            </Text>

            {/* ROLE PICKER IN EDIT */}
            <Text style={[styles.fieldLabel, { marginBottom: 6 }]}>Role:</Text>
            <View style={[styles.rolePickerContainer, { marginBottom: 12 }]}>
              {ROLE_OPTIONS.map((opt) => {
                const isSelected = editRole === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.roleCard,
                      { padding: 8 },
                      isSelected && {
                        borderColor: opt.color,
                        backgroundColor: opt.bgColor,
                      },
                    ]}
                    onPress={() => setEditRole(opt.id)}
                  >
                    <Text
                      style={[
                        styles.roleCardLabel,
                        { fontSize: 11 },
                        isSelected && { color: opt.color, fontWeight: "800" },
                      ]}
                    >
                      {opt.badge}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

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

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setEditModalVisible(false)}
            >
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
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0,
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
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1e3a8a",
    marginBottom: 4,
  },
  subtitle: {
    color: "#64748b",
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 18,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 8,
  },
  rolePickerContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  roleCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
  },
  roleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  roleCardLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    textAlign: "center",
  },
  roleCardDesc: {
    fontSize: 10,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 3,
    lineHeight: 12,
  },
  input: {
    backgroundColor: "#fff",
    padding: 14,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    fontSize: 14,
    color: "#1e293b",
  },
  inputWithAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  actionAddonBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ede9fe",
    borderWidth: 1,
    borderColor: "#c7d2fe",
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 4,
  },
  actionAddonText: {
    color: "#4f46e5",
    fontSize: 12,
    fontWeight: "700",
  },
  button: {
    backgroundColor: "#4f46e5",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
    shadowColor: "#4f46e5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  btnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
  tableHeaderTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#1e3a8a",
    marginBottom: 10,
    marginTop: 10,
  },
  tableContainer: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    marginBottom: 30,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    alignItems: "center",
  },
  tableHead: {
    backgroundColor: "#1e293b",
  },
  headText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
  },
  tableCell: {
    fontSize: 12,
    color: "#334155",
  },
  evenRow: {
    backgroundColor: "#ffffff",
  },
  oddRow: {
    backgroundColor: "#f8fafc",
  },
  roleBadgePill: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  noDataText: {
    textAlign: "center",
    padding: 20,
    color: "#94a3b8",
    fontSize: 14,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalBox: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1e3a8a",
    marginBottom: 5,
    textAlign: "center",
  },
  modalSub: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 15,
    textAlign: "center",
  },
  cancelBtn: {
    alignItems: "center",
    padding: 10,
    marginTop: 10,
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
    backgroundColor: "#dcfce7",
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
  credentialBox: {
    width: "100%",
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 15,
    marginBottom: 20,
  },
  credentialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  credentialLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
  credentialValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#6366f1",
  },
  successBtn: {
    width: "100%",
    backgroundColor: "#4f46e5",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
  },
});