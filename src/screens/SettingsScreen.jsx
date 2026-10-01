import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Switch, Image, ScrollView, Alert, Modal, Linking, StatusBar, FlatList, ActivityIndicator, Platform, PermissionsAndroid, InteractionManager } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import ImagePicker from "react-native-image-crop-picker"; 
import { launchImageLibrary } from "react-native-image-picker";
import { auth, db } from "../utils/firebaseConfig";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useTheme } from "../theme/ThemeContext";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import RNBluetoothEscposPrinter from "react-native-thermal-receipt-printer";

export default function SettingsScreen({ navigation }) {
  const { darkMode, toggleTheme, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);

  // Active Sub-View State ("main" | "shopInfo" | "taxPricing" | "receipt" | "printer" | "payment" | "appSettings")
  const [currentView, setCurrentView] = useState("main");
  const [currentMode, setCurrentMode] = useState("local");

  // Shop Info States
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [shopLogo, setShopLogo] = useState(null);
  const [shopName, setShopName] = useState("");
  const [address, setAddress] = useState("");
  const [customShopUid, setCustomShopUid] = useState("");
  const [isUidActive, setIsUidActive] = useState(true);

  // Payment States
  const [razorpayMobile, setRazorpayMobile] = useState("");
  const [upiMobile, setUpiMobile] = useState(""); 
  const [upiId, setUpiId] = useState("");
  const [razorpayKeyId, setRazorpayKeyId] = useState(""); 
  const [razorpaySecret, setRazorpaySecret] = useState(""); 
  const [qrCodeUri, setQrCodeUri] = useState(null);
  const [qrMode, setQrMode] = useState("generated");
  const [showPickerModal, setShowPickerModal] = useState(false);

  // GST / Tax States
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstBusinessName, setGstBusinessName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [gstPercentage, setGstPercentage] = useState("18");

  // Receipt Settings States
  const [receiptPaperSize, setReceiptPaperSize] = useState("58mm");
  const [receiptStoreLogo, setReceiptStoreLogo] = useState(false);
  const [receiptLogoUri, setReceiptLogoUri] = useState(null);
  const [receiptShopName, setReceiptShopName] = useState(true);
  const [receiptShopAddress, setReceiptShopAddress] = useState(true);
  const [receiptPhone, setReceiptPhone] = useState(true);
  const [receiptShowQr, setReceiptShowQr] = useState(true);
  const [receiptHeader, setReceiptHeader] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("Thank you!");

  // Printer Settings States (As per reference images)
  const [printerPaperSize, setPrinterPaperSize] = useState("58mm");
  const [printerAutoReconnect, setPrinterAutoReconnect] = useState(true);
  const [characterEncoding, setCharacterEncoding] = useState("Automatic");
  const [paperFeedAmount, setPaperFeedAmount] = useState("2");
  const [enableReceiptPrinting, setEnableReceiptPrinting] = useState(true);
  const [showPrintActionAfterCheckout, setShowPrintActionAfterCheckout] = useState(true);
  const [printAutomatically, setPrintAutomatically] = useState(false);
  const [qrCodeOnReceipt, setQrCodeOnReceipt] = useState(true);
  const [barcodeOnReceipt, setBarcodeOnReceipt] = useState(false);
  const [multipleReceiptCopies, setMultipleReceiptCopies] = useState("1");
  const [printerCompatibility, setPrinterCompatibility] = useState("Standard • Automatic");
  const [printingMode, setPrintingMode] = useState("Automatic");
  const [showPrinterDiscovery, setShowPrinterDiscovery] = useState(false);

  // Bluetooth Printer Discovery States
  const [availablePrinters, setAvailablePrinters] = useState([]);
  const [connectedPrinter, setConnectedPrinter] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [connectingAddress, setConnectingAddress] = useState(null);
  const [printerSearchText, setPrinterSearchText] = useState("");

  // Modals States
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);

  // Payment Toggles & Defaults
  const [razorpayEnabled, setRazorpayEnabled] = useState(true);
  const [upiEnabled, setUpiEnabled] = useState(true);
  const [cashEnabled, setCashEnabled] = useState(true);
  const [cashDisplayName, setCashDisplayName] = useState("");
  const [defaultPayment, setDefaultPayment] = useState("cash");

  useEffect(() => {
    loadSettingsData();
    const task = InteractionManager.runAfterInteractions(() => {
      initBluetoothPrinter();
    });
    return () => task.cancel();
  }, []);

  const requestBluetoothPermissions = async () => {
    if (Platform.OS === "android") {
      try {
        if (Platform.Version >= 31) {
          const res = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]);

          const scanGranted = res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
          const connectGranted = res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;

          if (scanGranted && connectGranted) {
            return true;
          }

          // Check if user clicked "Never ask again" / permanently denied
          const scanDenied = res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
          const connectDenied = res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;

          if (scanDenied || connectDenied) {
            Alert.alert(
              "Permission Required",
              "Nearby devices / Bluetooth permission deny aagirukku. Settings-la poi 'Nearby Devices' allow pannunga.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Open Settings", onPress: () => Linking.openSettings() }
              ]
            );
          }
          return false;
        } else {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: "Location Permission",
              message: "Bluetooth devices scan panna Location permission thevaipadu.",
              buttonNeutral: "Ask Later",
              buttonNegative: "Cancel",
              buttonPositive: "OK",
            }
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
      } catch (err) {
        console.log("Permission error:", err);
        return false;
      }
    }
    return true;
  };

  const initBluetoothPrinter = async () => {
    try {
      await RNBluetoothEscposPrinter.init();
      const savedPrinter = await AsyncStorage.getItem("connected_printer_device");
      if (savedPrinter) {
        const printerObj = JSON.parse(savedPrinter);
        setConnectedPrinter(printerObj);
        if (printerAutoReconnect) {
          RNBluetoothEscposPrinter.connectPrinter(printerObj.inner_mac_address)
            .then(() => console.log("Printer auto-reconnected successfully"))
            .catch((e) => console.log("Auto-reconnect error:", e));
        }
      }
    } catch (e) {
      console.log("BLE Init error:", e);
    }
  };

  const scanPrinters = async () => {
    const permissionGranted = await requestBluetoothPermissions();
    if (!permissionGranted) {
      return;
    }
    setIsScanning(true);
    setAvailablePrinters([]);
    try {
      await RNBluetoothEscposPrinter.init();
      const devices = await RNBluetoothEscposPrinter.getDeviceList();
      if (Array.isArray(devices)) {
        setAvailablePrinters(devices);
      }
    } catch (error) {
      Alert.alert("Scan Error", error.message || "Nearby bluetooth devices scan panna mudiyala.");
    } finally {
      setIsScanning(false);
    }
  };

  const connectToPrinter = async (printer) => {
    try {
      setConnectingAddress(printer.inner_mac_address);
      await RNBluetoothEscposPrinter.connectPrinter(printer.inner_mac_address);
      setConnectedPrinter(printer);
      await AsyncStorage.setItem("connected_printer_device", JSON.stringify(printer));
      setShowPrinterDiscovery(false);
      Alert.alert("Connected ✅", `${printer.device_name || "Printer"} connect aaiduchu!`);
    } catch (err) {
      Alert.alert("Error ❌", "Printer connect aagala: " + err.message);
    } finally {
      setConnectingAddress(null);
    }
  };

  const disconnectPrinter = async () => {
    try {
      await RNBluetoothEscposPrinter.closeConn();
      await AsyncStorage.removeItem("connected_printer_device");
      setConnectedPrinter(null);
      Alert.alert("Disconnected", "Printer disconnect aaiduchu.");
    } catch (e) {
      console.log("Disconnect error:", e);
    }
  };

  const loadSettingsData = async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (user) {
        const savedMode = await AsyncStorage.getItem("app_mode");
        const activeMode = savedMode === "global" ? "global" : "local";
        setCurrentMode(activeMode);

        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data();
          setOwnerName(data[`${activeMode}_ownerName`] || data.ownerName || "");
          setEmail(data[`${activeMode}_email`] || data.email || "");
          setPhone(data[`${activeMode}_phone`] || data.phone || "");
          setShopName(data[`${activeMode}_shopName`] || data.shopName || "");
          setAddress(data[`${activeMode}_address`] || data.address || "");
          
          const expiry = data.subscriptionExpiry || 0;
          setIsUidActive(data.subscriptionActive !== false && Date.now() < expiry);
          setCustomShopUid(data.customShopUid || "Not Generated / Expired");

          setRazorpayMobile(data.razorpayMobile || "");
          setUpiMobile(data.upiMobile || "");
          setUpiId(data.upiId || "");
          setRazorpayKeyId(data.razorpayKeyId || ""); 
          setRazorpaySecret(data.razorpaySecret || ""); 
          setQrMode(data.qrMode || "generated");
          
          setCashEnabled(data.cashEnabled ?? true);
          setCashDisplayName(data.cashDisplayName || "");
          setDefaultPayment(data.defaultPayment || "cash");

          setRazorpayEnabled(data.razorpayEnabled ?? true);
          setUpiEnabled(data.upiEnabled ?? true);

          setGstEnabled(data.gstEnabled === true); 
          setGstBusinessName(data.gstBusinessName || "");
          setGstNumber(data.gstNumber || "");
          setGstPercentage(data.gstPercentage || "18");

          if (data.receiptConfig) {
            setReceiptStoreLogo(data.receiptConfig.storeLogo ?? false);
            setReceiptHeader(data.receiptConfig.header || "");
            setReceiptFooter(data.receiptConfig.footer || "Thank you!");
          }
          const savedReceiptLogo = await AsyncStorage.getItem(`receipt_logo_${user.uid}`);
          if (savedReceiptLogo) setReceiptLogoUri(savedReceiptLogo);

          if (data.printerConfig) {
            setPrinterPaperSize(data.printerConfig.paperSize || "58mm");
            setPrinterAutoReconnect(data.printerConfig.autoReconnect ?? true);
            setCharacterEncoding(data.printerConfig.encoding || "Automatic");
            setPaperFeedAmount(data.printerConfig.feedAmount || "2");
            setEnableReceiptPrinting(data.printerConfig.enablePrinting ?? true);
            setShowPrintActionAfterCheckout(data.printerConfig.showPrintAction ?? true);
            setPrintAutomatically(data.printerConfig.printAuto ?? false);
            setQrCodeOnReceipt(data.printerConfig.qrOnReceipt ?? true);
            setBarcodeOnReceipt(data.printerConfig.barcodeOnReceipt ?? false);
            setMultipleReceiptCopies(data.printerConfig.copies || "1");
            setPrinterCompatibility(data.printerConfig.compatibility || "Standard • Automatic");
            setPrintingMode(data.printerConfig.printingMode || "Automatic");
          }
        }
        const savedQr = await AsyncStorage.getItem(`shop_qr_code_${user.uid}`);
        if (savedQr) setQrCodeUri(savedQr);

        const savedLogo = await AsyncStorage.getItem(`${activeMode}_shopLogo_${user.uid}`);
        if (savedLogo) setShopLogo(savedLogo);
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
        [`${currentMode}_ownerName`]: ownerName,
        [`${currentMode}_email`]: email,
        [`${currentMode}_phone`]: phone,
        [`${currentMode}_shopName`]: shopName,
        [`${currentMode}_address`]: address,
        razorpayMobile: razorpayMobile.trim(),
        upiMobile: upiMobile.trim(),
        upiId: upiId.trim(),
        razorpayKeyId: razorpayKeyId.trim(), 
        razorpaySecret: razorpaySecret.trim(),
        qrMode: qrMode,
        cashEnabled,
        cashDisplayName: cashDisplayName.trim(),
        defaultPayment,
        razorpayEnabled,
        upiEnabled,
        gstEnabled,
        gstBusinessName: gstBusinessName.trim(),
        gstNumber: gstNumber.trim(),
        gstPercentage: gstPercentage.trim(),

        receiptConfig: {
          paperSize: receiptPaperSize,
          storeLogo: receiptStoreLogo,
          header: receiptHeader.trim(),
          footer: receiptFooter.trim(),
        },

        printerConfig: {
          paperSize: printerPaperSize,
          autoReconnect: printerAutoReconnect,
          encoding: characterEncoding,
          feedAmount: paperFeedAmount,
          enablePrinting: enableReceiptPrinting,
          showPrintAction: showPrintActionAfterCheckout,
          printAuto: printAutomatically,
          qrOnReceipt: qrCodeOnReceipt,
          barcodeOnReceipt: barcodeOnReceipt,
          copies: multipleReceiptCopies,
          compatibility: printerCompatibility,
          printingMode: printingMode,
        }
      });

      if (qrCodeUri) {
        await AsyncStorage.setItem(`shop_qr_code_${user.uid}`, qrCodeUri);
      } else {
        await AsyncStorage.removeItem(`shop_qr_code_${user.uid}`);
      }

      if (receiptLogoUri) {
        await AsyncStorage.setItem(`receipt_logo_${user.uid}`, receiptLogoUri);
      }

      Alert.alert("Success ✅", "Settings saved successfully!");
      setCurrentView("main");
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

  const handleCall = () => Linking.openURL(`tel:9442461428`);
  const handleEmail = () => Linking.openURL(`mailto:upstagetechnologies@gmail.com`);
  const handleWhatsApp = () => Linking.openURL(`whatsapp://send?phone=919442461428`);

  const filteredPrinterList = availablePrinters.filter(item => 
    (item.device_name || "").toLowerCase().includes(printerSearchText.toLowerCase())
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <StatusBar barStyle={darkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} />
      
      {/* FIXED HEADER */}
      <View style={[styles.headerRow, { backgroundColor: theme.background }]}>
        <TouchableOpacity onPress={() => {
          if (currentView !== "main") setCurrentView("main");
          else navigation.goBack();
        }}>
          <Icon name="arrow-left" size={26} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {currentView === "main" && "Shop Setup"}
          {currentView === "shopInfo" && "Shop Information"}
          {currentView === "taxPricing" && "Tax & Pricing"}
          {currentView === "receipt" && "Receipt Settings"}
          {currentView === "printer" && "Printer Settings"}
          {currentView === "payment" && "Payment Methods"}
          {currentView === "appSettings" && "App Settings"}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 50 }}>
        
        {/* MAIN SETTINGS LIST */}
        {currentView === "main" && (
          <View style={[styles.menuContainer, { backgroundColor: theme.card }]}>
            
            {/* Shop Information */}
            <TouchableOpacity style={styles.menuItem} onPress={() => setCurrentView("shopInfo")}>
              <View style={[styles.menuIconContainer, { backgroundColor: "#e0e7ff" }]}>
                <Icon name="store" size={22} color="#6366f1" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Shop Information</Text>
                <Text style={styles.menuSubtitle}>Name, phone and currency</Text>
              </View>
              <Icon name="chevron-right" size={22} color="#94a3b8" />
            </TouchableOpacity>
            <View style={styles.menuDivider} />

            {/* Tax & Pricing */}
            <TouchableOpacity style={styles.menuItem} onPress={() => setCurrentView("taxPricing")}>
              <View style={[styles.menuIconContainer, { backgroundColor: "#e0f2fe" }]}>
                <Icon name="percent" size={22} color="#0284c7" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Tax & Pricing</Text>
                <Text style={styles.menuSubtitle}>{gstEnabled ? "GST Active" : "Tax is off"}</Text>
              </View>
              <Icon name="chevron-right" size={22} color="#94a3b8" />
            </TouchableOpacity>
            <View style={styles.menuDivider} />

            {/* Receipt Settings */}
            <TouchableOpacity style={styles.menuItem} onPress={() => setCurrentView("receipt")}>
              <View style={[styles.menuIconContainer, { backgroundColor: "#fef3c7" }]}>
                <Icon name="receipt" size={22} color="#d97706" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Receipt Settings</Text>
                <Text style={styles.menuSubtitle}>Paper size, footer and receipt QR</Text>
              </View>
              <Icon name="chevron-right" size={22} color="#94a3b8" />
            </TouchableOpacity>
            <View style={styles.menuDivider} />

            {/* Printer Settings */}
            <TouchableOpacity style={styles.menuItem} onPress={() => setCurrentView("printer")}>
              <View style={[styles.menuIconContainer, { backgroundColor: "#f3e8ff" }]}>
                <Icon name="printer" size={22} color="#9333ea" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Printer Settings</Text>
                <Text style={styles.menuSubtitle}>
                  {connectedPrinter ? `Connected: ${connectedPrinter.device_name || "Thermal Printer"}` : "Connect receipt printer"}
                </Text>
              </View>
              <Icon name="chevron-right" size={22} color="#94a3b8" />
            </TouchableOpacity>
            <View style={styles.menuDivider} />

            {/* Payment Methods */}
            <TouchableOpacity style={styles.menuItem} onPress={() => setCurrentView("payment")}>
              <View style={[styles.menuIconContainer, { backgroundColor: "#ecfdf5" }]}>
                <Icon name="wallet-outline" size={22} color="#10b981" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Payment Methods</Text>
                <Text style={styles.menuSubtitle}>Cash, card, transfer and QR Pay</Text>
              </View>
              <Icon name="chevron-right" size={22} color="#94a3b8" />
            </TouchableOpacity>
            <View style={styles.menuDivider} />

            {/* App Settings */}
            <TouchableOpacity style={styles.menuItem} onPress={() => setCurrentView("appSettings")}>
              <View style={[styles.menuIconContainer, { backgroundColor: "#f1f5f9" }]}>
                <Icon name="cog-outline" size={22} color="#475569" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>App Settings</Text>
                <Text style={styles.menuSubtitle}>Theme, language, help & support</Text>
              </View>
              <Icon name="chevron-right" size={22} color="#94a3b8" />
            </TouchableOpacity>

          </View>
        )}

        {/* 1. SHOP INFORMATION SCREEN */}
        {currentView === "shopInfo" && (
          <View>
            <View style={[styles.uidBanner, { backgroundColor: isUidActive ? "#ecfdf5" : "#fef2f2", borderColor: isUidActive ? "#10b981" : "#ef4444" }]}>
              <Icon name={isUidActive ? "shield-check" : "shield-alert"} size={22} color={isUidActive ? "#16a34a" : "#ef4444"} />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={{ fontWeight: "700", color: isUidActive ? "#16a34a" : "#ef4444" }}>
                  Shop UID: {customShopUid} ({isUidActive ? "Active" : "Disabled"})
                </Text>
              </View>
            </View>

            <View style={styles.imageWrap}>
              <TouchableOpacity onPress={() => {
                launchImageLibrary({ mediaType: "photo" }, async (res) => {
                  if (res.assets) {
                    const uri = res.assets[0].uri;
                    setShopLogo(uri);
                    await AsyncStorage.setItem(`${currentMode}_shopLogo_${auth.currentUser.uid}`, uri);
                  }
                });
              }} style={{ alignItems: "center" }}>
                {shopLogo ? (
                  <Image source={{ uri: shopLogo }} style={{ width: 100, height: 100, borderRadius: 20 }} />
                ) : (
                  <View style={{ width: 100, height: 100, borderRadius: 20, backgroundColor: "#e5e7eb", justifyContent: "center", alignItems: "center" }}>
                    <Icon name="store" size={40} color="#6366f1" />
                  </View>
                )}
                <View style={styles.editBtn}>
                  <Icon name="camera" size={16} color="#fff" />
                </View>
              </TouchableOpacity>
              <Text style={[styles.labelText, { color: theme.text }]}>Shop Logo</Text>
            </View>

            <Text style={[styles.inputLabel, { color: theme.text }]}>Owner Name</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]} placeholder="Owner Name" placeholderTextColor="#94a3b8" value={ownerName} onChangeText={setOwnerName} />

            <Text style={[styles.inputLabel, { color: theme.text }]}>Shop Name</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]} placeholder="Shop Name" placeholderTextColor="#94a3b8" value={shopName} onChangeText={setShopName} />

            <Text style={[styles.inputLabel, { color: theme.text }]}>Email Address</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]} placeholder="Email" placeholderTextColor="#94a3b8" value={email} onChangeText={setEmail} />

            <Text style={[styles.inputLabel, { color: theme.text }]}>Phone Number</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]} placeholder="Phone" placeholderTextColor="#94a3b8" value={phone} onChangeText={setPhone} />

            <Text style={[styles.inputLabel, { color: theme.text }]}>Shop Address</Text>
            <View style={{ zIndex: 1000, marginBottom: 20 }}>
              <GooglePlacesAutocomplete
                placeholder="Shop Address"
                fetchDetails={true}
                textInputProps={{ value: address, onChangeText: setAddress, placeholderTextColor: "#94a3b8" }}
                onPress={(data, details = null) => setAddress(details?.formatted_address || data?.description || "")}
                query={{ key: "AIzaSyDh7LkmivSR8am3gPvq0psCR8IH499wj28", language: "en", components: "country:in" }}
                styles={{
                  textInput: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, backgroundColor: theme.card, color: theme.text },
                  listView: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", zIndex: 9999 }
                }}
              />
            </View>

            <TouchableOpacity style={styles.saveActionBtn} onPress={handleSaveSettings}>
              <Text style={styles.saveActionText}>{loading ? "Saving..." : "Save Shop Info"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 2. TAX & PRICING SCREEN */}
        {currentView === "taxPricing" && (
          <View>
            <View style={[styles.subPaymentCard, { backgroundColor: theme.card, borderColor: gstEnabled ? "#10b981" : "rgba(0,0,0,0.08)", borderWidth: gstEnabled ? 2 : 1 }]}>
              <View style={styles.subConfigHeader}>
                <View style={styles.paymentMethodTitleRow}>
                  <View style={[styles.paymentIconBg, { backgroundColor: "#e0f2fe" }]}>
                    <Icon name="file-document-outline" size={20} color="#0284c7" />
                  </View>
                  <Text style={[styles.sectionSubtitle, { color: theme.text, marginBottom: 0, fontSize: 16 }]}>GST Settings</Text>
                </View>
                <Switch value={gstEnabled} onValueChange={setGstEnabled} thumbColor="#ffffff" trackColor={{ false: "#e2e8f0", true: "#10b981" }} />
              </View>

              <View style={[styles.subConfigBody, !gstEnabled && { opacity: 0.4 }]}>
                <Text style={[styles.inputLabel, { color: theme.text }]}>Business Legal Name</Text>
                <TextInput editable={gstEnabled} placeholder="Business Legal Name" placeholderTextColor="#94a3b8" value={gstBusinessName} onChangeText={setGstBusinessName} style={[styles.input, { backgroundColor: theme.background, color: theme.text }]} />

                <Text style={[styles.inputLabel, { color: theme.text }]}>GSTIN (GST Number)</Text>
                <TextInput editable={gstEnabled} placeholder="22AAAAA0000A1Z5" placeholderTextColor="#94a3b8" autoCapitalize="characters" value={gstNumber} onChangeText={setGstNumber} style={[styles.input, { backgroundColor: theme.background, color: theme.text }]} />

                <Text style={[styles.inputLabel, { color: theme.text }]}>Default Tax Percentage (%)</Text>
                <TextInput editable={gstEnabled} placeholder="18" placeholderTextColor="#94a3b8" keyboardType="numeric" value={gstPercentage} onChangeText={setGstPercentage} style={[styles.input, { backgroundColor: theme.background, color: theme.text }]} />
              </View>
            </View>

            <TouchableOpacity style={styles.saveActionBtn} onPress={handleSaveSettings}>
              <Text style={styles.saveActionText}>{loading ? "Saving..." : "Save Tax Settings"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 3. RECEIPT SETTINGS SCREEN */}
        {currentView === "receipt" && (
          <View>
            <View style={[styles.subPaymentCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Paper Width</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 15 }}>
                {["58mm", "80mm"].map(size => (
                  <TouchableOpacity key={size} onPress={() => setReceiptPaperSize(size)} style={[styles.toggleOptionRow, receiptPaperSize === size && styles.toggleOptionActive, { flex: 1, justifyContent: "center" }]}>
                    <Text style={[styles.toggleOptionText, receiptPaperSize === size && { color: "#16a34a" }]}>{size}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.menuDivider} />

              <View style={styles.subConfigHeader}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Store Logo</Text>
                <Switch value={receiptStoreLogo} onValueChange={setReceiptStoreLogo} trackColor={{ false: "#e2e8f0", true: "#10b981" }} />
              </View>

              {receiptStoreLogo && (
                <TouchableOpacity 
                  style={[styles.qrUploadPlaceholder, { backgroundColor: theme.background, marginVertical: 10 }]} 
                  onPress={() => {
                    launchImageLibrary({ mediaType: "photo" }, (res) => {
                      if (res.assets && res.assets[0]) {
                        setReceiptLogoUri(res.assets[0].uri);
                      }
                    });
                  }}
                >
                  {receiptLogoUri ? (
                    <Image source={{ uri: receiptLogoUri }} style={{ width: 60, height: 60, borderRadius: 30 }} />
                  ) : (
                    <Text style={{ color: "#64748b", fontWeight: "600" }}>+ Select Logo for Receipt</Text>
                  )}
                </TouchableOpacity>
              )}

              <View style={styles.subConfigHeader}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Shop Name</Text>
                <Switch value={receiptShopName} onValueChange={setReceiptShopName} trackColor={{ false: "#e2e8f0", true: "#10b981" }} />
              </View>

              <View style={styles.subConfigHeader}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Shop Address</Text>
                <Switch value={receiptShopAddress} onValueChange={setReceiptShopAddress} trackColor={{ false: "#e2e8f0", true: "#10b981" }} />
              </View>
              <View style={styles.subConfigHeader}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Phone Number</Text>
                <Switch value={receiptPhone} onValueChange={setReceiptPhone} trackColor={{ false: "#e2e8f0", true: "#10b981" }} />
              </View>
              <View style={styles.subConfigHeader}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Show Receipt QR</Text>
                <Switch value={receiptShowQr} onValueChange={setReceiptShowQr} trackColor={{ false: "#e2e8f0", true: "#10b981" }} />
              </View>

              <Text style={[styles.inputLabel, { color: theme.text, marginTop: 10 }]}>Custom Receipt Header</Text>
              <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.text }]} placeholder="Custom header text" placeholderTextColor="#94a3b8" value={receiptHeader} onChangeText={setReceiptHeader} />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Receipt Footer</Text>
              <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.text }]} placeholder="Thank you!" placeholderTextColor="#94a3b8" value={receiptFooter} onChangeText={setReceiptFooter} />
            </View>

            <TouchableOpacity style={styles.saveActionBtn} onPress={handleSaveSettings}>
              <Text style={styles.saveActionText}>{loading ? "Saving..." : "Save Receipt Settings"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 4. PRINTER SETTINGS SCREEN */}
        {currentView === "printer" && (
          <View>
            {/* Connected Printer Card */}
            <View style={[styles.subPaymentCard, { backgroundColor: theme.card, alignItems: "center", paddingVertical: 22 }]}>
              <View style={{ width: 45, height: 45, borderRadius: 12, backgroundColor: connectedPrinter ? "#dcfce7" : "rgba(0,0,0,0.04)", justifyContent: "center", alignItems: "center", marginBottom: 10 }}>
                <Icon name={connectedPrinter ? "printer-check" : "printer-off"} size={24} color={connectedPrinter ? "#16a34a" : "#64748b"} />
              </View>
              <Text style={[styles.menuTitle, { color: theme.text }]}>
                {connectedPrinter ? connectedPrinter.device_name || "Thermal Printer" : "Connect a printer"}
              </Text>
              <Text style={[styles.menuSubtitle, { textAlign: "center", marginBottom: 15 }]}>
                {connectedPrinter ? `Address: ${connectedPrinter.inner_mac_address}` : "Print receipts directly from app."}
              </Text>
              {connectedPrinter ? (
                <TouchableOpacity style={[styles.findPrinterBtn, { backgroundColor: "#ef4444" }]} onPress={disconnectPrinter}>
                  <Icon name="link-variant-off" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Disconnect</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.findPrinterBtn} onPress={() => { setShowPrinterDiscovery(true); scanPrinters(); }}>
                  <Icon name="bluetooth" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Find Printers</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Printer Setup Section */}
            <Text style={styles.sectionHeading}>Printer setup</Text>
            <View style={[styles.subPaymentCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>Paper size</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 15 }}>
                {["58mm", "80mm"].map(size => (
                  <TouchableOpacity key={size} onPress={() => setPrinterPaperSize(size)} style={[styles.toggleOptionRow, printerPaperSize === size && styles.toggleOptionActive, { flex: 1, justifyContent: "center" }]}>
                    <Text style={[styles.toggleOptionText, printerPaperSize === size && { color: "#16a34a" }]}>{size}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.subConfigHeader}>
                <View>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>Auto reconnect</Text>
                  <Text style={styles.menuSubtitle}>Reconnect to the last printer automatically</Text>
                </View>
                <Switch value={printerAutoReconnect} onValueChange={setPrinterAutoReconnect} trackColor={{ false: "#e2e8f0", true: "#10b981" }} />
              </View>
              <View style={styles.menuDivider} />

              <TouchableOpacity style={[styles.subConfigHeader, { paddingVertical: 8 }]} onPress={() => Alert.alert("Encoding", "Character encoding set to Automatic.")}>
                <View>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>Character Encoding</Text>
                  <Text style={styles.menuSubtitle}>{characterEncoding}</Text>
                </View>
                <Icon name="chevron-right" size={20} color="#94a3b8" />
              </TouchableOpacity>
              <View style={styles.menuDivider} />

              <View style={[styles.subConfigHeader, { paddingVertical: 8 }]}>
                <View>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>Paper feed amount</Text>
                </View>
                <TouchableOpacity onPress={() => setPaperFeedAmount(paperFeedAmount === "2" ? "3" : "2")} style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ color: "#16a34a", fontWeight: "700", fontSize: 16, marginRight: 4 }}>{paperFeedAmount}</Text>
                  <Icon name="chevron-down" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Receipt Printing Section */}
            <Text style={styles.sectionHeading}>Receipt printing</Text>
            <View style={[styles.subPaymentCard, { backgroundColor: theme.card }]}>
              <View style={styles.subConfigHeader}>
                <View>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>Enable receipt printing</Text>
                  <Text style={styles.menuSubtitle}>Allow receipts to be printed</Text>
                </View>
                <Switch value={enableReceiptPrinting} onValueChange={setEnableReceiptPrinting} trackColor={{ false: "#e2e8f0", true: "#10b981" }} />
              </View>
              <View style={styles.menuDivider} />

              <View style={styles.subConfigHeader}>
                <View>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>Show print action after checkout</Text>
                  <Text style={styles.menuSubtitle}>Keep Print receipt on sales success screen</Text>
                </View>
                <Switch value={showPrintActionAfterCheckout} onValueChange={setShowPrintActionAfterCheckout} trackColor={{ false: "#e2e8f0", true: "#10b981" }} />
              </View>
              <View style={styles.menuDivider} />

              <View style={styles.subConfigHeader}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={[styles.menuTitle, { color: theme.text }]}>Print automatically</Text>
                    <View style={styles.proBadge}><Text style={styles.proBadgeText}>Included in Pro</Text></View>
                  </View>
                  <Text style={styles.menuSubtitle}>Save a tap by printing as soon as checkout completes</Text>
                </View>
                <Switch value={printAutomatically} onValueChange={setPrintAutomatically} trackColor={{ false: "#e2e8f0", true: "#10b981" }} />
              </View>
              <View style={styles.menuDivider} />

              <View style={styles.subConfigHeader}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={[styles.menuTitle, { color: theme.text }]}>QR code on receipt</Text>
                    <View style={styles.proBadge}><Text style={styles.proBadgeText}>Included in Pro</Text></View>
                  </View>
                  <Text style={styles.menuSubtitle}>Add a scannable receipt reference</Text>
                </View>
                <Switch value={qrCodeOnReceipt} onValueChange={setQrCodeOnReceipt} trackColor={{ false: "#e2e8f0", true: "#10b981" }} />
              </View>
              <View style={styles.menuDivider} />

              <View style={styles.subConfigHeader}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={[styles.menuTitle, { color: theme.text }]}>Barcode on receipt</Text>
                    <View style={styles.proBadge}><Text style={styles.proBadgeText}>Included in Pro</Text></View>
                  </View>
                  <Text style={styles.menuSubtitle}>Print invoice number as a barcode</Text>
                </View>
                <Switch value={barcodeOnReceipt} onValueChange={setBarcodeOnReceipt} trackColor={{ false: "#e2e8f0", true: "#10b981" }} />
              </View>
              <View style={styles.menuDivider} />

              <TouchableOpacity style={[styles.subConfigHeader, { paddingVertical: 10 }]} onPress={() => Alert.alert("Copies", "Multiple receipt copies configuration.")}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={[styles.menuTitle, { color: theme.text }]}>Multiple receipt copies</Text>
                    <View style={styles.proBadge}><Text style={styles.proBadgeText}>Included in Pro</Text></View>
                  </View>
                  <Text style={styles.menuSubtitle}>Print more than one copy per print action • {multipleReceiptCopies}</Text>
                </View>
                <Icon name="chevron-right" size={20} color="#94a3b8" />
              </TouchableOpacity>
              <View style={styles.menuDivider} />

              <TouchableOpacity style={[styles.subConfigHeader, { paddingVertical: 10 }]} onPress={() => Alert.alert("Customize", "Customize receipt style options.")}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={[styles.menuTitle, { color: theme.text }]}>Customize receipt</Text>
                    <View style={styles.proBadge}><Text style={styles.proBadgeText}>Included in Pro</Text></View>
                  </View>
                  <Text style={styles.menuSubtitle}>Choose style and add custom receipt text</Text>
                </View>
                <Icon name="chevron-right" size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Label Printing Section */}
            <Text style={styles.sectionHeading}>Label printing</Text>
            <View style={[styles.subPaymentCard, { backgroundColor: theme.card }]}>
              <TouchableOpacity style={[styles.subConfigHeader, { paddingVertical: 8 }]} onPress={() => Alert.alert("Price Labels", "Navigate to Price Labels generator.")}>
                <View>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>Price Labels</Text>
                  <Text style={styles.menuSubtitle}>Create QR labels, barcode labels and price tags</Text>
                </View>
                <Icon name="chevron-right" size={20} color="#94a3b8" />
              </TouchableOpacity>
              <View style={styles.menuDivider} />

              <TouchableOpacity style={[styles.subConfigHeader, { paddingVertical: 8 }]} onPress={() => Alert.alert("Product Labels", "Navigate to Product Labels generator.")}>
                <View>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>Product Labels</Text>
                  <Text style={styles.menuSubtitle}>Create QR labels, barcode labels and price tags</Text>
                </View>
                <Icon name="chevron-right" size={20} color="#94a3b8" />
              </TouchableOpacity>
              <View style={styles.menuDivider} />

              <TouchableOpacity style={[styles.subConfigHeader, { paddingVertical: 8 }]} onPress={() => Alert.alert("Batch Printing", "Navigate to Batch Printing.")}>
                <View>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>Batch Printing</Text>
                  <Text style={styles.menuSubtitle}>Create QR labels, barcode labels and price tags</Text>
                </View>
                <Icon name="chevron-right" size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Advanced Section */}
            <Text style={styles.sectionHeading}>Advanced</Text>
            <View style={[styles.subPaymentCard, { backgroundColor: theme.card }]}>
              <TouchableOpacity style={[styles.subConfigHeader, { paddingVertical: 8 }]} onPress={() => Alert.alert("Compatibility", "Printer compatibility options.")}>
                <View>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>Printer compatibility</Text>
                  <Text style={styles.menuSubtitle}>{printerCompatibility}</Text>
                </View>
                <Icon name="chevron-right" size={20} color="#94a3b8" />
              </TouchableOpacity>
              <View style={styles.menuDivider} />

              <View style={[styles.subConfigHeader, { paddingVertical: 8 }]}>
                <View>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>Character Encoding</Text>
                  <Text style={styles.menuSubtitle}>{characterEncoding}</Text>
                </View>
              </View>
              <View style={styles.menuDivider} />

              <View style={[styles.subConfigHeader, { paddingVertical: 8 }]}>
                <View>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>Printing Mode</Text>
                  <Text style={styles.menuSubtitle}>{printingMode}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.saveActionBtn} onPress={handleSaveSettings}>
              <Text style={styles.saveActionText}>{loading ? "Saving..." : "Save Printer Settings"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 5. PAYMENT METHODS SCREEN */}
        {currentView === "payment" && (
          <View>
            <View style={[styles.paymentMethodCard, { backgroundColor: theme.card, borderColor: cashEnabled && defaultPayment === "cash" ? "#10b981" : "rgba(0,0,0,0.08)" }]}>
              <View style={styles.paymentMethodHeader}>
                <View style={styles.paymentMethodTitleRow}>
                  <View style={styles.paymentIconBg}><Icon name="cash" size={22} color="#10b981" /></View>
                  <Text style={[styles.paymentMethodTitle, { color: theme.text }]}>Cash</Text>
                </View>
                <Switch value={cashEnabled} onValueChange={setCashEnabled} trackColor={{ false: "#e2e8f0", true: "#10b981" }} />
              </View>
              <TextInput style={[styles.displayNameInput, { backgroundColor: theme.background, color: theme.text }]} placeholder="Display name" placeholderTextColor="#94a3b8" value={cashDisplayName} onChangeText={setCashDisplayName} />
              <TouchableOpacity style={styles.setAsDefaultBtn} onPress={() => setDefaultPayment("cash")}>
                <Icon name={defaultPayment === "cash" ? "check-circle" : "check-circle-outline"} size={20} color={defaultPayment === "cash" ? "#10b981" : "#94a3b8"} />
                <Text style={[styles.setAsDefaultText, { color: defaultPayment === "cash" ? "#10b981" : "#94a3b8" }]}>Set as default</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.inputContainer, { backgroundColor: theme.card }]}>
              <Text style={[styles.sectionSubtitle, { color: theme.text, fontSize: 18, marginBottom: 15 }]}>Online Payment Configurations</Text>

              {/* Razorpay Sub-Card */}
              <View style={[styles.subPaymentCard, { backgroundColor: theme.background, borderColor: razorpayEnabled && defaultPayment === "razorpay" ? "#10b981" : "rgba(0,0,0,0.08)", borderWidth: razorpayEnabled && defaultPayment === "razorpay" ? 2 : 1 }]}>
                <View style={styles.subConfigHeader}>
                  <View style={styles.paymentMethodTitleRow}>
                    <View style={[styles.paymentIconBg, { backgroundColor: "#e0e7ff" }]}>
                      <Icon name="credit-card-outline" size={20} color="#6366f1" />
                    </View>
                    <Text style={[styles.sectionSubtitle, { color: theme.text, marginBottom: 0, fontSize: 16 }]}>Razorpay Credentials</Text>
                    {razorpayEnabled && defaultPayment === "razorpay" && <View style={styles.defaultBadge}><Text style={styles.defaultBadgeText}>Default</Text></View>}
                  </View>
                  <Switch value={razorpayEnabled} onValueChange={setRazorpayEnabled} trackColor={{ false: "#e2e8f0", true: "#10b981" }} />
                </View>

                <View style={[styles.subConfigBody, !razorpayEnabled && { opacity: 0.4 }]}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Linked Mobile Number</Text>
                  <View style={[styles.fieldWrapper, { marginBottom: 12, backgroundColor: theme.card }]}>
                    <Icon name="phone-outline" size={20} color="#64748b" style={styles.fieldIcon} />
                    <TextInput editable={razorpayEnabled} placeholder="Enter active registered number" placeholderTextColor="#94a3b8" keyboardType="phone-pad" value={razorpayMobile} onChangeText={setRazorpayMobile} style={[styles.textInput, { color: theme.text }]} />
                  </View>

                  <Text style={[styles.inputLabel, { color: theme.text }]}>API Key ID</Text>
                  <View style={[styles.fieldWrapper, { marginBottom: 12, backgroundColor: theme.card }]}>
                    <Icon name="key-outline" size={20} color="#64748b" style={styles.fieldIcon} />
                    <TextInput editable={razorpayEnabled} placeholder="rzp_test_..." placeholderTextColor="#94a3b8" autoCapitalize="none" value={razorpayKeyId} onChangeText={setRazorpayKeyId} style={[styles.textInput, { color: theme.text }]} />
                  </View>

                  <Text style={[styles.inputLabel, { color: theme.text }]}>Secret Key</Text>
                  <View style={[styles.fieldWrapper, { backgroundColor: theme.card }]}>
                    <Icon name="lock-outline" size={20} color="#64748b" style={styles.fieldIcon} />
                    <TextInput editable={razorpayEnabled} placeholder="Enter Razorpay Secret Key" placeholderTextColor="#94a3b8" secureTextEntry autoCapitalize="none" value={razorpaySecret} onChangeText={setRazorpaySecret} style={[styles.textInput, { color: theme.text }]} />
                  </View>
                </View>

                <TouchableOpacity disabled={!razorpayEnabled} style={styles.setAsDefaultBtn} onPress={() => setDefaultPayment("razorpay")}>
                  <Icon name={defaultPayment === "razorpay" ? "check-circle" : "check-circle-outline"} size={20} color={razorpayEnabled && defaultPayment === "razorpay" ? "#10b981" : "#94a3b8"} />
                  <Text style={[styles.setAsDefaultText, { color: razorpayEnabled && defaultPayment === "razorpay" ? "#10b981" : "#94a3b8" }]}>Set as default</Text>
                </TouchableOpacity>
              </View>

              {/* UPI Sub-Card */}
              <View style={[styles.subPaymentCard, { backgroundColor: theme.background, borderColor: upiEnabled && defaultPayment === "upi" ? "#10b981" : "rgba(0,0,0,0.08)", borderWidth: upiEnabled && defaultPayment === "upi" ? 2 : 1, marginBottom: 0 }]}>
                <View style={styles.subConfigHeader}>
                  <View style={styles.paymentMethodTitleRow}>
                    <View style={[styles.paymentIconBg, { backgroundColor: "#e0e7ff" }]}>
                      <Icon name="qrcode" size={20} color="#6366f1" />
                    </View>
                    <Text style={[styles.sectionSubtitle, { color: theme.text, marginBottom: 0, fontSize: 16 }]}>UPI Details</Text>
                    {upiEnabled && defaultPayment === "upi" && <View style={styles.defaultBadge}><Text style={styles.defaultBadgeText}>Default</Text></View>}
                  </View>
                  <Switch value={upiEnabled} onValueChange={setUpiEnabled} trackColor={{ false: "#e2e8f0", true: "#10b981" }} />
                </View>

                <View style={[styles.subConfigBody, !upiEnabled && { opacity: 0.4 }]}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>Linked Mobile Number</Text>
                  <View style={[styles.fieldWrapper, { marginBottom: 12, backgroundColor: theme.card }]}>
                    <Icon name="phone-outline" size={20} color="#64748b" style={styles.fieldIcon} />
                    <TextInput editable={upiEnabled} placeholder="Enter UPI mobile number" placeholderTextColor="#94a3b8" keyboardType="phone-pad" value={upiMobile} onChangeText={setUpiMobile} style={[styles.textInput, { color: theme.text }]} />
                  </View>

                  <Text style={[styles.inputLabel, { color: theme.text }]}>Shop Merchant UPI ID</Text>
                  <View style={[styles.fieldWrapper, { backgroundColor: theme.card }]}>
                    <Icon name="bank-outline" size={20} color="#64748b" style={styles.fieldIcon} />
                    <TextInput editable={upiEnabled} placeholder="example@okaxis" placeholderTextColor="#94a3b8" autoCapitalize="none" value={upiId} onChangeText={setUpiId} style={[styles.textInput, { color: theme.text }]} />
                  </View>

                  <View style={{ marginVertical: 15, height: 1, backgroundColor: 'rgba(0,0,0,0.08)' }} />

                  <Text style={[styles.inputLabel, { color: theme.text, marginBottom: 10 }]}>Select Sales QR Mode</Text>
                  <View style={{ gap: 10 }}>
                    <View style={[styles.toggleOptionRow, qrMode === "generated" && styles.toggleOptionActive, { backgroundColor: theme.card }]}>
                      <Text style={[styles.toggleOptionText, { color: theme.text }]}>Auto Generated QR</Text>
                      <Switch value={qrMode === "generated"} onValueChange={(val) => { if (val) setQrMode("generated"); }} trackColor={{ false: "#e2e8f0", true: "#10b981" }} />
                    </View>

                    <View style={[styles.toggleOptionRow, qrMode === "image" && styles.toggleOptionActive, { backgroundColor: theme.card }]}>
                      <Text style={[styles.toggleOptionText, { color: theme.text }]}>Custom QR Image</Text>
                      <Switch value={qrMode === "image"} onValueChange={(val) => { if (val) setQrMode("image"); }} trackColor={{ false: "#e2e8f0", true: "#10b981" }} />
                    </View>
                  </View>

                  <View style={{ marginTop: 15 }}>
                    <Text style={[styles.inputLabel, { color: theme.text }]}>Custom Static Payments QR Code</Text>
                    {qrCodeUri ? (
                      <View style={styles.qrPreviewWrapper}>
                        <Image source={{ uri: qrCodeUri }} style={styles.qrImagePreview} />
                        <TouchableOpacity style={styles.removeQrBtn} onPress={() => setQrCodeUri(null)}><Icon name="close-circle" size={24} color="#ef4444" /></TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity style={[styles.qrUploadPlaceholder, { backgroundColor: theme.card }]} onPress={() => setShowPickerModal(true)}>
                        <Icon name="qrcode-scan" size={35} color="#94a3b8" />
                        <Text style={styles.uploadTextText}>Select QR Code Option</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <TouchableOpacity disabled={!upiEnabled} style={styles.setAsDefaultBtn} onPress={() => setDefaultPayment("upi")}>
                  <Icon name={defaultPayment === "upi" ? "check-circle" : "check-circle-outline"} size={20} color={upiEnabled && defaultPayment === "upi" ? "#10b981" : "#94a3b8"} />
                  <Text style={[styles.setAsDefaultText, { color: upiEnabled && defaultPayment === "upi" ? "#10b981" : "#94a3b8" }]}>Set as default</Text>
                </TouchableOpacity>
              </View>

            </View>

            <TouchableOpacity style={styles.saveActionBtn} onPress={handleSaveSettings}>
              <Text style={styles.saveActionText}>{loading ? "Saving..." : "Save Payment Methods"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 6. APP SETTINGS SCREEN */}
        {currentView === "appSettings" && (
          <View style={[styles.menuContainer, { backgroundColor: theme.card }]}>
            <View style={styles.menuItem}>
              <View style={styles.menuIconContainer}><Icon name="palette-outline" size={24} color={theme.text} /></View>
              <View style={styles.menuTextContainer}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Theme</Text>
                <Text style={styles.menuSubtitle}>{darkMode ? "Dark Mode" : "Light Mode"}</Text>
              </View>
              <Switch value={darkMode} onValueChange={toggleTheme} trackColor={{ false: "#e2e8f0", true: "#10b981" }} />
            </View>
            <View style={styles.menuDivider} />

            <View style={styles.menuItem}>
              <View style={styles.menuIconContainer}><Icon name="translate" size={24} color={theme.text} /></View>
              <View style={styles.menuTextContainer}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Language</Text>
                <Text style={styles.menuSubtitle}>System Default</Text>
              </View>
              <Icon name="chevron-right" size={22} color="#94a3b8" />
            </View>
            <View style={styles.menuDivider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => setShowHelpModal(true)}>
              <View style={styles.menuIconContainer}><Icon name="headset" size={24} color={theme.text} /></View>
              <View style={styles.menuTextContainer}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Help & Support</Text>
                <Text style={styles.menuSubtitle}>Get help or send feedback</Text>
              </View>
              <Icon name="chevron-right" size={22} color="#94a3b8" />
            </TouchableOpacity>
            <View style={styles.menuDivider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => setShowAboutModal(true)}>
              <View style={styles.menuIconContainer}><Icon name="information-outline" size={24} color={theme.text} /></View>
              <View style={styles.menuTextContainer}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>About Application</Text>
                <Text style={styles.menuSubtitle}>Version & details</Text>
              </View>
              <Icon name="chevron-right" size={22} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      {/* MODALS */}
      <Modal visible={showPickerModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Choose QR Code Source</Text>
            <TouchableOpacity style={styles.modalOption} onPress={handleChooseFromGallery}>
              <Icon name="image-multiple-outline" size={22} color="#6366f1" /><Text style={[styles.modalOptionText, { color: theme.text }]}>Upload from Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={handleTakePhoto}>
              <Icon name="camera-outline" size={22} color="#10b981" /><Text style={[styles.modalOptionText, { color: theme.text }]}>Take Photo (Camera)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowPickerModal(false)}><Text style={{ color: "#ef4444", fontWeight: "700" }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PRINTER DISCOVERY MODAL */}
      <Modal visible={showPrinterDiscovery} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, maxHeight: "80%" }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
              <Text style={[styles.modalTitle, { color: theme.text, marginBottom: 0 }]}>Printer Discovery</Text>
              <TouchableOpacity onPress={scanPrinters} disabled={isScanning}>
                <Icon name="refresh" size={22} color={isScanning ? "#94a3b8" : "#10b981"} />
              </TouchableOpacity>
            </View>

            <TextInput 
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, marginBottom: 10 }]} 
              placeholder="Search printer..." 
              placeholderTextColor="#94a3b8" 
              value={printerSearchText}
              onChangeText={setPrinterSearchText}
            />

            {isScanning ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator size="large" color="#10b981" />
                <Text style={[styles.menuSubtitle, { marginTop: 10, textAlign: "center" }]}>Searching for nearby bluetooth printers...</Text>
              </View>
            ) : (
              <FlatList
                data={filteredPrinterList}
                keyExtractor={(item) => item.inner_mac_address}
                ListEmptyComponent={
                  <Text style={[styles.menuSubtitle, { marginVertical: 15, textAlign: "center" }]}>
                    No bluetooth printers found. Turn ON bluetooth and scan again.
                  </Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" }}
                    onPress={() => connectToPrinter(item)}
                    disabled={connectingAddress === item.inner_mac_address}
                  >
                    <Icon name="printer" size={22} color="#10b981" style={{ marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.menuTitle, { color: theme.text, fontSize: 15 }]}>
                        {item.device_name || "Unknown Printer"}
                      </Text>
                      <Text style={styles.menuSubtitle}>{item.inner_mac_address}</Text>
                    </View>
                    {connectingAddress === item.inner_mac_address ? (
                      <ActivityIndicator size="small" color="#10b981" />
                    ) : (
                      <Icon name="link-variant" size={20} color="#94a3b8" />
                    )}
                  </TouchableOpacity>
                )}
              />
            )}

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowPrinterDiscovery(false)}>
              <Text style={{ color: "#ef4444", fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showHelpModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Help & Support</Text>
            <TouchableOpacity style={styles.modalOption} onPress={handleCall}>
              <Icon name="phone" size={22} color="#3b82f6" /><Text style={[styles.modalOptionText, { color: theme.text }]}>Call Us: 9442461428</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={handleWhatsApp}>
              <Icon name="whatsapp" size={22} color="#10b981" /><Text style={[styles.modalOptionText, { color: theme.text }]}>Chat on WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowHelpModal(false)}>
              <Text style={{ color: "#64748b", fontWeight: "700" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showAboutModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>About Application</Text>
            <Text style={[styles.aboutText, { color: theme.text }]}>POS Application v1.0.0 - Built for seamless retail & inventory tracking.</Text>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowAboutModal(false)}>
              <Text style={{ color: "#6366f1", fontWeight: "700" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 15, zIndex: 10 },
  headerTitle: { fontSize: 22, fontWeight: "800", marginLeft: 15 },
  menuContainer: { borderRadius: 16, marginBottom: 25, elevation: 2, paddingVertical: 5 },
  menuItem: { flexDirection: "row", alignItems: "center", padding: 15 },
  menuIconContainer: { padding: 8, borderRadius: 10, marginRight: 15 },
  menuTextContainer: { flex: 1 },
  menuTitle: { fontSize: 16, fontWeight: "700" },
  menuSubtitle: { fontSize: 13, color: "#64748b", marginTop: 2 },
  menuDivider: { height: 1, backgroundColor: "rgba(0,0,0,0.05)", marginLeft: 15, marginRight: 15 },
  sectionHeading: { fontSize: 15, fontWeight: "800", marginBottom: 10, marginTop: 15, color: "#6366f1", paddingHorizontal: 4 },
  paymentMethodCard: { borderRadius: 16, padding: 16, marginBottom: 15, borderWidth: 1, elevation: 1 },
  paymentMethodHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  paymentMethodTitleRow: { flexDirection: "row", alignItems: "center" },
  paymentIconBg: { backgroundColor: "#ecfdf5", padding: 6, borderRadius: 8, marginRight: 10 },
  paymentMethodTitle: { fontSize: 17, fontWeight: "700" },
  defaultBadge: { backgroundColor: "#d1fae5", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginLeft: 10 },
  defaultBadgeText: { color: "#047857", fontSize: 12, fontWeight: "700" },
  proBadge: { backgroundColor: "#e2e8f0", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, marginLeft: 8 },
  proBadgeText: { color: "#334155", fontSize: 10, fontWeight: "700" },
  displayNameInput: { height: 44, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)", fontSize: 15, marginTop: 5 },
  setAsDefaultBtn: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 12 },
  setAsDefaultText: { fontSize: 14, fontWeight: "600", marginLeft: 6 },
  sectionSubtitle: { fontSize: 15, fontWeight: "800", marginBottom: 12, color: "#6366f1" },
  subPaymentCard: { borderRadius: 14, padding: 14, marginBottom: 15, borderWidth: 1, overflow: "hidden" },
  subConfigHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingVertical: 4 },
  subConfigBody: { paddingLeft: 2, marginTop: 4 },
  inputContainer: { borderRadius: 16, padding: 16, marginBottom: 15, elevation: 2 },
  inputLabel: { fontSize: 14, fontWeight: "700", marginBottom: 6, marginTop: 8 },
  fieldWrapper: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: "#cbd5e1", paddingHorizontal: 10 },
  fieldIcon: { marginRight: 8 },
  textInput: { flex: 1, height: 44, fontSize: 14, fontWeight: "500" },
  input: { height: 46, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: "#cbd5e1", fontSize: 15, marginBottom: 12 },
  qrUploadPlaceholder: { borderStyle: "dashed", borderWidth: 2, borderColor: "#94a3b8", borderRadius: 12, padding: 20, justifyContent: "center", alignItems: "center" },
  uploadTextText: { fontSize: 14, color: "#64748b", fontWeight: "600", marginTop: 6 },
  qrPreviewWrapper: { alignSelf: "center", position: "relative", marginTop: 10 },
  qrImagePreview: { width: 140, height: 140, borderRadius: 12, borderWidth: 1, borderColor: "#cbd5e1" },
  removeQrBtn: { position: "absolute", top: -8, right: -8, backgroundColor: "#fff", borderRadius: 12 },
  saveActionBtn: { backgroundColor: "#6366f1", borderRadius: 16, paddingVertical: 15, alignItems: "center", marginTop: 15, marginBottom: 40, elevation: 4 },
  saveActionText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalContent: { width: "85%", borderRadius: 24, padding: 20, elevation: 10 },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 20, textAlign: "center" },
  modalOption: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  modalOptionText: { marginLeft: 12, fontSize: 15, fontWeight: "600" },
  modalCloseBtn: { marginTop: 15, paddingVertical: 10, alignItems: "center" },
  toggleOptionRow: { paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, alignItems: "center" },
  toggleOptionActive: { borderColor: "#16a34a", backgroundColor: "#f0fdf4" },
  toggleOptionText: { fontSize: 14, fontWeight: "700" },
  uidBanner: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 20 },
  imageWrap: { alignSelf: "center", marginBottom: 20, alignItems: "center" },
  editBtn: { position: "absolute", bottom: 15, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: "#16a34a", justifyContent: "center", alignItems: "center" },
  labelText: { textAlign: "center", marginTop: 8, fontWeight: "600" },
  findPrinterBtn: { flexDirection: "row", backgroundColor: "#10b981", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, marginTop: 4, alignItems: "center" },
  aboutText: { fontSize: 14, lineHeight: 22, textAlign: "center" }
});