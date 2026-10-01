import React, { useEffect, useState, useMemo } from "react";
import { 
  Linking, 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert, 
  TextInput,
  Modal,
  StatusBar,
  ScrollView
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { collection, onSnapshot, doc, updateDoc, getDoc, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../utils/firebaseConfig";
import { getSession } from "../utils/session";
import { useRoute, useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../theme/ThemeContext";

const TABS = ["All", "New", "Hold", "Completed", "Rejected"];

export default function OrdersScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { darkMode, theme } = useTheme();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState(null);
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [pendingModal, setPendingModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [pendingMessage, setPendingMessage] = useState("");
  const [currentAppMode, setCurrentAppMode] = useState("local");

  // Filter & Search states
  const [activeTab, setActiveTab] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("Home"); 
    }
  };

  const getSubCol = (mode) => (mode === "global" ? "global_orders" : "local_orders");

  useEffect(() => {
    let unsubs = [];
    let isMounted = true;

    const loadOrders = async () => {
      try {
        const session = await getSession();

        if (!session?.uid) {
          if (isMounted) setLoading(false);
          return;
        }

        if (!isMounted) return;
        setUid(session.uid);

        let activeMode = route.params?.appMode;
        if (!activeMode) {
          const savedMode = await AsyncStorage.getItem("app_mode");
          activeMode = savedMode === "global" ? "global" : "local";
        }

        if (!isMounted) return;
        setCurrentAppMode(activeMode);
        const subCollectionName = getSubCol(activeMode);

        let subColOrders = [];
        let legacyOrders = [];

        const mergeAndSetOrders = () => {
          if (!isMounted) return;

          // Merge both arrays without duplicate order IDs
          const orderMap = new Map();

          // Add legacy orders first (filtered by mode)
          legacyOrders.forEach(item => {
            const scope = (item.deliveryScope || "").toLowerCase();
            const isMatch = activeMode === "global"
              ? (scope === "global" || item.isGlobalMode === true)
              : (scope === "local" || !item.deliveryScope || item.isGlobalMode === false);

            if (isMatch) {
              orderMap.set(item.id, item);
            }
          });

          // Sub-collection orders take priority/override
          subColOrders.forEach(item => {
            orderMap.set(item.id, item);
          });

          const combined = Array.from(orderMap.values()).filter(item => {
          const name = (item.customerName || "").toLowerCase();
          return !name.includes("walk-in") && !item.isWalkIn;
        });

          // Sort descending by date
          combined.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
            return dateB - dateA;
          });

          setOrders(combined);
          setLoading(false);
        };

        // 1. Listen to sub-collection (local_orders / global_orders)
        const unsubSubCol = onSnapshot(
          collection(db, "users", session.uid, subCollectionName),
          (snap) => {
            subColOrders = snap.docs.map(d => ({
              id: d.id,
              ...d.data(),
            }));
            mergeAndSetOrders();
          },
          (err) => {
            console.log("Sub-collection snapshot error:", err);
            if (isMounted) setLoading(false);
          }
        );
        unsubs.push(unsubSubCol);

        // 2. Listen to legacy collection ("orders") concurrently
        const unsubLegacy = onSnapshot(
          collection(db, "users", session.uid, "orders"),
          (legacySnap) => {
            legacyOrders = legacySnap.docs.map(d => ({
              id: d.id,
              ...d.data(),
            }));
            mergeAndSetOrders();
          },
          (err) => {
            console.log("Legacy snapshot error:", err);
            if (isMounted) setLoading(false);
          }
        );
        unsubs.push(unsubLegacy);

      } catch (e) {
        console.log("loadOrders Error:", e);
        if (isMounted) setLoading(false);
      }
    };

    loadOrders();

    return () => {
      isMounted = false;
      unsubs.forEach(unsub => unsub && unsub());
    };
  }, [route.params?.appMode]);

  const updateStatus = async (orderId, status, customerUid) => {
    try {
      const subCol = getSubCol(currentAppMode);
      try {
        await updateDoc(doc(db, "users", uid, subCol, orderId), { status });
      } catch {
        await updateDoc(doc(db, "users", uid, "orders", orderId), { status });
      }
      
      if (status === "Delivered") {
        let orderDoc = await getDoc(doc(db, "users", uid, subCol, orderId));
        if (!orderDoc.exists()) {
          orderDoc = await getDoc(doc(db, "users", uid, "orders", orderId));
        }

        if (orderDoc.exists()) {
          const orderData = orderDoc.data();
          let orderedItems = orderData.items || [];
          if (!orderedItems.length && orderData.orderedShops) {
            const currentShopSection = orderData.orderedShops.find(s => s.shopId === uid);
            if (currentShopSection) {
              orderedItems = currentShopSection.items || [];
            }
          }

          let localItems = [];
          let globalItems = [];
          let localTotal = 0;
          let globalTotal = 0;
          let localProfit = 0;
          let globalProfit = 0;
          const isOrderGlobal = currentAppMode === "global";

          for (const prod of orderedItems) {
            const currentItemName = prod.itemName || prod.name || "";
            const currentBarcode = prod.barcode || "";
            const orderedQty = Number(prod.qty || 1);
            let itemFound = false;

            if (!isOrderGlobal) {
              let locSnap = { empty: true };
              if (currentBarcode) {
                locSnap = await getDocs(query(collection(db, "users", uid, "inventory"), where("barcode", "==", currentBarcode)));
              }
              if (locSnap.empty && currentItemName) {
                locSnap = await getDocs(query(collection(db, "users", uid, "inventory"), where("itemName", "==", currentItemName)));
              }
              if (!locSnap.empty) {
                itemFound = true;
                const invDocRef = locSnap.docs[0].ref;
                const currentQty = locSnap.docs[0].data().quantity || 0;
                await updateDoc(invDocRef, { quantity: Math.max(0, currentQty - orderedQty) });
                const itemData = locSnap.docs[0].data();
                const pPrice = Number(itemData.purchasePrice || 0);
                const sPrice = Number(prod.price || itemData.salesPrice || prod.salesPrice || 0);
                localItems.push({ ...prod, itemName: itemData.itemName || currentItemName, price: sPrice, purchasePrice: pPrice });
                localTotal += sPrice * orderedQty;
                localProfit += (sPrice - pPrice) * orderedQty;
              }
            } else {
              let globSnap = { empty: true };
              if (currentBarcode) {
                globSnap = await getDocs(query(collection(db, "users", uid, "global_inventory"), where("barcode", "==", currentBarcode)));
              }
              if (globSnap.empty && currentItemName) {
                globSnap = await getDocs(query(collection(db, "users", uid, "global_inventory"), where("itemName", "==", currentItemName)));
              }
              if (!globSnap.empty) {
                itemFound = true;
                const invDocRef = globSnap.docs[0].ref;
                const currentQty = globSnap.docs[0].data().quantity || 0;
                await updateDoc(invDocRef, { quantity: Math.max(0, currentQty - orderedQty) });
                const itemData = globSnap.docs[0].data();
                const pPrice = Number(itemData.purchasePrice || 0);
                const sPrice = Number(prod.price || itemData.salesPrice || prod.salesPrice || 0);
                globalItems.push({ ...prod, itemName: itemData.itemName || currentItemName, price: sPrice, purchasePrice: pPrice });
                globalTotal += sPrice * orderedQty;
                globalProfit += (sPrice - pPrice) * orderedQty;
              }
            }

            if (!itemFound) {
              const fallbackPrice = Number(prod.price || prod.salesPrice || 0);
              if (isOrderGlobal) {
                globalItems.push({ ...prod, itemName: currentItemName, price: fallbackPrice, purchasePrice: fallbackPrice * 0.8 });
                globalTotal += fallbackPrice * orderedQty;
                globalProfit += (fallbackPrice * 0.2) * orderedQty;
              } else {
                localItems.push({ ...prod, itemName: currentItemName, price: fallbackPrice, purchasePrice: fallbackPrice * 0.8 });
                localTotal += fallbackPrice * orderedQty;
                localProfit += (fallbackPrice * 0.2) * orderedQty;
              }
            }
          }
          const bNo = orderData.orderId || orderData.billNo || orderData.invoiceId || `ONL-${orderId.slice(-6).toUpperCase()}`;
          const bDate = new Date().toLocaleDateString("en-GB");
          if (localItems.length > 0) {
            await addDoc(collection(db, "users", uid, "sales"), { billNo: bNo, invoiceId: bNo, billDate: bDate, items: localItems, total: localTotal, profit: localProfit, paymentMode: "ONLINE", isGlobalMode: false, createdAt: serverTimestamp() });
          }
          if (globalItems.length > 0) {
            await addDoc(collection(db, "users", uid, "sales"), { billNo: bNo, invoiceId: bNo, billDate: bDate, items: globalItems, total: globalTotal, profit: globalProfit, paymentMode: "ONLINE", isGlobalMode: true, createdAt: serverTimestamp() });
          }
        }
      }
      if (customerUid) {
        const customerRef = doc(db, "customers", customerUid, "orders", orderId);
        const snap = await getDoc(customerRef);
        if (snap.exists()) {
          const data = snap.data();
          const updatedShops = (data.orderedShops || []).map(shop => {
            if (shop.shopId === uid) { return { ...shop, status: status }; }
            return shop;
          });
          await updateDoc(customerRef, { status: status, orderedShops: updatedShops });
        }
      }
    } catch (e) {
      console.log("Status Update Main Error: ", e);
      Alert.alert("Error", "Status Update Failed");
    }
  };

  const resumeOrder = async (order) => {
    const restoredStatus = order.lastStatus || "Accepted";
    try {
      const subCol = getSubCol(currentAppMode);
      try {
        await updateDoc(doc(db, "users", uid, subCol, order.id), { 
          status: restoredStatus,
          pendingMessage: "",
          pendingUntil: null
        });
      } catch {
        await updateDoc(doc(db, "users", uid, "orders", order.id), { 
          status: restoredStatus,
          pendingMessage: "",
          pendingUntil: null
        });
      }

      if (order.customerUid) {
        const customerRef = doc(db, "customers", order.customerUid, "orders", order.id);
        const snap = await getDoc(customerRef);
        if (snap.exists()) {
          const data = snap.data();
          const updatedShops = (data.orderedShops || []).map(shop => {
            if (shop.shopId === uid) { 
              return { ...shop, status: restoredStatus, pendingMessage: "", pendingUntil: null }; 
            }
            return shop;
          });
          await updateDoc(customerRef, { 
            status: restoredStatus, 
            orderedShops: updatedShops,
            pendingMessage: "",
            pendingUntil: null
          });
        }
      }
      Alert.alert("Success", `Order resumed to "${restoredStatus}"`);
    } catch (e) {
      console.log("Resume Order Error: ", e);
      Alert.alert("Error", "Failed to resume order");
    }
  };

  const savePending = async () => {
    try {
      const subCol = getSubCol(currentAppMode);
      const originalStatus = selectedOrder.status === "Pending" ? (selectedOrder.lastStatus || "Accepted") : (selectedOrder.status || "Accepted");
      
      try {
        await updateDoc(doc(db, "users", uid, subCol, selectedOrder.id), { 
          status: "Pending", 
          lastStatus: originalStatus, 
          pendingUntil: new Date(selectedDate.getTime() + 60 * 60 * 1000).toISOString(), 
          pendingMessage: pendingMessage 
        });
      } catch {
        await updateDoc(doc(db, "users", uid, "orders", selectedOrder.id), { 
          status: "Pending", 
          lastStatus: originalStatus, 
          pendingUntil: new Date(selectedDate.getTime() + 60 * 60 * 1000).toISOString(), 
          pendingMessage: pendingMessage 
        });
      }
      if (selectedOrder.customerUid) {
        await updateDoc(doc(db, "customers", selectedOrder.customerUid, "orders", selectedOrder.id), { 
          status: "Pending", 
          lastStatus: originalStatus, 
          pendingUntil: selectedDate.toISOString(), 
          pendingMessage: pendingMessage 
        });
      }
      setPendingModal(false);
      setPendingMessage("");
    } catch (e) {
      Alert.alert("Error", "Pending Save Failed");
    }
  };

  const rejectOrder = async (orderId, customerUid) => {
    try {
      const subCol = getSubCol(currentAppMode);
      try {
        await updateDoc(doc(db, "users", uid, subCol, orderId), { status: "Rejected" });
      } catch {
        await updateDoc(doc(db, "users", uid, "orders", orderId), { status: "Rejected" });
      }
      if (customerUid) {
        await updateDoc(doc(db, "customers", customerUid, "orders", orderId), { status: "Rejected" });
      }
    } catch {
      Alert.alert("Error", "Reject Failed");
    }
  };

  const nextStatus = (current, lastStatus) => {
    const status = current === "Pending" ? lastStatus : current;
    switch (status) {
      case "Pending Verification": return "Accepted";
      case "Accepted": return "Packed";
      case "Packed": return "Out For Delivery";
      case "Out For Delivery": return "Delivered";
      default: return null;
    }
  };

  const getProgress = (status) => {
    switch (status) {
      case "Pending Verification": return 20;
      case "Accepted": return 40;
      case "Packed": return 60;
      case "Pending": return 50;
      case "Out For Delivery": return 85;
      case "Delivered": return 100;
      default: return 0;
    }
  };

  const getBadgeStyle = (status) => {
    switch(status) {
      case "Delivered": return styles.badgeGreen;
      case "Pending Verification": return styles.badgeBlue;
      case "Out For Delivery": return styles.badgePurple;
      case "Rejected": return styles.badgeRed;
      default: return styles.badgeOrange;
    }
  };

  const getBadgeTextStyle = (status) => {
    switch(status) {
      case "Delivered": return styles.textGreen;
      case "Pending Verification": return styles.textBlue;
      case "Out For Delivery": return styles.textPurple;
      case "Rejected": return styles.textRed;
      default: return styles.textOrange;
    }
  };

// Filter & Search Logic
  const filteredOrders = useMemo(() => {
    return orders.filter(item => {
      // 1. Walk-in Customer orders-ஐ filter செய்து நீக்குதல்
      const custName = (item.customerName || "").toLowerCase().trim();
      const orderType = (item.orderType || item.type || "").toLowerCase().trim();
      
      if (
        custName.includes("walk-in") || 
        custName === "walk in customer" || 
        orderType.includes("walk-in") || 
        item.isWalkIn === true
      ) {
        return false;
      }

      const currentStatus = (item.status || "Pending Verification").trim();

      // Tab Filtering
      if (activeTab === "New") {
        const isNew = ["Pending Verification", "Accepted", "Packed", "Out For Delivery"].some(
          s => s.toLowerCase() === currentStatus.toLowerCase()
        );
        if (!isNew) return false;
      } else if (activeTab === "Hold") {
        if (currentStatus.toLowerCase() !== "pending") return false;
      } else if (activeTab === "Completed") {
        if (currentStatus.toLowerCase() !== "delivered") return false;
      } else if (activeTab === "Rejected") {
        if (currentStatus.toLowerCase() !== "rejected") return false;
      }

      // Search Filtering
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const idMatch = (item.orderId || item.id || "").toLowerCase().includes(q);
        const nameMatch = (item.customerName || "").toLowerCase().includes(q);
        const phoneMatch = (item.customerPhone || "").includes(q);
        const itemMatch = (item.items || []).some(prod => 
          (prod.itemName || prod.name || "").toLowerCase().includes(q)
        );
        return idMatch || nameMatch || phoneMatch || itemMatch;
      }

      return true;
    });
  }, [orders, activeTab, searchQuery]);

  const renderItem = ({ item }) => {
    const isPending = item.status === "Pending";
    const next = nextStatus(item.status, item.lastStatus);
    const activeTimeline = (current, targetArray) => targetArray.includes(current);

    let displayItems = item.items || [];
    if (!displayItems.length && item.orderedShops) {
      const myShop = item.orderedShops.find(s => s.shopId === uid);
      if (myShop) displayItems = myShop.items || [];
    }

    const orderTotal = item.totalAmount || item.total || displayItems.reduce((sum, p) => sum + ((p.price || 0) * (p.qty || 1)), 0);

    return (
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <View style={styles.topRow}>
          <Text style={[styles.orderId, { color: theme.text }]}>🆔 {item.orderId || item.id}</Text>
          <View style={[styles.statusBadge, getBadgeStyle(item.status)]}>
            <Text style={[styles.statusText, getBadgeTextStyle(item.status)]}>{item.status || "Pending Verification"}</Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: darkMode ? "#334155" : "#f1f5f9" }]} />

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Icon name="account" size={18} color={darkMode ? "#94a3b8" : "#64748b"} />
            <Text style={[styles.name, { color: theme.text }]}>{item.customerName || "Online Customer"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Icon name="phone" size={18} color={darkMode ? "#94a3b8" : "#64748b"} />
            <Text style={[styles.phone, { color: darkMode ? "#cbd5e1" : "#475569" }]}>{item.customerPhone || "N/A"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Icon name="map-marker" size={18} color="#ef4444" />
            <Text style={[styles.address, { color: darkMode ? "#94a3b8" : "#64748b" }]}>{item.deliveryAddress || "Address not provided"}</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          {item.customerPhone && (
            <TouchableOpacity style={[styles.smallBtn, { backgroundColor: "#3b82f6" }]} onPress={() => Linking.openURL(`tel:${item.customerPhone}`)}>
              <Icon name="phone-outgoing" size={16} color="#fff" />
              <Text style={styles.smallBtnText}>Call Customer</Text>
            </TouchableOpacity>
          )}

          {item.deliveryAddress && (
            <TouchableOpacity style={[styles.smallBtn, { backgroundColor: "#10b981" }]} onPress={() => Linking.openURL(`http://maps.google.com/?q=${encodeURIComponent(item.deliveryAddress)}`)}>
              <Icon name="google-maps" size={16} color="#fff" />
              <Text style={styles.smallBtnText}>Locate on Map</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.amountContainer, { backgroundColor: darkMode ? "#1e293b" : "#f8fafc" }]}>
          <Text style={[styles.amountLabel, { color: darkMode ? "#94a3b8" : "#64748b" }]}>Total Payout:</Text>
          <Text style={styles.amount}>₹{Number(orderTotal).toFixed(2)}</Text>
        </View>

        <View style={{ marginVertical: 10 }}>
          <Text style={styles.sectionTitle}>Order Progress</Text>
          <View style={[styles.progressBg, { backgroundColor: darkMode ? "#334155" : "#e2e8f0" }]}>
            <View style={[styles.progressFill, { width: `${getProgress(item.status)}%` }]} />
          </View>
        </View>

        <View style={[styles.timelineContainer, { backgroundColor: darkMode ? "#1e293b" : "#fdfdfd", borderColor: darkMode ? "#334155" : "#f1f5f9" }]}>
          <Text style={styles.sectionTitle}>Tracking Timeline</Text>
          <View style={styles.timeStep}>
            <Icon name="check-circle" size={20} color="#22c55e" />
            <Text style={[styles.trackTextActive, { color: theme.text }]}>Order Placed</Text>
          </View>
          <View style={styles.timeStep}>
            <Icon name="package-variant" size={20} color={activeTimeline(item.status, ["Accepted", "Packed", "Pending", "Out For Delivery", "Delivered"]) ? "#22c55e" : (darkMode ? "#475569" : "#cbd5e1")} />
            <Text style={activeTimeline(item.status, ["Accepted", "Packed", "Pending", "Out For Delivery", "Delivered"]) ? [styles.trackTextActive, { color: theme.text }] : styles.trackTextInactive}>Accepted / Packed</Text>
          </View>
          <View style={styles.timeStep}>
            <Icon name="truck-fast" size={20} color={activeTimeline(item.status, ["Out For Delivery", "Delivered"]) ? "#22c55e" : (darkMode ? "#475569" : "#cbd5e1")} />
            <Text style={activeTimeline(item.status, ["Out For Delivery", "Delivered"]) ? [styles.trackTextActive, { color: theme.text }] : styles.trackTextInactive}>Out For Delivery</Text>
          </View>
          <View style={styles.timeStep}>
            <Icon name="home-check" size={20} color={item.status === "Delivered" ? "#22c55e" : (darkMode ? "#475569" : "#cbd5e1")} />
            <Text style={item.status === "Delivered" ? [styles.trackTextActive, { color: theme.text }] : styles.trackTextInactive}>Delivered</Text>
          </View>
        </View>

        {isPending && (
          <View style={[styles.pendingAlertBox, { backgroundColor: darkMode ? "#431407" : "#fff7ed", borderColor: darkMode ? "#7c2d12" : "#ffedd5" }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: darkMode ? "#fb923c" : "#c2410c", fontWeight: "bold", fontSize: 14 }}>⏸ Order Postponed (Pending)</Text>
              <TouchableOpacity onPress={() => {
                setSelectedOrder(item);
                setPendingMessage(item.pendingMessage || "");
                setSelectedDate(new Date(Date.now() + 60 * 60 * 1000));
                setPendingModal(true);
              }}>
                <Icon name="pencil-box-outline" size={22} color="#f59e0b" />
              </TouchableOpacity>
            </View>
            <Text style={[styles.pendingAlertReason, { color: darkMode ? "#fdba74" : "#7c2d12" }]}>Reason: {item.pendingMessage || "N/A"}</Text>
          </View>
        )}

        {displayItems.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionTitle}>Items ({displayItems.length})</Text>
            <View style={[styles.itemsBlock, { backgroundColor: darkMode ? "#1e293b" : "#f8fafc" }]}>
              {displayItems.map((product, index) => (
                <View key={index} style={styles.itemRow}>
                  <Text style={[styles.itemName, { color: theme.text }]}>• {product.itemName || product.name}</Text>
                  <Text style={[styles.itemQty, { color: darkMode ? "#94a3b8" : "#64748b" }]}>Qty: {product.qty || 1}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 15 }}>
          {isPending ? (
            <TouchableOpacity 
              style={[styles.mainActionBtn, { backgroundColor: "#10b981" }]} 
              onPress={() => resumeOrder(item)}
            >
              <Text style={styles.btnText}>▶ Resume Order</Text>
            </TouchableOpacity>
          ) : (
            next && (
              <TouchableOpacity 
                style={[styles.mainActionBtn, { backgroundColor: "#6366f1" }]} 
                onPress={() => updateStatus(item.id, next, item.customerUid)}
              >
                <Text style={styles.btnText}>Mark as {next}</Text>
              </TouchableOpacity>
            )
          )}

          {!["Delivered", "Rejected"].includes(item.status) && (
            <TouchableOpacity 
              style={[styles.secondaryActionBtn, { backgroundColor: "#f59e0b" }]} 
              onPress={() => { setSelectedOrder(item); setPendingModal(true); }}
            >
              <Text style={styles.btnText}>{isPending ? "Edit Hold" : "Hold"}</Text>
            </TouchableOpacity>
          )}

          {!["Delivered", "Rejected"].includes(item.status) && (
            <TouchableOpacity 
              style={[styles.secondaryActionBtn, { backgroundColor: "#ef4444" }]} 
              onPress={() => rejectOrder(item.id, item.customerUid)}
            >
              <Text style={styles.btnText}>Reject</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loader, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar backgroundColor={theme.background} barStyle={darkMode ? "light-content" : "dark-content"} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={[styles.backButton, { backgroundColor: darkMode ? "#1e293b" : "#f1f5f9" }]} 
          onPress={handleBackPress}
        >
          <Icon name="arrow-left" size={22} color={theme.text} />
        </TouchableOpacity>
        <Icon name="clipboard-text-clock-outline" size={26} color="#6366f1" />
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          Customer Orders ({currentAppMode === "global" ? "Global" : "Local"})
        </Text>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: darkMode ? "#1e293b" : "#fff", borderColor: darkMode ? "#334155" : "#e2e8f0" }]}>
        <Icon name="magnify" size={22} color={darkMode ? "#94a3b8" : "#64748b"} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search by ID, name, phone, item..."
          placeholderTextColor={darkMode ? "#64748b" : "#94a3b8"}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Icon name="close-circle" size={18} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={{ marginBottom: 12 }}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContainer}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[
                  styles.tabPill,
                  isActive
                    ? styles.activeTabPill
                    : [styles.inactiveTabPill, { backgroundColor: darkMode ? "#1e293b" : "#fff", borderColor: darkMode ? "#334155" : "#e2e8f0" }]
                ]}
              >
                <Text
                  style={[
                    styles.tabPillText,
                    isActive ? styles.activeTabText : [styles.inactiveTabText, { color: darkMode ? "#cbd5e1" : "#1e293b" }]
                  ]}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* List */}
      <FlatList
        data={filteredOrders}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Icon name="package-variant-closed" size={60} color={darkMode ? "#475569" : "#cbd5e1"} />
            <Text style={styles.emptyText}>No Orders Found</Text>
          </View>
        }
      />

      {/* Pending Modal */}
      <Modal visible={pendingModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={[styles.newModalBox, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>⏸ Hold & Reschedule Order</Text>
            <TextInput 
              placeholder="Enter Delay Reason" 
              placeholderTextColor="#94a3b8"
              value={pendingMessage} 
              onChangeText={setPendingMessage} 
              style={[styles.modalInput, { backgroundColor: darkMode ? "#1e293b" : "#f8fafc", borderColor: darkMode ? "#334155" : "#e2e8f0", color: theme.text }]} 
            />
            <TouchableOpacity style={[styles.modalPickerBtn, { backgroundColor: darkMode ? "#1e293b" : "#fff", borderColor: darkMode ? "#334155" : "#e2e8f0" }]} onPress={() => setShowDate(true)}>
              <Icon name="calendar" size={18} color={darkMode ? "#94a3b8" : "#64748b"} />
              <Text style={[styles.modalPickerText, { color: theme.text }]}>Date: {selectedDate.toLocaleDateString("en-GB")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalPickerBtn, { backgroundColor: darkMode ? "#1e293b" : "#fff", borderColor: darkMode ? "#334155" : "#e2e8f0" }]} onPress={() => setShowTime(true)}>
              <Icon name="clock-outline" size={18} color={darkMode ? "#94a3b8" : "#64748b"} />
              <Text style={[styles.modalPickerText, { color: theme.text }]}>Time: {selectedDate.toLocaleTimeString("en-GB", {hour: '2-digit', minute:'2-digit'})}</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <TouchableOpacity style={[styles.modalActionBtn, { backgroundColor: darkMode ? "#334155" : "#cbd5e1" }]} onPress={() => setPendingModal(false)}>
                <Text style={[styles.btnText, { color: darkMode ? "#fff" : '#1e293b' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalActionBtn, { backgroundColor: "#f59e0b" }]} onPress={savePending}>
                <Text style={styles.btnText}>Apply Hold</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {showDate && <DateTimePicker value={selectedDate} mode="date" display="default" onChange={(e, date) => { setShowDate(false); if (date) setSelectedDate(date); }} />}
      {showTime && <DateTimePicker value={selectedDate} mode="time" display="default" onChange={(e, time) => { setShowTime(false); if (time) { const d = new Date(selectedDate); d.setHours(time.getHours()); d.setMinutes(time.getMinutes()); setSelectedDate(d); } }} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginVertical: 12 },
  backButton: { padding: 8, borderRadius: 12, marginRight: 10 },
  title: { fontSize: 18, fontWeight: "800", marginLeft: 8, flex: 1 },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },

  tabsContainer: {
    paddingHorizontal: 16,
    gap: 10,
    alignItems: "center",
  },
  tabPill: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  activeTabPill: {
    backgroundColor: "#ff701e",
    elevation: 3,
    shadowColor: "#ff701e",
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  inactiveTabPill: {
    borderWidth: 1.5,
  },
  tabPillText: {
    fontSize: 15,
    fontWeight: "700",
  },
  activeTabText: {
    color: "#ffffff",
  },
  inactiveTabText: {
    fontWeight: "700",
  },

  card: { borderRadius: 20, padding: 16, marginBottom: 16, elevation: 3, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderId: { fontWeight: "800", fontSize: 15 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  badgeGreen: { backgroundColor: "#dcfce7" },
  badgeOrange: { backgroundColor: "#ffedd5" },
  badgeBlue: { backgroundColor: "#e0f2fe" },
  badgePurple: { backgroundColor: "#f3e8ff" },
  badgeRed: { backgroundColor: "#fee2e2" },
  textGreen: { color: "#15803d", fontWeight: "700" },
  textOrange: { color: "#c2410c", fontWeight: "700" },
  textBlue: { color: "#0369a1", fontWeight: "700" },
  textPurple: { color: "#6b21a8", fontWeight: "700" },
  textRed: { color: "#b91c1c", fontWeight: "700" },
  statusText: { fontSize: 12 },
  divider: { height: 1, marginVertical: 12 },
  infoSection: { gap: 6 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontWeight: "700", fontSize: 15 },
  phone: { fontWeight: "500" },
  address: { fontSize: 13, flex: 1 },
  actionRow: { flexDirection: "row", marginTop: 12, gap: 8 },
  smallBtn: { flexDirection: "row", alignItems: "center", justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, flex: 1 },
  smallBtnText: { color: "#fff", marginLeft: 6, fontWeight: "700", fontSize: 13 },
  amountContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 12, marginTop: 14 },
  amountLabel: { fontSize: 14, fontWeight: '600' },
  amount: { fontSize: 20, fontWeight: "900", color: "#10b981" },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: "#94a3b8", textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 },
  progressBg: { height: 8, borderRadius: 10, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#10b981", borderRadius: 10 },
  timelineContainer: { marginVertical: 12, borderWidth: 1, padding: 12, borderRadius: 14 },
  timeStep: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  trackTextActive: { fontSize: 14, fontWeight: "700" },
  trackTextInactive: { fontSize: 14, color: "#94a3b8", fontWeight: "500" },
  itemsBlock: { borderRadius: 12, padding: 10, gap: 6 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  itemName: { fontWeight: "600", fontSize: 14 },
  itemQty: { fontWeight: "700", fontSize: 13 },
  pendingAlertBox: { padding: 12, borderRadius: 14, marginVertical: 10, borderWidth: 1 },
  pendingAlertReason: { marginTop: 4, fontSize: 13, fontWeight: '500' },
  mainActionBtn: { flex: 2, padding: 14, borderRadius: 14, alignItems: "center", justifyContent: 'center' },
  secondaryActionBtn: { flex: 1, padding: 14, borderRadius: 14, alignItems: "center", justifyContent: 'center' },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100, gap: 10 },
  emptyText: { color: '#94a3b8', fontSize: 16, fontWeight: '700' },
  modalBg: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.6)", justifyContent: "center", padding: 20 },
  newModalBox: { borderRadius: 24, padding: 24, elevation: 10 },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 15 },
  modalInput: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12, fontSize: 15 },
  modalPickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, padding: 14, borderRadius: 14, marginBottom: 10 },
  modalPickerText: { fontWeight: "600", fontSize: 14 },
  modalActionBtn: { flex: 1, padding: 14, borderRadius: 14, alignItems: "center", marginTop: 10 }
});