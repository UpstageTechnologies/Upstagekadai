import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Modal,
  Image,
  SafeAreaView,
  StatusBar,
  Platform,
  useWindowDimensions,
  FlatList,
  ActivityIndicator,
  Vibration,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WebView } from "react-native-webview";
import RazorpayCheckout from "react-native-razorpay";
import QRCode from "react-native-qrcode-svg";
import RNPrint from "react-native-print";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  doc,
  addDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../../utils/firebaseConfig";
import bluetoothPrinter from "../../utils/bluetoothPrinter";
import { useTheme } from "../../theme/ThemeContext";
import { displayNotification } from "../../utils/notification/notifications";

const CATEGORY_CHIPS = [
  "All",
  "Starters",
  "Main Course",
  "Breads",
  "Rice & Biryani",
  "Beverages",
  "Desserts",
  "Snacks",
];

const CATEGORY_META = {
  All: { icon: "food-fork-drink", color: "#16a34a", bg: "#dcfce7" },
  Starters: { icon: "food-drumstick", color: "#ea580c", bg: "#ffedd5" },
  "Main Course": { icon: "pot-steam", color: "#2563eb", bg: "#dbeafe" },
  Breads: { icon: "bread-slice", color: "#b45309", bg: "#fef3c7" },
  "Rice & Biryani": { icon: "rice", color: "#d97706", bg: "#fef3c7" },
  Beverages: { icon: "cup-water", color: "#0891b2", bg: "#cffafe" },
  Desserts: { icon: "cake", color: "#db2777", bg: "#fce7f3" },
  Snacks: { icon: "cookie", color: "#ca8a04", bg: "#fef9c3" },
  Combos: { icon: "package-variant", color: "#7c3aed", bg: "#ede9fe" },
};

export default function RestaurantSalesBilling({ navigation, route }) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const themeContext = useTheme() || {};
  const theme = themeContext.theme || {};
  const darkMode = Boolean(themeContext.darkMode);

  // Restaurant Shop Profile
  const [shopName, setShopName] = useState("MY RESTAURANT");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstPercentage, setGstPercentage] = useState("5");
  const [shopUpiId, setShopUpiId] = useState("");
  const [userRazorpayKeyId, setUserRazorpayKeyId] = useState("");
  const [currentQrMode, setCurrentQrMode] = useState("generated");
  const [savedSettingsQr, setSavedSettingsQr] = useState(null);

  // Payment settings
  const [cashEnabled, setCashEnabled] = useState(true);
  const [upiEnabled, setUpiEnabled] = useState(true);
  const [razorpayEnabled, setRazorpayEnabled] = useState(true);

  // Printer Config
  const [receiptHeader, setReceiptHeader] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("Thank you for dining with us!");
  const [receiptStoreLogo, setReceiptStoreLogo] = useState(false);
  const [receiptLogoUri, setReceiptLogoUri] = useState(null);
  const [receiptPaperSize, setReceiptPaperSize] = useState("58mm");
  const [printerCopies, setPrinterCopies] = useState("1");
  const [receiptShowQr, setReceiptShowQr] = useState(true);
  const [receiptShowBarcode, setReceiptShowBarcode] = useState(false);
  const [printAutomatically, setPrintAutomatically] = useState(false);
  const [enableReceiptPrinting, setEnableReceiptPrinting] = useState(true);

  // Food Menu & Cart States
  const [menuFoods, setMenuFoods] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const [orderItems, setOrderItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [subtotal, setSubtotal] = useState(0);
  const [taxTotal, setTaxTotal] = useState(0);

  // UI Flow States
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCartModal, setShowCartModal] = useState(false);
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  // Receipt Modal
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [currentBillNo, setCurrentBillNo] = useState("");
  const [currentBillDate, setCurrentBillDate] = useState("");
  const [receiptBill, setReceiptBill] = useState([]);
  const [receiptTotal, setReceiptTotal] = useState(0);

  // Hold & Resume Orders
  const [heldOrders, setHeldOrders] = useState([]);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [holdCustomerName, setHoldCustomerName] = useState("");
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [activeResumedOrderId, setActiveResumedOrderId] = useState(null);

  // Live Table KOT Orders from Waiters
  const [activeTableOrders, setActiveTableOrders] = useState([]);
  const [showTableOrdersModal, setShowTableOrdersModal] = useState(false);
  const [selectedTableOrderId, setSelectedTableOrderId] = useState(null);
  const [servedAlertOrder, setServedAlertOrder] = useState(null);

  const notifiedOrderIdsRef = useRef(new Set());
  const isInitialMountRef = useRef(true);
  const currentUser = auth?.currentUser;

  // Real-time listener for active Table KOT Orders
  useEffect(() => {
    if (!currentUser) return;
    const colRef = collection(db, "users", currentUser.uid, "kitchen_orders");
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((o) => o.status !== "completed" && o.status !== "billed")
          .sort((a, b) => {
            // Prioritize "served" orders first (ready for billing), then latest
            if (a.status === "served" && b.status !== "served") return -1;
            if (b.status === "served" && a.status !== "served") return 1;
            const timeA =
              a.servedAtMs ||
              a.createdAtMs ||
              (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
            const timeB =
              b.servedAtMs ||
              b.createdAtMs ||
              (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
            return timeB - timeA;
          });

        // Check for newly served orders to alert the owner
        if (isInitialMountRef.current) {
          list.forEach((o) => {
            if (o.status === "served") {
              notifiedOrderIdsRef.current.add(o.id);
            }
          });
          isInitialMountRef.current = false;
        } else {
          const newlyServed = list.filter(
            (o) => o.status === "served" && !notifiedOrderIdsRef.current.has(o.id)
          );

          newlyServed.forEach((order) => {
            notifiedOrderIdsRef.current.add(order.id);

            // 1. In-app pop-down alert banner
            setServedAlertOrder(order);

            // 2. Vibration
            if (Platform.OS === "android") {
              Vibration.vibrate([0, 250, 100, 250]);
            }

            // 3. System notification via Notifee
            displayNotification({
              title: `🔔 ${order.tableNo || "Table"} Served — Ready for Bill! 🧾`,
              body: `${order.waiterName || "Waiter"} served ${order.tableNo}. Total: ₹${Number(order.totalAmount || 0).toFixed(2)}. Tap to bill now.`,
              orderId: order.id,
              status: "served",
              screen: "Sales",
            });
          });
        }

        setActiveTableOrders(list);
      },
      (err) => console.log("Table KOT listener error:", err)
    );
    return () => unsub();
  }, [currentUser]);

  // Auto-dismiss in-app notification banner after 8 seconds
  useEffect(() => {
    if (servedAlertOrder) {
      const timer = setTimeout(() => {
        setServedAlertOrder(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [servedAlertOrder]);

  // Computed served table orders waiting for billing
  const servedTableOrders = React.useMemo(() => {
    return activeTableOrders.filter((o) => o.status === "served");
  }, [activeTableOrders]);

  // Load a table's order into Billing Register
  const handleLoadTableOrder = (tableOrder, openCart = true) => {
    if (!tableOrder.items || tableOrder.items.length === 0) {
      Alert.alert("Empty Order", "This table order has no items.");
      return;
    }
    const formattedItems = tableOrder.items.map((item, idx) => ({
      id: item.foodId || `table_item_${idx}_${Date.now()}`,
      name: item.name,
      portion: item.portion || "Standard",
      price: Number(item.price || 0),
      salesPrice: Number(item.price || 0),
      purchasePrice: Number(item.purchasePrice || 0),
      qty: Number(item.qty || 1),
      notes: item.notes || "",
    }));

    setOrderItems(formattedItems);
    setSelectedTableOrderId(tableOrder.id);
    setShowTableOrdersModal(false);
    setServedAlertOrder(null);
    if (openCart) {
      setShowCartModal(true);
    }
  };

  // Cloud Cart Sync Helper
  const syncToCloudCart = async (newBill) => {
    if (!currentUser) return;
    try {
      const cartRef = doc(db, "users", currentUser.uid, "active_cart", "current");
      await setDoc(
        cartRef,
        {
          items: newBill,
          lastConfirmedSale: null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.log("Cart sync error:", e);
    }
  };

  // Load Settings & Shop Profile
  useEffect(() => {
    if (!currentUser) return;

    const userRef = doc(db, "users", currentUser.uid);
    const unsubProfile = onSnapshot(userRef, (snap) => {
      const data = snap.data();
      if (data) {
        setShopName(data.shopName || "MY RESTAURANT");
        if (data.address) {
          setShopAddress(
            typeof data.address === "string"
              ? data.address
              : data.address.fullAddress || ""
          );
        }
        if (data.phone) setShopPhone(data.phone);
        setGstNumber(data.gstNumber || "");
        setGstEnabled(data.gstEnabled ?? false);
        setGstPercentage(data.gstPercentage || "5");
        setShopUpiId(data.upiId || "");
        setUserRazorpayKeyId(data.razorpayKeyId || "");
        setCurrentQrMode(data.qrMode || "generated");
        setCashEnabled(data.cashEnabled ?? true);
        setUpiEnabled(data.upiEnabled ?? true);
        setRazorpayEnabled(data.razorpayEnabled ?? true);

        if (data.receiptConfig) {
          setReceiptStoreLogo(data.receiptConfig.storeLogo ?? false);
          setReceiptHeader(data.receiptConfig.header || "");
          setReceiptFooter(data.receiptConfig.footer || "Thank you for dining with us!");
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
      }
    });

    return () => unsubProfile();
  }, [currentUser]);

  // Load Held Orders
  useEffect(() => {
    const loadHeldOrders = async () => {
      if (!currentUser) return;
      try {
        const savedHeld = await AsyncStorage.getItem(`held_orders_${currentUser.uid}`);
        if (savedHeld) {
          setHeldOrders(JSON.parse(savedHeld));
        }
      } catch (err) {
        console.log("Failed to load held orders", err);
      }
    };
    loadHeldOrders();
  }, [currentUser]);

  // Real-time listener for Food Menu items
  useEffect(() => {
    if (!currentUser) {
      setLoadingMenu(false);
      return;
    }

    setLoadingMenu(true);
    const unsub = onSnapshot(
      collection(db, "users", currentUser.uid, "restaurant_menu"),
      (snapshot) => {
        const foods = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setMenuFoods(foods);
        setLoadingMenu(false);
      },
      (err) => {
        console.log("Restaurant menu load error:", err);
        setLoadingMenu(false);
      }
    );

    return () => unsub();
  }, [currentUser]);

  // Handle preselected food passed via navigation params
  const preselected = route?.params?.preselectedFood;
  useEffect(() => {
    if (preselected && preselected.id) {
      addFoodToOrder(preselected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselected]);

  // Calculate Subtotal, GST, and Total
  useEffect(() => {
    const sub = orderItems.reduce((acc, item) => {
      const price = Number(item.salesPrice || item.price || 0);
      return acc + price * (item.qty || 1);
    }, 0);

    const tax = gstEnabled
      ? orderItems.reduce((acc, item) => {
          const itemPrice = Number(item.salesPrice || item.price || 0);
          const rate = Number(item.taxPercent || gstPercentage || 0);
          return acc + itemPrice * (item.qty || 1) * (rate / 100);
        }, 0)
      : 0;

    setSubtotal(sub);
    setTaxTotal(tax);
    setTotal(Math.round((sub + tax) * 100) / 100);
  }, [orderItems, gstEnabled, gstPercentage]);

  // Filter Foods by search & category
  const filteredFoods = menuFoods.filter((f) => {
    const name = (f.name || f.itemName || "").toLowerCase();
    const cat = (f.category || "").toLowerCase();
    const q = search.trim().toLowerCase();

    const matchesSearch = !q || name.includes(q) || cat.includes(q);
    const matchesCat =
      selectedCategory === "All" ||
      (f.category || "").toLowerCase() === selectedCategory.toLowerCase();

    return matchesSearch && matchesCat;
  });

  // Dynamic Categories from saved foods
  const categories = React.useMemo(() => {
    const set = new Set(CATEGORY_CHIPS);
    menuFoods.forEach((f) => {
      if (f.category) set.add(f.category.trim());
    });
    return Array.from(set);
  }, [menuFoods]);

  // First available image for each category (from menu foods)
  const categoryThumbnails = React.useMemo(() => {
    const map = {};
    menuFoods.forEach((f) => {
      const img = f.imageUrl || f.image;
      if (f.category && img && !map[f.category]) {
        map[f.category] = img;
      }
    });
    return map;
  }, [menuFoods]);

  // Cart operations
  const addFoodToOrder = async (food) => {
    if (food.isAvailable === false) {
      Alert.alert("Sold Out", `"${food.name || food.itemName}" is currently out of stock.`);
      return;
    }

    const price = Number(food.price || food.salesPrice || 0);
    const existing = orderItems.find((i) => i.id === food.id);

    let updated;
    if (existing) {
      updated = orderItems.map((i) =>
        i.id === food.id ? { ...i, qty: i.qty + 1 } : i
      );
    } else {
      updated = [
        ...orderItems,
        {
          ...food,
          id: food.id,
          name: food.name || food.itemName,
          itemName: food.name || food.itemName,
          price,
          salesPrice: price,
          purchasePrice: Number(food.purchasePrice || 0),
          qty: 1,
          category: food.category || "General",
          taxPercent: gstEnabled ? Number(gstPercentage || 0) : 0,
        },
      ];
    }

    setOrderItems(updated);
    await syncToCloudCart(updated);
  };

  const decreaseQuantity = async (food) => {
    const existing = orderItems.find((i) => i.id === food.id);
    if (!existing) return;

    let updated;
    if (existing.qty <= 1) {
      updated = orderItems.filter((i) => i.id !== food.id);
    } else {
      updated = orderItems.map((i) =>
        i.id === food.id ? { ...i, qty: i.qty - 1 } : i
      );
    }

    setOrderItems(updated);
    await syncToCloudCart(updated);
  };

  const removeItem = async (food) => {
    Alert.alert(
      "Remove Item",
      `Remove "${food.name || food.itemName}" from the current order?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Remove",
          style: "destructive",
          onPress: async () => {
            const updated = orderItems.filter((i) => i.id !== food.id);
            setOrderItems(updated);
            await syncToCloudCart(updated);
          },
        },
      ]
    );
  };

  const handleClearOrder = () => {
    if (orderItems.length === 0) return;
    Alert.alert("Clear Order", "Are you sure you want to clear the current order?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear All",
        style: "destructive",
        onPress: async () => {
          setOrderItems([]);
          setSelectedTableOrderId(null);
          await syncToCloudCart([]);
        },
      },
    ]);
  };

  // Hold Order Handling
  const handleHoldOrder = () => {
    if (orderItems.length === 0) {
      Alert.alert("Empty Order", "No food items in the current order to hold.");
      return;
    }
    setShowHoldModal(true);
  };

  const confirmHold = async () => {
    if (!currentUser) return;
    try {
      const newHold = {
        id: Date.now(),
        name: holdCustomerName.trim() || `Table / Order #${heldOrders.length + 1}`,
        items: orderItems,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        total,
      };

      const updated = [...heldOrders, newHold];
      setHeldOrders(updated);
      await AsyncStorage.setItem(`held_orders_${currentUser.uid}`, JSON.stringify(updated));

      setOrderItems([]);
      await syncToCloudCart([]);
      setHoldCustomerName("");
      setShowHoldModal(false);
      Alert.alert("Order Held ⏸️", "Order has been placed on hold successfully.");
    } catch (e) {
      Alert.alert("Error", "Could not hold order: " + e.message);
    }
  };

  const resumeOrder = async (held) => {
    setOrderItems(held.items);
    await syncToCloudCart(held.items);
    setActiveResumedOrderId(held.id);
    setShowResumeModal(false);
  };

  // Finalize Sale in Firebase
  const finalizeSale = async (payId = "CASH") => {
    if (orderItems.length === 0) return;
    if (!currentUser) {
      Alert.alert("Error", "Authentication required to complete sale.");
      return;
    }

    setIsFinalizing(true);
    try {
      const salesSnap = await getDocs(collection(db, "users", currentUser.uid, "sales"));

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const datePrefix = `${year}${month}${day}`;

      const sequenceNum = String(salesSnap.size + 1).padStart(4, "0");
      const billNo = `REST-${datePrefix}-${sequenceNum}`;
      const billDate = now.toLocaleDateString("en-GB");

      const profitTotal = orderItems.reduce((acc, i) => {
        const itemPrice = Number(i.salesPrice || i.price || 0);
        const cost = Number(i.purchasePrice || 0);
        return acc + (itemPrice - cost) * (i.qty || 1);
      }, 0);

      const activeTableObj = activeTableOrders.find((o) => o.id === selectedTableOrderId);

      const saleRecord = {
        billNo,
        invoiceId: billNo,
        billDate,
        items: orderItems,
        total,
        subtotal,
        taxTotal,
        profit: profitTotal,
        paymentMode,
        paymentId: payId,
        shopType: "restaurant",
        orderType: "dine-in",
        tableNo: activeTableObj?.tableNo || "",
        waiterName: activeTableObj?.waiterName || "",
        waiterId: activeTableObj?.waiterId || "",
        isGlobalMode: false,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "users", currentUser.uid, "sales"), saleRecord);

      // If this bill was loaded from a table KOT, mark it as completed/billed
      if (selectedTableOrderId) {
        try {
          const kotUpdate = {
            status: "completed",
            billedAt: serverTimestamp(),
            billNo,
          };
          await updateDoc(
            doc(db, "users", currentUser.uid, "kitchen_orders", selectedTableOrderId),
            kotUpdate
          );
          try {
            await updateDoc(doc(db, "kitchen_orders", selectedTableOrderId), kotUpdate);
          } catch (e) {}
          setSelectedTableOrderId(null);
        } catch (kotErr) {
          console.log("Error marking KOT completed:", kotErr);
        }
      }

      // Remove resumed order if applicable
      if (activeResumedOrderId) {
        const updated = heldOrders.filter((o) => o.id !== activeResumedOrderId);
        setHeldOrders(updated);
        await AsyncStorage.setItem(`held_orders_${currentUser.uid}`, JSON.stringify(updated));
        setActiveResumedOrderId(null);
      }

      setReceiptBill([...orderItems]);
      setReceiptTotal(total);
      setCurrentBillNo(billNo);
      setCurrentBillDate(billDate);

      // Clear current order
      setOrderItems([]);
      await syncToCloudCart([]);

      setShowCheckout(false);
      setShowReceiptModal(true);

      if (printAutomatically && enableReceiptPrinting) {
        triggerReceiptPrint(billNo, billDate, [...orderItems], total);
      }
    } catch (err) {
      console.log("Error saving restaurant sale:", err);
      Alert.alert("Billing Error ❌", err.message || "Failed to complete sale.");
    } finally {
      setIsFinalizing(false);
    }
  };

  // Razorpay Checkout
  const handleRazorpay = () => {
    if (!razorpayEnabled) {
      Alert.alert("Disabled", "Razorpay is disabled in settings.");
      return;
    }
    if (!userRazorpayKeyId) {
      Alert.alert("Configuration Missing", "Please set Razorpay Key ID in Settings.");
      return;
    }

    const options = {
      description: `Payment for Restaurant Order Total: ₹${total}`,
      currency: "INR",
      key: userRazorpayKeyId,
      amount: Math.round(total * 100),
      name: shopName,
      theme: { color: "#16a34a" },
    };

    RazorpayCheckout.open(options)
      .then((data) => {
        setShowCheckout(false);
        setShowSuccessOverlay(true);
        setTimeout(async () => {
          setShowSuccessOverlay(false);
          await finalizeSale(data.razorpay_payment_id || "RAZORPAY_SUCCESS");
        }, 1500);
      })
      .catch((err) => {
        Alert.alert("Payment Cancelled", err.description || "Payment was not completed.");
      });
  };

  // UPI Success simulation
  const handleUpiSuccess = () => {
    setShowUpiModal(false);
    setShowSuccessOverlay(true);
    setTimeout(async () => {
      setShowSuccessOverlay(false);
      await finalizeSale("UPI_RECEIVED");
    }, 1500);
  };

  // Print Receipt
  const triggerReceiptPrint = async (bNo, bDate, explicitBill, explicitTotal) => {
    const billItems = explicitBill || receiptBill;
    const finalTotal = explicitTotal !== undefined ? explicitTotal : receiptTotal;
    const billNum = bNo || currentBillNo;
    const billDt = bDate || currentBillDate;

    try {
      const itemsToPrint = billItems.map((item) => ({
        name: item.name || item.itemName || "Food Item",
        qty: Number(item.qty || 1),
        price: Number(item.salesPrice || item.price || 0),
        total: Number(item.salesPrice || item.price || 0) * Number(item.qty || 1),
      }));

      const upiPayload = shopUpiId
        ? `upi://pay?pa=${shopUpiId}&pn=${encodeURIComponent(shopName)}&am=${finalTotal}&cu=INR`
        : "";

      await bluetoothPrinter.printReceipt({
        shopName,
        address: shopAddress,
        phone: shopPhone,
        billNo: billNum,
        date: billDt,
        gstNumber: gstEnabled ? gstNumber : "",
        header: receiptHeader,
        footer: receiptFooter,
        items: itemsToPrint,
        subtotal: finalTotal,
        total: finalTotal,
        paymentMode,
        showQr: receiptShowQr && !!upiPayload,
        qrData: upiPayload,
        qrCodeData: upiPayload,
        showBarcode: receiptShowBarcode,
        paperSize: receiptPaperSize || "58mm",
        copies: parseInt(printerCopies, 10) || 1,
      });
    } catch (err) {
      console.log("Bluetooth print failed, falling back to system print:", err);
      const html = `
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: monospace; padding: 12px; font-size: 13px; color: #000; }
            .center { text-align: center; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .row { display: flex; justify-content: space-between; }
            table { width: 100%; border-collapse: collapse; }
            td { padding: 3px 0; }
            .right { text-align: right; }
          </style>
        </head>
        <body>
          <div class="center" style="font-size: 16px; font-weight: bold;">${shopName}</div>
          ${shopAddress ? `<div class="center" style="font-size: 11px;">${shopAddress}</div>` : ""}
          ${shopPhone ? `<div class="center" style="font-size: 11px;">Ph: ${shopPhone}</div>` : ""}
          ${gstEnabled && gstNumber ? `<div class="center" style="font-size: 11px;">GSTIN: ${gstNumber}</div>` : ""}
          <div class="divider"></div>
          <div>Bill No: ${billNum}</div>
          <div>Date: ${billDt}</div>
          <div>Mode: ${paymentMode}</div>
          <div class="divider"></div>
          <table>
            ${billItems
              .map(
                (i) => `
              <tr>
                <td>${i.name || i.itemName}<br/>&nbsp;&nbsp;${i.qty} x ₹${Number(i.salesPrice || i.price).toFixed(2)}</td>
                <td class="right">₹${(i.qty * Number(i.salesPrice || i.price)).toFixed(2)}</td>
              </tr>
            `
              )
              .join("")}
          </table>
          <div class="divider"></div>
          <div class="row" style="font-size: 15px; font-weight: bold;">
            <span>TOTAL:</span>
            <span>₹${Number(finalTotal).toFixed(2)}</span>
          </div>
          <div class="divider"></div>
          <div class="center" style="margin-top: 12px;">${receiptFooter}</div>
        </body>
        </html>
      `;
      await RNPrint.print({ html });
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: darkMode ? theme.background : "#f8fafc" }]}>
      <StatusBar
        barStyle={darkMode ? "light-content" : "dark-content"}
        backgroundColor={darkMode ? theme.background : "#ffffff"}
      />

      {/* TOP HEADER */}
      <View style={[styles.header, { backgroundColor: darkMode ? theme.card : "#ffffff" }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => {
              if (navigation.canGoBack()) navigation.goBack();
              else navigation.navigate("Dashboard");
            }}
            style={styles.backBtn}
          >
            <Icon name="arrow-left" size={24} color={darkMode ? theme.text : "#1e293b"} />
          </TouchableOpacity>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Icon name="silverware-fork-knife" size={18} color="#16a34a" style={{ marginRight: 6 }} />
              <Text
                style={[styles.headerShopName, { color: darkMode ? theme.text : "#1e293b" }]}
                numberOfLines={1}
              >
                {shopName}
              </Text>
            </View>
            <Text style={styles.headerSub}>Restaurant POS • Sales Billing</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* Table Orders (KOT) Shortcut */}
          <TouchableOpacity
            style={[styles.headerIconBtn, { backgroundColor: "#dbeafe" }]}
            onPress={() => setShowTableOrdersModal(true)}
            activeOpacity={0.7}
          >
            <Icon name="silverware-fork-knife" size={20} color="#1d4ed8" />
            {activeTableOrders.length > 0 && (
              <View style={[styles.badge, { backgroundColor: "#1d4ed8" }]}>
                <Text style={styles.badgeText}>{activeTableOrders.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Kitchen Display KDS Shortcut */}
          <TouchableOpacity
            style={[styles.headerIconBtn, { backgroundColor: "#ffedd5" }]}
            onPress={() => navigation.navigate("KitchenDisplay")}
            activeOpacity={0.7}
          >
            <Icon name="chef-hat" size={20} color="#ea580c" />
          </TouchableOpacity>

          {/* Held Orders Shortcut */}
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => setShowResumeModal(true)}
            activeOpacity={0.7}
          >
            <Icon name="pause-circle-outline" size={22} color="#d97706" />
            {heldOrders.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{heldOrders.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Sales History Shortcut */}
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => navigation.navigate("SalesHistory")}
            activeOpacity={0.7}
          >
            <Icon name="history" size={22} color="#6366f1" />
          </TouchableOpacity>
        </View>
      </View>

      {/* TOP SEARCH BAR (CLEAN & COMPACT) */}
      <View style={[styles.compactSearchBarSection, { backgroundColor: darkMode ? theme.card : "#ffffff" }]}>
        <View style={styles.compactSearchBar}>
          <Icon name="magnify" size={18} color="#94a3b8" style={{ marginRight: 6 }} />
          <TextInput
            placeholder="Search food or menu item..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
            style={[styles.compactSearchInput, { color: darkMode ? theme.text : "#111827" }]}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} style={{ padding: 2 }}>
              <Icon name="close-circle" size={16} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* FLOATING IN-APP SERVED NOTIFICATION BANNER */}
      {servedAlertOrder && (
        <View style={styles.floatingAlertBanner}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.floatingAlertInner, { backgroundColor: darkMode ? "#064e3b" : "#ecfdf5" }]}
            onPress={() => {
              handleLoadTableOrder(servedAlertOrder, true);
              setServedAlertOrder(null);
            }}
          >
            <View style={styles.floatingAlertIconWrap}>
              <Icon name="bell-ring" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <Text style={[styles.floatingAlertTitle, { color: darkMode ? "#a7f3d0" : "#065f46" }]}>
                🔔 {servedAlertOrder.tableNo || "Table"} Served — Ready for Bill!
              </Text>
              <Text style={[styles.floatingAlertSubtitle, { color: darkMode ? "#6ee7b7" : "#047857" }]}>
                {servedAlertOrder.waiterName || "Waiter"} finished serving • Total: ₹{Number(servedAlertOrder.totalAmount || 0).toFixed(2)} • Tap to Bill
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setServedAlertOrder(null)}
              style={styles.floatingAlertCloseBtn}
            >
              <Icon name="close" size={18} color={darkMode ? "#a7f3d0" : "#065f46"} />
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      )}

      {/* 🍽️ SERVED TABLES READY FOR BILLING (COMPACT CHIPS) */}
      {servedTableOrders.length > 0 && (
        <View style={[styles.compactServedSection, { backgroundColor: darkMode ? "#0f291e" : "#f0fdf4" }]}>
          <View style={styles.compactServedHeader}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={styles.livePulseDot} />
              <Icon name="receipt" size={13} color="#16a34a" style={{ marginRight: 4 }} />
              <Text style={[styles.compactServedTitle, { color: darkMode ? "#86efac" : "#15803d" }]}>
                Served Tables ({servedTableOrders.length})
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowTableOrdersModal(true)}
              style={styles.compactViewAllTablesBtn}
            >
              <Text style={styles.compactViewAllTablesText}>All Tables ({activeTableOrders.length}) →</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.compactServedCardsScroll}
          >
            {servedTableOrders.map((order) => {
              const isLoaded = selectedTableOrderId === order.id;
              const totalAmt = Number(order.totalAmount || 0);
              const totalItems = order.items?.length || 0;

              return (
                <TouchableOpacity
                  key={order.id}
                  activeOpacity={0.85}
                  onPress={() => handleLoadTableOrder(order, true)}
                  style={[
                    styles.compactServedCard,
                    { backgroundColor: darkMode ? theme.card : "#ffffff" },
                    isLoaded && styles.compactServedCardSelected,
                  ]}
                >
                  <View style={styles.compactCardRow1}>
                    <Text
                      style={[styles.compactCardTable, { color: darkMode ? theme.text : "#0f172a" }]}
                      numberOfLines={1}
                    >
                      {order.tableNo || "Table"}
                    </Text>
                    <View style={[styles.compactStatusPill, isLoaded && { backgroundColor: "#10b981" }]}>
                      <Text style={[styles.compactStatusPillText, isLoaded && { color: "#ffffff" }]}>
                        {isLoaded ? "ACTIVE" : "SERVED"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.compactCardRow2}>
                    <Text style={[styles.compactCardMeta, { color: darkMode ? "#cbd5e1" : "#334155" }]}>
                      {totalItems} items • <Text style={{ color: "#16a34a", fontWeight: "800" }}>₹{totalAmt.toFixed(0)}</Text>
                    </Text>
                    <View style={[styles.compactBillBtn, isLoaded && { backgroundColor: "#059669" }]}>
                      <Text style={styles.compactBillBtnText}>{isLoaded ? "Billed" : "Bill"}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* MAIN BODY: LEFT CATEGORIES WITH IMAGE + RIGHT FOODS GRID */}
      <View style={styles.mainSplitBody}>
        {/* LEFT COLUMN: CATEGORIES WITH IMAGES */}
        <View style={[styles.categorySidebar, { backgroundColor: darkMode ? theme.card : "#ffffff" }]}>
          <Text style={[styles.categorySidebarHeader, { color: darkMode ? "#86efac" : "#16a34a" }]}>
            Categories
          </Text>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.categorySidebarScroll}
          >
            {/* "All" button matching Image 2 "All Stores" */}
            <TouchableOpacity
              onPress={() => setSelectedCategory("All")}
              style={[
                styles.allCategoryPillBtn,
                selectedCategory === "All"
                  ? styles.allCategoryPillBtnActive
                  : { backgroundColor: darkMode ? "#1e293b" : "#f1f5f9" },
              ]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.allCategoryPillText,
                  selectedCategory === "All"
                    ? styles.allCategoryPillTextActive
                    : { color: darkMode ? theme.text : "#475569" },
                ]}
              >
                All Foods
              </Text>
            </TouchableOpacity>

            {/* List of categories with circular image/icon */}
            {categories
              .filter((c) => c !== "All")
              .map((cat) => {
                const isSel = selectedCategory === cat;
                const catImg = categoryThumbnails[cat];
                const meta = CATEGORY_META[cat] || {
                  icon: "silverware-fork-knife",
                  color: "#16a34a",
                  bg: "#dcfce7",
                };

                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setSelectedCategory(cat)}
                    style={[
                      styles.categorySidebarItem,
                      isSel && styles.categorySidebarItemActive,
                    ]}
                    activeOpacity={0.75}
                  >
                    <View
                      style={[
                        styles.categoryAvatarCircle,
                        isSel && styles.categoryAvatarCircleActive,
                        { backgroundColor: meta.bg },
                      ]}
                    >
                      {catImg ? (
                        <Image
                          source={{ uri: catImg }}
                          style={styles.categoryAvatarImg}
                          resizeMode="cover"
                        />
                      ) : (
                        <Icon name={meta.icon} size={22} color={meta.color} />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.categorySidebarItemText,
                        isSel && styles.categorySidebarItemTextActive,
                        { color: isSel ? "#16a34a" : darkMode ? theme.text : "#475569" },
                      ]}
                      numberOfLines={2}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
          </ScrollView>
        </View>

        {/* RIGHT COLUMN: FOODS CATALOG GRID */}
        <View style={[styles.foodsCatalogArea, { backgroundColor: darkMode ? theme.background : "#f8fafc" }]}>
          {/* Header row above products matching Image 2 */}
          <View style={styles.catalogHeaderBanner}>
            <View>
              <Text style={[styles.catalogCategoryName, { color: darkMode ? theme.text : "#0f172a" }]}>
                {selectedCategory === "All" ? "Global Menu" : selectedCategory}
              </Text>
              <Text style={styles.catalogItemCountSub}>
                {filteredFoods.length} {filteredFoods.length === 1 ? "item" : "items"} available
              </Text>
            </View>

            {selectedTableOrderId && (
              <View style={styles.activeTableChip}>
                <Icon name="table-chair" size={13} color="#1d4ed8" style={{ marginRight: 4 }} />
                <Text style={styles.activeTableChipText} numberOfLines={1}>
                  {activeTableOrders.find((o) => o.id === selectedTableOrderId)?.tableNo || "Table"}
                </Text>
              </View>
            )}
          </View>

          {loadingMenu ? (
            <View style={styles.loaderCenter}>
              <ActivityIndicator color="#16a34a" size="large" />
              <Text style={{ marginTop: 10, color: "#94a3b8" }}>Loading Menu...</Text>
            </View>
          ) : filteredFoods.length === 0 ? (
            <View style={styles.emptyCatalog}>
              <Icon name="food-off" size={44} color="#cbd5e1" />
              <Text style={[styles.emptyCatalogText, { color: darkMode ? theme.text : "#64748b" }]}>
                {menuFoods.length === 0 ? "No foods registered yet" : "No foods match your search"}
              </Text>
              <TouchableOpacity
                style={styles.emptyAddFoodBtn}
                onPress={() => navigation.navigate("Scan")}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>+ Add Foods to Menu</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filteredFoods}
              key={isLandscape ? "grid-land-3" : "grid-port-2"}
              keyExtractor={(item) => item.id}
              numColumns={isLandscape ? 3 : 2}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 4,
                paddingTop: 4,
                paddingBottom: orderItems.length > 0 ? 88 : 24,
              }}
              renderItem={({ item }) => {
                const inOrder = orderItems.find((i) => i.id === item.id);
                const isAvail = item.isAvailable !== false;
                const price = Number(item.price || item.salesPrice || 0);

                return (
                  <TouchableOpacity
                    style={[
                      styles.productCard,
                      { backgroundColor: darkMode ? theme.card : "#ffffff" },
                      !isAvail && styles.productCardDisabled,
                      inOrder && styles.productCardInOrder,
                    ]}
                    onPress={() => addFoodToOrder(item)}
                    activeOpacity={0.8}
                    disabled={!isAvail}
                  >
                    {/* Top food image with diet badge */}
                    <View style={styles.productImgContainer}>
                      {item.imageUrl || item.image ? (
                        <Image
                          source={{ uri: item.imageUrl || item.image }}
                          style={styles.productImg}
                          resizeMode="cover"
                        />
                      ) : (
                        <Icon
                          name={item.category === "Beverages" ? "coffee" : "food-drumstick"}
                          size={28}
                          color="#6366f1"
                        />
                      )}
                      {item.dietType === "veg" && (
                        <View style={styles.dietBadge}>
                          <Icon name="circle-slice-8" size={11} color="#16a34a" />
                        </View>
                      )}
                      {item.dietType === "non-veg" && (
                        <View style={styles.dietBadge}>
                          <Icon name="triangle" size={9} color="#dc2626" />
                        </View>
                      )}
                    </View>

                    {/* Food Info */}
                    <View style={styles.productInfo}>
                      <Text
                        style={[styles.productTitle, { color: darkMode ? theme.text : "#0f172a" }]}
                        numberOfLines={1}
                      >
                        {item.name || item.itemName}
                      </Text>
                      <Text style={styles.productCategory} numberOfLines={1}>
                        {item.category || "General"}
                      </Text>

                      {/* Price and Cart Action Row */}
                      <View style={styles.productBottomRow}>
                        <Text style={[styles.productPrice, { color: darkMode ? theme.text : "#0f172a" }]}>
                          ₹{price.toFixed(2)}
                        </Text>

                        {!isAvail ? (
                          <Text style={styles.soldOutText}>Sold Out</Text>
                        ) : inOrder ? (
                          <View style={styles.inOrderQtyTag}>
                            <Text style={styles.inOrderQtyText}>{inOrder.qty}</Text>
                          </View>
                        ) : (
                          <View style={styles.addCartBtn}>
                            <Icon name="cart-plus" size={16} color="#ffffff" />
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>

      {/* 🛒 FLOATING BOTTOM CART BAR (MATCHING IMAGE 2 & 3) */}
      {orderItems.length > 0 && (
        <View style={styles.floatingCartContainer}>
          <TouchableOpacity
            style={styles.floatingCartBar}
            activeOpacity={0.9}
            onPress={() => setShowCartModal(true)}
          >
            {/* Left: Cart Icon & Label */}
            <View style={styles.floatingCartLeft}>
              <Icon name="cart" size={20} color="#22c55e" />
              <Text style={styles.floatingCartTitle}>Cart</Text>
            </View>

            {/* Right: Item Count Badge + Total Amount + Arrow */}
            <View style={styles.floatingCartRight}>
              <View style={styles.floatingCartBadge}>
                <Text style={styles.floatingCartBadgeText}>
                  {orderItems.reduce((acc, i) => acc + (i.qty || 1), 0)}
                </Text>
              </View>
              <Text style={styles.floatingCartAmount}>₹{total.toFixed(2)}</Text>
              <Icon name="arrow-right" size={20} color="#22c55e" style={{ marginLeft: 6 }} />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* 🛍️ SHOPPING CART / BILLING MODAL (MATCHING IMAGE 4) */}
      <Modal visible={showCartModal} animationType="slide">
        <SafeAreaView style={[styles.cartModalSafeArea, { backgroundColor: darkMode ? theme.background : "#f8fafc" }]}>
          {/* Header */}
          <View style={[styles.cartModalTopBar, { backgroundColor: darkMode ? theme.card : "#ffffff" }]}>
            <TouchableOpacity
              onPress={() => setShowCartModal(false)}
              style={styles.continueShoppingBtn}
              activeOpacity={0.7}
            >
              <Icon name="arrow-left" size={18} color="#16a34a" style={{ marginRight: 6 }} />
              <Text style={styles.continueShoppingText}>Continue Shopping</Text>
            </TouchableOpacity>

            <View style={{ marginTop: 8 }}>
              <Text style={[styles.shoppingCartTitle, { color: darkMode ? theme.text : "#0f172a" }]}>
                Shopping Cart
              </Text>
              <Text style={styles.shoppingCartSub}>
                {orderItems.reduce((acc, i) => acc + (i.qty || 1), 0)} products in your cart
              </Text>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.cartModalScroll}
          >
            {/* Table Loaded Banner (if any) */}
            {selectedTableOrderId && (
              <View style={styles.cartTableInfoBanner}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Icon name="table-chair" size={18} color="#1d4ed8" style={{ marginRight: 6 }} />
                  <Text style={styles.cartTableInfoTitle}>
                    {activeTableOrders.find((o) => o.id === selectedTableOrderId)?.tableNo || "Table Order"}
                  </Text>
                  <Text style={styles.cartTableInfoWaiter}>
                    • Server: {activeTableOrders.find((o) => o.id === selectedTableOrderId)?.waiterName || "Staff"}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setSelectedTableOrderId(null);
                  }}
                  style={styles.cartTableClearBtn}
                >
                  <Text style={styles.cartTableClearText}>Detach Table</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* YOUR ITEMS SECTION */}
            <View style={[styles.cartSectionBox, { backgroundColor: darkMode ? theme.card : "#ffffff" }]}>
              <View style={styles.cartSectionHeaderRow}>
                <Text style={[styles.cartSectionHeading, { color: darkMode ? theme.text : "#0f172a" }]}>
                  Your Items
                </Text>
                <Text style={styles.cartItemsCountBadge}>
                  {orderItems.reduce((acc, i) => acc + (i.qty || 1), 0)} items
                </Text>
              </View>

              {orderItems.length === 0 ? (
                <View style={styles.emptyCartBoxModal}>
                  <Icon name="cart-outline" size={44} color="#94a3b8" />
                  <Text style={styles.emptyCartTitleModal}>Your cart is empty</Text>
                  <Text style={styles.emptyCartSubModal}>Add dishes from the menu to build the bill</Text>
                </View>
              ) : (
                orderItems.map((item) => {
                  const itemPrice = Number(item.salesPrice || item.price || 0);
                  const lineTotal = itemPrice * (item.qty || 1);

                  return (
                    <View key={item.id} style={styles.cartProductRow}>
                      {/* Image Thumbnail */}
                      <View style={styles.cartItemThumb}>
                        {item.imageUrl || item.image ? (
                          <Image
                            source={{ uri: item.imageUrl || item.image }}
                            style={styles.cartItemThumbImg}
                            resizeMode="cover"
                          />
                        ) : (
                          <Icon
                            name={item.category === "Beverages" ? "coffee" : "food-drumstick"}
                            size={22}
                            color="#6366f1"
                          />
                        )}
                      </View>

                      {/* Name & Unit Price */}
                      <View style={{ flex: 1, marginHorizontal: 10 }}>
                        <Text
                          style={[styles.cartProductName, { color: darkMode ? theme.text : "#0f172a" }]}
                          numberOfLines={1}
                        >
                          {item.name || item.itemName}
                        </Text>
                        <Text style={styles.cartProductPrice}>
                          ₹{itemPrice.toFixed(2)}
                        </Text>
                      </View>

                      {/* Stepper [- qty +] */}
                      <View style={styles.cartStepperBox}>
                        <TouchableOpacity
                          style={styles.cartStepperBtn}
                          onPress={() => decreaseQuantity(item)}
                          activeOpacity={0.7}
                        >
                          <Icon name="minus" size={14} color="#475569" />
                        </TouchableOpacity>

                        <Text style={[styles.cartStepperText, { color: darkMode ? theme.text : "#0f172a" }]}>
                          {item.qty}
                        </Text>

                        <TouchableOpacity
                          style={styles.cartStepperBtn}
                          onPress={() => addFoodToOrder(item)}
                          activeOpacity={0.7}
                        >
                          <Icon name="plus" size={14} color="#475569" />
                        </TouchableOpacity>
                      </View>

                      {/* Line Total */}
                      <Text style={[styles.cartLineTotal, { color: darkMode ? theme.text : "#0f172a" }]}>
                        ₹{lineTotal.toFixed(2)}
                      </Text>

                      {/* Delete Icon */}
                      <TouchableOpacity
                        onPress={() => removeItem(item)}
                        style={styles.cartTrashBtn}
                        activeOpacity={0.7}
                      >
                        <Icon name="trash-can-outline" size={18} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </View>

            {/* ORDER SUMMARY CARD */}
            {orderItems.length > 0 && (
              <View style={[styles.orderSummaryCard, { backgroundColor: darkMode ? theme.card : "#ffffff" }]}>
                <Text style={[styles.orderSummaryTitle, { color: darkMode ? theme.text : "#0f172a" }]}>
                  Order Summary
                </Text>

                <View style={styles.summaryLineRow}>
                  <Text style={styles.summaryLineLabel}>Subtotal</Text>
                  <Text style={[styles.summaryLineVal, { color: darkMode ? theme.text : "#0f172a" }]}>
                    ₹{subtotal.toFixed(2)}
                  </Text>
                </View>

                {gstEnabled && (
                  <View style={styles.summaryLineRow}>
                    <Text style={styles.summaryLineLabel}>GST ({gstPercentage}%)</Text>
                    <Text style={[styles.summaryLineVal, { color: darkMode ? theme.text : "#0f172a" }]}>
                      ₹{taxTotal.toFixed(2)}
                    </Text>
                  </View>
                )}

                <View style={styles.summaryDivider} />

                <View style={styles.summaryTotalRow}>
                  <Text style={[styles.summaryTotalLabel, { color: darkMode ? theme.text : "#0f172a" }]}>
                    Total
                  </Text>
                  <Text style={styles.summaryTotalAmount}>₹{total.toFixed(2)}</Text>
                </View>

                {/* Primary Proceed to Checkout Button */}
                <TouchableOpacity
                  style={styles.checkoutProceedBtn}
                  onPress={() => {
                    setShowCartModal(false);
                    setShowCheckout(true);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.checkoutProceedBtnText}>Proceed to Checkout</Text>
                </TouchableOpacity>

                {/* Secondary Continue Shopping Button */}
                <TouchableOpacity
                  style={styles.continueShoppingOutlineBtn}
                  onPress={() => setShowCartModal(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.continueShoppingOutlineBtnText}>Continue Shopping</Text>
                </TouchableOpacity>

                {/* Utility Actions (Hold / Clear) */}
                <View style={styles.cartUtilityRow}>
                  <TouchableOpacity
                    style={styles.cartHoldBtn}
                    onPress={() => {
                      setShowCartModal(false);
                      setShowHoldModal(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <Icon name="pause" size={16} color="#d97706" style={{ marginRight: 4 }} />
                    <Text style={styles.cartHoldBtnText}>Hold Order</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.cartClearBtn}
                    onPress={handleClearOrder}
                    activeOpacity={0.8}
                  >
                    <Icon name="trash-can-outline" size={16} color="#ef4444" style={{ marginRight: 4 }} />
                    <Text style={styles.cartClearBtnText}>Clear Cart</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* CHECKOUT / PAYMENT MODAL */}
      <Modal visible={showCheckout} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.checkoutSheet, { backgroundColor: darkMode ? theme.card : "#ffffff" }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: darkMode ? theme.text : "#1e293b" }]}>
                Order Checkout
              </Text>
              <TouchableOpacity onPress={() => setShowCheckout(false)} style={{ padding: 4 }}>
                <Icon name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Order Items Review */}
            <ScrollView style={{ maxHeight: 180, marginVertical: 8 }} showsVerticalScrollIndicator={false}>
              {orderItems.map((i) => (
                <View key={i.id} style={styles.reviewItemRow}>
                  <Text style={[styles.reviewItemText, { color: darkMode ? theme.text : "#334155" }]}>
                    {i.qty} × {i.name || i.itemName}
                  </Text>
                  <Text style={styles.reviewItemPrice}>
                    ₹{(Number(i.salesPrice || i.price) * i.qty).toFixed(2)}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.checkoutTotalBanner}>
              <Text style={{ color: "#16a34a", fontSize: 13, fontWeight: "700" }}>GRAND TOTAL</Text>
              <Text style={{ color: "#16a34a", fontSize: 28, fontWeight: "900" }}>₹{total.toFixed(2)}</Text>
            </View>

            {/* PAYMENT METHOD SELECTOR */}
            <Text style={[styles.paymentSelectLabel, { color: darkMode ? theme.text : "#475569" }]}>
              Select Payment Method
            </Text>

            <View style={styles.payModesRow}>
              <TouchableOpacity
                disabled={!cashEnabled}
                onPress={() => setPaymentMode("CASH")}
                style={[
                  styles.payOptionBtn,
                  paymentMode === "CASH" && styles.payOptionActive,
                  !cashEnabled && { opacity: 0.4 },
                ]}
              >
                <Icon
                  name="cash"
                  size={24}
                  color={paymentMode === "CASH" ? "#fff" : "#16a34a"}
                />
                <Text
                  style={[
                    styles.payOptionText,
                    paymentMode === "CASH" && { color: "#fff" },
                  ]}
                >
                  CASH
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={!upiEnabled}
                onPress={() => {
                  setPaymentMode("UPI");
                  setShowUpiModal(true);
                }}
                style={[
                  styles.payOptionBtn,
                  paymentMode === "UPI" && styles.payOptionActive,
                  !upiEnabled && { opacity: 0.4 },
                ]}
              >
                <Icon
                  name="qrcode-scan"
                  size={24}
                  color={paymentMode === "UPI" ? "#fff" : "#6366f1"}
                />
                <Text
                  style={[
                    styles.payOptionText,
                    paymentMode === "UPI" && { color: "#fff" },
                  ]}
                >
                  UPI QR
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={!razorpayEnabled}
                onPress={() => {
                  setPaymentMode("RAZORPAY");
                  handleRazorpay();
                }}
                style={[
                  styles.payOptionBtn,
                  paymentMode === "RAZORPAY" && styles.payOptionActive,
                  !razorpayEnabled && { opacity: 0.4 },
                ]}
              >
                <Icon
                  name="credit-card-outline"
                  size={24}
                  color={paymentMode === "RAZORPAY" ? "#fff" : "#d97706"}
                />
                <Text
                  style={[
                    styles.payOptionText,
                    paymentMode === "RAZORPAY" && { color: "#fff" },
                  ]}
                >
                  CARD/ONLINE
                </Text>
              </TouchableOpacity>
            </View>

            {/* COMPLETE SALE BUTTON */}
            <TouchableOpacity
              style={[
                styles.completePaymentBtn,
                isFinalizing && { opacity: 0.6 },
              ]}
              disabled={isFinalizing}
              onPress={() => finalizeSale(paymentMode)}
              activeOpacity={0.85}
            >
              {isFinalizing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.completePaymentBtnText}>
                  Complete Payment & Print Receipt ✓
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* UPI QR MODAL */}
      <Modal visible={showUpiModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.upiModalBox, { backgroundColor: darkMode ? theme.card : "#ffffff" }]}>
            <Text style={[styles.upiTitle, { color: darkMode ? theme.text : "#1e293b" }]}>
              Scan & Pay via UPI
            </Text>
            <Text style={styles.upiAmountText}>Amount: ₹{total.toFixed(2)}</Text>

            <View style={styles.qrContainer}>
              {currentQrMode === "generated" ? (
                shopUpiId ? (
                  <QRCode
                    value={`upi://pay?pa=${shopUpiId}&pn=${encodeURIComponent(shopName)}&am=${total}&cu=INR`}
                    size={200}
                  />
                ) : (
                  <Text style={{ color: "#ef4444", textAlign: "center" }}>
                    UPI ID not configured in Settings!
                  </Text>
                )
              ) : savedSettingsQr ? (
                <Image source={{ uri: savedSettingsQr }} style={{ width: 200, height: 200 }} resizeMode="contain" />
              ) : (
                <Text style={{ color: "#ef4444", textAlign: "center" }}>
                  Custom QR Image not found in Settings!
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={styles.receivedPaymentBtn}
              onPress={handleUpiSuccess}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
                Payment Received ✓
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowUpiModal(false)}
              style={{ marginTop: 12, alignItems: "center" }}
            >
              <Text style={{ color: "#ef4444", fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* RECEIPT MODAL */}
      <Modal visible={showReceiptModal} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#1e293b" }}>
          <View style={{ flex: 1, margin: 16, borderRadius: 16, overflow: "hidden", backgroundColor: "#fff" }}>
            <WebView
              originWhitelist={["*"]}
              source={{
                html: `
                <html>
                <head>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <style>
                    body { font-family: monospace; padding: 14px; font-size: 13px; color: #000; }
                    .center { text-align: center; }
                    .divider { border-top: 1px dashed #000; margin: 8px 0; }
                    .row { display: flex; justify-content: space-between; }
                    table { width: 100%; border-collapse: collapse; }
                    td { padding: 3px 0; }
                    .right { text-align: right; }
                  </style>
                </head>
                <body>
                  <div class="center" style="font-size: 16px; font-weight: bold;">${shopName}</div>
                  ${shopAddress ? `<div class="center" style="font-size: 11px;">${shopAddress}</div>` : ""}
                  ${shopPhone ? `<div class="center" style="font-size: 11px;">Ph: ${shopPhone}</div>` : ""}
                  ${gstEnabled && gstNumber ? `<div class="center" style="font-size: 11px;">GSTIN: ${gstNumber}</div>` : ""}
                  <div class="divider"></div>
                  <div>Bill No: ${currentBillNo}</div>
                  <div>Date: ${currentBillDate}</div>
                  <div>Mode: ${paymentMode}</div>
                  <div class="divider"></div>
                  <table>
                    ${receiptBill
                      .map(
                        (i) => `
                      <tr>
                        <td>${i.name || i.itemName}<br/>&nbsp;&nbsp;${i.qty} × ₹${Number(i.salesPrice || i.price).toFixed(2)}</td>
                        <td class="right">₹${(i.qty * Number(i.salesPrice || i.price)).toFixed(2)}</td>
                      </tr>
                    `
                      )
                      .join("")}
                  </table>
                  <div class="divider"></div>
                  <div class="row" style="font-size: 15px; font-weight: bold;">
                    <span>GRAND TOTAL:</span>
                    <span>₹${Number(receiptTotal).toFixed(2)}</span>
                  </div>
                  <div class="divider"></div>
                  <div class="center" style="margin-top: 12px; font-weight: bold;">${receiptFooter}</div>
                </body>
                </html>
              `,
              }}
              scalesPageToFit={true}
            />
          </View>

          <View style={styles.receiptActionFooter}>
            <TouchableOpacity
              style={[styles.receiptBtn, { backgroundColor: "#ef4444" }]}
              onPress={() => {
                setShowReceiptModal(false);
                setReceiptBill([]);
                setReceiptTotal(0);
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Close</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.receiptBtn, { backgroundColor: "#16a34a" }]}
              onPress={() => triggerReceiptPrint(currentBillNo, currentBillDate)}
            >
              <Icon name="printer" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={{ color: "#fff", fontWeight: "700" }}>Print Receipt</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* HOLD ORDER MODAL */}
      <Modal visible={showHoldModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.holdModalBox, { backgroundColor: darkMode ? theme.card : "#ffffff" }]}>
            <Text style={[styles.holdTitle, { color: darkMode ? theme.text : "#1e293b" }]}>
              Hold Order / Table No
            </Text>
            <TextInput
              placeholder="e.g. Table 4, Guest Sharma"
              placeholderTextColor="#94a3b8"
              value={holdCustomerName}
              onChangeText={setHoldCustomerName}
              style={[styles.holdInput, { color: darkMode ? theme.text : "#111827" }]}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                onPress={() => setShowHoldModal(false)}
                style={styles.cancelBtn}
              >
                <Text style={{ color: "#64748b", fontWeight: "700" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmHold}
                style={styles.confirmHoldBtn}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Confirm Hold</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* RESUME ORDER MODAL */}
      <Modal visible={showResumeModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.resumeModalBox, { backgroundColor: darkMode ? theme.card : "#ffffff" }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: darkMode ? theme.text : "#1e293b" }]}>
                Pending Held Orders
              </Text>
              <TouchableOpacity onPress={() => setShowResumeModal(false)}>
                <Icon name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300, marginTop: 10 }}>
              {heldOrders.length === 0 ? (
                <Text style={{ textAlign: "center", color: "#94a3b8", paddingVertical: 20 }}>
                  No held orders!
                </Text>
              ) : (
                heldOrders.map((o) => (
                  <View key={o.id} style={styles.heldOrderItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.heldOrderName, { color: darkMode ? theme.text : "#1e293b" }]}>
                        {o.name}
                      </Text>
                      <Text style={styles.heldOrderMeta}>
                        {o.timestamp} • {o.items?.length || 0} items • ₹{Number(o.total || 0).toFixed(2)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => resumeOrder(o)}
                      style={styles.resumeActionBtn}
                    >
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Resume</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ACTIVE TABLE ORDERS (KOT) MODAL */}
      <Modal visible={showTableOrdersModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.checkoutCard,
              {
                maxHeight: "85%",
                backgroundColor: darkMode ? theme.card : "#ffffff",
                padding: 16,
              },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Icon
                  name="silverware-fork-knife"
                  size={22}
                  color="#2563eb"
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={[
                    styles.checkoutTitle,
                    { color: darkMode ? theme.text : "#1e293b", marginBottom: 0 },
                  ]}
                >
                  Active Table Orders ({activeTableOrders.length})
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowTableOrdersModal(false)}>
                <Icon name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {activeTableOrders.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 40 }}>
                  <Icon name="silverware-clean" size={48} color="#94a3b8" />
                  <Text style={{ color: "#64748b", marginTop: 12, fontSize: 14 }}>
                    No active table orders from waiters currently.
                  </Text>
                </View>
              ) : (
                activeTableOrders.map((order) => {
                  const isServed = order.status === "served";
                  const isReady = order.status === "ready";
                  const isPreparing = order.status === "preparing";

                  const statusColor = isServed
                    ? "#16a34a"
                    : isReady
                    ? "#10b981"
                    : isPreparing
                    ? "#f59e0b"
                    : "#3b82f6";

                  const statusLabel = isServed
                    ? "✓ SERVED • READY FOR BILL 🧾"
                    : isReady
                    ? "🔔 DISH READY"
                    : isPreparing
                    ? "🍳 PREPARING"
                    : "⏱️ PENDING";

                  return (
                    <View
                      key={order.id}
                      style={{
                        backgroundColor: isServed ? (darkMode ? "#064e3b" : "#f0fdf4") : darkMode ? "#1e293b" : "#f8fafc",
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 10,
                        borderWidth: isServed ? 2 : 1,
                        borderColor: isServed ? "#16a34a" : "#e2e8f0",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text
                            style={{
                              fontSize: 16,
                              fontWeight: "800",
                              color: isServed ? "#16a34a" : "#2563eb",
                              marginRight: 8,
                            }}
                          >
                            {order.tableNo || "Table"}
                          </Text>
                          <Text style={{ fontSize: 12, color: "#94a3b8" }}>
                            {order.orderNumber || "KOT"}
                          </Text>
                        </View>

                        <View
                          style={{
                            backgroundColor: isServed ? "#16a34a" : statusColor + "22",
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 6,
                          }}
                        >
                          <Text
                            style={{
                              color: isServed ? "#ffffff" : statusColor,
                              fontSize: 10,
                              fontWeight: "800",
                              textTransform: "uppercase",
                            }}
                          >
                            {statusLabel}
                          </Text>
                        </View>
                      </View>

                      <Text
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                          marginTop: 4,
                        }}
                      >
                        Waiter: <Text style={{ fontWeight: "700" }}>{order.waiterName || "Staff"}</Text> • {order.items?.length || 0} items
                      </Text>

                      {/* Items Preview */}
                      <View style={{ marginTop: 8 }}>
                        {(order.items || []).map((food, fIdx) => (
                          <Text
                            key={fIdx}
                            style={{
                              fontSize: 12,
                              color: darkMode ? "#cbd5e1" : "#334155",
                            }}
                          >
                            • {food.qty}x {food.name}{" "}
                            {food.portion && food.portion !== "Standard" ? `(${food.portion})` : ""} - ₹
                            {(Number(food.price || 0) * Number(food.qty || 1)).toFixed(2)}
                          </Text>
                        ))}
                      </View>

                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginTop: 10,
                          paddingTop: 8,
                          borderTopWidth: 1,
                          borderTopColor: isServed ? "#bbf7d0" : "#e2e8f0",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "800",
                            color: "#16a34a",
                          }}
                        >
                          Total: ₹{Number(order.totalAmount || 0).toFixed(2)}
                        </Text>

                        <TouchableOpacity
                          style={{
                            backgroundColor: "#16a34a",
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 8,
                          }}
                          onPress={() => handleLoadTableOrder(order)}
                        >
                          <Text
                            style={{
                              color: "#ffffff",
                              fontWeight: "700",
                              fontSize: 13,
                            }}
                          >
                            {isServed ? "🧾 Bill Table Now" : "🧾 Bill Table"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* SUCCESS OVERLAY */}
      {showSuccessOverlay && (
        <View style={styles.successOverlay}>
          <View style={styles.successBox}>
            <View style={styles.successIconWrap}>
              <Icon name="check" size={36} color="#fff" />
            </View>
            <Text style={styles.successTitle}>Payment Received!</Text>
            <Text style={styles.successAmount}>₹{total.toFixed(2)}</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: (Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 0) + 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  backBtn: {
    padding: 6,
    marginRight: 8,
  },
  headerShopName: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "500",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -3,
    backgroundColor: "#ef4444",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },

  /* Compact Top Search Bar */
  compactSearchBarSection: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  compactSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    height: 38,
  },
  compactSearchInput: {
    flex: 1,
    fontSize: 13,
    height: 36,
    paddingVertical: 0,
  },

  /* In-app Notification Banner */
  floatingAlertBanner: {
    position: "absolute",
    top: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 60 : 64,
    left: 12,
    right: 12,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingAlertInner: {
    borderWidth: 1.5,
    borderColor: "#10b981",
    borderRadius: 14,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  floatingAlertIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#16a34a",
    justifyContent: "center",
    alignItems: "center",
  },
  floatingAlertTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  floatingAlertSubtitle: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: "600",
  },
  floatingAlertCloseBtn: {
    padding: 6,
  },

  /* Compact Served Tables Header & Cards */
  compactServedSection: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  compactServedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
    paddingHorizontal: 2,
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#16a34a",
    marginRight: 5,
  },
  compactServedTitle: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  compactViewAllTablesBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(22, 163, 74, 0.12)",
  },
  compactViewAllTablesText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#16a34a",
  },
  compactServedCardsScroll: {
    gap: 8,
    paddingRight: 8,
  },
  compactServedCard: {
    width: 140,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: "#16a34a",
    shadowColor: "#16a34a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  compactServedCardSelected: {
    borderColor: "#059669",
    borderWidth: 2,
    backgroundColor: "#f0fdf4",
  },
  compactCardRow1: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  compactCardTable: {
    fontSize: 12,
    fontWeight: "800",
    flex: 1,
    marginRight: 4,
  },
  compactStatusPill: {
    backgroundColor: "#dcfce7",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  compactStatusPillText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#16a34a",
  },
  compactCardRow2: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  compactCardMeta: {
    fontSize: 10,
    fontWeight: "600",
  },
  compactBillBtn: {
    backgroundColor: "#16a34a",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  compactBillBtnText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },

  /* MAIN SPLIT LAYOUT (Left Categories + Right Foods) */
  mainSplitBody: {
    flex: 1,
    flexDirection: "row",
  },

  /* LEFT COLUMN: CATEGORIES SIDEBAR */
  categorySidebar: {
    width: 88,
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
    paddingTop: 8,
    alignItems: "center",
  },
  categorySidebarHeader: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  categorySidebarScroll: {
    paddingBottom: 70,
    alignItems: "center",
    width: 88,
  },
  allCategoryPillBtn: {
    width: 74,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  allCategoryPillBtnActive: {
    backgroundColor: "#16a34a",
    borderColor: "#16a34a",
  },
  allCategoryPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  allCategoryPillTextActive: {
    color: "#ffffff",
    fontWeight: "800",
  },
  categorySidebarItem: {
    width: 74,
    alignItems: "center",
    marginBottom: 12,
  },
  categorySidebarItemActive: {},
  categoryAvatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  categoryAvatarCircleActive: {
    borderColor: "#16a34a",
    borderWidth: 2.5,
  },
  categoryAvatarImg: {
    width: "100%",
    height: "100%",
  },
  categorySidebarItemText: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 13,
  },
  categorySidebarItemTextActive: {
    fontWeight: "800",
  },

  /* RIGHT COLUMN: FOOD CATALOG GRID */
  foodsCatalogArea: {
    flex: 1,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  catalogHeaderBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  catalogCategoryName: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  catalogItemCountSub: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 1,
  },
  activeTableChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dbeafe",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: 120,
  },
  activeTableChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1d4ed8",
  },
  loaderCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyCatalog: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
  },
  emptyCatalogText: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 10,
    textAlign: "center",
  },
  emptyAddFoodBtn: {
    marginTop: 12,
    backgroundColor: "#16a34a",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },

  /* Product Card (Matching Image 2) */
  productCard: {
    flex: 1,
    margin: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
    overflow: "hidden",
  },
  productCardDisabled: {
    opacity: 0.5,
  },
  productCardInOrder: {
    borderColor: "#16a34a",
    borderWidth: 1.5,
  },
  productImgContainer: {
    height: 82,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
  },
  productImg: {
    width: "100%",
    height: "100%",
  },
  dietBadge: {
    position: "absolute",
    top: 5,
    left: 5,
    backgroundColor: "#ffffff",
    borderRadius: 4,
    padding: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  productInfo: {
    padding: 8,
  },
  productTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  productCategory: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 1,
  },
  productBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  productPrice: {
    fontSize: 13,
    fontWeight: "800",
  },
  soldOutText: {
    fontSize: 10,
    color: "#ef4444",
    fontWeight: "700",
  },
  inOrderQtyTag: {
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  inOrderQtyText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  addCartBtn: {
    backgroundColor: "#16a34a",
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },

  /* 🛒 FLOATING BOTTOM CART BAR (Matching Image 2 & 3) */
  floatingCartContainer: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    zIndex: 999,
  },
  floatingCartBar: {
    backgroundColor: "#18181b",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(34, 197, 94, 0.35)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  floatingCartLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  floatingCartTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    marginLeft: 8,
  },
  floatingCartRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  floatingCartBadge: {
    backgroundColor: "#22c55e",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
    marginRight: 8,
  },
  floatingCartBadgeText: {
    color: "#000000",
    fontSize: 12,
    fontWeight: "900",
  },
  floatingCartAmount: {
    color: "#22c55e",
    fontSize: 16,
    fontWeight: "900",
  },

  /* 🛍️ SHOPPING CART MODAL (Matching Image 4) */
  cartModalSafeArea: {
    flex: 1,
  },
  cartModalTopBar: {
    paddingHorizontal: 16,
    paddingTop: (Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 0) + 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  continueShoppingBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  continueShoppingText: {
    color: "#16a34a",
    fontSize: 13,
    fontWeight: "700",
  },
  shoppingCartTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  shoppingCartSub: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  cartModalScroll: {
    padding: 14,
    paddingBottom: 40,
  },
  cartTableInfoBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  cartTableInfoTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1d4ed8",
  },
  cartTableInfoWaiter: {
    fontSize: 11,
    color: "#64748b",
    marginLeft: 4,
  },
  cartTableClearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#dbeafe",
  },
  cartTableClearText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1d4ed8",
  },
  cartSectionBox: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 14,
  },
  cartSectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  cartSectionHeading: {
    fontSize: 15,
    fontWeight: "800",
  },
  cartItemsCountBadge: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
  },
  emptyCartBoxModal: {
    alignItems: "center",
    paddingVertical: 36,
  },
  emptyCartTitleModal: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 8,
  },
  emptyCartSubModal: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 2,
  },
  cartProductRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  cartItemThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  cartItemThumbImg: {
    width: "100%",
    height: "100%",
  },
  cartProductName: {
    fontSize: 13,
    fontWeight: "700",
  },
  cartProductPrice: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  cartStepperBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: "#f8fafc",
  },
  cartStepperBtn: {
    padding: 4,
  },
  cartStepperText: {
    fontSize: 12,
    fontWeight: "700",
    minWidth: 20,
    textAlign: "center",
  },
  cartLineTotal: {
    fontSize: 13,
    fontWeight: "800",
    minWidth: 60,
    textAlign: "right",
    marginLeft: 8,
  },
  cartTrashBtn: {
    padding: 6,
    marginLeft: 4,
  },

  /* Order Summary Card (Matching Image 4) */
  orderSummaryCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  orderSummaryTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12,
  },
  summaryLineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLineLabel: {
    fontSize: 13,
    color: "#64748b",
  },
  summaryLineVal: {
    fontSize: 13,
    fontWeight: "600",
  },
  summaryDivider: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    marginVertical: 8,
  },
  summaryTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  summaryTotalLabel: {
    fontSize: 15,
    fontWeight: "800",
  },
  summaryTotalAmount: {
    fontSize: 22,
    fontWeight: "900",
    color: "#16a34a",
  },
  checkoutProceedBtn: {
    backgroundColor: "#16a34a",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#16a34a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  checkoutProceedBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  continueShoppingOutlineBtn: {
    borderWidth: 1.5,
    borderColor: "#16a34a",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  continueShoppingOutlineBtnText: {
    color: "#16a34a",
    fontSize: 13,
    fontWeight: "700",
  },
  cartUtilityRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  cartHoldBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d97706",
    backgroundColor: "#fffbeb",
    paddingVertical: 8,
    borderRadius: 10,
  },
  cartHoldBtnText: {
    color: "#d97706",
    fontSize: 12,
    fontWeight: "700",
  },
  cartClearBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ef4444",
    backgroundColor: "#fef2f2",
    paddingVertical: 8,
    borderRadius: 10,
  },
  cartClearBtnText: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "700",
  },

  /* PAYMENT / CHECKOUT MODAL STYLES */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "flex-end",
  },
  checkoutSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "85%",
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  reviewItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  reviewItemText: {
    fontSize: 13,
    fontWeight: "600",
  },
  reviewItemPrice: {
    fontSize: 13,
    fontWeight: "700",
  },
  checkoutTotalBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    marginVertical: 10,
  },
  paymentSelectLabel: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  payModesRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  payOptionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  payOptionActive: {
    backgroundColor: "#16a34a",
    borderColor: "#16a34a",
  },
  payOptionText: {
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
    color: "#334155",
  },
  completePaymentBtn: {
    backgroundColor: "#16a34a",
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  completePaymentBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15,
  },

  /* UPI QR MODAL */
  upiModalBox: {
    width: "88%",
    alignSelf: "center",
    marginVertical: "auto",
    borderRadius: 24,
    padding: 20,
    alignItems: "center",
  },
  upiTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  upiAmountText: {
    color: "#64748b",
    fontSize: 14,
    marginTop: 4,
    fontWeight: "600",
  },
  qrContainer: {
    marginVertical: 16,
    padding: 12,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  receivedPaymentBtn: {
    backgroundColor: "#16a34a",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },

  /* RECEIPT MODAL */
  receiptActionFooter: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
  },
  receiptBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
  },

  /* HOLD ORDER MODAL */
  holdModalBox: {
    width: "85%",
    alignSelf: "center",
    marginVertical: "auto",
    borderRadius: 20,
    padding: 20,
  },
  holdTitle: {
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 12,
  },
  holdInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  confirmHoldBtn: {
    backgroundColor: "#d97706",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },

  /* RESUME MODAL */
  resumeModalBox: {
    width: "90%",
    alignSelf: "center",
    marginVertical: "auto",
    borderRadius: 20,
    padding: 18,
  },
  heldOrderItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  heldOrderName: {
    fontSize: 14,
    fontWeight: "700",
  },
  heldOrderMeta: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  resumeActionBtn: {
    backgroundColor: "#16a34a",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },

  /* TABLE KOT ORDERS MODAL */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  checkoutCard: {
    width: "100%",
    borderRadius: 20,
  },
  checkoutTitle: {
    fontSize: 18,
    fontWeight: "800",
  },

  /* SUCCESS OVERLAY */
  successOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  successBox: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 30,
    alignItems: "center",
    width: 260,
  },
  successIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#16a34a",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1e293b",
  },
  successAmount: {
    fontSize: 22,
    fontWeight: "900",
    color: "#16a34a",
    marginTop: 4,
  },
});
