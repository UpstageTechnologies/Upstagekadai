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
import { collection, onSnapshot, doc, updateDoc, getDoc, query, where, getDocs, addDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../utils/firebaseConfig";
import { getSession } from "../utils/session";
import { useRoute, useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../theme/ThemeContext";

const TABS = ["All", "New", "Hold", "Completed", "Rejected"];

const asArray = (value) => Array.isArray(value) ? value : [];
const asText = (value) => value == null ? "" : String(value);

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

  // Door Delivery & Shop Configuration States
  const [doorDeliveryEnabled, setDoorDeliveryEnabled] = useState(true);
  const [shopProfile, setShopProfile] = useState({ name: "My Shop", address: "", phone: "" });
  const [deliveryStaffList, setDeliveryStaffList] = useState([]);

  // Assign Delivery Modal States
  const [assignDeliveryModal, setAssignDeliveryModal] = useState(false);
  const [orderToDeliver, setOrderToDeliver] = useState(null);
  const [selectedDeliveryStaff, setSelectedDeliveryStaff] = useState(null);
  const [customDeliveryBoyName, setCustomDeliveryBoyName] = useState("");
  const [customDeliveryBoyPhone, setCustomDeliveryBoyPhone] = useState("");
  const [assigningLoading, setAssigningLoading] = useState(false);

  // Store Pickup / Packed Notification Modal States
  const [pickupModalVisible, setPickupModalVisible] = useState(false);
  const [orderToPickup, setOrderToPickup] = useState(null);

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("Dashboard");
    }
  };

  const getSubCol = (mode) => (mode === "global" ? "global_orders" : "local_orders");

useEffect(() => {
    let unsubscribe = null;
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

        // App Mode-ah route params ya illa AsyncStorage-la irunthu eduthukkurom
        let activeMode = route.params?.appMode;
        if (!activeMode) {
          const savedMode = await AsyncStorage.getItem("app_mode");
          activeMode = savedMode === "global" ? "global" : "local";
        }

        if (!isMounted) return;
        setCurrentAppMode(activeMode);

        // Mode-ku etha maari correct collection name set panrathu (Strict separation)
        const subCollectionName = activeMode === "global" ? "global_orders" : "local_orders";

        console.log(`📡 Fetching from: users/${session.uid}/${subCollectionName}`);

        // Listen to Shop Profile & Delivery Configuration
        const unsubShop = onSnapshot(doc(db, "users", session.uid), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const dEnabled = data.doorDeliveryEnabled ?? data.deliveryConfig?.doorDeliveryEnabled ?? true;
            setDoorDeliveryEnabled(dEnabled);
            setShopProfile({
              name: data.shopName || data.storeName || "My Store",
              address: typeof data.address === "string" ? data.address : (data.address?.fullAddress || ""),
              phone: data.phone || data.mobile || "",
            });
          }
        });

        // Listen to Delivery Boys for this shop
        const unsubStaff = onSnapshot(collection(db, "users", session.uid, "staffs"), (snap) => {
          const dBoys = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((s) => s.role === "delivery");
          setDeliveryStaffList(dBoys);
        });

        // Antha specific collection-ah mattum real-time-la listen panrathu
        unsubscribe = onSnapshot(
          collection(db, "users", session.uid, subCollectionName),
          (snapshot) => {
            if (!isMounted) return;

            const fetchedOrders = snapshot.docs.map(d => ({
              ...d.data(),
              id: String(d.id),
            }));

            // Walk-in customers-ah filter pani thallirom
            const filtered = fetchedOrders.filter(item => {
              const name = asText(item.customerName).toLowerCase();
              const orderType = asText(item.orderType || item.type).toLowerCase();
              return !name.includes("walk-in") && !name.includes("walk in") && !orderType.includes("walk-in") && !item.isWalkIn;
            });

            // Date descending order-la sort panrathu (Latest first)
            filtered.sort((a, b) => {
              const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
              const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
              return dateB - dateA;
            });

            setOrders(filtered);
            setLoading(false);
          },
          (err) => {
            console.log("Collection snapshot error:", err);
            if (isMounted) setLoading(false);
          }
        );

      } catch (e) {
        console.log("loadOrders Error:", e);
        if (isMounted) setLoading(false);
      }
    };

    loadOrders();

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
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
          if (!orderedItems.length && Array.isArray(orderData.orderedShops)) {
            const currentShopSection = orderData.orderedShops.find(s => s?.shopId === uid);
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
          const updatedShops = asArray(data.orderedShops).map(shop => {
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
          const updatedShops = asArray(data.orderedShops).map(shop => {
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

  // Toggle Door Delivery ON / OFF for this shop
  const toggleDoorDelivery = async () => {
    const nextVal = !doorDeliveryEnabled;
    setDoorDeliveryEnabled(nextVal);
    try {
      await updateDoc(doc(db, "users", uid), {
        doorDeliveryEnabled: nextVal,
        "deliveryConfig.doorDeliveryEnabled": nextVal,
      });
      Alert.alert(
        nextVal ? "Door Delivery Active 🛵" : "Store Pickup Only 🏬",
        nextVal
          ? "Door Delivery is now ON. You can assign delivery boys using the Delivery App."
          : "Delivery is now OFF. Customers will pick up their packed orders in your shop."
      );
    } catch (e) {
      console.log("Error toggling delivery:", e);
    }
  };

  // Assign Order to Delivery Boy & Send task to Delivery App
  const handleAssignDelivery = async () => {
    if (!orderToDeliver || !uid) return;

    let finalStaffName = selectedDeliveryStaff?.name || customDeliveryBoyName.trim();
    let finalStaffPhone = selectedDeliveryStaff?.mobile || customDeliveryBoyPhone.trim();
    let finalStaffId = selectedDeliveryStaff?.staffId || selectedDeliveryStaff?.id || "";

    if (!finalStaffName) {
      Alert.alert("Missing Delivery Boy", "Please select or enter the Delivery Boy's name.");
      return;
    }

    setAssigningLoading(true);

    try {
      // If custom delivery boy entered, match existing staff or auto-register to ensure login capability
      if (!selectedDeliveryStaff && finalStaffPhone) {
        const cleanCustomPhone = finalStaffPhone.replace(/\D/g, "");
        const existingStaff = deliveryStaffList.find(
          (s) => (s.mobile || "").replace(/\D/g, "") === cleanCustomPhone
        );

        if (existingStaff) {
          finalStaffId = existingStaff.staffId || existingStaff.id;
          finalStaffName = existingStaff.name || finalStaffName;
        } else {
          const currentYear = new Date().getFullYear();
          finalStaffId = `${currentYear}DEL${Date.now().toString().slice(-4)}`;
          const autoPass = cleanCustomPhone.length >= 6 ? cleanCustomPhone.slice(-6) : "del12345";
          const newStaffPayload = {
            staffId: finalStaffId,
            name: finalStaffName,
            mobile: finalStaffPhone,
            password: autoPass,
            role: "delivery",
            masterUid: uid,
            createdAt: serverTimestamp(),
          };

          try {
            await setDoc(doc(db, "users", uid, "staffs", finalStaffId), newStaffPayload);
            await setDoc(doc(db, "staffs", finalStaffId), newStaffPayload);
            console.log(`✅ [Dispatch] Registered delivery staff: ${finalStaffId} (${finalStaffName})`);
          } catch (regErr) {
            console.warn("⚠️ [Dispatch] Staff auto-registration notice:", regErr?.message);
          }
        }
      }

      if (!finalStaffId) {
        finalStaffId = `DEL-${Date.now().toString().slice(-4)}`;
      }

      console.log("🛵 [Dispatch] Assigning order:", {
        orderId: orderToDeliver.orderId || orderToDeliver.id,
        sellerUid: uid,
        staffId: finalStaffId,
        staffName: finalStaffName,
        mode: currentAppMode,
      });

      let displayItems = asArray(orderToDeliver.items);
      if (!displayItems.length && Array.isArray(orderToDeliver.orderedShops)) {
        const myShop = orderToDeliver.orderedShops.find((s) => s?.shopId === uid);
        if (myShop) displayItems = myShop.items || [];
      }

      const orderTotal = Number(
        orderToDeliver.totalAmount ??
        orderToDeliver.total ??
        displayItems.reduce((sum, p) => sum + (Number(p?.price) || 0) * (Number(p?.qty) || 1), 0)
      ) || 0;

      const customerId = asText(
        orderToDeliver.customerUid ||
        orderToDeliver.customerId ||
        orderToDeliver.userId ||
        ""
      );

      const deliveryTask = {
        id: String(orderToDeliver.id),
        orderId: String(orderToDeliver.orderId || orderToDeliver.id),
        orderDocId: String(orderToDeliver.id),
        shopId: uid,
        shopName: shopProfile.name || "My Store",
        shopAddress: shopProfile.address || "",
        shopPhone: shopProfile.phone || "",
        customerName: asText(orderToDeliver.customerName || "Customer"),
        customerPhone: asText(orderToDeliver.customerPhone || ""),
        customerUid: customerId,
        deliveryAddress: asText(orderToDeliver.deliveryAddress || "Address not provided"),
        items: displayItems,
        totalAmount: orderTotal,
        paymentMode: orderToDeliver.paymentMode || "COD",
        assignedStaffId: finalStaffId,
        assignedStaffName: finalStaffName,
        assignedStaffPhone: finalStaffPhone,
        assignedDeliveryAuthUid: selectedDeliveryStaff?.authUid || "",
        status: "assigned", // assigned -> accepted -> out_for_delivery -> delivered
        orderMode: currentAppMode || "local",
        assignedAt: serverTimestamp(),
        createdAt: orderToDeliver.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // 1. Write task into global `delivery_orders` (listened to by Delivery App)
      await setDoc(doc(db, "delivery_orders", String(orderToDeliver.id)), deliveryTask, { merge: true });

      // 2. Write copy under shop's delivery_orders
      await setDoc(doc(db, "users", uid, "delivery_orders", String(orderToDeliver.id)), deliveryTask, { merge: true });

      // 3. Update order in POS shop collection (local_orders or global_orders)
      const subCol = getSubCol(currentAppMode);
      const posUpdate = {
        status: "Out For Delivery",
        deliveryStatus: "assigned",
        assignedDeliveryBoyId: finalStaffId,
        assignedDeliveryBoyName: finalStaffName,
        assignedDeliveryBoyPhone: finalStaffPhone,
        dispatchedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      try {
        await updateDoc(doc(db, "users", uid, subCol, String(orderToDeliver.id)), posUpdate);
      } catch (colErr) {
        console.warn(`Fallback write from ${subCol} to orders:`, colErr?.message);
        await updateDoc(doc(db, "users", uid, "orders", String(orderToDeliver.id)), posUpdate);
      }

      // 4. Update customer's order if customerUid is available
      if (customerId) {
        try {
          const custRef = doc(db, "customers", customerId, "orders", String(orderToDeliver.id));
          await updateDoc(custRef, {
            status: "Out For Delivery",
            deliveryStatus: "assigned",
            deliveryBoyName: finalStaffName,
            deliveryBoyPhone: finalStaffPhone,
            updatedAt: serverTimestamp(),
          });
        } catch (custErr) {
          console.log("Customer order update notice:", custErr?.message);
        }
      }

      console.log("✅ [Dispatch Success] Order dispatched successfully to Delivery App:", {
        orderId: orderToDeliver.orderId || orderToDeliver.id,
        staffId: finalStaffId,
        targetGlobalDoc: `delivery_orders/${orderToDeliver.id}`,
      });

      setAssignDeliveryModal(false);
      Alert.alert(
        "Order Dispatched 🛵",
        `Order #${orderToDeliver.orderId || orderToDeliver.id} assigned to ${finalStaffName}. Details sent to Delivery App!`
      );
    } catch (e) {
      console.error("❌ [handleAssignDelivery Error]:", {
        orderId: orderToDeliver?.orderId || orderToDeliver?.id,
        sellerUid: uid,
        selectedStaffId: finalStaffId,
        targetPath: `delivery_orders/${orderToDeliver?.id}`,
        errorCode: e?.code,
        errorMessage: e?.message,
      });

      let userMsg = "Failed to assign delivery. Please try again.";
      if (e?.code === "permission-denied") {
        userMsg = "Permission Denied: Your account is not authorized to dispatch to delivery orders.";
      } else if (e?.code === "unavailable" || (e?.message && e.message.toLowerCase().includes("network"))) {
        userMsg = "Network connection failed. Please check your internet connection.";
      } else if (e?.message) {
        userMsg = e.message;
      }
      Alert.alert("Dispatch Error", userMsg);
    } finally {
      setAssigningLoading(false);
    }
  };

  // Mark Packed & Notify Customer when Delivery is OFF (or for Store Pickup)
  const handleMarkPackedAndNotify = async (order) => {
    try {
      const subCol = getSubCol(currentAppMode);
      const packedUpdate = {
        status: "Packed",
        pickupReady: true,
        packedAt: serverTimestamp(),
      };

      try {
        await updateDoc(doc(db, "users", uid, subCol, order.id), packedUpdate);
      } catch {
        await updateDoc(doc(db, "users", uid, "orders", order.id), packedUpdate);
      }

      // Update customer order document
      if (order.customerUid) {
        try {
          const custRef = doc(db, "customers", order.customerUid, "orders", order.id);
          await updateDoc(custRef, {
            status: "Packed",
            pickupStatus: "ready_for_pickup",
            pickupMessage: `Your order is packed! Please get your product in shop: ${shopProfile.name}`,
          });

          // Add notification for customer
          await addDoc(collection(db, "customers", order.customerUid, "notifications"), {
            title: "🛍️ Your order is packed!",
            message: `Your order is packed! Get your product in shop: ${shopProfile.name} (${shopProfile.address || ""})`,
            orderId: order.id,
            type: "order_packed",
            createdAt: serverTimestamp(),
          });
        } catch (e) {
          console.log("Customer notification error:", e);
        }
      }

      setOrderToPickup(order);
      setPickupModalVisible(true);
    } catch (e) {
      console.log("Mark packed error:", e);
      Alert.alert("Error", "Failed to update order status");
    }
  };

  const sendPickupWhatsAppMessage = (order) => {
    if (!order?.customerPhone) {
      Alert.alert("No Phone Number", "Customer phone number is not available.");
      return;
    }
    const cleanPhone = order.customerPhone.replace(/\D/g, "");
    const msg = `Hello ${order.customerName || "Customer"}! 👋\n\nYour order #${order.orderId || order.id} from *${shopProfile.name}* is packed and ready! 🛍️\n\n📍 *Get your product in our shop:*\n${shopProfile.address || shopProfile.name}\n${shopProfile.phone ? "📞 Phone: " + shopProfile.phone : ""}\n\nThank you for shopping with us! 😊`;
    const url = `whatsapp://send?phone=${cleanPhone.length === 10 ? "91" + cleanPhone : cleanPhone}&text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://wa.me/${cleanPhone.length === 10 ? "91" + cleanPhone : cleanPhone}?text=${encodeURIComponent(msg)}`);
    });
  };

  const sendDeliveryWhatsAppMessage = (order, staffPhone, staffName) => {
    if (!staffPhone) return;
    const cleanPhone = staffPhone.replace(/\D/g, "");
    const msg = `🛵 *NEW DELIVERY ASSIGNED* 🛵\n\n*Order ID:* #${order.orderId || order.id}\n*Customer:* ${order.customerName || "Customer"}\n*Phone:* ${order.customerPhone}\n*Delivery Address:* ${order.deliveryAddress}\n*Amount to Collect:* ₹${order.totalAmount || order.total || 0} (${order.paymentMode || 'COD'})\n\n📍 *Google Maps Navigation:*\nhttps://maps.google.com/?q=${encodeURIComponent(order.deliveryAddress)}\n\n*Pickup from:* ${shopProfile.name}, ${shopProfile.address}`;
    const url = `whatsapp://send?phone=${cleanPhone.length === 10 ? "91" + cleanPhone : cleanPhone}&text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://wa.me/${cleanPhone.length === 10 ? "91" + cleanPhone : cleanPhone}?text=${encodeURIComponent(msg)}`);
    });
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
      const custName = asText(item.customerName).toLowerCase().trim();
      const orderType = asText(item.orderType || item.type).toLowerCase().trim();
      
      if (
        custName.includes("walk-in") || 
        custName === "walk in customer" || 
        orderType.includes("walk-in") || 
        item.isWalkIn === true
      ) {
        return false;
      }

      const currentStatus = asText(item.status || "Pending Verification").trim();

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
        const idMatch = asText(item.orderId || item.id).toLowerCase().includes(q);
        const nameMatch = asText(item.customerName).toLowerCase().includes(q);
        const phoneMatch = asText(item.customerPhone).includes(q);
        const itemMatch = asArray(item.items).some(prod => 
          asText(prod?.itemName || prod?.name).toLowerCase().includes(q)
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

    let displayItems = asArray(item.items);
    if (!displayItems.length && Array.isArray(item.orderedShops)) {
      const myShop = item.orderedShops.find(s => s?.shopId === uid);
      if (myShop) displayItems = myShop.items || [];
    }
    displayItems = asArray(displayItems);

    const orderTotal = Number(item.totalAmount ?? item.total ?? displayItems.reduce((sum, p) => sum + (Number(p?.price) || 0) * (Number(p?.qty) || 1), 0)) || 0;

    return (
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <View style={styles.topRow}>
          <Text style={[styles.orderId, { color: theme.text }]}>🆔 {asText(item.orderId || item.id)}</Text>
          <View style={[styles.statusBadge, getBadgeStyle(asText(item.status))]}>
            <Text style={[styles.statusText, getBadgeTextStyle(asText(item.status))]}>{asText(item.status || "Pending Verification")}</Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: darkMode ? "#334155" : "#f1f5f9" }]} />

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Icon name="account" size={18} color={darkMode ? "#94a3b8" : "#64748b"} />
            <Text style={[styles.name, { color: theme.text }]}>{asText(item.customerName || "Online Customer")}</Text>
          </View>
          <View style={styles.infoRow}>
            <Icon name="phone" size={18} color={darkMode ? "#94a3b8" : "#64748b"} />
            <Text style={[styles.phone, { color: darkMode ? "#cbd5e1" : "#475569" }]}>{asText(item.customerPhone || "N/A")}</Text>
          </View>
          <View style={styles.infoRow}>
            <Icon name="map-marker" size={18} color="#ef4444" />
            <Text style={[styles.address, { color: darkMode ? "#94a3b8" : "#64748b" }]}>{asText(item.deliveryAddress || "Address not provided")}</Text>
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
                  <Text style={[styles.itemName, { color: theme.text }]}>• {asText(product?.itemName || product?.name || "Item")}</Text>
                  <Text style={[styles.itemQty, { color: darkMode ? "#94a3b8" : "#64748b" }]}>Qty: {asText(product?.qty || 1)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Assigned Delivery Boy Badge (if assigned) */}
        {item.assignedDeliveryBoyName && (
          <View style={[styles.assignedDeliveryBadge, { 
            backgroundColor: item.deliveryStatus === "rejected" ? (darkMode ? "#450a0a" : "#fef2f2") : (darkMode ? "#064e3b" : "#ecfdf5"), 
            borderColor: item.deliveryStatus === "rejected" ? "#ef4444" : "#10b981" 
          }]}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              <Icon 
                name={item.deliveryStatus === "rejected" ? "alert-circle" : "moped"} 
                size={18} 
                color={item.deliveryStatus === "rejected" ? "#ef4444" : "#16a34a"} 
                style={{ marginRight: 6 }} 
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: "800", color: item.deliveryStatus === "rejected" ? "#ef4444" : "#16a34a" }}>
                  {item.deliveryStatus === "rejected" 
                    ? `Rejected by: ${item.assignedDeliveryBoyName}` 
                    : `Delivery Boy: ${item.assignedDeliveryBoyName}`}
                  {item.deliveryStatus === "accepted" ? " (Accepted)" : item.deliveryStatus === "assigned" ? " (Dispatched)" : ""}
                </Text>
                {item.assignedDeliveryBoyPhone ? (
                  <Text style={{ fontSize: 11, color: "#64748b" }}>
                    Ph: {item.assignedDeliveryBoyPhone}
                  </Text>
                ) : null}
              </View>
            </View>
            {item.assignedDeliveryBoyPhone ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(`tel:${item.assignedDeliveryBoyPhone}`)}
                style={{ backgroundColor: item.deliveryStatus === "rejected" ? "#ef4444" : "#16a34a", padding: 6, borderRadius: 8, marginLeft: 6 }}
              >
                <Icon name="phone" size={14} color="#fff" />
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* Action Buttons */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 15 }}>
          {isPending ? (
            <TouchableOpacity 
              style={[styles.mainActionBtn, { backgroundColor: "#10b981" }]} 
              onPress={() => resumeOrder(item)}
            >
              <Text style={styles.btnText}>▶ Resume Order</Text>
            </TouchableOpacity>
          ) : (
            <>
              {/* DOOR DELIVERY ON: Assign to Delivery Boy button */}
              {doorDeliveryEnabled && (["Accepted", "Packed"].includes(item.status) || item.deliveryStatus === "rejected") && (
                <TouchableOpacity
                  style={[styles.mainActionBtn, { backgroundColor: item.deliveryStatus === "rejected" ? "#ea580c" : "#16a34a" }]}
                  onPress={() => {
                    setOrderToDeliver(item);
                    setSelectedDeliveryStaff(deliveryStaffList[0] || null);
                    setCustomDeliveryBoyName("");
                    setCustomDeliveryBoyPhone("");
                    setAssignDeliveryModal(true);
                  }}
                >
                  <Icon name="moped" size={16} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={styles.btnText}>
                    {item.deliveryStatus === "rejected" ? "Reassign Delivery Boy" : "Assign Delivery Boy"}
                  </Text>
                </TouchableOpacity>
              )}

              {/* DOOR DELIVERY OFF (or In-Store Pickup): Mark Packed & Notify Customer */}
              {!doorDeliveryEnabled && item.status === "Accepted" && (
                <TouchableOpacity
                  style={[styles.mainActionBtn, { backgroundColor: "#7c3aed" }]}
                  onPress={() => handleMarkPackedAndNotify(item)}
                >
                  <Icon name="package-variant-closed" size={16} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={styles.btnText}>Pack & Notify Customer</Text>
                </TouchableOpacity>
              )}

              {/* DOOR DELIVERY OFF & ALREADY PACKED: Send message or mark collected */}
              {!doorDeliveryEnabled && item.status === "Packed" && (
                <>
                  <TouchableOpacity
                    style={[styles.mainActionBtn, { backgroundColor: "#25d366" }]}
                    onPress={() => sendPickupWhatsAppMessage(item)}
                  >
                    <Icon name="whatsapp" size={16} color="#fff" style={{ marginRight: 4 }} />
                    <Text style={styles.btnText}>Notify Pickup (WhatsApp)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secondaryActionBtn, { backgroundColor: "#10b981" }]}
                    onPress={() => updateStatus(item.id, "Delivered", item.customerUid)}
                  >
                    <Text style={styles.btnText}>✓ Collected in Shop</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Standard Next Status Button */}
              {next && !(doorDeliveryEnabled && ["Accepted", "Packed"].includes(item.status)) && !(!doorDeliveryEnabled && ["Accepted", "Packed"].includes(item.status)) && (
                <TouchableOpacity 
                  style={[styles.mainActionBtn, { backgroundColor: "#6366f1" }]} 
                  onPress={() => updateStatus(item.id, next, item.customerUid)}
                >
                  <Text style={styles.btnText}>Mark as {next}</Text>
                </TouchableOpacity>
              )}
            </>
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

      {/* DOOR DELIVERY MODE TOGGLE BANNER */}
      <View style={[styles.deliveryBanner, { backgroundColor: doorDeliveryEnabled ? "#ecfdf5" : "#fffbeb", borderColor: doorDeliveryEnabled ? "#a7f3d0" : "#fef3c7" }]}>
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: 8 }}>
          <Icon name={doorDeliveryEnabled ? "moped" : "store-clock"} size={22} color={doorDeliveryEnabled ? "#16a34a" : "#d97706"} style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "800", color: doorDeliveryEnabled ? "#15803d" : "#b45309" }}>
              {doorDeliveryEnabled ? "🛵 Door Delivery: ON" : "🏬 Store Pickup Only: Active"}
            </Text>
            <Text style={{ fontSize: 11, color: doorDeliveryEnabled ? "#166534" : "#92400e" }}>
              {doorDeliveryEnabled 
                ? "Assign orders to delivery boys using the Delivery App" 
                : "Door delivery OFF. Customers pick up packed orders in-shop"}
            </Text>
          </View>
        </View>
        <TouchableOpacity 
          style={[styles.deliveryToggleBtn, { backgroundColor: doorDeliveryEnabled ? "#16a34a" : "#d97706" }]} 
          onPress={toggleDoorDelivery}
          activeOpacity={0.8}
        >
          <Text style={styles.deliveryToggleBtnText}>{doorDeliveryEnabled ? "Turn OFF" : "Turn ON"}</Text>
        </TouchableOpacity>
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
        keyExtractor={item => String(item.id)}
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

      {/* 🛵 ASSIGN TO DELIVERY BOY MODAL */}
      <Modal visible={assignDeliveryModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.newModalBox, { backgroundColor: theme.card, maxHeight: "90%" }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Icon name="moped" size={24} color="#16a34a" style={{ marginRight: 8 }} />
                <Text style={[styles.modalTitle, { color: theme.text, marginBottom: 0 }]}>
                  Assign Delivery Boy
                </Text>
              </View>
              <TouchableOpacity onPress={() => setAssignDeliveryModal(false)}>
                <Icon name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            {orderToDeliver && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Order Summary Box */}
                <View style={{ backgroundColor: darkMode ? "#1e293b" : "#f8fafc", borderRadius: 12, padding: 12, marginBottom: 14 }}>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: theme.text }}>
                    Order #{orderToDeliver.orderId || orderToDeliver.id}
                  </Text>
                  <Text style={{ fontSize: 13, color: darkMode ? "#cbd5e1" : "#334155", marginTop: 4 }}>
                    👤 {orderToDeliver.customerName || "Customer"} • 📞 {orderToDeliver.customerPhone || "N/A"}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#ef4444", marginTop: 4, fontWeight: "600" }}>
                    📍 {orderToDeliver.deliveryAddress || "Address not provided"}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: "#16a34a", marginTop: 6 }}>
                    Total: ₹{orderToDeliver.totalAmount || orderToDeliver.total || 0} ({orderToDeliver.paymentMode || "COD"})
                  </Text>
                </View>

                {/* Select Registered Delivery Boy */}
                <Text style={{ fontSize: 13, fontWeight: "700", color: theme.text, marginBottom: 8 }}>
                  Select Delivery Boy:
                </Text>

                {deliveryStaffList.length === 0 ? (
                  <View style={{ padding: 12, backgroundColor: darkMode ? "#334155" : "#f1f5f9", borderRadius: 10, marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: "#64748b" }}>
                      No delivery staff registered in Staff Creation. Enter details below or add delivery staff in Settings → Staff.
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 8, marginBottom: 14 }}>
                    {deliveryStaffList.map((staff) => {
                      const isSel = selectedDeliveryStaff?.id === staff.id;
                      return (
                        <TouchableOpacity
                          key={staff.id}
                          onPress={() => {
                            setSelectedDeliveryStaff(staff);
                            setCustomDeliveryBoyName(staff.name);
                            setCustomDeliveryBoyPhone(staff.mobile);
                          }}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: 12,
                            borderRadius: 12,
                            borderWidth: 1.5,
                            borderColor: isSel ? "#16a34a" : darkMode ? "#334155" : "#e2e8f0",
                            backgroundColor: isSel ? (darkMode ? "#064e3b" : "#f0fdf4") : darkMode ? "#1e293b" : "#ffffff",
                          }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <Icon name="account-circle" size={26} color={isSel ? "#16a34a" : "#64748b"} style={{ marginRight: 8 }} />
                            <View>
                              <Text style={{ fontSize: 14, fontWeight: "700", color: theme.text }}>{staff.name}</Text>
                              <Text style={{ fontSize: 11, color: "#64748b" }}>ID: {staff.staffId || staff.id} • 📞 {staff.mobile}</Text>
                            </View>
                          </View>
                          <Icon name={isSel ? "check-circle" : "radiobox-blank"} size={20} color={isSel ? "#16a34a" : "#94a3b8"} />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* Or Custom Delivery Boy Details */}
                <Text style={{ fontSize: 13, fontWeight: "700", color: theme.text, marginBottom: 6 }}>
                  Or Custom Delivery Person:
                </Text>
                <TextInput
                  placeholder="Delivery Boy Name"
                  placeholderTextColor="#94a3b8"
                  value={customDeliveryBoyName}
                  onChangeText={(val) => {
                    setCustomDeliveryBoyName(val);
                    if (selectedDeliveryStaff && val !== selectedDeliveryStaff.name) {
                      setSelectedDeliveryStaff(null);
                    }
                  }}
                  style={[styles.modalInput, { backgroundColor: darkMode ? "#1e293b" : "#f8fafc", borderColor: darkMode ? "#334155" : "#e2e8f0", color: theme.text }]}
                />
                <TextInput
                  placeholder="Delivery Boy Phone Number"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                  value={customDeliveryBoyPhone}
                  onChangeText={setCustomDeliveryBoyPhone}
                  style={[styles.modalInput, { backgroundColor: darkMode ? "#1e293b" : "#f8fafc", borderColor: darkMode ? "#334155" : "#e2e8f0", color: theme.text }]}
                />

                {/* Dispatch Button */}
                <TouchableOpacity
                  style={[styles.modalActionBtn, { backgroundColor: "#16a34a", paddingVertical: 14 }]}
                  disabled={assigningLoading}
                  onPress={handleAssignDelivery}
                >
                  {assigningLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={[styles.btnText, { fontSize: 15 }]}>
                      🛵 Dispatch & Send to Delivery App
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Share to WhatsApp option */}
                {(customDeliveryBoyPhone || selectedDeliveryStaff?.mobile) ? (
                  <TouchableOpacity
                    style={[styles.modalActionBtn, { backgroundColor: "#25d366", marginTop: 8, paddingVertical: 12 }]}
                    onPress={() => sendDeliveryWhatsAppMessage(orderToDeliver, selectedDeliveryStaff?.mobile || customDeliveryBoyPhone, selectedDeliveryStaff?.name || customDeliveryBoyName)}
                  >
                    <Icon name="whatsapp" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.btnText}>Share Address to Delivery Boy WhatsApp</Text>
                  </TouchableOpacity>
                ) : null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* 🏬 STORE PICKUP / PACKED NOTIFICATION MODAL */}
      <Modal visible={pickupModalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={[styles.newModalBox, { backgroundColor: theme.card }]}>
            <View style={{ alignItems: "center", marginBottom: 12 }}>
              <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: "#dcfce7", justifyContent: "center", alignItems: "center", marginBottom: 10 }}>
                <Icon name="check-bold" size={26} color="#16a34a" />
              </View>
              <Text style={[styles.modalTitle, { color: theme.text, textAlign: "center", marginBottom: 4 }]}>
                Order Packed Successfully! 🛍️
              </Text>
              <Text style={{ fontSize: 13, color: "#64748b", textAlign: "center", paddingHorizontal: 10 }}>
                Customer has been notified: "Your order is packed! Get your product in shop: {shopProfile.name}".
              </Text>
            </View>

            {orderToPickup && (
              <View style={{ backgroundColor: darkMode ? "#1e293b" : "#f8fafc", borderRadius: 12, padding: 12, marginVertical: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: theme.text }}>
                  Customer: {orderToPickup.customerName || "Customer"} (📞 {orderToPickup.customerPhone || "N/A"})
                </Text>
                <Text style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
                  Order #{orderToPickup.orderId || orderToPickup.id} • Total: ₹{orderToPickup.totalAmount || orderToPickup.total || 0}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.modalActionBtn, { backgroundColor: "#25d366", marginTop: 8 }]}
              onPress={() => {
                sendPickupWhatsAppMessage(orderToPickup);
                setPickupModalVisible(false);
              }}
            >
              <Icon name="whatsapp" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.btnText}>Send WhatsApp Notification</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalActionBtn, { backgroundColor: darkMode ? "#334155" : "#e2e8f0", marginTop: 8 }]}
              onPress={() => setPickupModalVisible(false)}
            >
              <Text style={[styles.btnText, { color: darkMode ? "#fff" : "#1e293b" }]}>Done</Text>
            </TouchableOpacity>
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
  modalActionBtn: { flex: 1, padding: 14, borderRadius: 14, alignItems: "center", marginTop: 10, flexDirection: "row", justifyContent: "center" },

  /* Delivery Mode Banner Styles */
  deliveryBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  deliveryToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  deliveryToggleBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 11,
  },
  assignedDeliveryBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
    marginTop: 10,
  },
});
