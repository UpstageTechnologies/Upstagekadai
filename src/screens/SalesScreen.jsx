import React, { useEffect, useState, useRef } from "react";
import RazorpayCheckout from "react-native-razorpay";     
import RNBluetoothEscposPrinter from "react-native-thermal-receipt-printer";
import RNPrint from "react-native-print";
import { useFocusEffect } from "@react-navigation/native";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, Dimensions, Linking, Modal, Image } from "react-native";
import { Camera, useCameraDevice, useCodeScanner } from "react-native-vision-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WebView } from "react-native-webview"; 
import DropDownPicker from 'react-native-dropdown-picker';
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import { auth, db } from "../firebaseConfig";
import { addDoc, serverTimestamp, collection, onSnapshot, doc, updateDoc, getDocs, getDoc, deleteDoc } from "firebase/firestore";
import QRCode from "react-native-qrcode-svg";
import { onAuthStateChanged } from "firebase/auth";

const { width, height } = Dimensions.get("window");

export default function SalesScreen({ navigation }) {
  const [cameraPosition, setCameraPosition] = useState("back");
  const device = useCameraDevice(cameraPosition);

  const [currentMode, setCurrentMode] = useState("local");
  const [inventory, setInventory] = useState([]);
  const [bill, setBill] = useState([]);
  const [total, setTotal] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [search, setSearch] = useState("");
  const [paymentMode, setPaymentMode] = useState("UPI");
  const [hasPermission, setHasPermission] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [torch, setTorch] = useState("off"); 
  
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [currentBillNo, setCurrentBillNo] = useState("");
  const [currentBillDate, setCurrentBillDate] = useState("");

  const [logoUrl, setLogoUrl] = useState("");
  const [gstNumber, setGstNumber] = useState("33ABCDE1234F1Z5");
  const [shopName, setShopName] = useState("MY SHOP");
  const [shopUpiId, setShopUpiId] = useState(""); 
  const [modalVisible, setModalVisible] = useState(false);
  
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [savedSettingsQr, setSavedSettingsQr] = useState(null);

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
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [userRazorpayKeyId, setUserRazorpayKeyId] = useState("");
  const [currentQrMode, setCurrentQrMode] = useState("generated"); // 🌟 "generated" அல்லது "image"

  const scanLockRef = useRef(false);

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

        const savedQr = await AsyncStorage.getItem(`shop_qr_code_${user.uid}`);
        if (savedQr) {
          setSavedSettingsQr(savedQr);
        }

        const inventoryCollection = savedMode === "global" ? "global_inventory" : "inventory";
        const categoriesCollection = savedMode === "global" ? "global_categories" : "categories";

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
          setShopUpiId(data.upiId || "");
          setUserRazorpayKeyId(data.razorpayKeyId || "");
          setCurrentQrMode(data.qrMode || "generated"); 
        }
      });
    }
  );
  return () => unsub();
}, []);

  const triggerUpiSuccessAnimation = () => {
    setShowUpiModal(false); 
    setShowSuccessOverlay(true); 
    
    setTimeout(async () => {
      setShowSuccessOverlay(false);
      await finalizeOrder("UPI_AUTOMATIC_SUCCESS");
    }, 2000);
  };

  const handleRazorpayPayment = () => {
    if (!userRazorpayKeyId) {
      Alert.alert("Configuration Missing", "Please configure Razorpay API Key in settings screen.");
      return;
    }

    var options = {
      description: `Payment for Order Total: ₹${total}`,
      image: logoUrl || 'https://i.imgur.com/3g7nmJC.png',
      currency: 'INR',
      key: userRazorpayKeyId,
      amount: total * 100, 
      name: shopName,
      prefill: {
        email: auth.currentUser?.email || 'test@example.com',
        contact: '',
        name: auth.currentUser?.displayName || 'Merchant Customer'
      },
      theme: { color: '#6366f1' }
    };

    RazorpayCheckout.open(options).then((data) => {
      setShowReview(false);
      setShowSuccessOverlay(true);
      setTimeout(async () => {
        setShowSuccessOverlay(false);
        await finalizeOrder(data.razorpay_payment_id);
      }, 2000);
    }).catch((error) => {
      Alert.alert("Payment Failed ❌", error.description || "Process cancelled by user.");
    });
  };

  const finalizeOrder = async (payId = "CASH_OR_OTHER") => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const salesSnap = await getDocs(collection(db, "users", user.uid, "sales"));
      const bNo = `BILL-${String(salesSnap.size + 1).padStart(6, "0")}`;
      const bDate = new Date().toLocaleDateString("en-GB");

      const totalProfit = bill.reduce((sum, i) => sum + (Number(i.salesPrice || i.price) - Number(i.purchasePrice || 0)) * i.qty, 0);

      await addDoc(collection(db, "users", user.uid, "sales"), {
        billNo: bNo, 
        invoiceId: bNo, 
        billDate: bDate, 
        items: bill, 
        total, 
        profit: totalProfit, 
        paymentMode, 
        razorpayPaymentId: payId,
        isGlobalMode: currentMode === "global",
        createdAt: serverTimestamp()
      });

      setCurrentBillNo(bNo);
      setCurrentBillDate(bDate);
      setShowReview(false);
      setShowReceiptModal(true); 

    } catch (err) {
      Alert.alert("Save failed", err.message);
    }
  };

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
      {/* WHITE HEADER WITH SHOP NAME & ICONS */}
      <View style={styles.topWhiteHeader}>
        <View style={styles.shopBadge}>
          <Icon name="storefront" size={22} color="#16a34a" />
          <Text style={styles.shopNameText}>{shopName}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={styles.headerIconBtn}>
            <Icon name="magnify" size={24} color="#475569" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn}>
            <Icon name="history" size={24} color="#475569" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 🌟 ROUNDED SQUARE CAMERA VIEW FRAME */}
      <View style={styles.cameraOuterWrapper}>
        <View style={styles.cameraFrameContainer}>
          {device && hasPermission && (
            <Camera 
              style={StyleSheet.absoluteFill} 
              device={device} 
              isActive={isActive} 
              codeScanner={codeScanner}
              torch={torch} 
            />
          )}
          <View style={styles.overlay}>
            {/* CAMERA CONTROLS */}
            <View style={styles.cameraControlRow}>
              <TouchableOpacity 
                style={styles.actionCircleBtn} 
                onPress={() => setTorch(prev => prev === "on" ? "off" : "on")}
              >
                <Icon name={torch === "on" ? "flash" : "flash-off"} size={22} color="#fff" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.actionCircleBtn} 
                onPress={() => setCameraPosition(prev => prev === "back" ? "front" : "back")}
              >
                <Icon name="camera-flip" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* PERFECTLY CENTERED SCAN Target */}
            <View style={styles.scanRow}>
              <View style={styles.salesScanBox}>
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
                
                <Text style={styles.scanText}>Scan QR or barcode</Text>
                <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>Point camera at product code</Text>

                <View style={{ backgroundColor: currentMode === "global" ? "#16a34a" : "#6366f1", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 8 }}>
                  <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 10 }}>{currentMode.toUpperCase()} MODE</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* BOTTOM WHITE PANEL SHEET */}
      {!showReview && (
        <View style={styles.bottomWhiteContainer}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <TextInput
              placeholder={`Search ${currentMode} inventory product...`}
              placeholderTextColor="#64748b"
              value={search}
              onChangeText={setSearch}
              style={{ flex: 1, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#cbd5e1", padding: 12, borderRadius: 12, color: "#000" }}
            />
            <TouchableOpacity
              onPress={() => { setManualName(""); setManualPrice(""); setManualQty("1"); setSelectedCategory(""); setModalVisible(true); }}
              style={{ width: 48, height: 48, backgroundColor: "#6366f1", borderRadius: 12, justifyContent: "center", alignItems: "center", marginLeft: 10 }}
            >
              <Text style={{ color: "#fff", fontSize: 28, fontWeight: "bold" }}>+</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>Scanned Items</Text>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
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

          <View style={{ borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 10 }}>
            <Text style={styles.total}>₹ {total}</Text>
            <TouchableOpacity style={styles.payBtn} onPress={() => { if (bill.length === 0) { Alert.alert("No items"); return; } setIsActive(false); setShowReview(true); }}>
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Review Order</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* REVIEW / CHECKOUT PANEL */}
      {showReview && (
        <View style={styles.checkoutContainer}>
          <Text style={styles.title}>Checkout</Text>
          <TextInput placeholder="Shop Name" placeholderTextColor="#64748b" value={shopName} onChangeText={setShopName} style={{ backgroundColor: "#e5e7eb", padding: 10, borderRadius: 10, marginBottom: 8, color: '#000' }} />
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
          {["CASH", "UPI", "CARD"].map(mode => ( // 🌟 RAZORPAY-க்கு பதிலா CARD மாத்தியாச்சு
            <TouchableOpacity 
              key={mode} 
              onPress={() => {
                setPaymentMode(mode);
                if (mode === "UPI") {
                  setShowUpiModal(true); 
                }
              }} 
              style={{ padding: 12, borderRadius: 10, minWidth: 90, alignItems: 'center', backgroundColor: paymentMode === mode ? "#16a34a" : "#e5e7eb" }}
            >
              <Text style={{ color: paymentMode === mode ? "#fff" : "#000", fontWeight: '700' }}>{mode}</Text>
            </TouchableOpacity>
          ))}
        </View>

         <TouchableOpacity
  style={{ backgroundColor: "#16a34a", padding: 14, borderRadius: 12, alignItems: "center", marginTop: 20 }}
  onPress={async () => {
    if (bill.length === 0) return;
    await finalizeOrder("CARD_PAYMENT");
  }}
>
  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>
    Pay & View Receipt
  </Text>
</TouchableOpacity>
        </View>
      )}

      {/* DYNAMIC UPI QR MODAL */}
      <Modal visible={showUpiModal} transparent animationType="slide">
        <View style={styles.upiModalContainer}>
          <View style={styles.upiModalContent}>
            <Text style={styles.upiModalTitle}>{shopName}</Text>
            <Text style={styles.upiModalAmount}>₹ {total}</Text>
            
  <View style={styles.qrWrapper}>
  {currentQrMode === "image" && savedSettingsQr ? (
    // 🌟 1. செட்டிங்ஸ்ல Image மோடில் Custom QR இமேஜ் காட்டும்
    <Image 
      source={{ uri: savedSettingsQr }} 
      style={{ width: 220, height: 220, borderRadius: 12 }} 
      resizeMode="contain"
    />
  ) : currentQrMode === "generated" && shopUpiId ? (
    // 🌟 2. செட்டிங்ஸ்ல Auto Generated மோடில் UPI ID மூலமாக ஜெனரேட் ஆகும் QR காட்டும்
    <>
      <QRCode 
        value={`upi://pay?pa=${shopUpiId}&pn=${encodeURIComponent(shopName)}&am=${total}&cu=INR`} 
        size={220} 
      />
      <Text style={styles.upiIdText}>UPI ID: {shopUpiId}</Text>
    </>
  ) : (
    // ஏதாச்சும் செட்டிங்ஸ் மிஸ்ஸானால் காட்டப்படும் அலர்ட் வியூ
    <View style={{ padding: 20, backgroundColor: "#fef2f2", borderRadius: 8 }}>
      <Text style={{ color: "#ef4444", fontWeight: "bold", textAlign: "center" }}>
        ⚠️ QR Mode Configurations Missing in Settings!
      </Text>
    </View>
  )}
</View>

            <TouchableOpacity 
              style={styles.receivedBtn}
              onPress={triggerUpiSuccessAnimation}
            >
              <Text style={styles.receivedBtnText}>Payment Received (Simulate) ✓</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.closeUpiBtn} 
              onPress={() => setShowUpiModal(false)}
            >
              <Text style={{ color: "#64748b", fontWeight: "bold" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SUCCESS TICK OVERLAY MODAL */}
      {showSuccessOverlay && (
        <Modal transparent={true} animationType="fade" visible={showSuccessOverlay}>
          <View style={styles.successOverlayBg}>
            <View style={styles.successMessageBox}>
              <View style={styles.successIconCircle}>
                <Text style={{ color: "#fff", fontSize: 32, fontWeight: "bold" }}>✓</Text>
              </View>
              <Text style={styles.successTextTitle}>Payment Received! 🎉</Text>
              <Text style={styles.successTextSub}>Amount: ₹ {total.toFixed(2)}</Text>
              <Text style={styles.successModeBadge}>{paymentMode} PAYMENT</Text>
            </View>
          </View>
        </Modal>
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

      {/* MANUAL ADD MODAL */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}>
          <View style={{ width: "85%", backgroundColor: "#fff", borderRadius: 20, padding: 20, maxHeight: "85%" }}>
            <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
              <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10, color: "#000" }}>Select Category ({currentMode.toUpperCase()})</Text>
              
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

      {/* CATEGORY MANAGE MODAL */}
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
        <View style={{ position: "absolute", top: 40, alignSelf: "center", backgroundColor: "#16a34a", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 30, zIndex: 9999, elevation: 20 }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>✓ Product Added</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f4f5" },
  topWhiteHeader: { height: 60, width: '100%', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', elevation: 2 },
  shopBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0fdf4', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  shopNameText: { fontSize: 16, fontWeight: '800', color: '#16a34a', marginLeft: 6 },
  headerIconBtn: { padding: 8, marginLeft: 6, backgroundColor: '#f1f5f9', borderRadius: 20 },
  
  // 🌟 கேமராவுக்கு வெளியே 4-வது படம் போன்ற மார்ஜின் மற்றும் ஒயிட் ஸ்பேஸ் தரும் ரேப்பர்
  cameraOuterWrapper: { height: 260, width: "100%", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: "#ffffff" },
  // 🌟 4-வது படம் போல் ROUNDED SQUARE வடிவமாக்கும் ஸ்டைல்ஸ்
  cameraFrameContainer: { flex: 1, overflow: "hidden", backgroundColor: '#000', borderRadius: 24, elevation: 4 },
  
  cameraControlRow: { position: 'absolute', top: 15, right: 15, zIndex: 10, flexDirection: 'row' },
  actionCircleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', marginLeft: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  bottomWhiteContainer: { flex: 1, backgroundColor: "#ffffff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, marginTop: 4, elevation: 12 },
  checkoutContainer: { position: "absolute", bottom: 0, width: "100%", height: "55%", backgroundColor: "#fff", borderTopLeftRadius: 35, borderTopRightRadius: 35, padding: 20, elevation: 12 },
  title: { color: "#0f172a", fontSize: 18, marginBottom: 8, fontWeight: "700" },
  itemCard: { position: "relative", backgroundColor: "#f8fafc", borderRadius: 14, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e2e8f0" },
  itemName: { fontSize: 14, fontWeight: "700", color: "#111827" },
  itemSub: { marginTop: 2, fontSize: 12, color: "#64748b" },
  qtyControls: { flexDirection: "row", alignItems: "center", marginHorizontal: 8 },
  qtyBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: "#6366f1", justifyContent: "center", alignItems: "center" },
  qtyBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  qtyText: { marginHorizontal: 8, fontSize: 15, fontWeight: "700", minWidth: 20, textAlign: "center", color: "#000" },
  amountText: { width: 80, textAlign: "right", fontSize: 14, fontWeight: "bold", color: "#16a34a" },
  total: { color: "#16a34a", fontSize: 26, textAlign: "center", marginVertical: 8, fontWeight: "bold" },
  payBtn: { backgroundColor: "#6366f1", padding: 14, borderRadius: 14, alignItems: "center" },
  
  // 🌟 கச்சிதமாக கேமராவுக்கு நடுவில் அலைன் செய்யும் ஸ்டைல்
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', paddingTop: 50 },
  scanRow: { flexDirection: "row", alignItems: "center", justifyContent: 'center' },
  salesScanBox: { width: width * 0.75, height: 140, justifyContent: "center", alignItems: "center", backgroundColor: 'none', borderRadius: 16,height: 160, },
  
  corner: { position: "absolute", width: 24, height: 24, borderColor: "#22c55e" },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 10 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 10 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 10 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 10 },
  scanText: { color: "#22c55e", marginTop: 10, fontSize: 15, fontWeight: "700", textAlign: 'center' },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd5e1", padding: 12, borderRadius: 10, marginTop: 10, color: "#000" },
  popoverMenu: { position: "absolute", right: 10, top: 45, backgroundColor: "#fff", borderRadius: 12, paddingVertical: 8, minWidth: 140, elevation: 8, zIndex: 999 },
  modalReceiptContainer: { flex: 1, backgroundColor: "#1e293b", paddingTop: 20, paddingBottom: 10 },
  zoomTipText: { color: "#38bdf8", textAlign: "center", fontWeight: "700", marginBottom: 12, fontSize: 13 },
  receiptActionRow: { flexDirection: "row", padding: 15, backgroundColor: "#1e293b", justifyContent: "space-between" },
  recBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: "center", marginHorizontal: 6, elevation: 2 },
  recBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  
  upiModalContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.6)" },
  upiModalContent: { width: width * 0.88, backgroundColor: "#fff", borderRadius: 24, padding: 24, alignItems: "center", elevation: 10 },
  upiModalTitle: { fontSize: 20, fontWeight: "700", color: "#1e293b", marginBottom: 6, textTransform: "uppercase" },
  upiModalAmount: { fontSize: 32, fontWeight: "800", color: "#16a34a", marginBottom: 20 },
  qrWrapper: { padding: 16, backgroundColor: "#f8fafc", borderRadius: 16, borderWidth: 1, borderColor: "#e2e8f0", alignItems: "center", justifyContent: "center", marginBottom: 15 },
  upiIdText: { fontSize: 12, color: "#64748b", marginTop: 8, fontWeight: "500" },
  receivedBtn: { backgroundColor: "#16a34a", paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, width: "100%", alignItems: "center", marginTop: 10, elevation: 2 },
  receivedBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  closeUpiBtn: { marginTop: 14, padding: 8 },

  successOverlayBg: { flex: 1, backgroundColor: "rgba(15,23,42,0.85)", justifyContent: "center", alignItems: "center" },
  successMessageBox: { width: "80%", backgroundColor: "#fff", borderRadius: 24, padding: 30, alignItems: "center", elevation: 15 },
  successIconCircle: { width: 70, height: 70, borderRadius: 35, backgroundColor: "#22c55e", justifyContent: "center", alignItems: "center", marginBottom: 16 },
  successTextTitle: { fontSize: 22, fontWeight: "bold", color: "#0f172a", textAlign: "center" },
  successTextSub: { fontSize: 16, color: "#475569", marginTop: 6, fontWeight: "600" },
  successModeBadge: { marginTop: 14, backgroundColor: "#e2e8f0", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, fontSize: 12, fontWeight: "bold", color: "#475569" }
});