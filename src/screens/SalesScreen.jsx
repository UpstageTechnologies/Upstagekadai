import React, { useEffect, useState, useRef } from "react";     
import RNBluetoothEscposPrinter from "react-native-thermal-receipt-printer";
import RNPrint from "react-native-print";
import { useFocusEffect } from "@react-navigation/native";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, Dimensions, Linking, Modal } from "react-native";
import { Camera, useCameraDevice, useCodeScanner } from "react-native-vision-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WebView } from "react-native-webview"; 
import DropDownPicker from 'react-native-dropdown-picker';

import { auth, db } from "../firebaseConfig";
import { addDoc, serverTimestamp, collection, onSnapshot, doc, updateDoc, getDocs, getDoc, deleteDoc } from "firebase/firestore";
import QRCode from "react-native-qrcode-svg";
import { onAuthStateChanged } from "firebase/auth";

const { width } = Dimensions.get("window");

export default function SalesScreen({ navigation }) {

  const device = useCameraDevice("back");

  const [currentMode, setCurrentMode] = useState("local");
  const [inventory, setInventory] = useState([]);
  const [bill, setBill] = useState([]);
  const [total, setTotal] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [search, setSearch] = useState("");
  const [paymentMode, setPaymentMode] = useState("UPI");
  const [hasPermission, setHasPermission] = useState(false);
  const [isActive, setIsActive] = useState(true);
  
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [currentBillNo, setCurrentBillNo] = useState("");
  const [currentBillDate, setCurrentBillDate] = useState("");

  const [logoUrl, setLogoUrl] = useState("");
  const [gstNumber, setGstNumber] = useState("33ABCDE1234F1Z5");
  const [shopName, setShopName] = useState("MY SHOP");
  const [modalVisible, setModalVisible] = useState(false);
  
  // DYNAMIC CATEGORY STATES
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoryItems, setCategoryItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [newCategoryModal, setNewCategoryModal] = useState(false);
  const [categoryName, setCategoryName] = useState("");

  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualQty, setManualQty] = useState("1");
  const [showDropdown, setShowDropdown] = useState(false);
  const [menuItem, setMenuItem] = useState(null);
  const [lastAddedBarcode, setLastAddedBarcode] = useState(null);
  const [showScanToast, setShowScanToast] = useState(false);

  const scanLockRef = useRef(false);

  // 🌟 DYNAMIC REAL-TIME MODE AND CATEGORY LISTENER
  useFocusEffect(
    React.useCallback(() => {
      setIsActive(true);   
      const user = auth.currentUser;
      if (!user) return;

      let unsubscribeInventory;
      let unsubscribeCategories;

      const setupListeners = async () => {
        const savedMode = (await AsyncStorage.getItem("app_mode")) || "local";
        setCurrentMode(savedMode);

        const inventoryCollection = savedMode === "global" ? "global_inventory" : "inventory";
        const categoriesCollection = savedMode === "global" ? "global_categories" : "categories";

        // Inventory Real-time Listener
        unsubscribeInventory = onSnapshot(
          collection(db, "users", user.uid, inventoryCollection),
          (snap) => {
            setInventory(snap.docs.map((d) => ({
              id: d.id,
              fromDB: true, 
              ...d.data()
            })));
          }
        );

        // Categories Real-time Listener
        unsubscribeCategories = onSnapshot(
          collection(db, "users", user.uid, categoriesCollection),
          (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setCategories(data);
            setCategoryItems(data.map(cat => ({ label: cat.name, value: cat.name, id: cat.id })));
          }
        );
      };

      setupListeners();

      return () => {
        setIsActive(false); 
        if (unsubscribeInventory) unsubscribeInventory();
        if (unsubscribeCategories) unsubscribeCategories();
      };
    }, [])
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user) return;
        const userRef = doc(db, "users", user.uid);
        const savedLogo = await AsyncStorage.getItem(`shopLogo_${user.uid}`);
        if (savedLogo) { setLogoUrl(savedLogo); }

        return onSnapshot(userRef, (snap) => {
          const data = snap.data();
          if (data) {
            setShopName(data.shopName || "MY SHOP");
            setGstNumber(data.gstNumber || "");
          }
        });
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    (async () => {
      const status = await Camera.getCameraPermissionStatus();
      if (status === "granted") { setHasPermission(true); } 
      else {
        const newStatus = await Camera.requestCameraPermission();
        if (newStatus === "granted") { setHasPermission(true); } 
        else {
          setHasPermission(false);
          Alert.alert("Camera Permission Required", "Enable camera in settings", [
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]);
        }
      }
    })();
  }, []);

  const categoriesCollection = currentMode === "global" ? "global_categories" : "categories";
  const inventoryCollection = currentMode === "global" ? "global_inventory" : "inventory";

  // DELETE CATEGORY (LONG PRESS)
  const handleDeleteCategory = (catId, catName) => {
    const user = auth.currentUser;
    Alert.alert(
      "Delete Category 🗑️",
      `Are you sure you want to delete "${catName}"?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            try {
              if (user) {
                await deleteDoc(doc(db, "users", user.uid, categoriesCollection, catId));
                Alert.alert("Success", "Category deleted successfully!");
              }
            } catch (error) {
              console.log("Error deleting category:", error);
            }
          } 
        }
      ]
    );
  };

  const addToBill = async (item) => {
    try {
      const userUid = auth.currentUser?.uid;
      if (userUid) {
        const userDoc = await getDoc(doc(db, "users", userUid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const plan = userData.subscriptionPlan || "Free Trial";

          if (plan === "Basic") {
            const currentTotalItems = bill.reduce((sum, i) => sum + i.qty, 0);
            if (currentTotalItems >= 5) {
              Alert.alert(
                "Scan Limit Reached ⚠️",
                "You cross your scan limit! Unlimited scan for upgrade premium or pro.",
                [
                  { text: "Upgrade Plan", onPress: () => navigation.navigate("Subscription") },
                  { text: "Cancel", style: "cancel" }
                ],
                { cancelable: false }
              );
              return; 
            }
          }
        }
      }
    } catch (err) {
      console.log("Limit Check Error:", err);
    }

    if (item.quantity <= 5) { Alert.alert("Low stock ⚠️"); }
    if (item.quantity <= 0) return Alert.alert("Out of stock");

    setBill(prev => {
      const exist = prev.find(i => i.barcode === item.barcode);
      if (exist) {
        return prev.map(i => i.barcode === item.barcode ? { ...i, qty: i.qty + 1 } : i );
      }
      return [...prev, { 
        ...item,
        qty: 1,
        price: item.salesPrice || item.price || 0,
        salesPrice: item.salesPrice || item.price || 0,   
        purchasePrice: Number(item.purchasePrice ?? 0)
      }];
    });

    if (item.id && item.id.length > 10) { 
      await updateDoc(doc(db, "users", auth.currentUser.uid, inventoryCollection, item.id), { quantity: item.quantity - 1 });
    }
  };

  const decreaseQty = async (item) => {
    const exist = bill.find(i => i.barcode === item.barcode);
    if (!exist) return;

    if (exist.qty === 1) {
      setBill(prev => prev.filter(i => i.barcode !== item.barcode));
    } else {
      setBill(prev => prev.map(i => i.barcode === item.barcode ? { ...i, qty: i.qty - 1 } : i ));
    }

    if (item.id && item.id.length > 10) {
      await updateDoc(doc(db, "users", auth.currentUser.uid, inventoryCollection, item.id), { quantity: item.quantity + 1 });
    }
  };

  const removeItem = async (item) => {
    Alert.alert("Remove Item", `Remove ${item.itemName} from bill?`, [
      { text: "No" },
      {
        text: "Yes",
        onPress: async () => {
          setBill(prev => prev.filter(i => i.barcode !== item.barcode));
          if (item.id && item.id.length > 10) {
            await updateDoc(doc(db, "users", auth.currentUser.uid, inventoryCollection, item.id), { quantity: item.quantity + item.qty });
          }
        }
      }
    ]);
  };

  useEffect(() => {
    const t = bill.reduce((sum, i) => sum + (i.price * i.qty), 0);
    setTotal(t);
  }, [bill]);

  const triggerThermalPrint = async (billNo, billDate) => {
    try {
      const printers = await RNBluetoothEscposPrinter.getDeviceList();
      if (printers && printers.length > 0) {
        const printer = printers[0];
        await RNBluetoothEscposPrinter.connectPrinter(printer.address);
        await RNBluetoothEscposPrinter.printerInit();

        await RNBluetoothEscposPrinter.printText(`${shopName}\n`, { align: "center" });
        await RNBluetoothEscposPrinter.printText(`GST: ${gstNumber}\n`, { align: "center" });
        await RNBluetoothEscposPrinter.printText(`Bill: ${billNo} | Date: ${billDate}\n`, { align: "center" });
        await RNBluetoothEscposPrinter.printText("--------------------------------\n");
        
        for (let item of bill) {
          await RNBluetoothEscposPrinter.printText(`${item.itemName}\n`);
          await RNBluetoothEscposPrinter.printText(`  ${item.qty} x ₹${item.price} = ₹${item.qty * item.price}\n`);
        }

        await RNBluetoothEscposPrinter.printText("--------------------------------\n");
        await RNBluetoothEscposPrinter.printText(`TOTAL: ₹${total}\n`, { align: "right" });
        await RNBluetoothEscposPrinter.printText("--------------------------------\n");
        await RNBluetoothEscposPrinter.printText("Thank you for your business!\n\n\n", { align: "center" });
        return;
      }
      throw "No printer connected";
    } catch (err) {
      const html = `
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
          <style>
            @page { size: 58mm auto; margin: 0mm; }
            body { font-family: monospace; margin: 0; padding: 6mm 4mm; font-size: 12px; color: #000; font-weight: bold; }
            .center { text-align: center; } 
            .divider { border-top: 1px dashed #000; margin: 6px 0; }
            .row { display: flex; justify-content: space-between; }
            table { width: 100%; border-collapse: collapse; }
            td { font-size: 12px; padding: 2px 0; }
            .right { text-align: right; }
          </style>
        </head>
        <body>
          <div class="center" style="font-size:14px; font-weight:bold;">${shopName}</div>
          <div class="center">GST: ${gstNumber}</div>
          <div class="divider"></div>
          <div>Bill No: ${billNo}</div>
          <div>Date: ${billDate}</div>
          <div class="divider"></div>
          <table>
            ${bill.map(i => `
              <tr>
                <td>${i.itemName}<br/>&nbsp;&nbsp;${i.qty} x ₹${Number(i.price).toFixed(2)}</td>
                <td class="right" style="vertical-align:bottom;">₹${(i.qty * i.price).toFixed(2)}</td>
              </tr>
            `).join("")}
          </table>
          <div class="divider"></div>
          <div class="row"><span>Subtotal:</span><span>₹${Number(total).toFixed(2)}</span></div>
          <div class="row" style="font-size:13px; font-weight:bold;"><span>Grand Total:</span><span>₹${Number(total).toFixed(2)}</span></div>
          <div class="divider"></div>
          <div class="center" style="margin-top:12px;">Thank you for your business!</div>
        </body>
        </html>`;
      await RNPrint.print({ html });
    }
  };

  const codeScanner = useCodeScanner({
    codeTypes: ["ean-13", "ean-8", "code-128", "qr"],
    onCodeScanned: async (codes) => {
      const code = codes[0]?.value;
      if (!code) return;
      if (scanLockRef.current) return;
      scanLockRef.current = true;
      setTimeout(() => { scanLockRef.current = false; }, 1500);

      try {
        const userUid = auth.currentUser?.uid;
        if (!userUid) return;

        const userDoc = await getDoc(doc(db, "users", userUid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const plan = userData.subscriptionPlan || "Free Trial";

          if (plan === "Basic") {
            const todayStr = new Date().toDateString();
            const savedDate = await AsyncStorage.getItem(`scan_date_${userUid}`);
            let currentCount = 0;

            if (savedDate === todayStr) {
              const countStr = await AsyncStorage.getItem(`scan_count_${userUid}`);
              currentCount = parseInt(countStr || "0", 10);
            } else {
              await AsyncStorage.setItem(`scan_date_${userUid}`, todayStr);
              await AsyncStorage.setItem(`scan_count_${userUid}`, "0");
            }

            if (currentCount >= 5) {
              Alert.alert(
                "Scan Limit Reached ⚠️",
                "You cross your scan limit! Unlimited scan for upgrade premium or pro.",
                [
                  { text: "Upgrade Plan", onPress: () => navigation.navigate("Subscription") },
                  { text: "Cancel", style: "cancel" }
                ],
                { cancelable: false }
              );
              return; 
            }
            await AsyncStorage.setItem(`scan_count_${userUid}`, String(currentCount + 1));
          }
        }
      } catch (err) {
        console.log("Sales Scan Limit Error:", err);
      }

      const scanned = String(code).replace(/\D/g, "");
      const item = inventory.find((i) => String(i.barcode || "").replace(/\D/g, "") === scanned);

      if (item) {
        await addToBill(item);
        setLastAddedBarcode(item.barcode);
        setTimeout(() => { setLastAddedBarcode(null); }, 2000);
        setShowScanToast(true);
        setTimeout(() => { setShowScanToast(false); }, 1200);
      } else {
        Alert.alert("Product Not Found ❌", "This product is not available in inventory");
      }
    },
  });

  const filteredInventory = inventory.filter(i =>
    (i.itemName || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      {/* CAMERA */}
      <View style={{ height: 420, width: "100%", margin: 0, borderRadius: 20, overflow: "hidden" }}>
        {device && hasPermission && (
          <Camera style={StyleSheet.absoluteFill} device={device} isActive={isActive} codeScanner={codeScanner} />
        )}
        <View style={styles.overlay}>
          <View style={styles.dimTop} />
          <View style={styles.scanRow}>
            <View style={styles.scanDimSide} />
            <View style={styles.salesScanBox}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
              <Text style={styles.scanText}>Scan Here</Text>
              <View style={{ backgroundColor: currentMode === "global" ? "#16a34a" : "#6366f1", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 10 }}>
                <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>{currentMode.toUpperCase()} MODE</Text>
              </View>
            </View>
            <View style={styles.dimSide} />
          </View>
          <View style={styles.dimBottom}>
            <Text style={{ color: "#fff" }}>Align barcode inside box</Text>
          </View>
        </View>
      </View>

      {/* BILL LIST SECTION */}
      {!showReview && (
        <View style={{ position: "absolute", bottom: 20, width: "100%", backgroundColor: "#f1f5f9", borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 12, height: 400 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginHorizontal: 10, marginBottom: 10 }}>
            <TextInput
              placeholder={`Search ${currentMode} inventory product...`}
              placeholderTextColor="#64748b"
              value={search}
              onChangeText={setSearch}
              style={{ flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd5e1", padding: 12, borderRadius: 12 }}
            />
            <TouchableOpacity
              onPress={() => { setManualName(""); setManualPrice(""); setManualQty("1"); setSelectedCategory(""); setModalVisible(true); }}
              style={{ width: 48, height: 48, backgroundColor: "#6366f1", borderRadius: 12, justifyContent: "center", alignItems: "center", marginLeft: 10 }}
            >
              <Text style={{ color: "#fff", fontSize: 28, fontWeight: "bold" }}>+</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>Scanned Items</Text>
          <ScrollView style={{ maxHeight: 200 }}>
            {search.trim().length > 0 ? (
              filteredInventory.map((item) => (
                <View key={item.id} style={styles.itemCard}>
                  <Text style={{ color: "#000", flex: 1, fontWeight: '700' }}>{item.itemName}</Text>
                  <TouchableOpacity onPress={() => addToBill(item)} style={{ backgroundColor: "#22c55e", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                    <Text style={{ color: "#fff", fontWeight: "600" }}>Add</Text>
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              bill.map((i) => (
                <View key={i.barcode} style={styles.itemCard}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.itemName}>{i.itemName}</Text>
                    <Text style={styles.itemSub}>₹{i.price} × {i.qty}</Text>
                  </View>
                  <View style={styles.qtyControls}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => decreaseQty(i)}><Text style={styles.qtyBtnText}>-</Text></TouchableOpacity>
                    <Text style={styles.qtyText}>{i.qty}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => addToBill(i)}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => setMenuItem(menuItem === i.barcode ? null : i.barcode)} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 22, color: "#64748b", fontWeight: "bold" }}>⋮</Text>
                  </TouchableOpacity>
                  <Text style={styles.amountText}>₹{(i.price * i.qty).toFixed(2)}</Text>
                  {menuItem === i.barcode && (
                    <View style={styles.popoverMenu}>
                      <TouchableOpacity onPress={() => { setMenuItem(null); removeItem(i); }} style={{ padding: 12 }}>
                        <Text style={{ color: "#ef4444", fontWeight: "600" }}>🗑 Remove Item</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </ScrollView>

          <Text style={styles.total}>₹ {total}</Text>
          <TouchableOpacity style={styles.payBtn} onPress={() => { if (bill.length === 0) { Alert.alert("No items"); return; } setIsActive(false); setShowReview(true); }}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>Review Order</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* REVIEW / CHECKOUT */}
      {showReview && (
        <View style={{ position: "absolute", bottom: 0, width: "100%", height: "52%", backgroundColor: "#fff", borderTopLeftRadius: 35, borderTopRightRadius: 35, padding: 20, elevation: 10 }}>
          <Text style={styles.title}>Checkout</Text>
          <TextInput placeholder="Shop Name" placeholderTextColor="#64748b" value={shopName} onChangeText={setShopName} style={{ backgroundColor: "#e5e7eb", padding: 10, borderRadius: 10, marginBottom: 8 }} />
          <ScrollView style={{ maxHeight: 120 }}>
            {bill.map((i) => (
              <View key={i.barcode} style={styles.reviewRow}>
                <Text style={{ color: "#000" }}>{i.qty} x {i.itemName}</Text>
                <Text style={{ color: "#000", fontWeight: "bold" }}>₹{i.price * i.qty}</Text>
              </View>
            ))}
          </ScrollView>
          <Text style={styles.total}>₹ {total}</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-around", marginVertical: 10 }}>
            {["CASH", "UPI", "CARD"].map(mode => (
              <TouchableOpacity key={mode} onPress={() => setPaymentMode(mode)} style={{ padding: 10, borderRadius: 10, backgroundColor: paymentMode === mode ? "#16a34a" : "#e5e7eb" }}>
                <Text style={{ color: paymentMode === mode ? "#fff" : "#000" }}>{mode}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {paymentMode === "UPI" && (
            <View style={{ alignItems: "center", marginVertical: 10 }}>
              <QRCode value={`upi://pay?pa=yourupi@bank&am=${total}`} size={104} />
            </View>
          )}   
        // SalesScreen.jsx உள்ள Checkout பட்டன் (Pay & View Receipt) ஆன்-பிரஸ் லாஜிக்கை மட்டும் மாற்றவும்:

<TouchableOpacity
  style={{ backgroundColor: "#16a34a", padding: 14, borderRadius: 12, alignItems: "center", marginTop: 5 }}
  onPress={async () => {
    if (bill.length === 0) return;
    try {
      const user = auth.currentUser;
      if (!user) return;

      const salesSnap = await getDocs(collection(db, "users", user.uid, "sales"));
      const bNo = `BILL-${String(salesSnap.size + 1).padStart(6, "0")}`;
      const bDate = new Date().toLocaleDateString("en-GB");

      const totalProfit = bill.reduce((sum, i) => sum + (Number(i.salesPrice || i.price) - Number(i.purchasePrice || 0)) * i.qty, 0);

      // 🌟 பிக்ஸ்: மோடுக்கு தகுந்தாற்போல 'isGlobalMode' பூலியனை ஸ்ட்ரிக்ட்டாக சேர்க்கிறோம்
      await addDoc(collection(db, "users", user.uid, "sales"), {
        billNo: bNo, 
        invoiceId: bNo, 
        billDate: bDate, 
        items: bill, 
        total, 
        profit: totalProfit, 
        paymentMode, 
        isGlobalMode: currentMode === "global", // இங்கதான் மேஜிக்!
        createdAt: serverTimestamp()
      });

      setCurrentBillNo(bNo);
      setCurrentBillDate(bDate);
      setShowReview(false);
      setShowReceiptModal(true); 
    } catch (err) {
      Alert.alert("Save failed", err.message);
    }
  }}
>
  <Text style={{ color: "#fff", fontWeight: "600" }}>Pay & View Receipt</Text>
</TouchableOpacity>
        </View>
      )}

      {/* RECEIPT MODAL (WEBVIEW) */}
      <Modal visible={showReceiptModal} animationType="slide" transparent={false}>
        <View style={styles.modalReceiptContainer}>
          <Text style={styles.zoomTipText}>💡 Use two fingers to Zoom In/Out (Pinch)</Text>
          <View style={{ flex: 1, backgroundColor: "#fff", marginHorizontal: 15, borderRadius: 12, overflow: 'hidden', elevation: 4 }}>
            <WebView
              originWhitelist={['*']}
              source={{ html: `
                <html>
                <head>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes">
                  <style>
                    body { font-family: monospace; margin: 0; padding: 20px 15px; font-size: 14px; color: #000; font-weight: bold; background-color: #fff; }
                    .center { text-align: center; } 
                    .divider { border-top: 1px dashed #000; margin: 12px 0; }
                    .row { display: flex; justify-content: space-between; }
                    table { width: 100%; border-collapse: collapse; }
                    td { font-size: 14px; padding: 4px 0; }
                    .right { text-align: right; }
                  </style>
                </head>
                <body>
                  <div class="center" style="font-size:18px; font-weight:bold; text-transform: uppercase;">${shopName}</div>
                  <div class="center">GST: ${gstNumber}</div>
                  <div class="divider"></div>
                  <div>Bill No: ${currentBillNo}</div>
                  <div>Date: ${currentBillDate}</div>
                  <div>Payment: ${paymentMode}</div>
                  <div class="divider"></div>
                  <table>
                    ${bill.map(i => `
                      <tr>
                        <td>${i.itemName}<br/>&nbsp;&nbsp;${i.qty} x ₹${Number(i.price).toFixed(2)}</td>
                        <td class="right" style="vertical-align:bottom;">₹${(i.qty * i.price).toFixed(2)}</td>
                      </tr>
                    `).join("")}
                  </table>
                  <div class="divider"></div>
                  <div class="row"><span>Subtotal:</span><span>₹${Number(total).toFixed(2)}</span></div>
                  <div class="row" style="font-size:16px; font-weight:bold; border-top: 1px dashed #000; padding-top: 6px; margin-top: 4px;">
                    <span>Grand Total:</span><span>₹${Number(total).toFixed(2)}</span>
                  </div>
                  <div class="divider"></div>
                  <div class="center" style="margin-top:20px; font-style: italic;">Thank you for your business!</div>
                </body>
                </html>
              ` }}
              scalesPageToFit={true}
            />
          </View>
          <View style={styles.receiptActionRow}>
            <TouchableOpacity style={[styles.recBtn, { backgroundColor: "#ef4444" }]} onPress={() => { setShowReceiptModal(false); setBill([]); setIsActive(true); }}>
              <Text style={styles.recBtnText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.recBtn, { backgroundColor: "#6366f1" }]} onPress={() => triggerThermalPrint(currentBillNo, currentBillDate)}>
              <Text style={styles.recBtnText}>🖨 Print Bill</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 🌟 NEW DYNAMIC MANUAL ADD CATEGORY MODAL */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
          <View style={{ width: "85%", backgroundColor: "#fff", borderRadius: 20, padding: 20, maxHeight: "85%" }}>
            <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
              <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10, color: "#000" }}>Select Category ({currentMode.toUpperCase()})</Text>
              
              {/* DropDownPicker for dynamic categories */}
              <DropDownPicker 
                open={open} 
                value={selectedCategory} 
                items={categoryItems} 
                setOpen={setOpen} 
                setValue={setSelectedCategory} 
                setItems={setCategoryItems} 
                placeholder="Select Category" 
                style={{ marginBottom: 10, borderColor: "#cbd5e1" }} 
                listMode="SCROLLVIEW"
                dropDownContainerStyle={{ borderColor: "#cbd5e1" }}
              />

              <TouchableOpacity onPress={() => setNewCategoryModal(true)} style={{ marginTop: 5, marginBottom: 15 }}>
                <Text style={{ color: "#6366f1", fontWeight: "600" }}>+ Add / Manage Categories</Text>
              </TouchableOpacity>

              <TextInput placeholder="Product Name" placeholderTextColor="#64748b" value={manualName} textAlign="center" onChangeText={(text) => { setManualName(text); setShowDropdown(true); }} style={styles.input} />
              
              {showDropdown && manualName !== "" && (
                <View style={{ maxHeight: 150, backgroundColor: "#ffffff", borderRadius: 12, marginTop: 8, overflow: "hidden", elevation: 4, borderWidth: 1, borderColor: "#e2e8f0" }}>
                  <ScrollView nestedScrollEnabled={true}>
                    {inventory.filter(item => (item.itemName || "").toLowerCase().includes(manualName.toLowerCase())).map(item => (
                      <TouchableOpacity key={item.id} style={{ backgroundColor: "#fff", padding: 12, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" }} onPress={() => { setManualName(item.itemName); setManualPrice(String(item.salesPrice || 0)); setSelectedCategory(item.category || ""); setShowDropdown(false); }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: "#000" }}>{item.itemName}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <TextInput placeholder="Sales Price" placeholderTextColor="#64748b" textAlign="center" keyboardType="numeric" value={manualPrice} onChangeText={setManualPrice} style={styles.input} />
              <TextInput placeholder="Quantity" textAlign="center" placeholderTextColor="#64748b" keyboardType="numeric" value={manualQty} onChangeText={setManualQty} style={styles.input} />
              
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 20 }}>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={{ padding: 10 }}><Text style={{ color: "red", fontWeight: "bold" }}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity 
                  style={{ padding: 10 }}
                  onPress={() => { 
                    setBill(prev => [...prev, { id: "manual-" + Date.now(), barcode: "manual-" + Date.now(), itemName: manualName, price: Number(manualPrice), qty: Number(manualQty), category: selectedCategory }]); 
                    setModalVisible(false); 
                  }}
                >
                  <Text style={{ color: "green", fontWeight: "bold" }}>Add</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* DYNAMIC CATEGORY MANAGE MODAL */}
      <Modal visible={newCategoryModal} transparent animationType="fade">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ width: "85%", backgroundColor: "#fff", borderRadius: 15, padding: 20, maxHeight: "80%" }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10, color: "#000" }}>Manage Categories ({currentMode.toUpperCase()})</Text>
            
            <TextInput placeholder="New Category Name" placeholderTextColor="#94a3b8" value={categoryName} onChangeText={setCategoryName} style={styles.input} />
            
            <TouchableOpacity
              onPress={async () => {
                if (!categoryName.trim() || !auth.currentUser) return;
                await addDoc(collection(db, "users", auth.currentUser.uid, categoriesCollection), { name: categoryName.trim() });
                setCategoryName("");
              }}
              style={{ backgroundColor: "#22c55e", padding: 12, borderRadius: 10, marginTop: 10 }}
            >
              <Text style={{ color: "#fff", textAlign: "center", fontWeight: "bold" }}>+ Add Category</Text>
            </TouchableOpacity>

            <Text style={{ fontSize: 12, color: "#64748b", marginTop: 15, marginBottom: 5, fontStyle: "italic" }}>* Long press to delete a category</Text>
            
            <ScrollView style={{ minHeight: 100, maxHeight: 200, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, padding: 5 }}>
              {categories.map((cat) => (
                <TouchableOpacity 
                  key={cat.id} 
                  onLongPress={() => handleDeleteCategory(cat.id, cat.name)}
                  delayLongPress={600}
                  style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: "#e2e8f0", backgroundColor: "#f8fafc", marginVertical: 2, borderRadius: 5 }}
                >
                  <Text style={{ color: "#334155", fontWeight: "500" }}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 20 }}>
              <TouchableOpacity onPress={() => { setCategoryName(""); setNewCategoryModal(false); }} style={{ padding: 10 }}>
                <Text style={{ color: "#6366f1", fontSize: 16, fontWeight: "bold" }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {showScanToast && (
        <View style={{ position: "absolute", top: 70, alignSelf: "center", backgroundColor: "#16a34a", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 30, zIndex: 9999, elevation: 20 }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>✓ Product Added</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  title: { color: "#0f172a", fontSize: 18, marginBottom: 12, fontWeight: "700" },
  itemCard: { position: "relative", backgroundColor: "#ffffff", borderRadius: 16, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", elevation: 2 },
  itemName: { fontSize: 15, fontWeight: "700", color: "#111827" },
  itemSub: { marginTop: 4, fontSize: 12, color: "#64748b" },
  qtyControls: { flexDirection: "row", alignItems: "center", marginHorizontal: 12 },
  qtyBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#6366f1", justifyContent: "center", alignItems: "center" },
  qtyBtnText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  qtyText: { marginHorizontal: 12, fontSize: 16, fontWeight: "700", minWidth: 20, textAlign: "center", color: "#000" },
  amountText: { width: 90, textAlign: "right", fontSize: 15, fontWeight: "bold", color: "#16a34a" },
  total: { color: "#16a34a", fontSize: 28, textAlign: "center", marginVertical: 14, fontWeight: "bold" },
  payBtn: { backgroundColor: "#6366f1", padding: 16, borderRadius: 16, alignItems: "center" },
  overlay: { ...StyleSheet.absoluteFillObject },
  dimTop: { flex: 1.5, backgroundColor: "rgba(0,0,0,0.65)" },
  dimBottom: { flex: 1.5, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", alignItems: "center" },
  reviewRow: { flexDirection: "row", justifyContent: "space-between", marginVertical: 6 },
  dimSide: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)" },
  corner: { position: "absolute", width: 45, height: 45, borderColor: "#22c55e" },
  topLeft: { top: 0, left: 0, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 12 },
  topRight: { top: 0, right: 0, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 12 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 12 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 12 },
  scanText: { color: "#22c55e", marginTop: 40, fontSize: 20, fontWeight: "700" },
  scanRow: { flexDirection: "row", alignItems: "center" },
  scanDimSide: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)" },
  salesScanBox: { top: 50, width: 290, height: 290, justifyContent: "center", alignItems: "center" },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd5e1", padding: 12, borderRadius: 10, marginTop: 10, color: "#000" },
  popoverMenu: { position: "absolute", right: 10, top: 55, backgroundColor: "#fff", borderRadius: 12, paddingVertical: 8, minWidth: 140, elevation: 8, zIndex: 999 },
  modalReceiptContainer: { flex: 1, backgroundColor: "#1e293b", paddingTop: 20, paddingBottom: 10 },
  zoomTipText: { color: "#38bdf8", textAlign: "center", fontWeight: "700", marginBottom: 12, fontSize: 13 },
  receiptActionRow: { flexDirection: "row", padding: 15, backgroundColor: "#1e293b", justifyContent: "space-between" },
  recBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: "center", marginHorizontal: 6, elevation: 2 },
  recBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 }
});