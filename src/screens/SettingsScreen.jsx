import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Switch, Image, ScrollView, Alert, SafeAreaView, Modal } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import ImagePicker from "react-native-image-crop-picker"; 
import { auth, db } from "../firebaseConfig";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useTheme } from "../theme/ThemeContext";

export default function SettingsScreen({ navigation }) {
  const { darkMode, toggleTheme, theme } = useTheme();
  const [loading, setLoading] = useState(false);
  
  const [razorpayMobile, setRazorpayMobile] = useState("");
  const [upiId, setUpiId] = useState("");
  const [razorpayKeyId, setRazorpayKeyId] = useState(""); 
  const [razorpaySecret, setRazorpaySecret] = useState(""); 
  const [qrCodeUri, setQrCodeUri] = useState(null);
  const [qrMode, setQrMode] = useState("generated"); // 🌟 "generated" அல்லது "image"
  const [showPickerModal, setShowPickerModal] = useState(false);

  useEffect(() => {
    loadSettingsData();
  }, []);

  const loadSettingsData = async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (user) {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data();
          setRazorpayMobile(data.razorpayMobile || "");
          setUpiId(data.upiId || "");
          setRazorpayKeyId(data.razorpayKeyId || ""); 
          setRazorpaySecret(data.razorpaySecret || ""); 
          setQrMode(data.qrMode || "generated"); // Firestore-ல் இருந்து மோடு லோட் ஆகும்
        }
        const savedQr = await AsyncStorage.getItem(`shop_qr_code_${user.uid}`);
        if (savedQr) setQrCodeUri(savedQr);
      }
    } catch (error) {
      console.log("Error loading settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      setLoading(true);

      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        razorpayMobile: razorpayMobile.trim(),
        upiId: upiId.trim(),
        razorpayKeyId: razorpayKeyId.trim(), 
        razorpaySecret: razorpaySecret.trim(),
        qrMode: qrMode, // 🌟 மோடு ஃபயர்ஸ்டோரில் சேவ் ஆகும்
      });

      if (qrCodeUri) {
        await AsyncStorage.setItem(`shop_qr_code_${user.uid}`, qrCodeUri);
      } else {
        await AsyncStorage.removeItem(`shop_qr_code_${user.uid}`);
      }

      Alert.alert("Success ✅", "Settings saved successfully!");
      navigation.goBack();
    } catch (error) {
      Alert.alert("Error ❌", "Failed to save data: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChooseFromGallery = () => {
    setShowPickerModal(false);
    ImagePicker.openPicker({ width: 400, height: 400, cropping: true }).then(image => setQrCodeUri(image.path)).catch(err => console.log(err));
  };
  const handleTakePhoto = () => {
    setShowPickerModal(false);
    ImagePicker.openCamera({ width: 400, height: 400, cropping: true }).then(image => setQrCodeUri(image.path)).catch(err => console.log(err));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={26} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Application Settings</Text>
        </View>

        {/* DARK MODE */}
        <View style={[styles.settingBox, { backgroundColor: theme.card }]}>
          <View style={styles.inlineRow}>
            <View style={styles.iconDescRow}>
              <Icon name={darkMode ? "weather-sunny" : "weather-night"} size={24} color="#6366f1" />
              <Text style={[styles.settingLabel, { color: theme.text }]}>Dark Interface Mode</Text>
            </View>
            <Switch value={darkMode} onValueChange={toggleTheme} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Payment Configurations</Text>

        {/* RAZORPAY MOBILE */}
        <View style={[styles.inputContainer, { backgroundColor: theme.card }]}>
          <Text style={[styles.inputLabel, { color: theme.text }]}>Razorpay Linked Mobile Number</Text>
          <View style={styles.fieldWrapper}>
            <Icon name="phone-outline" size={20} color="#64748b" style={styles.fieldIcon} />
            <TextInput placeholder="Enter active registered number" placeholderTextColor="#94a3b8" keyboardType="phone-pad" value={razorpayMobile} onChangeText={setRazorpayMobile} style={[styles.textInput, { color: theme.text }]} />
          </View>
        </View>

        {/* UPI ID */}
        <View style={[styles.inputContainer, { backgroundColor: theme.card }]}>
          <Text style={[styles.inputLabel, { color: theme.text }]}>Shop Merchant UPI ID</Text>
          <View style={styles.fieldWrapper}>
            <Icon name="bank-outline" size={20} color="#64748b" style={styles.fieldIcon} />
            <TextInput placeholder="example@okaxis" placeholderTextColor="#94a3b8" autoCapitalize="none" value={upiId} onChangeText={setUpiId} style={[styles.textInput, { color: theme.text }]} />
          </View>
        </View>

        {/* RAZORPAY KEY ID */}
        <View style={[styles.inputContainer, { backgroundColor: theme.card }]}>
          <Text style={[styles.inputLabel, { color: theme.text }]}>Razorpay API Key ID</Text>
          <View style={styles.fieldWrapper}>
            <Icon name="key-outline" size={20} color="#64748b" style={styles.fieldIcon} />
            <TextInput placeholder="rzp_test_..." placeholderTextColor="#94a3b8" autoCapitalize="none" value={razorpayKeyId} onChangeText={setRazorpayKeyId} style={[styles.textInput, { color: theme.text }]} />
          </View>
        </View>

        {/* RAZORPAY SECRET KEY */}
        <View style={[styles.inputContainer, { backgroundColor: theme.card }]}>
          <Text style={[styles.inputLabel, { color: theme.text }]}>Razorpay Secret Key</Text>
          <View style={styles.fieldWrapper}>
            <Icon name="lock-outline" size={20} color="#64748b" style={styles.fieldIcon} />
            <TextInput placeholder="Enter Razorpay Secret Key" placeholderTextColor="#94a3b8" secureTextEntry autoCapitalize="none" value={razorpaySecret} onChangeText={setRazorpaySecret} style={[styles.textInput, { color: theme.text }]} />
          </View>
        </View>

        {/* 🌟 NEW: QR DISPLAY MODE SELECTOR */}
        <View style={[styles.inputContainer, { backgroundColor: theme.card }]}>
          <Text style={[styles.inputLabel, { color: theme.text }]}>Select Sales QR Mode</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 5 }}>
            <TouchableOpacity 
              onPress={() => setQrMode("generated")}
              style={[styles.radioOption, qrMode === "generated" && styles.radioActive]}
            >
              <Icon name={qrMode === "generated" ? "radiobox-marked" : "radiobox-blank"} size={20} color={qrMode === "generated" ? "#16a34a" : "#64748b"} />
              <Text style={[styles.radioText, { color: theme.text }]}>Auto Generated QR</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => setQrMode("image")}
              style={[styles.radioOption, qrMode === "image" && styles.radioActive]}
            >
              <Icon name={qrMode === "image" ? "radiobox-marked" : "radiobox-blank"} size={20} color={qrMode === "image" ? "#16a34a" : "#64748b"} />
              <Text style={[styles.radioText, { color: theme.text }]}>Custom QR Image</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* QR CODE UPLOADER */}
        <View style={[styles.inputContainer, { backgroundColor: theme.card }]}>
          <Text style={[styles.inputLabel, { color: theme.text }]}>Custom Static Payments QR Code</Text>
          {qrCodeUri ? (
            <View style={styles.qrPreviewWrapper}>
              <Image source={{ uri: qrCodeUri }} style={styles.qrImagePreview} />
              <TouchableOpacity style={styles.removeQrBtn} onPress={() => setQrCodeUri(null)}><Icon name="close-circle" size={24} color="#ef4444" /></TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.qrUploadPlaceholder} onPress={() => setShowPickerModal(true)}>
              <Icon name="qrcode-scan" size={40} color="#94a3b8" />
              <Text style={styles.uploadTextText}>Select QR Code Option</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.saveActionBtn} onPress={handleSaveSettings}>
          <Text style={styles.saveActionText}>Save Config changes</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* PICKER MODAL */}
      <Modal visible={showPickerModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Choose QR Code Source</Text>
            <TouchableOpacity style={styles.modalOption} onPress={handleChooseFromGallery}>
              <Icon name="image-multiple-outline" size={24} color="#6366f1" /><Text style={[styles.modalOptionText, { color: theme.text }]}>Upload from Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={handleTakePhoto}>
              <Icon name="camera-outline" size={24} color="#10b981" /><Text style={[styles.modalOptionText, { color: theme.text }]}>Take Photo (Camera)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowPickerModal(false)}><Text style={{ color: "#ef4444", fontWeight: "700" }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 25, marginTop: 10 },
  headerTitle: { fontSize: 22, fontWeight: "800", marginLeft: 15 },
  settingBox: { borderRadius: 16, padding: 16, marginBottom: 20, elevation: 2 },
  inlineRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  iconDescRow: { flexDirection: "row", alignItems: "center" },
  settingLabel: { fontSize: 16, fontWeight: "600", marginLeft: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, marginTop: 5 },
  inputContainer: { borderRadius: 16, padding: 16, marginBottom: 15, elevation: 2 },
  inputLabel: { fontSize: 14, fontWeight: "700", marginBottom: 8 },
  fieldWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.02)", borderRadius: 12, borderWidth: 1, borderColor: "#cbd5e1", paddingHorizontal: 12 },
  fieldIcon: { marginRight: 8 },
  textInput: { flex: 1, height: 46, fontSize: 15, fontWeight: "500" },
  qrUploadPlaceholder: { borderStyle: "dashed", borderWidth: 2, borderColor: "#94a3b8", borderRadius: 12, padding: 25, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.01)" },
  uploadTextText: { fontSize: 14, color: "#64748b", fontWeight: "600", marginTop: 8 },
  qrPreviewWrapper: { alignSelf: "center", position: "relative" },
  qrImagePreview: { width: 160, height: 160, borderRadius: 12, borderWidth: 1, borderColor: "#cbd5e1" },
  removeQrBtn: { position: "absolute", top: -8, right: -8, backgroundColor: "#fff", borderRadius: 12 },
  saveActionBtn: { backgroundColor: "#6366f1", borderRadius: 16, paddingVertical: 15, alignItems: "center", marginTop: 25, elevation: 4 },
  saveActionText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalContent: { width: "80%", borderRadius: 24, padding: 20, elevation: 10 },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 20, textAlign: "center" },
  modalOption: { flexDirection: "row", alignItems: "center", paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  modalOptionText: { marginLeft: 12, fontSize: 16, fontWeight: "600" },
  modalCloseBtn: { marginTop: 15, paddingVertical: 10, alignItems: "center" },
  // Radio Styles
  radioOption: { flex: 0.48, flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 12, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12 },
  radioActive: { borderColor: "#16a34a", backgroundColor: "#f0fdf4" },
  radioText: { marginLeft: 6, fontSize: 13, fontWeight: "700" }
});