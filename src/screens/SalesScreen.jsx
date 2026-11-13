import React, { useEffect, useState, useRef } from "react";
import RazorpayCheckout from "react-native-razorpay";
import { useTheme } from "../theme/ThemeContext";
import bluetoothPrinter from "../utils/bluetoothPrinter";
import RNPrint from "react-native-print";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, Modal, Image, SafeAreaView, StatusBar, Platform, Keyboard, useWindowDimensions, Animated, ActivityIndicator } from "react-native";
import { NativeModules } from "react-native";
import { Camera, useCameraDevice, useCodeScanner, useCameraPermission } from "react-native-vision-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WebView } from "react-native-webview";
import DropDownPicker from 'react-native-dropdown-picker';
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { SvgUri } from "react-native-svg";

import { auth, db } from "../utils/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { getEffectiveProductPrice } from "../utils/pricing";
import { addDoc, serverTimestamp, collection, onSnapshot, doc, updateDoc, getDocs, deleteDoc, setDoc } from "firebase/firestore";
import QRCode from "react-native-qrcode-svg";
import RestaurantSalesBilling from "./restaurant/RestaurantSalesBilling";
import { fetchAndCacheShopType, getCachedShopType, isRestaurantShop } from "../utils/restaurantMode";
import { matchProductSearch } from "../services/hsnService";
import upiPaymentService from "../services/upiPaymentService";
import upiAutoDetectService from "../services/upiAutoDetectService";
import paymentSound from "../utils/paymentSound";

function RetailSalesScreen({ navigation, route }) {
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
  const { hasPermission, requestPermission } = useCameraPermission();
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

  // 🚀 AUTOMATIC UPI PAYMENT STATES
  const [upiStatus, setUpiStatus] = useState("IDLE"); // IDLE, CREATED, WAITING_FOR_PAYMENT, PROCESSING, SUCCESS, FAILED, EXPIRED, CANCELLED
  const [upiSessionId, setUpiSessionId] = useState(null);
  const [upiQrImageUrl, setUpiQrImageUrl] = useState(null);
  const [upiQrCodeId, setUpiQrCodeId] = useState(null);
  const [upiTransactionData, setUpiTransactionData] = useState(null);
  const [upiErrorMessage, setUpiErrorMessage] = useState("");
  const [upiLoading, setUpiLoading] = useState(false);
  const [upiQrImageLoading, setUpiQrImageLoading] = useState(true);
  const [upiTimeRemaining, setUpiTimeRemaining] = useState("15:00");
  const [upiPaymentType, setUpiPaymentType] = useState("DIRECT"); // "RAZORPAY" | "DIRECT"
  const [hasNotificationAccess, setHasNotificationAccess] = useState(true);

  const checkmarkScaleAnim = useRef(new Animated.Value(0)).current;
  const pulseRadarAnim = useRef(new Animated.Value(1)).current;
  const isFinalizingOrderRef = useRef(false);
  const unsubUpiListenerRef = useRef(null);
  const countdownIntervalRef = useRef(null);

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
  const themeContext = useTheme();
  const darkMode = Boolean(themeContext?.darkMode);
  const theme = themeContext?.theme || { background: "#f8fafc", card: "#ffffff", text: "#0f172a" };
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [receiptPaperSize, setReceiptPaperSize] = useState("58mm");
  const [receiptHeader, setReceiptHeader] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("Thank you!");
  const [receiptStoreLogo, setReceiptStoreLogo] = useState(false);
  const [receiptLogoUri, setReceiptLogoUri] = useState(null);
  const [receiptShowQr, setReceiptShowQr] = useState(true);
  const [receiptShowBarcode, setReceiptShowBarcode] = useState(false);
  const [printAutomatically, setPrintAutomatically] = useState(false);
  const [enableReceiptPrinting, setEnableReceiptPrinting] = useState(true);
  const [printerCopies, setPrinterCopies] = useState("1");

  const isFocused = useIsFocused();
  const isCameraActive = Boolean(
    isFocused &&
    isActive &&
    !showReview &&
    !showReceiptModal &&
    !modalVisible &&
    !showHoldModal &&
    !showResumeModal &&
    !showUpiModal &&
    !newCategoryModal
  );

  // =========================================================
  // 🔌 PROFESSIONAL BACKGROUND HARDWARE SCANNER ENGINE
  // =========================================================
  const hiddenScannerRef = useRef(null);
  const [scannerBuffer, setScannerBuffer] = useState("");
  const scanLockRef = useRef(false);
  const lastProcessedSaleTimestampRef = useRef(Date.now());
  const scanDebounceTimerRef = useRef(null);

  const focusGunScanner = () => {
    try {
      hiddenScannerRef.current?.focus();
      Keyboard.dismiss();
    } catch (e) {
      // safe guard
    }
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
    const user = auth?.currentUser;
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

  useEffect(() => {
    if (route?.params?.showReview !== undefined) {
      setShowReview(Boolean(route.params.showReview));
    }
    if (route?.params?.showReceiptModal !== undefined) {
      setShowReceiptModal(Boolean(route.params.showReceiptModal));
    }
    if (route?.params?.showUpiModal !== undefined) {
      setShowUpiModal(Boolean(route.params.showUpiModal));
    }
  }, [route?.params?.showReview, route?.params?.showReceiptModal, route?.params?.showUpiModal]);

  // Real-time Cloud Cart Listener
  useEffect(() => {
    let unsubCart = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubCart) {
        unsubCart();
        unsubCart = null;
      }
      if (!user) {
        setBill([]);
        return;
      }
      const cartRef = doc(db, "users", user.uid, "active_cart", "current");
      unsubCart = onSnapshot(
        cartRef,
        (docSnap) => {
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
        },
        (error) => {
          console.log("Cart onSnapshot listener error:", error);
        }
      );
    });
    return () => {
      if (unsubCart) unsubCart();
      unsubAuth();
    };
  }, []);

  useEffect(() => {
    const loadHeldOrders = async () => {
      try {
        const user = auth?.currentUser;
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
      const user = auth?.currentUser;
      if (!user) return;
      await AsyncStorage.setItem(`held_orders_${user.uid}`, JSON.stringify(orders));
    } catch (err) {
      console.log("Failed to save held orders", err);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      setIsActive(true);
      const user = auth?.currentUser;
      if (!user) return;

      let unsubscribeInventory;
      let unsubscribeCategories;
      let isSubscribed = true;

      const setupListeners = async () => {
        try {
          const savedMode = (await AsyncStorage.getItem("app_mode")) || "local";
          if (!isSubscribed) return;
          setCurrentMode(savedMode);

          const savedQr = await AsyncStorage.getItem(`shop_qr_code_${user.uid}`);
          if (!isSubscribed) return;
          if (savedQr) {
            setSavedSettingsQr(savedQr);
          }

          const savedReceiptLogo = await AsyncStorage.getItem(`receipt_logo_${user.uid}`);
          if (!isSubscribed) return;
          if (savedReceiptLogo) {
            setReceiptLogoUri(savedReceiptLogo);
          }

          const inventoryCollection = savedMode === "global" ? "global_inventory" : "inventory";
          const categoriesCollection = savedMode === "global" ? "global_categories" : "categories";

          unsubscribeInventory = onSnapshot(
            collection(db, "users", user.uid, inventoryCollection),
            (snap) => {
              if (!isSubscribed) return;
              setInventory(snap.docs.map((d) => ({
                id: d.id,
                fromDB: true,
                ...d.data()
              })));
            },
            (err) => {
              console.log("SalesScreen inventory onSnapshot error:", err);
            }
          );

          unsubscribeCategories = onSnapshot(
            collection(db, "users", user.uid, categoriesCollection),
            (snap) => {
              if (!isSubscribed) return;
              const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
              setCategories(data);
              setCategoryItems(data.map(cat => ({ label: cat.name, value: cat.name, id: cat.id })));
            },
            (err) => {
              console.log("SalesScreen categories onSnapshot error:", err);
            }
          );
        } catch (e) {
          console.log("setupListeners error:", e);
        }
      };

      setupListeners();

      return () => {
        isSubscribed = false;
        setIsActive(false);
        if (unsubscribeInventory) unsubscribeInventory();
        if (unsubscribeCategories) unsubscribeCategories();
      };
    }, [])
  );

  useEffect(() => {
    let unsubUserSnap = null;
    const unsub = onAuthStateChanged(
      auth,
      async (user) => {
        if (unsubUserSnap) {
          unsubUserSnap();
          unsubUserSnap = null;
        }
        if (!user) return;

        try {
          const savedReceiptLogo = await AsyncStorage.getItem(`receipt_logo_${user.uid}`);
          if (savedReceiptLogo) {
            setReceiptLogoUri(savedReceiptLogo);
          }
        } catch (e) {
          console.log("Failed reading logo", e);
        }

        const userRef = doc(db, "users", user.uid);
        unsubUserSnap = onSnapshot(
          userRef,
          (snap) => {
            const data = snap.data();
            if (data) {
              setShopName(data.shopName || "MY SHOP");
              if (data.address) setShopAddress(data.address);
              if (data.phone) setShopPhone(data.phone);
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
                if (data.receiptConfig.paperSize) setReceiptPaperSize(data.receiptConfig.paperSize);
                if (data.receiptConfig.showQr !== undefined) setReceiptShowQr(data.receiptConfig.showQr);
              }

              if (data.printerConfig) {
                setPrintAutomatically(data.printerConfig.printAutomatically ?? false);
                setEnableReceiptPrinting(data.printerConfig.enableReceiptPrinting ?? true);
                if (data.printerConfig.paperSize) setReceiptPaperSize(data.printerConfig.paperSize);
                if (data.printerConfig.copies) setPrinterCopies(data.printerConfig.copies);
                if (data.printerConfig.qrCodeOnReceipt !== undefined) setReceiptShowQr(data.printerConfig.qrCodeOnReceipt);
                if (data.printerConfig.barcodeOnReceipt !== undefined) setReceiptShowBarcode(data.printerConfig.barcodeOnReceipt);
              }

              if (!(data.cashEnabled ?? true) && data.upiEnabled) setPaymentMode("UPI");
              else if (!(data.cashEnabled ?? true) && !(data.upiEnabled ?? true) && data.razorpayEnabled) setPaymentMode("RAZORPAY");
            }
          },
          (err) => {
            console.log("User doc onSnapshot error:", err);
          }
        );
      }
    );
    return () => {
      if (unsubUserSnap) unsubUserSnap();
      unsub();
    };
  }, []);

  // 💫 UPI ANIMATIONS
  useEffect(() => {
    let pulseLoop = null;
    if (upiStatus === "WAITING_FOR_PAYMENT" || upiStatus === "PROCESSING") {
      pulseRadarAnim.setValue(1);
      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseRadarAnim, {
            toValue: 1.06,
            duration: 850,
            useNativeDriver: true,
          }),
          Animated.timing(pulseRadarAnim, {
            toValue: 1.0,
            duration: 850,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();
    }
    return () => {
      if (pulseLoop) pulseLoop.stop();
    };
  }, [upiStatus]);

  useEffect(() => {
    if (upiStatus === "SUCCESS") {
      checkmarkScaleAnim.setValue(0);
      Animated.spring(checkmarkScaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 60,
        useNativeDriver: true,
      }).start();
    }
  }, [upiStatus]);

  // Cleanup on screen unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      if (unsubUpiListenerRef.current) {
        unsubUpiListenerRef.current();
      }
    };
  }, []);

  const initiateUpiPayment = async () => {
    const user = auth?.currentUser;
    if (!user) {
      Alert.alert("Authentication Required", "Please log in to initiate payment.");
      return;
    }

    if (total <= 0) {
      Alert.alert("Invalid Amount", "Bill total must be greater than zero.");
      return;
    }

    // Determine Payment Mode:
    // If razorpayEnabled is active AND seller has entered razorpayKeyId -> Automatic Razorpay Dynamic QR
    // Otherwise -> Direct Merchant UPI QR Mode
    const hasRazorpayConfig = Boolean(razorpayEnabled && userRazorpayKeyId && userRazorpayKeyId.trim().length > 0);

    if (hasRazorpayConfig) {
      // 🚀 MODE A: AUTOMATIC RAZORPAY DYNAMIC QR
      setUpiPaymentType("RAZORPAY");
      setPaymentMode("UPI");
      setShowUpiModal(true);
      setUpiStatus("CREATED");
      setUpiErrorMessage("");
      setUpiLoading(true);
      setUpiQrImageLoading(true);
      setUpiQrImageUrl(null);
      setUpiTransactionData(null);
      setUpiTimeRemaining("15:00");

      if (unsubUpiListenerRef.current) {
        unsubUpiListenerRef.current();
        unsubUpiListenerRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      try {
        const result = await upiPaymentService.createUpiPaymentSession({
          sellerUid: user.uid,
          amount: total,
          shopName: shopName || "Shop POS",
        });

        setUpiSessionId(result.sessionId);
        setUpiQrImageUrl(result.qrImageUrl);
        setUpiQrCodeId(result.qrCodeId);
        setUpiStatus("WAITING_FOR_PAYMENT");
        setUpiLoading(false);

        // Start countdown timer
        const expiresAtMs = result.expiresAt ? new Date(result.expiresAt).getTime() : (Date.now() + 15 * 60 * 1000);
        countdownIntervalRef.current = setInterval(() => {
          const remainingMs = expiresAtMs - Date.now();
          if (remainingMs <= 0) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
            setUpiStatus("EXPIRED");
          } else {
            const mins = Math.floor(remainingMs / 60000);
            const secs = Math.floor((remainingMs % 60000) / 1000);
            setUpiTimeRemaining(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
          }
        }, 1000);

        // Realtime listener for webhook updates
        unsubUpiListenerRef.current = upiPaymentService.listenToPaymentSession(
          user.uid,
          result.sessionId,
          (sessionData) => {
            handleUpiSessionUpdate(sessionData, result.sessionId, result.qrCodeId);
          },
          (listenerErr) => {
            console.warn("[SalesScreen] UPI session listener error:", listenerErr);
          }
        );

      } catch (err) {
        console.error("[SalesScreen] UPI QR Generation Error:", err);
        setUpiLoading(false);
        setUpiStatus("FAILED");
        setUpiErrorMessage(err.message || "Failed to generate dynamic UPI QR. Please try again.");
      }
    } else {
      // 📱 MODE B: DIRECT MERCHANT UPI QR MODE
      // Check if merchant has shopUpiId or savedSettingsQr configured
      const hasUpiConfig = Boolean(
        (shopUpiId && shopUpiId.trim().length > 0) ||
        (savedSettingsQr && savedSettingsQr.length > 0)
      );

      if (!hasUpiConfig) {
        Alert.alert(
          "UPI Details Missing",
          "Please configure your Shop UPI ID (e.g. yourname@okaxis) or upload a custom QR in Settings > Payment Methods.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => navigation.navigate("Settings") }
          ]
        );
        return;
      }

      if (unsubUpiListenerRef.current) {
        unsubUpiListenerRef.current();
        unsubUpiListenerRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      setUpiPaymentType("DIRECT");
      setPaymentMode("UPI");
      setShowUpiModal(true);
      setUpiStatus("WAITING_FOR_PAYMENT");
      setUpiErrorMessage("");
      setUpiLoading(false);
      setUpiQrImageLoading(false);
      setUpiQrImageUrl(null);
      setUpiTransactionData(null);

      // Check notification access on Android
      upiAutoDetectService.isAccessGranted().then((granted) => {
        setHasNotificationAccess(granted);
      });

      // ⚡ Start Automatic UPI Payment Detection (PhonePe, Google Pay, Paytm, BHIM, Bank SMS)
      upiAutoDetectService.startListening(total, user.uid, (paymentData) => {
        handleDirectUpiAutoSuccess(paymentData);
      });
    }
  };

  const handleDirectUpiAutoSuccess = async (paymentData) => {
    if (upiStatus === "SUCCESS" || isFinalizingOrderRef.current) return;

    setUpiStatus("SUCCESS");
    const directRef = paymentData?.transactionReference || ("UPI-AUTO-" + Date.now().toString().slice(-8));
    const transactionData = {
      paymentProvider: "DIRECT_UPI",
      detectedBy: paymentData?.detectedBy || "Automatic UPI Notification",
      transactionReference: directRef,
      upiId: shopUpiId || "",
      amount: paymentData?.amount || total,
      sender: paymentData?.sender || "",
      paidAt: paymentData?.paidAt || new Date().toISOString(),
    };
    setUpiTransactionData(transactionData);

    // 🔊 Play verified native payment success chime
    paymentSound.playPaymentSuccessSound(directRef);

    // Smooth checkmark scale animation
    checkmarkScaleAnim.setValue(0);
    Animated.spring(checkmarkScaleAnim, {
      toValue: 1,
      tension: 60,
      friction: 6,
      useNativeDriver: true,
    }).start();

    // Automatically finalize sale and transition to receipt modal
    setTimeout(async () => {
      setShowUpiModal(false);
      setUpiStatus("IDLE");
      await finalizeOrder("UPI", transactionData);
    }, 2000);
  };

  const handleUpiSessionUpdate = async (sessionData, sessionId, qrCodeId) => {
    if (!sessionData) return;

    if (sessionData.status === "PROCESSING") {
      setUpiStatus("PROCESSING");
    } else if (sessionData.status === "FAILED") {
      setUpiStatus("FAILED");
      setUpiErrorMessage(sessionData.failureReason || "Payment verification failed.");
    } else if (sessionData.status === "EXPIRED") {
      setUpiStatus("EXPIRED");
    } else if (sessionData.status === "SUCCESS") {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      setUpiStatus("SUCCESS");
      setUpiTransactionData(sessionData);

      // 🔊 Play verified payment success chime once
      const paymentRef = sessionData.paymentId || sessionData.transactionReference || sessionId;
      paymentSound.playPaymentSuccessSound(paymentRef);

      // Automatically finalize sale and transition to receipt
      setTimeout(async () => {
        if (unsubUpiListenerRef.current) {
          unsubUpiListenerRef.current();
          unsubUpiListenerRef.current = null;
        }
        setShowUpiModal(false);
        await finalizeOrder("UPI", {
          ...sessionData,
          sessionId,
          qrCodeId,
        });
      }, 2200);
    }
  };

  const handleCancelUpiModal = async () => {
    upiAutoDetectService.stopListening();
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (unsubUpiListenerRef.current) {
      unsubUpiListenerRef.current();
      unsubUpiListenerRef.current = null;
    }
    if (upiSessionId && auth?.currentUser?.uid && upiStatus === "WAITING_FOR_PAYMENT") {
      upiPaymentService.cancelUpiPaymentSession(auth.currentUser.uid, upiSessionId).catch(() => {});
    }
    setShowUpiModal(false);
    setUpiStatus("IDLE");
    focusGunScanner();
  };

  const handleManualStatusCheck = async () => {
    if (!upiSessionId || !auth?.currentUser?.uid) return;
    setUpiLoading(true);
    try {
      const res = await upiPaymentService.checkUpiPaymentStatus(auth.currentUser.uid, upiSessionId);
      if (res && res.status === "SUCCESS") {
        handleUpiSessionUpdate(res, upiSessionId, upiQrCodeId);
      } else if (res && res.status === "EXPIRED") {
        setUpiStatus("EXPIRED");
      } else {
        Alert.alert("Payment Status", "Waiting for payment. Please ensure customer has completed payment in their UPI app.");
      }
    } catch (err) {
      Alert.alert("Status Check", err.message || "Could not check status right now. Listening for webhook...");
    } finally {
      setUpiLoading(false);
    }
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
        email: auth?.currentUser?.email || 'test@example.com',
        contact: '',
        name: auth?.currentUser?.displayName || 'Merchant Customer'
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

  const finalizeOrder = async (payId = "CASH_OR_OTHER", paymentDetails = null) => {
    if (isFinalizingOrderRef.current) {
      console.log("[finalizeOrder] Order already finalizing, preventing duplicate execution.");
      return;
    }
    isFinalizingOrderRef.current = true;

    try {
      const user = auth?.currentUser;
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

      const subtotal = bill.reduce((sum, i) => sum + (Number(i.salesPrice || i.price || 0) * i.qty), 0);
      const taxTotal = gstEnabled ? bill.reduce((sum, i) => {
        const itemTaxRate = Number(i.taxPercent || gstPercentage || 0);
        return sum + ((Number(i.salesPrice || i.price || 0) * i.qty) * (itemTaxRate / 100));
      }, 0) : 0;

      const finalOrderTotal = subtotal + taxTotal;
      const totalProfit = bill.reduce((sum, i) => sum + (Number(i.salesPrice || i.price || 0) - Number(i.purchasePrice || 0)) * i.qty, 0);

      const saleRecord = {
        billNo: bNo,
        invoiceId: bNo,
        billDate: bDate,
        items: bill,
        total: finalOrderTotal,
        profit: totalProfit,
        paymentMode: paymentMode || "CASH",
        isGlobalMode: currentMode === "global",
        createdAt: serverTimestamp()
      };

      if (paymentMode === "UPI" && paymentDetails) {
        saleRecord.paymentStatus = "SUCCESS";
        saleRecord.paymentProvider = paymentDetails.paymentProvider || "RAZORPAY";
        saleRecord.paymentId = paymentDetails.paymentId || payId;
        saleRecord.orderId = paymentDetails.sessionId || paymentDetails.orderId || "";
        saleRecord.qrCodeId = paymentDetails.qrCodeId || "";
        saleRecord.transactionReference = paymentDetails.transactionReference || paymentDetails.paymentId || payId;
        saleRecord.amount = finalOrderTotal;
        saleRecord.currency = "INR";
        saleRecord.verifiedAt = serverTimestamp();
        if (paymentDetails.upiId) {
          saleRecord.upiId = paymentDetails.upiId;
        }
        if (paymentDetails.vpa || paymentDetails.customerVpa) {
          saleRecord.customerVpa = paymentDetails.vpa || paymentDetails.customerVpa;
        }
      } else if (paymentMode === "RAZORPAY") {
        saleRecord.paymentStatus = "SUCCESS";
        saleRecord.paymentProvider = "RAZORPAY";
        saleRecord.razorpayPaymentId = payId;
        saleRecord.amount = finalOrderTotal;
        saleRecord.currency = "INR";
      } else {
        saleRecord.paymentStatus = "SUCCESS";
        saleRecord.paymentProvider = "CASH";
        saleRecord.razorpayPaymentId = payId;
      }

      await addDoc(collection(db, "users", user.uid, "sales"), saleRecord);

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

      if (printAutomatically && enableReceiptPrinting) {
        triggerThermalPrint(bNo, bDate, [...bill], finalOrderTotal);
      }

    } catch (err) {
      Alert.alert("Save failed", err.message);
    } finally {
      isFinalizingOrderRef.current = false;
    }
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        if (typeof Camera?.getCameraPermissionStatus === "function") {
          const status = await Camera.getCameraPermissionStatus();
          if (status !== "granted" && typeof Camera?.requestCameraPermission === "function") {
            await Camera.requestCameraPermission();
          }
        } else if (!hasPermission && typeof requestPermission === "function") {
          await requestPermission();
        }
      } catch (error) {
        console.log("SalesScreen camera permission error:", error);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const inventoryCollection = currentMode === "global" ? "global_inventory" : "inventory";

  const addToBill = async (item) => {
    if (item.quantity <= 0) return Alert.alert("Out of stock");

    const pricing = getEffectiveProductPrice(item);
    const effectivePrice = pricing.valid ? pricing.effectivePrice : Number(item.salesPrice || item.price || 0);

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
        price: effectivePrice,
        salesPrice: effectivePrice,
        originalSalesPrice: pricing.valid ? pricing.originalPrice : Number(item.originalSalesPrice ?? item.salesPrice ?? item.price ?? 0),
        discountValue: pricing.valid && pricing.hasDiscount ? pricing.discountValue : 0,
        discountType: pricing.valid && pricing.hasDiscount ? pricing.discountType : "percent",
        discountAmount: pricing.valid && pricing.hasDiscount ? pricing.discountAmount : 0,
        purchasePrice: Number(item.purchasePrice ?? 0),
        taxPercent: item.taxPercent || gstPercentage || 0
      }];
    }

    setBill(updatedBill);
    await syncToCloudCart(updatedBill);

    const user = auth?.currentUser;
    if (user?.uid && item.id && item.id.length > 10) {
      try {
        await updateDoc(doc(db, "users", user.uid, inventoryCollection, item.id), { quantity: item.quantity - 1 });
      } catch (err) {
        console.log("Failed to update inventory quantity in addToBill:", err);
      }
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

    const user = auth?.currentUser;
    if (user?.uid && item.id && item.id.length > 10) {
      try {
        await updateDoc(doc(db, "users", user.uid, inventoryCollection, item.id), { quantity: item.quantity + 1 });
      } catch (err) {
        console.log("Failed to update inventory quantity in decreaseQty:", err);
      }
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
          const user = auth?.currentUser;
          if (user?.uid && item.id && item.id.length > 10) {
            try {
              await updateDoc(doc(db, "users", user.uid, inventoryCollection, item.id), { quantity: item.quantity + item.qty });
            } catch (err) {
              console.log("Failed to update inventory quantity in removeItem:", err);
            }
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
      const user = auth?.currentUser;
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

  const triggerThermalPrint = async (bNo, bDate, explicitBill, explicitTotal) => {
    try {
      const billItems = (explicitBill && explicitBill.length > 0) ? explicitBill : receiptBill;
      const finalTotal = explicitTotal !== undefined ? explicitTotal : receiptTotal;
      const billNumber = bNo || currentBillNo;
      const billDateStr = bDate || currentBillDate;

      const itemsToPrint = billItems.map((item) => {
        const itemPrice = Number(item.salesPrice || item.price || 0);
        const itemQty = Number(item.qty || 1);
        return {
          name: item.itemName || item.name || "Item",
          qty: itemQty,
          price: itemPrice,
          total: itemPrice * itemQty,
        };
      });

      const qrPayload = shopUpiId
        ? `upi://pay?pa=${shopUpiId}&pn=${encodeURIComponent(shopName || "Shop")}&am=${finalTotal}&cu=INR`
        : "";

      await bluetoothPrinter.printReceipt({
        shopName: shopName || "MY SHOP",
        address: shopAddress || "",
        phone: shopPhone || "",
        billNo: billNumber,
        date: billDateStr,
        gstNumber: gstEnabled ? gstNumber : "",
        header: receiptHeader || "",
        footer: receiptFooter || "Thank you for your business!",
        items: itemsToPrint,
        subtotal: finalTotal,
        total: finalTotal,
        paymentMode: paymentMode || "CASH",
        showQr: receiptShowQr && !!qrPayload,
        qrData: qrPayload,
        qrCodeData: qrPayload,
        showBarcode: receiptShowBarcode,
        paperSize: receiptPaperSize || "58mm",
        copies: parseInt(printerCopies, 10) || 1,
      });
      return;
    } catch (err) {
      console.log("Bluetooth print fallback to system print:", err);
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
      try {
        ScanBeep?.beep?.();
        await addToBill(item);
        setShowScanToast(true);
        setTimeout(() => {
          setShowScanToast(false);
          scanLockRef.current = false;
          focusGunScanner();
        }, 1200);
      } catch (err) {
        console.log("Error adding scanned item:", err);
        scanLockRef.current = false;
      }
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
    codeTypes: Platform.OS === "ios"
      ? ["ean-13", "qr", "ean-8"]
      : ["ean-13", "qr", "ean-8", "upc-a"],
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

  const filteredInventory = inventory.filter(i => matchProductSearch(i, search));

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
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
          <TouchableOpacity 
            focusable={false}
            onPress={() => {
              if (navigation?.canGoBack?.()) {
                navigation.goBack();
              } else {
                navigation.navigate("Dashboard");
              }
            }}
            style={[styles.headerBackBtn, { backgroundColor: darkMode ? '#1e293b' : '#f1f5f9' }]}
            activeOpacity={0.7}
          >
            <Icon name="arrow-left" size={22} color={theme.text} />
          </TouchableOpacity>
          <View style={[styles.shopBadge, { backgroundColor: darkMode ? '#1e293b' : '#eef2ff' }]}>
            <Icon name="storefront" size={20} color="#16a34a" />
            <Text style={[styles.shopNameText, { color: darkMode ? '#f8fafc' : '#6366f1' }]} numberOfLines={1}>{shopName}</Text>
          </View>
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
              {device && hasPermission && isCameraActive ? (
                <Camera
                  style={StyleSheet.absoluteFill}
                  device={device}
                  isActive={isCameraActive}
                  codeScanner={codeScanner}
                  torch={device?.hasTorch && torch === "on" ? "on" : "off"}
                  onError={(error) => console.log("Camera runtime error:", error)}
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center" }]}>
                  <Icon name={!hasPermission ? "camera-off" : "camera-outline"} size={40} color="#64748b" />
                  <Text style={{ color: "#94a3b8", fontSize: 12, marginTop: 8 }}>
                    {!hasPermission ? "Camera permission required" : "Camera paused"}
                  </Text>
                </View>
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
              onPress={() => { if (upiEnabled) { initiateUpiPayment(); } }}
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
                  const pricing = getEffectiveProductPrice(item);
                  const effectivePrice = pricing.valid ? pricing.effectivePrice : Number(item.salesPrice || item.price || 0);
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
                        <Text style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Stock: {item.quantity} | {pricing.valid && pricing.hasDiscount ? <><Text style={{ textDecorationLine: "line-through", color: "#94a3b8" }}>₹{pricing.originalPrice.toFixed(2)}</Text><Text> </Text></> : null}<Text style={{ color: "#16a34a", fontWeight: "bold" }}>₹{effectivePrice.toFixed(2)}</Text>{pricing.valid && pricing.hasDiscount ? <Text style={{ color: "#16a34a", fontWeight: "700" }}> {pricing.discountType === "percent" ? `(${pricing.discountValue}% off)` : `(₹${pricing.discountAmount.toFixed(2)} off)`}</Text> : null}</Text>
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

      {/* PROFESSIONAL AUTOMATIC UPI PAYMENT MODAL */}
      <Modal visible={showUpiModal} transparent={true} animationType="fade" onRequestClose={handleCancelUpiModal}>
        <View style={styles.upiModalOverlay}>
          <View style={[styles.upiModalCard, { backgroundColor: theme.card }]}>

            {/* HEADER: Shop Badge & Close */}
            <View style={styles.upiModalHeader}>
              <View style={[styles.upiShopBadge, { backgroundColor: darkMode ? "#1e293b" : "#eef2ff" }]}>
                <Icon name="storefront" size={16} color="#16a34a" />
                <Text style={[styles.upiShopName, { color: darkMode ? "#f8fafc" : "#4338ca" }]} numberOfLines={1}>
                  {shopName}
                </Text>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {upiPaymentType === "DIRECT" && (
                  <View style={styles.upiModeTag}>
                    <Icon name="qrcode-scan" size={12} color="#059669" />
                    <Text style={styles.upiModeTagText}>Direct UPI</Text>
                  </View>
                )}
                {upiStatus !== "SUCCESS" && (
                  <TouchableOpacity focusable={false} onPress={handleCancelUpiModal} style={styles.upiCloseBtn}>
                    <Icon name="close" size={20} color={theme.text} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* WAITING / CREATED / PROCESSING STATE */}
            {(upiStatus === "WAITING_FOR_PAYMENT" || upiStatus === "CREATED" || upiStatus === "PROCESSING") && (
              <View style={styles.upiBodyContainer}>
                <Text style={[styles.upiAmountLabel, { color: theme.text }]}>Total Payable Amount</Text>
                <Text style={styles.upiAmountValue}>₹ {total.toFixed(2)}</Text>

                {/* QR Code Container */}
                <View style={[styles.upiQrBox, { backgroundColor: "#ffffff", borderColor: darkMode ? "#334155" : "#e2e8f0" }]}>
                  {upiPaymentType === "DIRECT" ? (
                    currentQrMode === "custom" && savedSettingsQr ? (
                      <Image
                        source={{ uri: savedSettingsQr }}
                        style={{ width: 190, height: 190 }}
                        resizeMode="contain"
                      />
                    ) : shopUpiId ? (
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onLongPress={() => upiAutoDetectService.simulateTestPayment(total, "Google Pay")}
                        delayLongPress={1200}
                      >
                        <QRCode
                          value={`upi://pay?pa=${shopUpiId}&pn=${encodeURIComponent(shopName)}&am=${total.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Bill Payment')}`}
                          size={190}
                        />
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.upiQrLoaderContainer}>
                        <Icon name="alert-circle-outline" size={36} color="#ef4444" />
                        <Text style={[styles.upiQrLoaderText, { color: "#ef4444" }]}>UPI ID not configured</Text>
                      </View>
                    )
                  ) : upiLoading || !upiQrImageUrl ? (
                    <View style={styles.upiQrLoaderContainer}>
                      <ActivityIndicator size="large" color="#6366f1" />
                      <Text style={styles.upiQrLoaderText}>Generating Dynamic UPI QR...</Text>
                    </View>
                  ) : (
                    <View style={styles.upiQrImageWrapper}>
                      {upiQrImageUrl.toLowerCase().includes(".svg") ? (
                        <SvgUri
                          width={190}
                          height={190}
                          uri={upiQrImageUrl}
                          onLoad={() => setUpiQrImageLoading(false)}
                        />
                      ) : (
                        <Image
                          source={{ uri: upiQrImageUrl }}
                          style={{ width: 190, height: 190 }}
                          resizeMode="contain"
                          onLoadEnd={() => setUpiQrImageLoading(false)}
                        />
                      )}
                      {upiQrImageLoading && (
                        <View style={styles.upiImageSpinnerOverlay}>
                          <ActivityIndicator size="small" color="#6366f1" />
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {/* Shop Merchant UPI ID Badge */}
                {shopUpiId ? (
                  <View style={[styles.upiIdBadge, { backgroundColor: darkMode ? "#1e293b" : "#f0fdf4" }]}>
                    <Icon name="bank-outline" size={14} color="#16a34a" />
                    <Text style={[styles.upiIdBadgeText, { color: darkMode ? "#94a3b8" : "#475569" }]}>
                      UPI ID: <Text style={{ fontWeight: "700", color: darkMode ? "#f8fafc" : "#0f172a" }}>{shopUpiId}</Text>
                    </Text>
                  </View>
                ) : null}

                {/* Live Status Indicator */}
                <Animated.View style={[styles.upiStatusBadge, { transform: [{ scale: pulseRadarAnim }] }]}>
                  <View style={styles.upiGreenPulseDot} />
                  <Text style={styles.upiStatusBadgeText}>
                    {upiPaymentType === "DIRECT"
                      ? "Awaiting Customer Payment..."
                      : (upiStatus === "PROCESSING" ? "Verifying Payment..." : "Waiting for payment...")}
                  </Text>
                </Animated.View>

                <Text style={styles.upiScanInstruction}>
                  Scan using Google Pay, PhonePe, Paytm or any UPI App
                </Text>

                {/* UPI Supported Apps Pills */}
                <View style={styles.upiAppsRow}>
                  <View style={styles.upiAppPill}><Text style={styles.upiAppPillText}>Google Pay</Text></View>
                  <View style={styles.upiAppPill}><Text style={styles.upiAppPillText}>PhonePe</Text></View>
                  <View style={styles.upiAppPill}><Text style={styles.upiAppPillText}>Paytm</Text></View>
                  <View style={styles.upiAppPill}><Text style={styles.upiAppPillText}>BHIM</Text></View>
                </View>

                {/* Direct UPI Mode -> Automatic Confirmation Indicator */}
                {upiPaymentType === "DIRECT" ? (
                  <View style={{ width: "100%", alignItems: "center", marginTop: 12 }}>
                    <View style={[styles.upiAutoListeningBadge, { backgroundColor: darkMode ? "#1e293b" : "#f0fdf4" }]}>
                      <View style={styles.upiGreenPulseDot} />
                      <Text style={[styles.upiAutoListeningText, { color: darkMode ? "#86efac" : "#16a34a" }]}>
                        Auto-detect active • PhonePe, GPay, Paytm & SMS
                      </Text>
                    </View>

                    {!hasNotificationAccess && Platform.OS === "android" && (
                      <TouchableOpacity
                        focusable={false}
                        activeOpacity={0.8}
                        onPress={() => upiAutoDetectService.openAccessSettings()}
                        style={styles.upiPermissionNotice}
                      >
                        <Icon name="bell-ring-outline" size={14} color="#d97706" style={{ marginRight: 6 }} />
                        <Text style={styles.upiPermissionNoticeText}>
                          Tap to allow notification access for auto-detection
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity focusable={false} onPress={handleCancelUpiModal} style={styles.upiCancelBtn}>
                      <Text style={styles.upiCancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    {/* Timer & Reconcile Row for Razorpay Mode */}
                    <View style={styles.upiFooterRow}>
                      <View style={styles.upiTimerContainer}>
                        <Icon name="clock-outline" size={14} color="#64748b" />
                        <Text style={styles.upiTimerText}>Expires in: {upiTimeRemaining}</Text>
                      </View>
                      <TouchableOpacity focusable={false} onPress={handleManualStatusCheck} style={styles.upiCheckStatusBtn}>
                        <Icon name="refresh" size={14} color="#6366f1" />
                        <Text style={styles.upiCheckStatusText}>Check Status</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity focusable={false} onPress={handleCancelUpiModal} style={styles.upiCancelBtn}>
                      <Text style={styles.upiCancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {/* SUCCESS STATE - WITH ANIMATED GREEN TICK */}
            {upiStatus === "SUCCESS" && (
              <View style={styles.upiSuccessContainer}>
                <Animated.View style={[styles.upiSuccessCheckmarkOuter, { transform: [{ scale: checkmarkScaleAnim }] }]}>
                  <View style={styles.upiSuccessCheckmarkInner}>
                    <Icon name="check-bold" size={44} color="#ffffff" />
                  </View>
                </Animated.View>

                <Text style={[styles.upiSuccessTitle, { color: theme.text }]}>Payment Received! 🎉</Text>
                <Text style={styles.upiSuccessSubtitle}>
                  {upiPaymentType === "DIRECT" ? "Direct Merchant UPI Payment" : "Verified by Razorpay UPI"}
                </Text>

                <View style={[styles.upiSuccessCard, { backgroundColor: darkMode ? "#1e293b" : "#f1f5f9" }]}>
                  <View style={styles.upiSuccessDetailRow}>
                    <Text style={styles.upiSuccessDetailLabel}>Amount Received</Text>
                    <Text style={styles.upiSuccessDetailAmount}>₹ {total.toFixed(2)}</Text>
                  </View>
                  {upiTransactionData?.transactionReference ? (
                    <View style={styles.upiSuccessDetailRow}>
                      <Text style={styles.upiSuccessDetailLabel}>Ref / RRN</Text>
                      <Text style={[styles.upiSuccessDetailValue, { color: theme.text }]}>
                        {upiTransactionData.transactionReference}
                      </Text>
                    </View>
                  ) : null}
                  {upiTransactionData?.upiId ? (
                    <View style={styles.upiSuccessDetailRow}>
                      <Text style={styles.upiSuccessDetailLabel}>Merchant UPI</Text>
                      <Text style={[styles.upiSuccessDetailValue, { color: theme.text }]}>
                        {upiTransactionData.upiId}
                      </Text>
                    </View>
                  ) : null}
                  {upiTransactionData?.paymentId ? (
                    <View style={styles.upiSuccessDetailRow}>
                      <Text style={styles.upiSuccessDetailLabel}>Payment ID</Text>
                      <Text style={[styles.upiSuccessDetailValue, { color: theme.text }]}>
                        {upiTransactionData.paymentId}
                      </Text>
                    </View>
                  ) : null}
                  {upiTransactionData?.vpa ? (
                    <View style={styles.upiSuccessDetailRow}>
                      <Text style={styles.upiSuccessDetailLabel}>Customer VPA</Text>
                      <Text style={[styles.upiSuccessDetailValue, { color: theme.text }]}>
                        {upiTransactionData.vpa}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.upiAutoFinalizeNote}>
                  <ActivityIndicator size="small" color="#16a34a" style={{ marginRight: 8 }} />
                  <Text style={styles.upiAutoFinalizeText}>Generating receipt and completing order...</Text>
                </View>
              </View>
            )}

            {/* FAILED / EXPIRED STATE */}
            {(upiStatus === "FAILED" || upiStatus === "EXPIRED") && (
              <View style={styles.upiErrorContainer}>
                <View style={styles.upiErrorIconCircle}>
                  <Icon name={upiStatus === "EXPIRED" ? "timer-sand" : "alert-circle-outline"} size={42} color="#ef4444" />
                </View>

                <Text style={[styles.upiErrorTitle, { color: theme.text }]}>
                  {upiStatus === "EXPIRED" ? "Payment QR Expired" : "Payment Verification Failed"}
                </Text>

                <Text style={styles.upiErrorDesc}>
                  {upiErrorMessage || (upiStatus === "EXPIRED" ? "This QR code timed out for security. Please generate a new QR." : "Payment could not be verified.")}
                </Text>

                <TouchableOpacity focusable={false} onPress={initiateUpiPayment} style={styles.upiRetryBtn}>
                  <Icon name="refresh" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.upiRetryBtnText}>Generate New QR</Text>
                </TouchableOpacity>

                <TouchableOpacity focusable={false} onPress={handleCancelUpiModal} style={styles.upiCancelBtn}>
                  <Text style={styles.upiCancelBtnText}>Return to Checkout</Text>
                </TouchableOpacity>
              </View>
            )}

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
  headerBackBtn: { padding: 8, marginRight: 8, borderRadius: 20 },
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
  },

  // 🚀 AUTOMATIC UPI PAYMENT MODAL STYLES
  upiModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  upiModalCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 28,
    padding: 22,
    alignItems: "center",
    elevation: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
  },
  upiModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 10,
  },
  upiShopBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    maxWidth: "80%",
  },
  upiShopName: {
    fontSize: 14,
    fontWeight: "800",
    marginLeft: 6,
  },
  upiCloseBtn: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: "rgba(100, 116, 139, 0.12)",
  },
  upiBodyContainer: {
    alignItems: "center",
    width: "100%",
  },
  upiAmountLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  upiAmountValue: {
    fontSize: 32,
    fontWeight: "900",
    color: "#16a34a",
    marginVertical: 4,
  },
  upiQrBox: {
    width: 220,
    height: 220,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    marginVertical: 10,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    overflow: "hidden",
  },
  upiQrLoaderContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  upiQrLoaderText: {
    marginTop: 10,
    fontSize: 12,
    color: "#6366f1",
    fontWeight: "600",
    textAlign: "center",
  },
  upiQrImageWrapper: {
    width: 190,
    height: 190,
    justifyContent: "center",
    alignItems: "center",
  },
  upiImageSpinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  upiStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 163, 74, 0.12)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 6,
  },
  upiGreenPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#16a34a",
    marginRight: 8,
  },
  upiStatusBadgeText: {
    color: "#16a34a",
    fontWeight: "700",
    fontSize: 12,
  },
  upiScanInstruction: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
    fontWeight: "500",
  },
  upiAppsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
    marginBottom: 8,
  },
  upiAppPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(99, 102, 241, 0.08)",
  },
  upiAppPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#4f46e5",
  },
  upiFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(100, 116, 139, 0.15)",
  },
  upiTimerContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  upiTimerText: {
    fontSize: 12,
    color: "#64748b",
    marginLeft: 4,
    fontWeight: "600",
  },
  upiCheckStatusBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "rgba(99, 102, 241, 0.08)",
  },
  upiCheckStatusText: {
    fontSize: 12,
    color: "#6366f1",
    fontWeight: "700",
    marginLeft: 4,
  },
  upiCancelBtn: {
    marginTop: 10,
    paddingVertical: 10,
    width: "100%",
    alignItems: "center",
  },
  upiCancelBtnText: {
    color: "#ef4444",
    fontWeight: "700",
    fontSize: 14,
  },
  upiAutoListeningBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(22, 163, 74, 0.25)",
  },
  upiAutoListeningText: {
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 6,
  },
  upiPermissionNotice: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(217, 119, 6, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "rgba(217, 119, 6, 0.3)",
  },
  upiPermissionNoticeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#d97706",
    flex: 1,
  },
  upiIdBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.2)",
  },
  upiIdBadgeText: {
    fontSize: 12,
    marginLeft: 6,
  },
  upiModeTag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
  },
  upiModeTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
    marginLeft: 4,
  },

  // SUCCESS ANIMATION STYLES
  upiSuccessContainer: {
    alignItems: "center",
    width: "100%",
    paddingVertical: 12,
  },
  upiSuccessCheckmarkOuter: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#dcfce7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  upiSuccessCheckmarkInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#16a34a",
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#16a34a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  upiSuccessTitle: {
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  upiSuccessSubtitle: {
    fontSize: 13,
    color: "#16a34a",
    fontWeight: "700",
    marginTop: 2,
    marginBottom: 14,
  },
  upiSuccessCard: {
    width: "100%",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  upiSuccessDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 3,
  },
  upiSuccessDetailLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
  },
  upiSuccessDetailAmount: {
    fontSize: 16,
    fontWeight: "800",
    color: "#16a34a",
  },
  upiSuccessDetailValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  upiAutoFinalizeNote: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  upiAutoFinalizeText: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
  },

  // ERROR STYLES
  upiErrorContainer: {
    alignItems: "center",
    width: "100%",
    paddingVertical: 12,
  },
  upiErrorIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#fee2e2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  upiErrorTitle: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
  },
  upiErrorDesc: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  upiRetryBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#6366f1",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    width: "100%",
    justifyContent: "center",
  },
  upiRetryBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  }
});

export default function SalesScreen(props) {
  const routeRest = Boolean(props.route?.params?.isRestaurant);
  const [isRestaurant, setIsRestaurant] = useState(routeRest);
  const [loading, setLoading] = useState(!routeRest);

  useEffect(() => {
    let active = true;
    const checkMode = async () => {
      try {
        const user = auth?.currentUser;
        if (!user) {
          if (active) setLoading(false);
          return;
        }
        const cached = await getCachedShopType(user.uid);
        if (cached && active) {
          setIsRestaurant(isRestaurantShop(cached));
          setLoading(false);
        }
        const { isRestaurant: isRest } = await fetchAndCacheShopType(user.uid);
        if (active) {
          setIsRestaurant(isRest);
          setLoading(false);
        }
      } catch (e) {
        console.log("SalesScreen checkMode error:", e);
        if (active) setLoading(false);
      }
    };
    checkMode();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: "#f8fafc" }} />;
  }

  if (isRestaurant) {
    return <RestaurantSalesBilling {...props} />;
  }

  return <RetailSalesScreen {...props} />;
}
 