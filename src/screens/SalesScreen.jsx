import React, { useEffect, useState, useRef } from "react";
import RazorpayCheckout from "react-native-razorpay";
import { useTheme } from "../theme/ThemeContext";
import RNBluetoothEscposPrinter from "react-native-thermal-receipt-printer";
import RNPrint from "react-native-print";
import { useFocusEffect } from "@react-navigation/native";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, Modal, Image, SafeAreaView, StatusBar, Platform, Keyboard, useWindowDimensions } from "react-native";
import { NativeModules } from "react-native";
import { Camera, useCameraDevice, useCodeScanner } from "react-native-vision-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WebView } from "react-native-webview";
import DropDownPicker from 'react-native-dropdown-picker';
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import { auth, db } from "../utils/firebaseConfig";
import { addDoc, serverTimestamp, collection, onSnapshot, doc, updateDoc, getDocs, deleteDoc, setDoc } from "firebase/firestore";
import QRCode from "react-native-qrcode-svg";
import { onAuthStateChanged } from "firebase/auth";

export default function SalesScreen({ navigation }) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { ScanBeep } = NativeModules;
  const [cameraPosition, setCameraPosition] = useState("back");
  const device = useCameraDevice(cameraPosition);

  const [currentMode, setCurrentMode] = useState("local");
  const [inventory, setInventory] = useState([]);
  const [bill, setBill] = useState([]);
  const [total, setTotal] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [hasPermission, setHasPermission] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [torch, setTorch] = useState("off");

  // RECEIPT SPECIFIC STATES
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [currentBillNo, setCurrentBillNo] = useState("");
  const [currentBillDate, setCurrentBillDate] = useState("");
  const [receiptBill, setReceiptBill] = useState([]);
  const [receiptTotal, setReceiptTotal] = useState(0);

  const [logoUrl, setLogoUrl] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstPercentage, setGstPercentage] = useState("18");
  const [shopName, setShopName] = useState("MY SHOP");
  const [shopUpiId, setShopUpiId] = useState("");

  const [showUpiModal, setShowUpiModal] = useState(false);
  const [savedSettingsQr, setSavedSettingsQr] = useState(null);
  const [showHoldSuccess, setShowHoldSuccess] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [showScanToast, setShowScanToast] = useState(false);

  // Settings Enabled Statuses for Buttons Gray-out Logic
  const [cashEnabled, setCashEnabled] = useState(true);
  const [upiEnabled, setUpiEnabled] = useState(true);
  const [razorpayEnabled, setRazorpayEnabled] = useState(true);

  // HOLD ORDER STATES
  const [heldOrders, setHeldOrders] = useState([]);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [holdCustomerName, setHoldCustomerName] = useState("");
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [activeResumedOrderId, setActiveResumedOrderId] = useState(null);

  // MANUAL ADD & CATEGORY STATES
  const [modalVisible, setModalVisible] = useState(false);
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
  const [userRazorpayKeyId, setUserRazorpayKeyId] = useState("");
  const [currentQrMode, setCurrentQrMode] = useState("generated");
  const [search, setSearch] = useState("");
  const { darkMode, theme } = useTheme();
  const [receiptHeader, setReceiptHeader] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("Thank you!");
  const [receiptStoreLogo, setReceiptStoreLogo] = useState(false);
  const [receiptLogoUri, setReceiptLogoUri] = useState(null);

  // =========================================================
  // 🔌 PROFESSIONAL BACKGROUND HARDWARE SCANNER ENGINE
  // =========================================================
  const hiddenScannerRef = useRef(null);
  const [scannerBuffer, setScannerBuffer] = useState("");
  const scanLockRef = useRef(false);
  const lastProcessedSaleTimestampRef = useRef(Date.now());
  const scanDebounceTimerRef = useRef(null);

  const focusGunScanner = () => {
    hiddenScannerRef.current?.focus();
    Keyboard.dismiss();
  };

  useFocusEffect(
    React.useCallback(() => {
      const timer = setTimeout(() => {
        focusGunScanner();
      }, 400);
      return () => clearTimeout(timer);
    }, [])
  );

  // Professional Error Popup Modal State
  const [scanAlertData, setScanAlertData] = useState({
    visible: false,
    type: "not_found",
    title: "",
    message: "",
    code: ""
  });

  const closeScanAlert = () => {
    setScanAlertData(prev => ({ ...prev, visible: false }));
    scanLockRef.current = false;
    setTimeout(() => {
      focusGunScanner();
    }, 200);
  };

  // Real-time Cloud Cart Sync Helper
  const syncToCloudCart = async (newBill) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const cartRef = doc(db, "users", user.uid, "active_cart", "current");
      await setDoc(cartRef, {
        items: newBill,
        lastConfirmedSale: null,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error("Cart sync error:", e);
    }
  };

  // Real-time Cloud Cart Listener
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      const cartRef = doc(db, "users", user.uid, "active_cart", "current");
      const unsubCart = onSnapshot(cartRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();

          if (data.lastConfirmedSale && data.lastConfirmedSale.timestamp) {
            const sale = data.lastConfirmedSale;
            const now = Date.now();
            const isJustConfirmed = (now - sale.timestamp) < 8000;

            if (sale.timestamp > lastProcessedSaleTimestampRef.current && isJustConfirmed) {
              lastProcessedSaleTimestampRef.current = sale.timestamp;
              setCurrentBillNo(sale.billNo || "");
              setCurrentBillDate(sale.billDate || "");
              setReceiptBill(sale.items || []);
              setReceiptTotal(Number(sale.total || sale.totalAmount || 0));
              setBill([]);
              setShowReview(false);
              setShowReceiptModal(true);
              return;
            }
          }

          setBill(data.items || []);
        } else {
          setBill([]);
        }
      });
      return () => unsubCart();
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    const loadHeldOrders = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const savedHeld = await AsyncStorage.getItem(`held_orders_${user.uid}`);
        if (savedHeld) {
          setHeldOrders(JSON.parse(savedHeld));
        }
      } catch (err) {
        console.log("Failed to load held orders", err);
      }
    };
    loadHeldOrders();
  }, []);

  const saveHeldOrdersToStorage = async (orders) => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      await AsyncStorage.setItem(`held_orders_${user.uid}`, JSON.stringify(orders));
    } catch (err) {
      console.log("Failed to save held orders", err);
    }
  };

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

        const savedReceiptLogo = await AsyncStorage.getItem(`receipt_logo_${user.uid}`);
        if (savedReceiptLogo) {
          setReceiptLogoUri(savedReceiptLogo);
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

        const savedReceiptLogo = await AsyncStorage.getItem(`receipt_logo_${user.uid}`);
        if (savedReceiptLogo) {
          setReceiptLogoUri(savedReceiptLogo);
        }

        const userRef = doc(db, "users", user.uid);
        return onSnapshot(userRef, (snap) => {
          const data = snap.data();
          if (data) {
            setShopName(data.shopName || "MY SHOP");
            setGstNumber(data.gstNumber || "");
            setGstEnabled(data.gstEnabled ?? false);
            setGstPercentage(data.gstPercentage || "18");
            setShopUpiId(data.upiId || "");
            setUserRazorpayKeyId(data.razorpayKeyId || "");
            setCurrentQrMode(data.qrMode || "generated");
            setCashEnabled(data.cashEnabled ?? true);
            setUpiEnabled(data.upiEnabled ?? true);
            setRazorpayEnabled(data.razorpayEnabled ?? true);

            if (data.receiptConfig) {
              setReceiptStoreLogo(data.receiptConfig.storeLogo ?? false);
              setReceiptHeader(data.receiptConfig.header || "");
              setReceiptFooter(data.receiptConfig.footer || "Thank you!");
            }

            if (!(data.cashEnabled ?? true) && data.upiEnabled) setPaymentMode("UPI");
            else if (!(data.cashEnabled ?? true) && !(data.upiEnabled ?? true) && data.razorpayEnabled) setPaymentMode("RAZORPAY");
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
    if (!razorpayEnabled) {
      Alert.alert("Disabled", "Razorpay is disabled in settings.");
      return;
    }
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

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const datePrefix = `${year}${month}${day}`;

      const sequenceNum = String(salesSnap.size + 1).padStart(4, "0");
      const bNo = `${datePrefix}-${sequenceNum}`;
      const bDate = now.toLocaleDateString("en-GB");

      const subtotal = bill.reduce((sum, i) => sum + (Number(i.price) * i.qty), 0);
      const taxTotal = gstEnabled ? bill.reduce((sum, i) => {
        const itemTaxRate = Number(i.taxPercent || gstPercentage || 0);
        return sum + ((Number(i.price) * i.qty) * (itemTaxRate / 100));
      }, 0) : 0;

      const finalOrderTotal = subtotal + taxTotal;
      const totalProfit = bill.reduce((sum, i) => sum + (Number(i.salesPrice || i.price) - Number(i.purchasePrice || 0)) * i.qty, 0);

      await addDoc(collection(db, "users", user.uid, "sales"), {
        billNo: bNo,
        invoiceId: bNo,
        billDate: bDate,
        items: bill,
        total: finalOrderTotal,
        profit: totalProfit,
        paymentMode,
        razorpayPaymentId: payId,
        isGlobalMode: currentMode === "global",
        createdAt: serverTimestamp()
      });

      if (activeResumedOrderId) {
        const updatedOrders = heldOrders.filter(o => o.id !== activeResumedOrderId);
        setHeldOrders(updatedOrders);
        saveHeldOrdersToStorage(updatedOrders);
        setActiveResumedOrderId(null);
      }

      setReceiptBill([...bill]);
      setReceiptTotal(finalOrderTotal);
      setCurrentBillNo(bNo);
      setCurrentBillDate(bDate);

      await syncToCloudCart([]);

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
        }
      }
    })();
  }, []);

  const inventoryCollection = currentMode === "global" ? "global_inventory" : "inventory";

  const addToBill = async (item) => {
    if (item.quantity <= 0) return Alert.alert("Out of stock");

    const itemId = item.id || item.barcode;
    const exist = bill.find(i => (i.id && i.id === item.id) || (i.barcode && i.barcode === item.barcode));

    let updatedBill;
    if (exist) {
      updatedBill = bill.map(i => ((i.id && i.id === item.id) || (i.barcode && i.barcode === item.barcode)) ? { ...i, qty: i.qty + 1 } : i);
    } else {
      updatedBill = [...bill, {
        ...item,
        id: itemId,
        name: item.itemName || item.name,
        qty: 1,
        price: Number(item.salesPrice || item.price || 0),
        salesPrice: Number(item.salesPrice || item.price || 0),
        purchasePrice: Number(item.purchasePrice ?? 0),
        taxPercent: item.taxPercent || gstPercentage || 0
      }];
    }

    setBill(updatedBill);
    await syncToCloudCart(updatedBill);

    if (item.id && item.id.length > 10) {
      await updateDoc(doc(db, "users", auth.currentUser.uid, inventoryCollection, item.id), { quantity: item.quantity - 1 });
    }
  };

  const decreaseQty = async (item) => {
    const exist = bill.find(i => (i.id && i.id === item.id) || (i.barcode && i.barcode === item.barcode));
    if (!exist) return;

    let updatedBill;
    if (exist.qty === 1) {
      updatedBill = bill.filter(i => !((i.id && i.id === item.id) || (i.barcode && i.barcode === item.barcode)));
    } else {
      updatedBill = bill.map(i => ((i.id && i.id === item.id) || (i.barcode && i.barcode === item.barcode)) ? { ...i, qty: i.qty - 1 } : i);
    }

    setBill(updatedBill);
    await syncToCloudCart(updatedBill);

    if (item.id && item.id.length > 10) {
      await updateDoc(doc(db, "users", auth.currentUser.uid, inventoryCollection, item.id), { quantity: item.quantity + 1 });
    }
  };

  const removeItem = async (item) => {
    Alert.alert("Remove Item", `Remove ${item.itemName || item.name} from bill?`, [
      { text: "No" },
      {
        text: "Yes",
        onPress: async () => {
          const updatedBill = bill.filter(i => !((i.id && i.id === item.id) || (i.barcode && i.barcode === item.barcode)));
          setBill(updatedBill);
          await syncToCloudCart(updatedBill);
          if (item.id && item.id.length > 10) {
            await updateDoc(doc(db, "users", auth.currentUser.uid, inventoryCollection, item.id), { quantity: item.quantity + item.qty });
          }
        }
      }
    ]);
  };

  const handleHoldOrder = () => {
    if (bill.length === 0) {
      Alert.alert("Empty Bill", "No items to hold.");
      return;
    }
    setShowHoldModal(true);
  };

  const confirmHold = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const newHold = {
        id: Date.now(),
        name: holdCustomerName.trim() || "Guest",
        items: bill,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      const updatedOrders = [...heldOrders, newHold];
      setHeldOrders(updatedOrders);
      await AsyncStorage.setItem(`held_orders_${user.uid}`, JSON.stringify(updatedOrders));

      setBill([]);
      await syncToCloudCart([]);
      setHoldCustomerName("");
      setShowHoldModal(false);

      setShowHoldSuccess(true);
      setTimeout(() => setShowHoldSuccess(false), 2000);
    } catch (err) {
      Alert.alert("Error", "Failed to hold order: " + err.message);
    }
  };

  const resumeOrder = async (order) => {
    setBill(order.items);
    await syncToCloudCart(order.items);
    setActiveResumedOrderId(order.id);
    setShowResumeModal(false);
  };

  useEffect(() => {
    const subtotal = bill.reduce((sum, i) => sum + ((i.salesPrice || i.price || 0) * i.qty), 0);
    const taxTotal = gstEnabled ? bill.reduce((sum, i) => {
      const itemTaxRate = Number(i.taxPercent || gstPercentage || 0);
      return sum + (((i.salesPrice || i.price || 0) * i.qty) * (itemTaxRate / 100));
    }, 0) : 0;
    setTotal(subtotal + taxTotal);
  }, [bill, gstEnabled, gstPercentage]);

  const triggerThermalPrint = async (bNo, bDate) => {
    try {
      const printers = await RNBluetoothEscposPrinter.getDeviceList();
      if (printers && printers.length > 0) {
        const printer = printers[0];
        await RNBluetoothEscposPrinter.connectPrinter(printer.address);
        await RNBluetoothEscposPrinter.printerInit();

        if (receiptStoreLogo && receiptLogoUri) {
          await RNBluetoothEscposPrinter.printText(`[LOGO]\n`, { align: "center" });
        }
        await RNBluetoothEscposPrinter.printText(`${shopName}\n`, { align: "center" });
        if (gstEnabled && gstNumber) {
          await RNBluetoothEscposPrinter.printText(`GST: ${gstNumber}\n`, { align: "center" });
        }
        await RNBluetoothEscposPrinter.printText(`Bill: ${bNo} | Date: ${bDate}\n`, { align: "center" });
        await RNBluetoothEscposPrinter.printText("--------------------------------\n");

        for (let item of receiptBill) {
          await RNBluetoothEscposPrinter.printText(`${item.itemName || item.name}\n`);
          await RNBluetoothEscposPrinter.printText(` ${item.qty} x ₹${item.salesPrice || item.price} = ₹${item.qty * (item.salesPrice || item.price)}\n`);
        }

        await RNBluetoothEscposPrinter.printText("--------------------------------\n");
        await RNBluetoothEscposPrinter.printText(`TOTAL: ₹${receiptTotal}\n`, { align: "right" });
        await RNBluetoothEscposPrinter.printText("--------------------------------\n");
        await RNBluetoothEscposPrinter.printText(`${receiptFooter || "Thank you for your business!"}\n\n\n`, { align: "center" });
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
      body { font-family: monospace; margin: 0; padding: 6mm 4mm; font-size: 12px; color: #000; font-weight: bold; background-color: #fff; }
      .center { text-align: center; }
      .header-row { display: flex; align-items: center; margin-bottom: 8px; justify-content: center; }
      .logo-img { width: 50px; height: 50px; border-radius: 50%; object-fit: cover; margin-right: 8px; border: 1px solid #ddd; }
      .divider { border-top: 1px dashed #000; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; }
      table { width: 100%; border-collapse: collapse; }
      td { font-size: 12px; padding: 2px 0; }
      .right { text-align: right; }
      </style>
      </head>
      <body>

      <div class="header-row">
        ${receiptStoreLogo && receiptLogoUri ? `<img class="logo-img" src="${receiptLogoUri}"/>` : ""}
        <div style="text-align: center;">
          <div style="font-size:14px; font-weight:bold; text-transform: uppercase;">${shopName}</div>
          ${gstEnabled && gstNumber ? `<div style="font-size:11px;">GST: ${gstNumber}</div>` : ""}
        </div>
      </div>

      ${receiptHeader ? `<div class="center" style="font-size: 11px; margin-bottom: 6px; font-style: italic;">${receiptHeader}</div>` : ""}

      <div class="divider"></div>
      <div>Bill No: ${bNo}</div>
      <div>Date: ${bDate}</div>
      <div class="divider"></div>
      <table>
      ${receiptBill.map(i => `
      <tr>
      <td>${i.itemName || i.name}<br/>&nbsp;&nbsp;${i.qty} x ₹${Number(i.salesPrice || i.price).toFixed(2)}</td>
      <td class="right" style="vertical-align:bottom;">₹${(i.qty * (i.salesPrice || i.price)).toFixed(2)}</td>
      </tr>
      `).join("")}
      </table>
      <div class="divider"></div>
      <div class="row" style="font-size:13px; font-weight:bold;"><span>GRAND TOTAL:</span><span>₹${Number(receiptTotal).toFixed(2)}</span></div>
      <div class="divider"></div>
      <div class="center" style="margin-top:10px;">${receiptFooter || "Thank you for your business!"}</div>
      </body>
      </html>`;
      await RNPrint.print({ html });
    }
  };

  // =========================================================
  // ⚡ DUAL SCAN HANDLER (Tolerant Barcode Matcher)
  // =========================================================
  const processScannedCode = async (rawCode) => {
    if (!rawCode) return;
    if (scanLockRef.current) return;
    scanLockRef.current = true;

    const cleanScanned = String(rawCode).trim();
    const numericScanned = cleanScanned.replace(/\D/g, "");

    if (cleanScanned.length < 3) {
      setScanAlertData({
        visible: true,
        type: "invalid_scan",
        title: "Scan Incomplete",
        message: "Barcode was not scanned clearly. Please hold steady and align properly.",
        code: cleanScanned
      });
      return;
    }

    const item = inventory.find((i) => {
      const itemBarcode = String(i.barcode || "").trim();
      const itemId = String(i.id || "").trim();
      if (!itemBarcode && !itemId) return false;

      const itemNumeric = itemBarcode.replace(/\D/g, "");

      // 1. Exact string match
      if (itemBarcode === cleanScanned || itemId === cleanScanned) return true;

      // 2. Pure numeric match
      if (numericScanned && itemNumeric && numericScanned === itemNumeric) return true;

      // 3. Leading zero strip match (e.g. 08904165 vs 8904165)
      const cleanNoZero = numericScanned.replace(/^0+/, "");
      const itemNoZero = itemNumeric.replace(/^0+/, "");
      if (cleanNoZero && itemNoZero && cleanNoZero === itemNoZero) return true;

      // 4. Missing Check-digit match (EAN-13 12 vs 13 digits)
      if (numericScanned.length >= 8 && itemNumeric.length >= 8) {
        if (numericScanned.startsWith(itemNumeric) || itemNumeric.startsWith(numericScanned)) {
          return true;
        }
      }

      return false;
    });

    if (item) {
      ScanBeep?.beep?.();
      await addToBill(item);
      setShowScanToast(true);
      setTimeout(() => {
        setShowScanToast(false);
        scanLockRef.current = false;
        focusGunScanner();
      }, 1200);
    } else {
      setScanAlertData({
        visible: true,
        type: "not_found",
        title: "Product Not Found",
        message: "This product is not registered in your current inventory.",
        code: cleanScanned
      });
    }
  };

  // 1️⃣ Camera Code Scanner
  const codeScanner = useCodeScanner({
    codeTypes: ["ean-13", "ean-8", "code-128", "qr", "upc-a", "upc-e"],
    onCodeScanned: async (codes) => {
      const rawCode = codes[0]?.value;
      if (rawCode) {
        await processScannedCode(rawCode);
      }
    },
  });

  // 2️⃣ Hardware Gun Scanner Auto Buffer Reader
  const handleGunKeystroke = (text) => {
    setScannerBuffer(text);

    if (scanDebounceTimerRef.current) {
      clearTimeout(scanDebounceTimerRef.current);
    }

    scanDebounceTimerRef.current = setTimeout(async () => {
      const candidate = text.trim();
      if (candidate.length >= 6) {
        setScannerBuffer("");
        await processScannedCode(candidate);
      }
    }, 280);
  };

  const handleGunSubmit = async () => {
    if (scanDebounceTimerRef.current) {
      clearTimeout(scanDebounceTimerRef.current);
    }
    const finalCode = scannerBuffer.trim();
    setScannerBuffer("");
    if (finalCode.length >= 3) {
      await processScannedCode(finalCode);
    }
  };

  const filteredInventory = inventory.filter(i =>
    (i.itemName || i.name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={darkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} />

      {/* 🔌 ZERO-KEYBOARD GUN LISTENER */}
      <View style={styles.gunListenerWrapper} pointerEvents="box-none">
        <TextInput
          ref={hiddenScannerRef}
          style={styles.gunHiddenInput}
          autoFocus={true}
          showSoftInputOnFocus={false}
          caretHidden={true}
          contextMenuHidden={true}
          disableFullscreenUI={true}
          keyboardType="numeric"
          autoCorrect={false}
          autoCapitalize="none"
          value={scannerBuffer}
          onChangeText={handleGunKeystroke}
          onSubmitEditing={handleGunSubmit}
          blurOnSubmit={false}
        />
      </View>

      {/* TOP HEADER */}
      <View style={[styles.topWhiteHeader, { backgroundColor: theme.card, borderBottomColor: darkMode ? '#334155' : '#e2e8f0' }]}>
        <View style={[styles.shopBadge, { backgroundColor: darkMode ? '#1e293b' : '#eef2ff' }]}>
          <Icon name="storefront" size={20} color="#16a34a" />
          <Text style={[styles.shopNameText, { color: darkMode ? '#f8fafc' : '#6366f1' }]} numberOfLines={1}>{shopName}</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity 
            focusable={false}
            style={[styles.headerIconBtn, { backgroundColor: darkMode ? '#1e293b' : '#f1f5f9' }]} 
            onPress={() => setShowResumeModal(true)}
          >
            <Icon name="pause-circle" size={22} color="#d97706" />
            {heldOrders.length > 0 && (
              <View style={styles.badgeContainer}>
                <Text style={styles.badgeText}>{heldOrders.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity 
            focusable={false}
            style={styles.headerIconBtn} 
            onPress={() => navigation.navigate("SalesHistory")}
          >
            <Icon name="history" size={22} color="#6366f1" />
          </TouchableOpacity>
        </View>
      </View>

      {/* MAIN BODY: PORTRAIT VS TABLET LANDSCAPE SPLIT */}
      <View style={[styles.mainLayout, isLandscape && styles.landscapeMainLayout]}>

        {/* LEFT AREA: CAMERA & SEARCH */}
        <View style={[styles.leftSection, isLandscape && styles.landscapeLeftSection]}>
          <View style={[styles.cameraOuterWrapper, isLandscape && styles.landscapeCameraWrapper, { backgroundColor: theme.background }]}>
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
                <View style={styles.cameraControlRow}>
                  <TouchableOpacity focusable={false} style={styles.actionCircleBtn} onPress={() => setTorch(prev => prev === "on" ? "off" : "on")}>
                    <Icon name={torch === "on" ? "flash" : "flash-off"} size={22} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity focusable={false} style={styles.actionCircleBtn} onPress={() => setCameraPosition(prev => prev === "back" ? "front" : "back")}>
                    <Icon name="camera-flip" size={22} color="#fff" />
                  </TouchableOpacity>
                </View>

                <View style={styles.scanRow}>
                  <View style={[styles.salesScanBox, isLandscape && styles.tabletSalesScanBox]}>
                    <View style={[styles.corner, styles.topLeft]} />
                    <View style={[styles.corner, styles.topRight]} />
                    <View style={[styles.corner, styles.bottomLeft]} />
                    <View style={[styles.corner, styles.bottomRight]} />
                    <Text style={styles.scanText}>Camera / Gun Scanner Active</Text>
                    <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>Scan using Camera or Helett Scanner</Text>

                    <View style={{ backgroundColor: currentMode === "global" ? "#16a34a" : "#6366f1", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 8 }}>
                      <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 10 }}>{currentMode.toUpperCase()} MODE</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* 🔍 PRODUCT SEARCH BAR */}
          <View style={[styles.searchRowContainer, { backgroundColor: theme.card, paddingHorizontal: isLandscape ? 0 : 16 }]}>
            <TextInput
              placeholder={`Search ${currentMode} inventory product...`}
              placeholderTextColor="#64748b"
              value={search}
              onChangeText={setSearch}
              onBlur={() => {
                focusGunScanner();
              }}
              style={{
                flex: 1,
                backgroundColor: darkMode ? '#1e293b' : '#f8fafc',
                borderWidth: 1,
                borderColor: darkMode ? '#334155' : '#cbd5e1',
                paddingHorizontal: 12,
                borderRadius: 12,
                color: theme.text,
                height: 44
              }}
            />
            <TouchableOpacity
              focusable={false}
              onPress={() => { setSearch(""); setManualName(""); setManualPrice(""); setManualQty("1"); setSelectedCategory(""); setModalVisible(true); }}
              style={{ width: 44, height: 44, backgroundColor: "#6366f1", borderRadius: 12, justifyContent: "center", alignItems: "center", marginLeft: 10 }}
            >
              <Text style={{ color: "#fff", fontSize: 26, fontWeight: "bold" }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* RIGHT AREA: SCANNED ITEMS & CHECKOUT */}
        {!showReview && (
          <View style={[styles.bottomWhiteContainer, isLandscape && styles.landscapeRightSection, { backgroundColor: theme.card }]}>
            <Text style={[styles.title, { color: theme.text }]}>Scanned Items</Text>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {search.trim().length > 0 ? (
                filteredInventory.map((item) => {
                  const isItemInBill = bill.find(b => (b.id && b.id === item.id) || (b.barcode && b.barcode === item.barcode));
                  return (
                    <View key={item.id} style={styles.itemCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: "#000", fontWeight: '700' }}>{item.itemName || item.name}</Text>
                        <Text style={styles.itemSub}>Stock: {item.quantity}</Text>
                      </View>
                      {isItemInBill ? (
                        <View style={styles.qtyControls}>
                          <TouchableOpacity focusable={false} style={styles.qtyBtn} onPress={() => decreaseQty(item)}><Text style={styles.qtyBtnText}>-</Text></TouchableOpacity>
                          <Text style={styles.qtyText}>{isItemInBill.qty}</Text>
                          <TouchableOpacity focusable={false} style={styles.qtyBtn} onPress={() => addToBill(item)}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity focusable={false} onPress={() => addToBill(item)} style={{ backgroundColor: "#22c55e", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                          <Text style={{ color: "#fff", fontWeight: "600" }}>Add</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              ) : (
                bill.map((i, idx) => {
                  const itemIdentifier = i.barcode || i.id || String(idx);
                  const itemPrice = i.salesPrice || i.price || 0;
                  return (
                    <View key={itemIdentifier} style={styles.itemCard}>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={styles.itemName}>{i.itemName || i.name}</Text>
                        <Text style={styles.itemSub}>₹{itemPrice} × {i.qty}</Text>
                      </View>
                      <View style={styles.qtyControls}>
                        <TouchableOpacity focusable={false} style={styles.qtyBtn} onPress={() => decreaseQty(i)}><Text style={styles.qtyBtnText}>-</Text></TouchableOpacity>
                        <Text style={styles.qtyText}>{i.qty}</Text>
                        <TouchableOpacity focusable={false} style={styles.qtyBtn} onPress={() => addToBill(i)}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>
                      </View>
                      <TouchableOpacity focusable={false} onPress={() => setMenuItem(menuItem === itemIdentifier ? null : itemIdentifier)} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 20, color: "#64748b", fontWeight: "bold" }}>⋮</Text>
                      </TouchableOpacity>
                      <Text style={styles.amountText}>₹{(itemPrice * i.qty).toFixed(2)}</Text>
                      {menuItem === itemIdentifier && (
                        <View style={styles.popoverMenu}>
                          <TouchableOpacity focusable={false} onPress={() => { setMenuItem(null); removeItem(i); }} style={{ padding: 10 }}>
                            <Text style={{ color: "#ef4444", fontWeight: "600" }}>🗑 Remove Item</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={{ borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 8 }}>
              <Text style={styles.total}>₹ {total}</Text>
              <View style={styles.actionButtonBarRow}>
                <TouchableOpacity focusable={false} style={styles.holdBtnIcon} onPress={handleHoldOrder}>
                  <Icon name="pause-circle-outline" size={24} color="#d97706" />
                </TouchableOpacity>
                <TouchableOpacity
                  focusable={false}
                  style={[styles.payBtnNew, { flex: 1, marginHorizontal: 8 }]}
                  onPress={() => { if (bill.length === 0) { Alert.alert("No items"); return; } setIsActive(false); setShowReview(true); }}
                >
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Review Order</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

      </View>

      {/* REVIEW / CHECKOUT PANEL */}
      {showReview && (
        <View style={styles.checkoutContainer}>
          <Text style={styles.title}>Checkout</Text>
          <TextInput placeholder="Shop Name" placeholderTextColor="#64748b" value={shopName} onChangeText={setShopName} style={{ backgroundColor: "#e5e7eb", padding: 10, borderRadius: 10, marginBottom: 8, color: '#000' }} />
          <ScrollView style={{ maxHeight: 120 }}>
            {bill.map((i, idx) => (
              <View key={i.barcode || i.id || idx} style={styles.reviewRow}>
                <Text style={{ color: "#000" }}>{i.qty} x {i.itemName || i.name}</Text>
                <Text style={{ color: "#000", fontWeight: "bold" }}>₹{(i.salesPrice || i.price || 0) * i.qty}</Text>
              </View>
            ))}
          </ScrollView>
          <Text style={styles.total}>₹ {total}</Text>

          <View style={{ flexDirection: "row", justifyContent: "space-around", marginVertical: 8 }}>
            <TouchableOpacity
              focusable={false}
              disabled={!cashEnabled}
              onPress={() => setPaymentMode("CASH")}
              style={[styles.payModeBtnStyle, paymentMode === "CASH" && styles.payModeBtnActive, !cashEnabled && styles.payModeBtnDisabled]}
            >
              <Text style={[styles.payModeText, paymentMode === "CASH" && { color: "#fff" }, !cashEnabled && { color: "#9ca3af" }]}>CASH</Text>
            </TouchableOpacity>

            <TouchableOpacity
              focusable={false}
              disabled={!upiEnabled}
              onPress={() => { if (upiEnabled) { setPaymentMode("UPI"); setShowUpiModal(true); } }}
              style={[styles.payModeBtnStyle, paymentMode === "UPI" && styles.payModeBtnActive, !upiEnabled && styles.payModeBtnDisabled]}
            >
              <Text style={[styles.payModeText, paymentMode === "UPI" && { color: "#fff" }, !upiEnabled && { color: "#9ca3af" }]}>UPI</Text>
            </TouchableOpacity>

            <TouchableOpacity
              focusable={false}
              disabled={!razorpayEnabled}
              onPress={() => { if (razorpayEnabled) { setPaymentMode("RAZORPAY"); handleRazorpayPayment(); } }}
              style={[styles.payModeBtnStyle, paymentMode === "RAZORPAY" && styles.payModeBtnActive, !razorpayEnabled && styles.payModeBtnDisabled]}
            >
              <Text style={[styles.payModeText, paymentMode === "RAZORPAY" && { color: "#fff" }, !razorpayEnabled && { color: "#9ca3af" }]}>RAZORPAY</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            focusable={false}
            style={{ backgroundColor: "#16a34a", padding: 12, borderRadius: 12, alignItems: "center", marginTop: 10 }}
            onPress={async () => {
              if (bill.length === 0) return;
              await finalizeOrder(paymentMode);
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Complete Payment & Receipt</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* MANUAL ADD MODAL */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{ width: "100%", height: "85%", backgroundColor: theme.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, elevation: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
              <Text style={{ fontSize: 20, fontWeight: "bold", color: theme.text }}>Select Products ({currentMode.toUpperCase()})</Text>
              <TouchableOpacity focusable={false} onPress={() => { setModalVisible(false); focusGunScanner(); }} style={{ padding: 4 }}>
                <Icon name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={{ zIndex: 1000, marginBottom: 12 }}>
              <DropDownPicker
                open={open}
                value={selectedCategory}
                items={categoryItems}
                setOpen={setOpen}
                setValue={setSelectedCategory}
                setItems={setCategoryItems}
                placeholder="All Categories"
                style={{ borderColor: darkMode ? "#334155" : "#cbd5e1", backgroundColor: darkMode ? "#1e293b" : "#fff", borderRadius: 12 }}
                textStyle={{ color: theme.text }}
                dropDownContainerStyle={{ borderColor: darkMode ? "#334155" : "#cbd5e1", backgroundColor: darkMode ? "#1e293b" : "#fff" }}
                listMode="SCROLLVIEW"
              />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {inventory
                .filter(item => !selectedCategory || item.category === selectedCategory)
                .map((item) => {
                  const existingInBill = bill.find(b => (b.id && b.id === item.id) || (b.barcode && b.barcode === item.barcode));
                  const currentQtyInBill = existingInBill ? existingInBill.qty : 0;

                  return (
                    <View key={item.id} style={{
                      backgroundColor: darkMode ? "#1e293b" : "#f8fafc",
                      borderRadius: 16,
                      padding: 12,
                      marginBottom: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: darkMode ? "#334155" : "#e2e8f0"
                    }}>
                      <View style={{ width: 50, height: 50, borderRadius: 10, backgroundColor: "#e2e8f0", justifyContent: "center", alignItems: "center", overflow: "hidden", marginRight: 12 }}>
                        {(item.image || item.imageUrl) ? (
                          <Image source={{ uri: item.image || item.imageUrl }} style={{ width: 50, height: 50 }} resizeMode="cover" />
                        ) : (
                          <Icon name="package-variant" size={24} color="#64748b" />
                        )}
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "700", color: theme.text }}>{item.itemName || item.name}</Text>
                        <Text style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Stock: {item.quantity} | <Text style={{ color: "#16a34a", fontWeight: "bold" }}>₹{item.salesPrice || item.price}</Text></Text>
                      </View>

                      {currentQtyInBill > 0 ? (
                        <View style={styles.qtyControls}>
                          <TouchableOpacity focusable={false} style={styles.qtyBtn} onPress={() => decreaseQty(item)}>
                            <Text style={styles.qtyBtnText}>-</Text>
                          </TouchableOpacity>
                          <Text style={[styles.qtyText, { color: theme.text }]}>{currentQtyInBill}</Text>
                          <TouchableOpacity focusable={false} style={styles.qtyBtn} onPress={() => addToBill(item)}>
                            <Text style={styles.qtyBtnText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          focusable={false}
                          onPress={() => addToBill(item)}
                          style={{ backgroundColor: "#6366f1", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 }}
                        >
                          <Text style={{ color: "#fff", fontWeight: "600" }}>Add</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
            </ScrollView>

            <TouchableOpacity
              focusable={false}
              style={{ backgroundColor: "#16a34a", padding: 14, borderRadius: 14, alignItems: "center", marginTop: 10 }}
              onPress={() => { setModalVisible(false); focusGunScanner(); }}
            >
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>Done ({bill.length} items added)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* RECEIPT MODAL */}
      <Modal visible={showReceiptModal} animationType="slide" transparent={false}>
        <View style={styles.modalReceiptContainer}>
          <Text style={styles.zoomTipText}>💡 Use two fingers to Zoom In/Out (Pinch)</Text>
          <View style={{ flex: 1, backgroundColor: "#fff", marginHorizontal: 15, borderRadius: 12, overflow: 'hidden' }}>
            <WebView
              originWhitelist={['*']}
              source={{ html: `
              <html>
              <head>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: monospace; margin: 0; padding: 15px; font-size: 14px; color: #000; font-weight: bold; background-color: #fff; }
                .header-row { display: flex; align-items: center; margin-bottom: 12px; }
                .logo-img { width: 50px; height: 50px; border-radius: 50%; object-fit: cover; margin-right: 10px; border: 1px solid #ddd; }
                .center { text-align: center; }
                .divider { border-top: 1px dashed #000; margin: 12px 0; }
                .row { display: flex; justify-content: space-between; }
                table { width: 100%; border-collapse: collapse; }
                td { font-size: 14px; padding: 4px 0; }
                .right { text-align: right; }
              </style>
              </head>
              <body>
              <div class="header-row" style="display: flex; align-items: center; margin-bottom: 12px;">
                ${receiptStoreLogo && receiptLogoUri ? `<img src="${receiptLogoUri}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; margin-right: 10px; border: 1px solid #ddd;" />` : ""}
                <div style="flex: 1; text-align: center;">
                  <div style="font-size:18px; font-weight:bold; text-transform: uppercase;">${shopName}</div>
                  ${gstEnabled && gstNumber ? `<div style="font-size:12px;">GST: ${gstNumber}</div>` : ""}
                </div>
              </div>

              ${receiptHeader ? `<div class="center" style="font-size: 13px; margin-bottom: 8px; font-style: italic;">${receiptHeader}</div>` : ""}

              <div class="divider"></div>
              <div>Bill No: ${currentBillNo}</div>
              <div>Date: ${currentBillDate}</div>
              <div class="divider"></div>

              <table>
                ${receiptBill.map(i => `
                  <tr>
                    <td>${i.itemName || i.name}<br/>&nbsp;&nbsp;${i.qty} x ₹${Number(i.salesPrice || i.price || 0).toFixed(2)}</td>
                    <td class="right" style="vertical-align:bottom;">₹${(i.qty * (i.salesPrice || i.price || 0)).toFixed(2)}</td>
                  </tr>
                `).join("")}
              </table>

              <div class="divider"></div>
              <div class="row" style="font-size:16px; font-weight:bold;">
                <span>GRAND TOTAL:</span><span>₹${Number(receiptTotal).toFixed(2)}</span>
              </div>
              <div class="divider"></div>

              <div class="center" style="margin-top:20px; font-weight: bold;">${receiptFooter || "Thank you for your business!"}</div>
              </body>
              </html>
              ` }}
              scalesPageToFit={true}
            />
          </View>

          <View style={styles.receiptActionRow}>
            <TouchableOpacity focusable={false} style={[styles.recBtn, { backgroundColor: "#ef4444" }]} onPress={async () => { setShowReceiptModal(false); setReceiptBill([]); setReceiptTotal(0); await syncToCloudCart([]); setIsActive(true); focusGunScanner(); }}>
              <Text style={styles.recBtnText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity focusable={false} style={[styles.recBtn, { backgroundColor: "#6366f1" }]} onPress={() => triggerThermalPrint(currentBillNo, currentBillDate)}>
              <Text style={styles.recBtnText}>🖨 Print Bill</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SUCCESS OVERLAY MODAL */}
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

      {showScanToast && (
        <View style={{ position: "absolute", top: 40, alignSelf: "center", backgroundColor: "#16a34a", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 30, zIndex: 9999, elevation: 20 }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>✓ Product Added</Text>
        </View>
      )}

      {/* PROFESSIONAL SCAN ERROR MODAL */}
      <Modal
        visible={scanAlertData.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeScanAlert}
      >
        <View style={styles.errorModalOverlay}>
          <View style={[styles.errorCard, { backgroundColor: theme.card }]}>
            <View style={[
              styles.errorIconWrapper,
              { backgroundColor: scanAlertData.type === "invalid_scan" ? "#fef3c7" : "#fee2e2" }
            ]}>
              <Icon
                name={scanAlertData.type === "invalid_scan" ? "barcode-scan" : "package-variant-remove"}
                size={38}
                color={scanAlertData.type === "invalid_scan" ? "#d97706" : "#ef4444"}
              />
            </View>

            <Text style={[styles.errorCardTitle, { color: theme.text }]}>
              {scanAlertData.title}
            </Text>

            <Text style={styles.errorCardDesc}>
              {scanAlertData.message}
            </Text>

            <View style={[styles.codeBadge, { backgroundColor: darkMode ? "#1e293b" : "#f1f5f9" }]}>
              <Text style={styles.codeLabel}>Scanned Code:</Text>
              <Text style={[styles.codeValue, { color: darkMode ? "#38bdf8" : "#2563eb" }]}>
                {scanAlertData.code}
              </Text>
            </View>

            <View style={styles.errorActionRow}>
              <TouchableOpacity
                focusable={false}
                style={[styles.primaryActionBtn, { backgroundColor: scanAlertData.type === "invalid_scan" ? "#d97706" : "#4f46e5" }]}
                onPress={closeScanAlert}
              >
                <Text style={styles.primaryActionBtnText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* HOLD ORDER MODAL */}
      <Modal visible={showHoldModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: '80%', backgroundColor: theme.card, padding: 20, borderRadius: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: theme.text }}>Enter Customer Name</Text>
            <TextInput
              placeholder="Customer Name (Optional)"
              placeholderTextColor="#64748b"
              value={holdCustomerName}
              onChangeText={setHoldCustomerName}
              style={{ borderWidth: 1, borderColor: darkMode ? '#334155' : '#ccc', color: theme.text, padding: 10, borderRadius: 10, marginBottom: 15 }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <TouchableOpacity focusable={false} onPress={() => { setShowHoldModal(false); focusGunScanner(); }}>
                <Text style={{ color: 'red', fontWeight: 'bold' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity focusable={false} onPress={confirmHold}>
                <Text style={{ color: 'green', fontWeight: 'bold' }}>Confirm Hold</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* RESUME ORDER MODAL */}
      <Modal visible={showResumeModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: '85%', backgroundColor: theme.card, padding: 20, borderRadius: 20, maxHeight: '80%' }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 15, color: theme.text }}>Pending Orders</Text>
            <ScrollView>
              {heldOrders.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#64748b', marginVertical: 20 }}>No pending orders!</Text>
              ) : (
                heldOrders.map((o) => (
                  <View key={o.id} style={{ padding: 12, borderBottomWidth: 1, borderColor: darkMode ? '#334155' : '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <Text style={{ fontWeight: 'bold', fontSize: 16, color: theme.text }}>{o.name}</Text>
                      <Text style={{ color: '#64748b' }}>{o.timestamp} • {o.items.length} items</Text>
                    </View>
                    <TouchableOpacity focusable={false} onPress={() => resumeOrder(o)} style={{ backgroundColor: '#6366f1', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>Resume</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity focusable={false} onPress={() => { setShowResumeModal(false); focusGunScanner(); }} style={{ marginTop: 20, alignItems: 'center' }}>
              <Text style={{ color: 'red', fontWeight: 'bold' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* UPI PAYMENT MODAL */}
      <Modal visible={showUpiModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, alignItems: "center" }]}>
            <Text style={[styles.modalTitle, { color: theme.text, textAlign: "center" }]}>Scan & Pay via UPI</Text>
            <Text style={{ textAlign: "center", color: "#64748b", marginBottom: 10 }}>
              Amount: ₹{total.toFixed(2)}
            </Text>

            <View style={{ alignItems: "center", justifyContent: "center", marginVertical: 15, width: "100%" }}>
              {currentQrMode === "generated" ? (
                shopUpiId ? (
                  <QRCode
                    value={`upi://pay?pa=${shopUpiId}&pn=${encodeURIComponent(shopName)}&am=${total}&cu=INR`}
                    size={180}
                  />
                ) : (
                  <Text style={{ color: "#ef4444", textAlign: "center", fontWeight: "600" }}>
                    UPI ID not configured in Settings!
                  </Text>
                )
              ) : (
                savedSettingsQr ? (
                  <Image
                    source={{ uri: savedSettingsQr }}
                    style={{ width: 180, height: 180, borderRadius: 12 }}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={{ color: "#ef4444", textAlign: "center", fontWeight: "600" }}>
                    Custom QR Image not found in Settings!
                  </Text>
                )
              )}
            </View>

            <TouchableOpacity
              focusable={false}
              style={{ backgroundColor: "#16a34a", padding: 12, borderRadius: 12, alignItems: "center", marginTop: 10, width: "100%" }}
              onPress={triggerUpiSuccessAnimation}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>I have received payment ✓</Text>
            </TouchableOpacity>

            <TouchableOpacity
              focusable={false}
              style={{ alignItems: "center", width: "100%", marginTop: 12 }}
              onPress={() => { setShowUpiModal(false); focusGunScanner(); }}
            >
              <Text style={{ color: "#ef4444", fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f4f5" },
  gunListenerWrapper: {
    position: 'absolute',
    top: -200,
    left: -200,
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  gunHiddenInput: {
    width: 1,
    height: 1,
    opacity: 0,
    padding: 0,
    margin: 0,
  },
  topWhiteHeader: { height: 60, width: '100%', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', elevation: 2, marginTop: Platform.OS === "android" ? StatusBar.currentHeight || 24 : 0 },
  shopBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef2ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, maxWidth: '60%' },
  shopNameText: { fontSize: 16, fontWeight: '800', color: '#6366f1', marginLeft: 6 },
  headerIconBtn: { padding: 8, marginLeft: 6, backgroundColor: '#f1f5f9', borderRadius: 20, position: 'relative' },
  badgeContainer: { position: 'absolute', top: 2, right: 2, backgroundColor: '#ef4444', minWidth: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  // Responsive Layout
  mainLayout: { flex: 1, flexDirection: 'column' },
  landscapeMainLayout: { flexDirection: 'row', padding: 10, gap: 14 },
  
  // Left: Camera Section Width reduced clearly to 0.52 (small camera)
  leftSection: { width: '100%' },
  landscapeLeftSection: { flex: 0.52, height: '100%', justifyContent: 'flex-start' },

  cameraOuterWrapper: { height: 260, width: "100%", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: "#ffffff" },
  landscapeCameraWrapper: { height: 175, flex: 0, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  cameraFrameContainer: { flex: 1, overflow: "hidden", backgroundColor: '#000', borderRadius: 20, elevation: 4 },
  cameraControlRow: { position: 'absolute', top: 10, right: 10, zIndex: 10, flexDirection: 'row' },
  actionCircleBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', marginLeft: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scanRow: { flexDirection: "row", alignItems: "center", justifyContent: 'center', padding: 0,paddingTop:40, },
  salesScanBox: { width: '80%', height: 140, justifyContent: "center", alignItems: "center", backgroundColor: 'transparent', borderRadius: 16, marginTop: 15 },
  tabletSalesScanBox: { width: "90%", height: 105, marginTop: 10 },
  corner: { position: "absolute", width: 20, height: 20, borderColor: "#22c55e" },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 },
  scanText: { color: "#22c55e", marginTop: 4, fontSize: 13, fontWeight: "700", textAlign: 'center' },

  // Search row: Gap and spacing
  searchRowContainer: { flexDirection: "row", alignItems: "center", paddingTop: 14, paddingBottom: 6, borderRadius: 12 },

  // Right: Scanned Items Box Width increased clearly to 1.48 (wide box)
  bottomWhiteContainer: { flex: 1, backgroundColor: "#ffffff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, marginTop: 4, elevation: 12 },
  landscapeRightSection: { flex: 1.48, height: '100%', borderRadius: 22, marginTop: 0, elevation: 4, padding: 14 },

  checkoutContainer: { position: "absolute", bottom: 0, width: "100%", height: "55%", backgroundColor: "#fff", borderTopLeftRadius: 35, borderTopRightRadius: 35, padding: 20, elevation: 12 },
  title: { color: "#0f172a", fontSize: 17, marginBottom: 8, fontWeight: "700" },
  itemCard: { position: "relative", backgroundColor: "#f8fafc", borderRadius: 14, padding: 10, marginBottom: 6, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e2e8f0" },
  itemName: { fontSize: 14, fontWeight: "700", color: "#111827" },
  itemSub: { marginTop: 2, fontSize: 12, color: "#64748b" },
  qtyControls: { flexDirection: "row", alignItems: "center", marginHorizontal: 8 },
  qtyBtn: { width: 26, height: 26, borderRadius: 6, backgroundColor: "#6366f1", justifyContent: "center", alignItems: "center" },
  qtyBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  qtyText: { marginHorizontal: 8, fontSize: 15, fontWeight: "700", minWidth: 20, textAlign: "center", color: "#000" },
  amountText: { width: 80, textAlign: "right", fontSize: 14, fontWeight: "bold", color: "#16a34a" },
  total: { color: "#16a34a", fontSize: 26, textAlign: "center", marginVertical: 8, fontWeight: "bold" },
  actionButtonBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 4 },
  holdBtnIcon: { width: 50, height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: '#cbd5e1', backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  payBtnNew: { flex: 1, backgroundColor: "#6366f1", height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  popoverMenu: { position: "absolute", right: 10, top: 40, backgroundColor: "#fff", borderRadius: 12, paddingVertical: 8, minWidth: 130, elevation: 8, zIndex: 999 },
  modalReceiptContainer: { flex: 1, backgroundColor: "#1e293b", paddingTop: 20, paddingBottom: 10 },
  zoomTipText: { color: "#38bdf8", textAlign: "center", fontWeight: "700", marginBottom: 12, fontSize: 13 },
  receiptActionRow: { flexDirection: "row", padding: 15, backgroundColor: "#1e293b", justifyContent: "space-between" },
  recBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: "center", marginHorizontal: 6, elevation: 2 },
  recBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  reviewRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  successOverlayBg: { flex: 1, backgroundColor: "rgba(15,23,42,0.85)", justifyContent: "center", alignItems: "center" },
  successMessageBox: { width: "80%", backgroundColor: "#fff", borderRadius: 24, padding: 30, alignItems: "center", elevation: 15 },
  successIconCircle: { width: 70, height: 70, borderRadius: 35, backgroundColor: "#22c55e", justifyContent: "center", alignItems: "center", marginBottom: 16 },
  successTextTitle: { fontSize: 22, fontWeight: "bold", color: "#0f172a", textAlign: "center" },
  successTextSub: { fontSize: 16, color: "#475569", marginTop: 6, fontWeight: "600" },
  successModeBadge: { marginTop: 14, backgroundColor: "#e2e8f0", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, fontSize: 12, fontWeight: "bold", color: "#475569" },
  payModeBtnStyle: { padding: 12, borderRadius: 10, minWidth: 90, alignItems: 'center', backgroundColor: "#e5e7eb" },
  payModeBtnActive: { backgroundColor: "#16a34a" },
  payModeBtnDisabled: { backgroundColor: "#f3f4f6", opacity: 0.4 },
  payModeText: { fontWeight: '700', color: "#000" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalContent: { width: "90%", maxWidth: 380, borderRadius: 24, padding: 20, alignItems: "center", elevation: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6 },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 4 },

  errorModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  errorCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
  },
  errorIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  errorCardTitle: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  errorCardDesc: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  codeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    marginTop: 16,
    marginBottom: 20,
  },
  codeLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
    marginRight: 6,
  },
  codeValue: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  errorActionRow: {
    width: "100%",
    flexDirection: "row",
  },
  primaryActionBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryActionBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  }
});