import React, { useEffect, useState } from "react";
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
  SafeAreaView,
  StatusBar
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { collection, onSnapshot, doc, updateDoc, getDoc, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { getSession } from "../../utils/session";
import { useRoute } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function OrdersScreen() {
  const route = useRoute();
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

  useEffect(() => {
    loadOrders();
  }, [route.params?.appMode]);

  const loadOrders = async () => {
    const session = await getSession();
    if (!session?.uid) return;
    setUid(session.uid);

    // Get current mode from routing params or fallback to AsyncStorage
    let activeMode = route.params?.appMode;
    if (!activeMode) {
      const savedMode = await AsyncStorage.getItem("app_mode");
      activeMode = savedMode === "global" ? "global" : "local";
    }
    setCurrentAppMode(activeMode);
    const isTargetGlobal = activeMode === "global";

    const unsub = onSnapshot(
      collection(db, "users", session.uid, "orders"),
      (snap) => {
        const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        arr.forEach(async (order) => {
          if (order.status === "Pending" && order.pendingUntil) {
            const now = new Date();
            const pendingDate = new Date(order.pendingUntil);
            if (now >= pendingDate) {
              await updateDoc(doc(db, "users", session.uid, "orders", order.id), {
                status: order.lastStatus,
                pendingUntil: null,
                pendingMessage: null,
              });
            }
          }
        });

        // 🌟 கச்சிதமான கண்டிஷன்: தற்போதைய மோடுக்குரிய ஆர்டர்களை மட்டும் ஃபில்டர் செய்கிறது
        const filteredOrders = arr.filter(o => (o.isGlobalMode || false) === isTargetGlobal);

        filteredOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setOrders(filteredOrders);
        setLoading(false);
      }
    );
    return () => unsub();
  };

  const updateStatus = async (orderId, status, customerUid) => {
    try {
      await updateDoc(doc(db, "users", uid, "orders", orderId), { status });

      if (status === "Delivered") {
        const orderDoc = await getDoc(doc(db, "users", uid, "orders", orderId));
        if (orderDoc.exists()) {
          const orderData = orderDoc.data();
          const orderedItems = orderData.items || [];

          let localItems = [];
          let globalItems = [];
          let localTotal = 0;
          let globalTotal = 0;
          let localProfit = 0;
          let globalProfit = 0;

          // தற்போதைய ஆர்டரின் மோடு என்ன என்பதைத் தீர்மானித்தல்
          const isOrderGlobal = orderData.isGlobalMode || false;

          for (const prod of orderedItems) {
            const currentItemName = prod.itemName || prod.name || "";
            const currentBarcode = prod.barcode || "";
            const orderedQty = Number(prod.qty || 1);

            let itemFound = false;

            if (!isOrderGlobal) {
              // 1. Local Inventory Target
              let locSnap = { empty: true };
              if (currentBarcode) {
                const locQ = query(collection(db, "users", uid, "inventory"), where("barcode", "==", currentBarcode));
                locSnap = await getDocs(locQ);
              }
              if (locSnap.empty && currentItemName) {
                const locQName = query(collection(db, "users", uid, "inventory"), where("itemName", "==", currentItemName));
                locSnap = await getDocs(locQName);
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
              // 2. Global Inventory Target
              let globSnap = { empty: true };
              if (currentBarcode) {
                const globQ = query(collection(db, "users", uid, "global_inventory"), where("barcode", "==", currentBarcode));
                globSnap = await getDocs(globQ);
              }
              if (globSnap.empty && currentItemName) {
                const globQName = query(collection(db, "users", uid, "global_inventory"), where("itemName", "==", currentItemName));
                globSnap = await getDocs(globQName);
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

            // Fallback Safety Check
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
            await addDoc(collection(db, "users", uid, "sales"), {
              billNo: bNo,
              invoiceId: bNo,
              billDate: bDate,
              items: localItems,
              total: localTotal,
              profit: localProfit,
              paymentMode: "ONLINE",
              isGlobalMode: false, 
              createdAt: serverTimestamp()
            });
          }

          if (globalItems.length > 0) {
            await addDoc(collection(db, "users", uid, "sales"), {
              billNo: bNo,
              invoiceId: bNo,
              billDate: bDate,
              items: globalItems,
              total: globalTotal,
              profit: globalProfit,
              paymentMode: "ONLINE",
              isGlobalMode: true, 
              createdAt: serverTimestamp()
            });
          }
        }
      }

      const customerRef = doc(db, "customers", customerUid, "orders", orderId);
      const snap = await getDoc(customerRef);

      if (snap.exists()) {
        const data = snap.data();
        const updatedShops = (data.orderedShops || []).map(shop => {
          if (shop.shopId === uid) { return { ...shop, status: status }; }
          return shop;
        });
        await updateDoc(customerRef, { orderedShops: updatedShops });
      }
    } catch (e) {
      console.log("Status Update Main Error: ", e);
      Alert.alert("Error", "Status Update Failed");
    }
  };

  const savePending = async () => {
    try {
      await updateDoc(doc(db, "users", uid, "orders", selectedOrder.id), {
        status: "Pending",
        lastStatus: selectedOrder.status === "Pending" ? selectedOrder.lastStatus : selectedOrder.status,
        pendingUntil: new Date(selectedDate.getTime() + 60 * 60 * 1000).toISOString(),
        pendingMessage: pendingMessage,
      });

      await updateDoc(doc(db, "customers", selectedOrder.customerUid, "orders", selectedOrder.id), {
        status: "Pending",
        lastStatus: selectedOrder.status === "Pending" ? selectedOrder.lastStatus : selectedOrder.status,
        pendingUntil: selectedDate.toISOString(),
        pendingMessage: pendingMessage,
      });

      setPendingModal(false);
      setPendingMessage("");
    } catch (e) {
      Alert.alert("Error", "Pending Save Failed");
    }
  };

  const rejectOrder = async (orderId, customerUid) => {
    try {
      await updateDoc(doc(db, "users", uid, "orders", orderId), { status: "Rejected" });
      await updateDoc(doc(db, "customers", customerUid, "orders", orderId), { status: "Rejected" });
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
      case "Pending": return 60;
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

  const renderItem = ({ item }) => {
    const next = nextStatus(item.status, item.lastStatus);
    const activeTimeline = (current, targetArray) => targetArray.includes(current);

    return (
      <View style={styles.card}>
        <View style={styles.topRow}>
          <Text style={styles.orderId}>🆔 {item.orderId || item.id}</Text>
          <View style={[styles.statusBadge, getBadgeStyle(item.status)]}>
            <Text style={[styles.statusText, getBadgeTextStyle(item.status)]}>{item.status}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.infoSection}>
          <View style={styles.infoRow}><Icon name="account" size={18} color="#64748b" /><Text style={styles.name}>{item.customerName}</Text></View>
          <View style={styles.infoRow}><Icon name="phone" size={18} color="#64748b" /><Text style={styles.phone}>{item.customerPhone}</Text></View>
          <View style={styles.infoRow}><Icon name="map-marker" size={18} color="#ef4444" /><Text style={styles.address}>{item.deliveryAddress}</Text></View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.smallBtn, { backgroundColor: "#3b82f6" }]} onPress={() => Linking.openURL(`tel:${item.customerPhone}`)}>
            <Icon name="phone-outgoing" size={16} color="#fff" />
            <Text style={styles.smallBtnText}>Call Customer</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.smallBtn, { backgroundColor: "#10b981" }]} onPress={() => Linking.openURL(`http://maps.google.com/?q=${encodeURIComponent(item.deliveryAddress)}`)}>
            <Icon name="google-maps" size={16} color="#fff" />
            <Text style={styles.smallBtnText}>Locate on Map</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.amountContainer}>
          <Text style={styles.amountLabel}>Total Payout:</Text>
          <Text style={styles.amount}>₹{item.total?.toFixed(2)}</Text>
        </View>

        <View style={{ marginVertical: 10 }}>
          <Text style={styles.sectionTitle}>Order Progress</Text>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${getProgress(item.status)}%` }]} />
          </View>
        </View>

        <View style={styles.timelineContainer}>
          <Text style={styles.sectionTitle}>Tracking Timeline</Text>
          <View style={styles.timeStep}>
            <Icon name="check-circle" size={20} color="#22c55e" />
            <Text style={styles.trackTextActive}>Order Placed</Text>
          </View>
          <View style={styles.timeStep}>
            <Icon name="package-variant" size={20} color={activeTimeline(item.status, ["Accepted", "Packed", "Pending", "Out For Delivery", "Delivered"]) ? "#22c55e" : "#cbd5e1"} />
            <Text style={activeTimeline(item.status, ["Accepted", "Packed", "Pending", "Out For Delivery", "Delivered"]) ? styles.trackTextActive : styles.trackTextInactive}>Accepted / Packed</Text>
          </View>
          <View style={styles.timeStep}>
            <Icon name="truck-fast" size={20} color={activeTimeline(item.status, ["Out For Delivery", "Delivered"]) ? "#22c55e" : "#cbd5e1"} />
            <Text style={activeTimeline(item.status, ["Out For Delivery", "Delivered"]) ? styles.trackTextActive : styles.trackTextInactive}>Out For Delivery</Text>
          </View>
          <View style={styles.timeStep}>
            <Icon name="home-check" size={20} color={item.status === "Delivered" ? "#22c55e" : "#cbd5e1"} />
            <Text style={item.status === "Delivered" ? styles.trackTextActive : styles.trackTextInactive}>Delivered</Text>
          </View>
        </View>

        {item.status === "Pending" && (
          <View style={styles.pendingAlertBox}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: "#c2410c", fontWeight: "bold", fontSize: 14 }}>⏸ Order Postponed (Pending)</Text>
              <TouchableOpacity onPress={() => {
                setSelectedOrder(item);
                setPendingMessage(item.pendingMessage || "");
                setSelectedDate(new Date(Date.now() + 60 * 60 * 1000));
                setPendingModal(true);
              }}>
                <Icon name="pencil-box-outline" size={22} color="#f59e0b" />
              </TouchableOpacity>
            </View>
            <Text style={styles.pendingAlertReason}>Reason: {item.pendingMessage}</Text>
            <Text style={styles.pendingAlertTime}>Resumes At: {new Date(item.pendingUntil).toLocaleString("en-GB")}</Text>
          </View>
        )}

        {item.items?.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionTitle}>Items ({item.items.length})</Text>
            <View style={styles.itemsBlock}>
              {item.items.map((product, index) => (
                <View key={index} style={styles.itemRow}>
                  <Text style={styles.itemName}>• {product.itemName || product.name}</Text>
                  <Text style={styles.itemQty}>Qty: {product.qty}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {item.status === "Delivered" && (
          <View style={styles.successBlock}>
            <Icon name="checkbox-marked-circle-outline" size={18} color="#15803d" />
            <Text style={styles.successBlockText}>Order Delivered Successfully</Text>
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 8, marginTop: 15 }}>
          {next && (
            <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: "#6366f1" }]} onPress={() => updateStatus(item.id, next, item.customerUid)}>
              <Text style={styles.btnText}>Mark as {next}</Text>
            </TouchableOpacity>
          )}
          {!["Delivered", "Rejected"].includes(item.status) && (
            <TouchableOpacity style={[styles.secondaryActionBtn, { backgroundColor: "#f59e0b" }]} onPress={() => { setSelectedOrder(item); setPendingModal(true); }}>
              <Text style={styles.btnText}>Hold</Text>
            </TouchableOpacity>
          )}
          {!["Delivered", "Rejected"].includes(item.status) && (
            <TouchableOpacity style={[styles.secondaryActionBtn, { backgroundColor: "#ef4444" }]} onPress={() => rejectOrder(item.id, item.customerUid)}>
              <Text style={styles.btnText}>Reject</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#f8fafc" barStyle="dark-content" />
      <View style={styles.header}>
        <Icon name="clipboard-text-clock-outline" size={28} color="#6366f1" />
        <Text style={styles.title}>
          Customer Orders ({currentAppMode === "global" ? "Global" : "Local"})
        </Text>
      </View>

      <FlatList
        data={orders}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Icon name="package-variant-closed" size={60} color="#cbd5e1" />
            <Text style={styles.emptyText}>No {currentAppMode.toUpperCase()} Orders Found</Text>
          </View>
        }
      />

      <Modal visible={pendingModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.newModalBox}>
            <Text style={styles.modalTitle}>⏸ Hold & Reschedule Order</Text>
            <TextInput 
              placeholder="Enter Delay Reason (e.g. Stock missing)" 
              placeholderTextColor="#94a3b8"
              value={pendingMessage} 
              onChangeText={setPendingMessage} 
              style={styles.modalInput} 
            />
            <TouchableOpacity style={styles.modalPickerBtn} onPress={() => setShowDate(true)}>
              <Icon name="calendar" size={18} color="#64748b" />
              <Text style={styles.modalPickerText}>Date: {selectedDate.toLocaleDateString("en-GB")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalPickerBtn} onPress={() => setShowTime(true)}>
              <Icon name="clock-outline" size={18} color="#64748b" />
              <Text style={styles.modalPickerText}>Time: {selectedDate.toLocaleTimeString("en-GB", {hour: '2-digit', minute:'2-digit'})}</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <TouchableOpacity style={[styles.modalActionBtn, { backgroundColor: "#cbd5e1" }]} onPress={() => setPendingModal(false)}>
                <Text style={[styles.btnText, { color: '#1e293b' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalActionBtn, { backgroundColor: "#f59e0b" }]} onPress={savePending}>
                <Text style={styles.btnText}>Apply Hold</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {showDate && (
        <DateTimePicker value={selectedDate} mode="date" display="default" onChange={(e, date) => { setShowDate(false); if (date) setSelectedDate(date); }} />
      )}
      {showTime && (
        <DateTimePicker value={selectedDate} mode="time" display="default" onChange={(e, time) => { setShowTime(false); if (time) { const d = new Date(selectedDate); d.setHours(time.getHours()); d.setMinutes(time.getMinutes()); setSelectedDate(d); } }} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", paddingHorizontal: 16 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", marginVertical: 15 },
  title: { fontSize: 20, fontWeight: "800", marginLeft: 10, color: "#1e293b" },
  card: { backgroundColor: "#fff", borderRadius: 20, padding: 16, marginBottom: 16, elevation: 3, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderId: { fontWeight: "800", fontSize: 15, color: "#1e293b" },
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
  divider: { height: 1, backgroundColor: "#f1f5f9", marginVertical: 12 },
  infoSection: { gap: 6 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontWeight: "700", color: "#334155", fontSize: 15 },
  phone: { color: "#475569", fontWeight: "500" },
  address: { color: "#64748b", fontSize: 13, flex: 1 },
  actionRow: { flexDirection: "row", marginTop: 12, gap: 8 },
  smallBtn: { flexDirection: "row", alignItems: "center", justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, flex: 1 },
  smallBtnText: { color: "#fff", marginLeft: 6, fontWeight: "700", fontSize: 13 },
  amountContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', padding: 12, borderRadius: 12, marginTop: 14 },
  amountLabel: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  amount: { fontSize: 20, fontWeight: "900", color: "#10b981" },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: "#94a3b8", textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 },
  progressBg: { height: 8, backgroundColor: "#e2e8f0", borderRadius: 10, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#10b981", borderRadius: 10 },
  timelineContainer: { marginVertical: 12, backgroundColor: '#fdfdfd', borderWidth: 1, borderColor: '#f1f5f9', padding: 12, borderRadius: 14 },
  timeStep: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  trackTextActive: { fontSize: 14, fontWeight: "700", color: "#334155" },
  trackTextInactive: { fontSize: 14, color: "#94a3b8", fontWeight: "500" },
  itemsBlock: { backgroundColor: "#f8fafc", borderRadius: 12, padding: 10, gap: 6 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  itemName: { color: "#334155", fontWeight: "600", fontSize: 14 },
  itemQty: { color: "#64748b", fontWeight: "700", fontSize: 13 },
  pendingAlertBox: { backgroundColor: "#fff7ed", padding: 12, borderRadius: 14, marginVertical: 10, borderWidth: 1, borderColor: '#ffedd5' },
  pendingAlertReason: { color: '#7c2d12', marginTop: 4, fontSize: 13, fontWeight: '500' },
  pendingAlertTime: { color: '#9a3412', fontSize: 12, fontWeight: '600', marginTop: 2 },
  successBlock: { backgroundColor: "#dcfce7", padding: 12, borderRadius: 12, marginTop: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  successBlockText: { color: "#15803d", fontWeight: "800", textAlign: "center", fontSize: 14 },
  mainActionBtn: { flex: 2, padding: 14, borderRadius: 14, alignItems: "center", justifyContent: 'center' },
  secondaryActionBtn: { flex: 1, padding: 14, borderRadius: 14, alignItems: "center", justifyContent: 'center' },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100, gap: 10 },
  emptyText: { color: '#94a3b8', fontSize: 16, fontWeight: '700' },
  modalBg: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.6)", justifyContent: "center", padding: 20 },
  newModalBox: { backgroundColor: "#fff", borderRadius: 24, padding: 24, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 15, color: "#1e293b" },
  modalInput: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 14, padding: 14, marginBottom: 12, color: '#1e293b', fontSize: 15, backgroundColor: '#f8fafc' },
  modalPickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: "#e2e8f0", padding: 14, borderRadius: 14, marginBottom: 10, backgroundColor: '#fff' },
  modalPickerText: { color: "#334155", fontWeight: "600", fontSize: 14 },
  modalActionBtn: { flex: 1, padding: 14, borderRadius: 14, alignItems: "center", marginTop: 10 }
});