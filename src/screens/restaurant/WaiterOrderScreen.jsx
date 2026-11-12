import React, { useEffect, useState, useMemo } from "react";
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
  FlatList,
  ActivityIndicator,
  Vibration,
  useWindowDimensions,
  Platform,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import {
  collection,
  onSnapshot,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../../utils/firebaseConfig";
import { getSession, saveSession, clearSession } from "../../utils/session";
import { useTheme } from "../../theme/ThemeContext";

const QUICK_TABLES = [
  "Table 1",
  "Table 2",
  "Table 3",
  "Table 4",
  "Table 5",
  "Table 6",
  "Table 7",
  "Table 8",
  "Table 9",
  "Table 10",
  "Takeaway",
];

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

export default function WaiterOrderScreen({ navigation }) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const themeContext = useTheme() || {};
  const theme = themeContext.theme || {};
  const darkMode = Boolean(themeContext.darkMode);

  // Session & Shop Identity
  const [masterUid, setMasterUid] = useState(null);
  const [waiterName, setWaiterName] = useState("Waiter");
  const [waiterId, setWaiterId] = useState("");
  const [shopName, setShopName] = useState("Restaurant");
  const [loadingSession, setLoadingSession] = useState(true);

  // Tab: "take_order" | "live_kot"
  const [activeTab, setActiveTab] = useState("take_order");

  // Table Selection
  const [selectedTable, setSelectedTable] = useState("Table 1");
  const [customTable, setCustomTable] = useState("");
  const [isCustomTableMode, setIsCustomTableMode] = useState(false);

  // Menu & Filtering
  const [menuFoods, setMenuFoods] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [dietFilter, setDietFilter] = useState("all"); // "all", "veg", "non-veg"
  const [search, setSearch] = useState("");

  // Cart for Current Table (Waiter Order Taking)
  const [orderItems, setOrderItems] = useState([]);
  const [orderNotes, setOrderNotes] = useState("");
  const [isSendingKot, setIsSendingKot] = useState(false);
  const [showCartDrawer, setShowCartDrawer] = useState(false);

  // Variant Picker Modal
  const [variantModalFood, setVariantModalFood] = useState(null);

  // Live Kitchen Orders
  const [kitchenOrders, setKitchenOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // 1. Load Session
  useEffect(() => {
    let isMounted = true;
    const initSession = async () => {
      try {
        const session = await getSession();
        let fallbackUid = session?.uid || auth.currentUser?.uid;

        // Auto-heal fallbackUid from staffId if missing
        if (!fallbackUid && session?.staffId) {
          try {
            const staffSnap = await getDoc(doc(db, "staffs", session.staffId));
            if (staffSnap.exists()) {
              const sData = staffSnap.data();
              fallbackUid = sData.masterUid || sData.ownerUid || sData.userId || "";
              if (fallbackUid) {
                await saveSession({ ...session, uid: fallbackUid });
              }
            }
          } catch (lookupErr) {
            console.log("Waiter staff lookup error:", lookupErr);
          }
        }

        if (isMounted) {
          setMasterUid(fallbackUid);
          setWaiterName(session?.staffName || "Captain / Waiter");
          setWaiterId(session?.staffId || "");
        }

        if (fallbackUid) {
          const userSnap = await getDoc(doc(db, "users", fallbackUid));
          if (userSnap.exists() && isMounted) {
            const data = userSnap.data();
            setShopName(data.shopName || data.restaurantName || "Restaurant");
          }
        }
      } catch (err) {
        console.log("Waiter session init error:", err);
      } finally {
        if (isMounted) setLoadingSession(false);
      }
    };

    initSession();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Real-time Menu Foods Listener
  useEffect(() => {
    if (!masterUid) return;
    setLoadingMenu(true);

    const unsubscribe = onSnapshot(
      collection(db, "users", masterUid, "restaurant_menu"),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((item) => item.isAvailable !== false);
        setMenuFoods(list);
        setLoadingMenu(false);
      },
      (err) => {
        console.log("Menu foods error in Waiter screen:", err);
        setLoadingMenu(false);
      }
    );

    return () => unsubscribe();
  }, [masterUid]);

  // 3. Real-time Live Kitchen Orders Listener (In-memory sort, index-free)
  useEffect(() => {
    if (!masterUid) return;
    setLoadingOrders(true);

    const colRef = collection(db, "users", masterUid, "kitchen_orders");

    const unsubscribe = onSnapshot(
      colRef,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const timeA =
              a.createdAtMs ||
              (a.createdAt?.toMillis
                ? a.createdAt.toMillis()
                : a.createdAt?.seconds
                ? a.createdAt.seconds * 1000
                : new Date(a.createdAt || 0).getTime());
            const timeB =
              b.createdAtMs ||
              (b.createdAt?.toMillis
                ? b.createdAt.toMillis()
                : b.createdAt?.seconds
                ? b.createdAt.seconds * 1000
                : new Date(b.createdAt || 0).getTime());
            return timeB - timeA;
          });
        setKitchenOrders(list);
        setLoadingOrders(false);
      },
      (err) => {
        console.log("Kitchen orders error in Waiter screen:", err);
        setLoadingOrders(false);
      }
    );

    return () => unsubscribe();
  }, [masterUid]);

  // Dynamic Categories from saved foods
  const categories = useMemo(() => {
    const set = new Set(CATEGORY_CHIPS);
    menuFoods.forEach((f) => {
      if (f.category) set.add(f.category.trim());
    });
    return Array.from(set);
  }, [menuFoods]);

  // First available image for each category (from menu foods)
  const categoryThumbnails = useMemo(() => {
    const map = {};
    menuFoods.forEach((f) => {
      const img = f.imageUrl || f.image;
      if (f.category && img && !map[f.category]) {
        map[f.category] = img;
      }
    });
    return map;
  }, [menuFoods]);

  // Computed: Filtered Foods
  const filteredFoods = useMemo(() => {
    return menuFoods.filter((f) => {
      const matchCat =
        selectedCategory === "All" ||
        (f.category || "Main Course").toLowerCase() === selectedCategory.toLowerCase();

      const matchDiet =
        dietFilter === "all" ||
        (f.dietType || "veg").toLowerCase() === dietFilter.toLowerCase();

      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        (f.itemName || f.name || "").toLowerCase().includes(q) ||
        (f.category || "").toLowerCase().includes(q);

      return matchCat && matchDiet && matchSearch;
    });
  }, [menuFoods, selectedCategory, dietFilter, search]);

  // Map of active kitchen orders by tableNo to show status in table chips
  const tableOrdersMap = useMemo(() => {
    const map = {};
    kitchenOrders.forEach((o) => {
      if (o.status !== "completed" && o.status !== "billed") {
        const tNo = (o.tableNo || "").trim();
        if (tNo && !map[tNo]) {
          map[tNo] = o;
        }
      }
    });
    return map;
  }, [kitchenOrders]);

  // Active Ready Orders Count for Waiter Badge
  const readyOrdersCount = useMemo(() => {
    return kitchenOrders.filter((o) => o.status === "ready").length;
  }, [kitchenOrders]);

  const activeOrdersCount = useMemo(() => {
    return kitchenOrders.filter((o) => o.status === "pending" || o.status === "preparing").length;
  }, [kitchenOrders]);

  // Cart operations
  const addToCart = (food, selectedVariant = null) => {
    if (food.hasVariants && Array.isArray(food.variants) && food.variants.length > 0 && !selectedVariant) {
      setVariantModalFood(food);
      return;
    }

    const portionName = selectedVariant?.name || "Standard";
    const effectivePrice = Number(selectedVariant?.price ?? food.salesPrice ?? food.price ?? 0);
    const cartItemId = `${food.id}_${portionName}`;

    setOrderItems((prev) => {
      const existing = prev.find((item) => item.cartItemId === cartItemId);
      if (existing) {
        return prev.map((item) =>
          item.cartItemId === cartItemId ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [
        ...prev,
        {
          cartItemId,
          foodId: food.id,
          name: food.itemName || food.name || "Dish",
          price: effectivePrice,
          purchasePrice: Number(food.purchasePrice || 0),
          qty: 1,
          portion: portionName,
          dietType: food.dietType || "veg",
          notes: "",
        },
      ];
    });

    setVariantModalFood(null);
  };

  const updateItemQty = (cartItemId, delta) => {
    setOrderItems((prev) => {
      return prev
        .map((item) => {
          if (item.cartItemId === cartItemId) {
            const nextQty = item.qty + delta;
            return nextQty > 0 ? { ...item, qty: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean);
    });
  };

  const updateItemNote = (cartItemId, noteText) => {
    setOrderItems((prev) =>
      prev.map((item) => (item.cartItemId === cartItemId ? { ...item, notes: noteText } : item))
    );
  };

  const cartTotalAmount = useMemo(() => {
    return orderItems.reduce((acc, i) => acc + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);
  }, [orderItems]);

  const cartTotalQty = useMemo(() => {
    return orderItems.reduce((acc, i) => acc + (Number(i.qty) || 1), 0);
  }, [orderItems]);

  // 👨‍🍳 SEND ORDER TO KITCHEN (KOT)
  const handleSendToKitchen = async () => {
    if (orderItems.length === 0) {
      Alert.alert("Empty Order", "Please select at least one dish to send to the kitchen.");
      return;
    }

    // Auto-resolve masterUid if not yet in state
    let targetMasterUid = masterUid;
    if (!targetMasterUid) {
      const session = await getSession();
      targetMasterUid = session?.uid || auth.currentUser?.uid;
      if (!targetMasterUid && session?.staffId) {
        try {
          const staffSnap = await getDoc(doc(db, "staffs", session.staffId));
          if (staffSnap.exists()) {
            targetMasterUid = staffSnap.data().masterUid || staffSnap.data().ownerUid || "";
            if (targetMasterUid) {
              setMasterUid(targetMasterUid);
              await saveSession({ ...session, uid: targetMasterUid });
            }
          }
        } catch (e) {}
      }
    }

    if (!targetMasterUid) {
      Alert.alert("Session Error", "Could not detect restaurant account. Please log in again.");
      return;
    }

    const finalTableName = isCustomTableMode
      ? customTable.trim() || "Custom Table"
      : selectedTable;

    setIsSendingKot(true);
    try {
      const nowMs = Date.now();
      const kotNumber = `KOT-${nowMs.toString().slice(-4)}`;

      // Strictly sanitize every item so no undefined or NaN values ever reach Firestore
      const sanitizedItems = orderItems.map((item, idx) => ({
        foodId: String(item.foodId || `dish_${idx}_${nowMs}`),
        name: String(item.name || item.itemName || "Dish"),
        portion: String(item.portion || "Standard"),
        price: Number(item.price) || 0,
        purchasePrice: Number(item.purchasePrice) || 0,
        qty: Math.max(1, Number(item.qty) || 1),
        notes: String(item.notes || "").trim(),
      }));

      const safeTotalAmount = sanitizedItems.reduce((acc, i) => acc + i.price * i.qty, 0);
      const safeTotalQty = sanitizedItems.reduce((acc, i) => acc + i.qty, 0);

      const kotPayload = {
        orderNumber: kotNumber,
        tableNo: String(finalTableName || "Table 1").trim(),
        waiterId: String(waiterId || "waiter"),
        waiterName: String(waiterName || "Waiter"),
        items: sanitizedItems,
        orderNotes: String(orderNotes || "").trim(),
        status: "pending", // "pending" -> "preparing" -> "ready" -> "served" -> "completed"
        totalAmount: safeTotalAmount,
        totalItems: safeTotalQty,
        masterUid: String(targetMasterUid),
        createdAtMs: nowMs,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // 1. Primary write to users/{targetMasterUid}/kitchen_orders
      const docRef = await addDoc(collection(db, "users", targetMasterUid, "kitchen_orders"), kotPayload);

      // 2. Also dual-write / mirror to root kitchen_orders collection with same ID
      try {
        await setDoc(doc(db, "kitchen_orders", docRef.id), {
          ...kotPayload,
          id: docRef.id,
        });
      } catch (rootErr) {
        console.log("Root kitchen_orders mirror write:", rootErr);
      }

      // Haptic confirmation
      if (Platform.OS === "android") {
        Vibration.vibrate([0, 100, 50, 100]);
      }

      Alert.alert(
        "Order Sent to Kitchen! 🍳",
        `Order ${kotNumber} for ${finalTableName} has been placed. Kitchen has been notified.`,
        [
          {
            text: "View Live Status",
            onPress: () => setActiveTab("live_kot"),
          },
          {
            text: "Next Order",
            style: "cancel",
          },
        ]
      );

      // Clear draft cart
      setOrderItems([]);
      setOrderNotes("");
      setShowCartDrawer(false);
    } catch (e) {
      console.log("Send to kitchen error:", e);
      Alert.alert("Error", "Could not send order to kitchen: " + e.message);
    } finally {
      setIsSendingKot(false);
    }
  };

  // Waiter Marks Dish as Served when delivered to table
  const handleMarkServed = async (orderId, tableNo) => {
    if (!masterUid || !orderId) return;
    try {
      const updateData = {
        status: "served",
        servedAt: serverTimestamp(),
        servedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
        readyForBilling: true,
      };

      await updateDoc(doc(db, "users", masterUid, "kitchen_orders", orderId), updateData);
      try {
        await updateDoc(doc(db, "kitchen_orders", orderId), updateData);
      } catch (e) {}

      Alert.alert(
        "Dishes Served ✓",
        `${tableNo} dishes marked as served! Bill notification sent to Owner / Cashier.`
      );
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to exit Waiter Portal?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await clearSession();
          navigation.reset({
            index: 0,
            routes: [{ name: "StaffLogin" }],
          });
        },
      },
    ]);
  };

  if (loadingSession) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background || "#f8fafc" }]}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={{ marginTop: 12, color: theme.text || "#1e293b", fontWeight: "600" }}>
          Loading Waiter Portal…
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkMode ? theme.background : "#f8fafc" }]}>
      <StatusBar
        barStyle={darkMode ? "light-content" : "dark-content"}
        backgroundColor={darkMode ? theme.background : "#ffffff"}
      />

      {/* TOP HEADER (Matching Image 1) */}
      <View style={[styles.header, { backgroundColor: darkMode ? theme.card : "#ffffff" }]}>
        <View style={styles.headerLeft}>
          <View style={styles.waiterIconBadge}>
            <Icon name="silverware-fork-knife" size={17} color="#ffffff" />
          </View>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Icon name="silverware-fork-knife" size={16} color="#16a34a" style={{ marginRight: 6 }} />
              <Text
                style={[styles.headerShopName, { color: darkMode ? theme.text : "#1e293b" }]}
                numberOfLines={1}
              >
                {shopName}
              </Text>
            </View>
            <Text style={styles.headerSub}>
              Server: <Text style={{ fontWeight: "700", color: "#16a34a" }}>{waiterName}</Text> {waiterId ? `(${waiterId})` : ""}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* Live Orders (KOT) Shortcut with Ready / Active Badge (Matching Image 1's table orders button) */}
          <TouchableOpacity
            style={[
              styles.headerIconBtn,
              { backgroundColor: activeTab === "live_kot" ? "#16a34a" : "#dbeafe" },
            ]}
            onPress={() => setActiveTab((curr) => (curr === "live_kot" ? "take_order" : "live_kot"))}
            activeOpacity={0.7}
          >
            <Icon
              name="silverware-fork-knife"
              size={20}
              color={activeTab === "live_kot" ? "#ffffff" : "#1d4ed8"}
            />
            {readyOrdersCount > 0 ? (
              <View style={[styles.badge, { backgroundColor: "#22c55e" }]}>
                <Text style={styles.badgeText}>{readyOrdersCount}</Text>
              </View>
            ) : activeOrdersCount > 0 ? (
              <View style={[styles.badge, { backgroundColor: "#1d4ed8" }]}>
                <Text style={styles.badgeText}>{activeOrdersCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>

          {/* Quick Tab Toggle Pill (Order / Live KOT) */}
          <TouchableOpacity
            style={[
              styles.tabHeaderPill,
              { backgroundColor: activeTab === "live_kot" ? "#dcfce7" : "#ffedd5" },
            ]}
            onPress={() => setActiveTab((curr) => (curr === "live_kot" ? "take_order" : "live_kot"))}
            activeOpacity={0.7}
          >
            <Icon
              name={activeTab === "live_kot" ? "notebook-edit-outline" : "chef-hat"}
              size={15}
              color={activeTab === "live_kot" ? "#16a34a" : "#ea580c"}
              style={{ marginRight: 4 }}
            />
            <Text
              style={[
                styles.tabHeaderPillText,
                { color: activeTab === "live_kot" ? "#16a34a" : "#ea580c" },
              ]}
            >
              {activeTab === "live_kot" ? "Order" : "KOT"}
            </Text>
          </TouchableOpacity>

          {/* Logout Shortcut */}
          <TouchableOpacity
            style={[styles.headerIconBtn, { backgroundColor: "#fee2e2" }]}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Icon name="logout" size={18} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ============================================================== */}
      {/* TAB 1: TAKE ORDER VIEW (MATCHING OWNER SCREEN IMAGE 1) */}
      {/* ============================================================== */}
      {activeTab === "take_order" ? (
        <View style={{ flex: 1 }}>
          {/* TOP SEARCH BAR (CLEAN & COMPACT, Matching Image 1) */}
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

          {/* 🍽️ SELECT TABLE (MATCHING IMAGE 1's SERVED TABLES SECTION) */}
          <View style={[styles.compactServedSection, { backgroundColor: darkMode ? "#0f291e" : "#f0fdf4" }]}>
            <View style={styles.compactServedHeader}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={styles.livePulseDot} />
                <Icon name="table-chair" size={13} color="#16a34a" style={{ marginRight: 4 }} />
                <Text style={[styles.compactServedTitle, { color: darkMode ? "#86efac" : "#15803d" }]}>
                  SELECT TABLE ({isCustomTableMode ? "Custom" : selectedTable})
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsCustomTableMode((prev) => !prev)}
                style={styles.compactViewAllTablesBtn}
              >
                <Text style={styles.compactViewAllTablesText}>
                  {isCustomTableMode ? "← Quick Tables" : "+ Custom Table"}
                </Text>
              </TouchableOpacity>
            </View>

            {isCustomTableMode ? (
              <View style={styles.customTableInputRow}>
                <TextInput
                  placeholder="Enter Custom Table / Name (e.g. Table 15, Mr. Kumar)"
                  placeholderTextColor="#94a3b8"
                  value={customTable}
                  onChangeText={setCustomTable}
                  style={[
                    styles.customTableInput,
                    {
                      color: darkMode ? theme.text : "#0f172a",
                      backgroundColor: darkMode ? theme.card : "#ffffff",
                    },
                  ]}
                  autoFocus
                />
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.compactServedCardsScroll}
              >
                {QUICK_TABLES.map((t) => {
                  const isSelected = selectedTable === t && !isCustomTableMode;
                  const activeOrder = tableOrdersMap[t];
                  const hasOrder = Boolean(activeOrder);
                  const orderStatus = activeOrder?.status || "";
                  const itemsCount = activeOrder?.items?.length || 0;
                  const totalAmt = Number(activeOrder?.totalAmount || 0);

                  return (
                    <TouchableOpacity
                      key={t}
                      activeOpacity={0.85}
                      onPress={() => {
                        setSelectedTable(t);
                        setIsCustomTableMode(false);
                      }}
                      style={[
                        styles.compactServedCard,
                        { backgroundColor: darkMode ? theme.card : "#ffffff" },
                        isSelected && styles.compactServedCardSelected,
                      ]}
                    >
                      <View style={styles.compactCardRow1}>
                        <Text
                          style={[styles.compactCardTable, { color: darkMode ? theme.text : "#0f172a" }]}
                          numberOfLines={1}
                        >
                          {t}
                        </Text>
                        <View
                          style={[
                            styles.compactStatusPill,
                            isSelected && { backgroundColor: "#10b981" },
                            !isSelected && orderStatus === "ready" && { backgroundColor: "#bbf7d0" },
                            !isSelected && orderStatus === "served" && { backgroundColor: "#dcfce7" },
                            !isSelected && orderStatus === "preparing" && { backgroundColor: "#dbeafe" },
                            !isSelected && orderStatus === "pending" && { backgroundColor: "#fef3c7" },
                            !isSelected && !hasOrder && { backgroundColor: "#f1f5f9" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.compactStatusPillText,
                              isSelected && { color: "#ffffff" },
                              !isSelected && orderStatus === "ready" && { color: "#15803d" },
                              !isSelected && orderStatus === "served" && { color: "#16a34a" },
                              !isSelected && orderStatus === "preparing" && { color: "#2563eb" },
                              !isSelected && orderStatus === "pending" && { color: "#d97706" },
                              !isSelected && !hasOrder && { color: "#64748b" },
                            ]}
                          >
                            {isSelected
                              ? "ACTIVE"
                              : orderStatus === "ready"
                              ? "READY"
                              : orderStatus === "served"
                              ? "SERVED"
                              : orderStatus === "preparing"
                              ? "COOKING"
                              : orderStatus === "pending"
                              ? "PENDING"
                              : "VACANT"}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.compactCardRow2}>
                        <Text style={[styles.compactCardMeta, { color: darkMode ? "#cbd5e1" : "#334155" }]}>
                          {hasOrder ? `${itemsCount} items • ` : "0 items • "}
                          <Text style={{ color: "#16a34a", fontWeight: "800" }}>
                            ₹{hasOrder ? totalAmt.toFixed(0) : "0"}
                          </Text>
                        </Text>
                        <View style={[styles.compactBillBtn, isSelected && { backgroundColor: "#059669" }]}>
                          <Text style={styles.compactBillBtnText}>{isSelected ? "Selected" : "Select"}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* MAIN BODY: LEFT CATEGORIES WITH IMAGE + RIGHT FOODS GRID (Matching Image 1) */}
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
                {/* "All" button matching Image 1 "All Foods" */}
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

                {/* Bottom Diet Quick Switcher (Matching Image 1's bottom circular button) */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setDietFilter((curr) => {
                      if (curr === "all") return "veg";
                      if (curr === "veg") return "non-veg";
                      return "all";
                    });
                  }}
                  style={[
                    styles.dietToggleCircle,
                    {
                      backgroundColor:
                        dietFilter === "veg"
                          ? "#dcfce7"
                          : dietFilter === "non-veg"
                          ? "#fee2e2"
                          : "#0f172a",
                    },
                  ]}
                >
                  {dietFilter === "veg" ? (
                    <Icon name="circle-slice-8" size={18} color="#16a34a" />
                  ) : dietFilter === "non-veg" ? (
                    <Icon name="triangle" size={16} color="#dc2626" />
                  ) : (
                    <Icon name="swap-horizontal" size={18} color="#ffffff" />
                  )}
                </TouchableOpacity>
                <Text style={styles.dietToggleText}>
                  {dietFilter === "veg" ? "Veg" : dietFilter === "non-veg" ? "Non-Veg" : "Diet"}
                </Text>
              </ScrollView>
            </View>

            {/* RIGHT COLUMN: FOODS CATALOG GRID */}
            <View style={[styles.foodsCatalogArea, { backgroundColor: darkMode ? theme.background : "#f8fafc" }]}>
              {/* Header row above products matching Image 1 */}
              <View style={styles.catalogHeaderBanner}>
                <View>
                  <Text style={[styles.catalogCategoryName, { color: darkMode ? theme.text : "#0f172a" }]}>
                    {selectedCategory === "All" ? "Global Menu" : selectedCategory}
                  </Text>
                  <Text style={styles.catalogItemCountSub}>
                    {filteredFoods.length} {filteredFoods.length === 1 ? "item" : "items"} available
                  </Text>
                </View>

                <View style={styles.activeTableChip}>
                  <Icon name="table-chair" size={13} color="#1d4ed8" style={{ marginRight: 4 }} />
                  <Text style={styles.activeTableChipText} numberOfLines={1}>
                    {isCustomTableMode ? customTable || "Custom Table" : selectedTable}
                  </Text>
                </View>
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
                    paddingBottom: orderItems.length > 0 ? 90 : 24,
                  }}
                  renderItem={({ item }) => {
                    const inOrderItems = orderItems.filter((i) => i.foodId === item.id);
                    const inOrderQty = inOrderItems.reduce((acc, i) => acc + i.qty, 0);
                    const isAvail = item.isAvailable !== false;
                    const price = Number(item.salesPrice || item.price || 0);
                    const isVeg = (item.dietType || "veg").toLowerCase() === "veg";

                    return (
                      <TouchableOpacity
                        style={[
                          styles.productCard,
                          { backgroundColor: darkMode ? theme.card : "#ffffff" },
                          !isAvail && styles.productCardDisabled,
                          inOrderQty > 0 && styles.productCardInOrder,
                        ]}
                        onPress={() => addToCart(item)}
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
                              name={item.category === "Beverages" ? "cup-water" : "food-drumstick"}
                              size={28}
                              color="#6366f1"
                            />
                          )}
                          {isVeg ? (
                            <View style={styles.dietBadge}>
                              <Icon name="circle-slice-8" size={11} color="#16a34a" />
                            </View>
                          ) : (
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
                            ) : inOrderQty > 0 ? (
                              <View style={styles.inOrderQtyTag}>
                                <Text style={styles.inOrderQtyText}>{inOrderQty}</Text>
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

          {/* 🛒 FLOATING BOTTOM CART BAR (Matching Image 1) */}
          {orderItems.length > 0 && (
            <View style={styles.floatingCartContainer}>
              <TouchableOpacity
                style={styles.floatingCartBar}
                activeOpacity={0.9}
                onPress={() => setShowCartDrawer(true)}
              >
                {/* Left: Cart Icon & Table */}
                <View style={styles.floatingCartLeft}>
                  <Icon name="cart" size={20} color="#22c55e" />
                  <View style={{ marginLeft: 8 }}>
                    <Text style={styles.floatingCartTitle}>
                      {isCustomTableMode ? customTable || "Custom Table" : selectedTable}
                    </Text>
                    <Text style={styles.floatingCartSubtitle}>Tap to review notes</Text>
                  </View>
                </View>

                {/* Right: Item Count Badge + Total Amount + Direct KOT Button */}
                <View style={styles.floatingCartRight}>
                  <View style={styles.floatingCartBadge}>
                    <Text style={styles.floatingCartBadgeText}>{cartTotalQty}</Text>
                  </View>
                  <Text style={styles.floatingCartAmount}>₹{cartTotalAmount.toFixed(2)}</Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={isSendingKot}
                    onPress={handleSendToKitchen}
                    style={styles.floatingSendKotBtn}
                  >
                    {isSendingKot ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Icon name="pot-steam" size={14} color="#fff" style={{ marginRight: 4 }} />
                        <Text style={styles.floatingSendKotText}>KOT</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        /* ============================================================== */
        /* TAB 2: LIVE KITCHEN ORDERS VIEW */
        /* ============================================================== */
        <View style={{ flex: 1 }}>
          <View style={[styles.liveOrdersTopBar, { backgroundColor: darkMode ? theme.card : "#ffffff" }]}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setActiveTab("take_order")}
              style={styles.backToTakeOrderBtn}
            >
              <Icon name="arrow-left" size={18} color="#16a34a" style={{ marginRight: 6 }} />
              <Text style={styles.backToTakeOrderText}>← Take New Order</Text>
            </TouchableOpacity>
            <View style={styles.liveOrdersCountBadge}>
              <Text style={styles.liveOrdersCountBadgeText}>{kitchenOrders.length} Orders</Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
            {loadingOrders ? (
              <View style={{ padding: 40, alignItems: "center" }}>
                <ActivityIndicator color="#16a34a" size="small" />
                <Text style={{ marginTop: 8, color: "#94a3b8", fontSize: 12 }}>Loading live orders…</Text>
              </View>
            ) : kitchenOrders.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: theme.card }]}>
                <Icon name="clipboard-check-outline" size={48} color="#94a3b8" />
                <Text style={{ marginTop: 10, color: theme.text, fontWeight: "700", fontSize: 15 }}>
                  No Active Kitchen Orders
                </Text>
                <Text style={{ color: "#94a3b8", fontSize: 12, textAlign: "center", marginTop: 4 }}>
                  Orders you send to the kitchen will show live updates here!
                </Text>
              </View>
            ) : (
              kitchenOrders.map((order) => {
                const isReady = order.status === "ready";
                const isPreparing = order.status === "preparing";
                const isPending = order.status === "pending";
                const isServed = order.status === "served";
                const isCompleted = order.status === "completed" || order.status === "billed";

                const statusColor = isReady
                  ? "#22c55e"
                  : isPreparing
                  ? "#3b82f6"
                  : isPending
                  ? "#f59e0b"
                  : isCompleted
                  ? "#059669"
                  : isServed
                  ? "#15803d"
                  : "#64748b";

                const statusLabel = isReady
                  ? "🔔 DISH READY! Pick Up"
                  : isPreparing
                  ? "🍳 Cooking in Kitchen"
                  : isPending
                  ? "⏱️ Sent to Kitchen"
                  : isCompleted
                  ? "✓ Billed & Completed"
                  : isServed
                  ? "✓ Served • Ready for Bill"
                  : "✓ Served to Table";

                return (
                  <View
                    key={order.id}
                    style={[
                      styles.orderCard,
                      {
                        backgroundColor: theme.card,
                        borderColor: isReady ? "#22c55e" : darkMode ? "#334155" : "#e2e8f0",
                        borderWidth: isReady ? 2 : 1,
                      },
                    ]}
                  >
                    <View style={styles.orderCardHeader}>
                      <View>
                        <Text style={[styles.orderTableTitle, { color: theme.text }]}>{order.tableNo}</Text>
                        <Text style={{ fontSize: 11, color: "#94a3b8" }}>
                          {order.orderNumber} • Server: {order.waiterName || "Waiter"}
                        </Text>
                      </View>

                      <View style={[styles.statusTag, { backgroundColor: statusColor }]}>
                        <Text style={styles.statusTagText}>{statusLabel}</Text>
                      </View>
                    </View>

                    {/* Order Items */}
                    <View style={{ marginVertical: 8 }}>
                      {(order.items || []).map((it, idx) => (
                        <View key={idx} style={styles.kotItemRow}>
                          <Text style={[styles.kotItemQty, { color: "#16a34a" }]}>{it.qty}x</Text>
                          <Text style={[styles.kotItemName, { color: theme.text }]} numberOfLines={1}>
                            {it.name} {it.portion && it.portion !== "Standard" ? `(${it.portion})` : ""}
                          </Text>
                          <Text style={{ color: darkMode ? "#94a3b8" : "#64748b", fontSize: 12 }}>
                            ₹{Number(it.price || 0) * Number(it.qty || 1)}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {order.orderNotes ? (
                      <View style={styles.kotNotesBox}>
                        <Text style={styles.kotNotesText}>Note: {order.orderNotes}</Text>
                      </View>
                    ) : null}

                    {/* ACTION: MARK SERVED IF DISH READY */}
                    {isReady && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => handleMarkServed(order.id, order.tableNo)}
                        style={styles.markServedBtn}
                      >
                        <Icon name="check-circle" size={18} color="#fff" style={{ marginRight: 6 }} />
                        <Text style={styles.markServedBtnText}>Mark as Served to Table</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      )}

      {/* ============================================================== */}
      {/* CART DRAWER MODAL */}
      {/* ============================================================== */}
      <Modal visible={showCartDrawer} transparent animationType="slide" onRequestClose={() => setShowCartDrawer(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.drawerContent, { backgroundColor: theme.card }]}>
            <View style={styles.drawerHeader}>
              <View>
                <Text style={[styles.drawerTitle, { color: theme.text }]}>
                  Order for {isCustomTableMode ? customTable || "Custom Table" : selectedTable}
                </Text>
                <Text style={{ fontSize: 12, color: "#16a34a", fontWeight: "700" }}>
                  {cartTotalQty} Dishes • Total: ₹{cartTotalAmount}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowCartDrawer(false)} style={{ padding: 4 }}>
                <Icon name="close" size={24} color={darkMode ? "#94a3b8" : "#64748b"} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300, marginVertical: 10 }} showsVerticalScrollIndicator={false}>
              {orderItems.map((item) => (
                <View key={item.cartItemId} style={[styles.cartItemRow, { borderBottomColor: darkMode ? "#334155" : "#e2e8f0" }]}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[styles.cartItemName, { color: theme.text }]}>
                      {item.name} {item.portion && item.portion !== "Standard" ? `[${item.portion}]` : ""}
                    </Text>
                    <Text style={{ color: "#16a34a", fontSize: 12, fontWeight: "700" }}>₹{item.price} each</Text>
                    <TextInput
                      placeholder="Special note (e.g. less spicy)..."
                      placeholderTextColor="#94a3b8"
                      value={item.notes}
                      onChangeText={(txt) => updateItemNote(item.cartItemId, txt)}
                      style={[styles.itemNoteInput, { color: theme.text, backgroundColor: darkMode ? "#0f172a" : "#f8fafc" }]}
                    />
                  </View>

                  <View style={styles.qtyRow}>
                    <TouchableOpacity onPress={() => updateItemQty(item.cartItemId, -1)} style={styles.qtyMiniBtn}>
                      <Text style={styles.qtyMiniBtnText}>-</Text>
                    </TouchableOpacity>
                    <Text style={[styles.qtyMiniText, { color: theme.text }]}>{item.qty}</Text>
                    <TouchableOpacity onPress={() => updateItemQty(item.cartItemId, 1)} style={styles.qtyMiniBtn}>
                      <Text style={styles.qtyMiniBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Overall Order Notes */}
            <View style={{ marginVertical: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b", marginBottom: 4 }}>
                Kitchen Instructions (Optional)
              </Text>
              <TextInput
                placeholder="e.g. Serve starters first, Table is celebrating birthday..."
                placeholderTextColor="#94a3b8"
                value={orderNotes}
                onChangeText={setOrderNotes}
                style={[styles.input, { backgroundColor: darkMode ? "#0f172a" : "#f8fafc", color: theme.text, minHeight: 44 }]}
              />
            </View>

            {/* SEND KOT ACTION */}
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={isSendingKot}
              onPress={handleSendToKitchen}
              style={[styles.sendKotBtn, { width: "100%", marginTop: 10 }]}
            >
              {isSendingKot ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Icon name="pot-steam" size={20} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.sendKotBtnText}>SEND TO KITCHEN (KOT)</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ============================================================== */}
      {/* VARIANT PICKER MODAL */}
      {/* ============================================================== */}
      <Modal visible={Boolean(variantModalFood)} transparent animationType="fade" onRequestClose={() => setVariantModalFood(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.variantModalBox, { backgroundColor: theme.card }]}>
            <Text style={[styles.variantModalTitle, { color: theme.text }]}>
              {variantModalFood?.itemName || variantModalFood?.name}
            </Text>
            <Text style={{ color: "#64748b", fontSize: 12, marginBottom: 12 }}>Select portion / size variant:</Text>

            {(variantModalFood?.variants || []).map((v, i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.8}
                onPress={() => addToCart(variantModalFood, v)}
                style={styles.variantOptionBtn}
              >
                <Text style={{ fontWeight: "700", color: "#1e3a8a", fontSize: 14 }}>{v.name}</Text>
                <Text style={{ fontWeight: "800", color: "#16a34a", fontSize: 14 }}>₹{v.price}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity onPress={() => setVariantModalFood(null)} style={styles.variantCancelBtn}>
              <Text style={{ color: "#64748b", fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },

  /* Top Header (Matching Image 1) */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  waiterIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#16a34a",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  headerShopName: {
    fontSize: 16,
    fontWeight: "800",
  },
  headerSub: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 1,
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
    top: -4,
    right: -4,
    backgroundColor: "#ef4444",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },
  tabHeaderPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  tabHeaderPillText: {
    fontSize: 12,
    fontWeight: "700",
  },

  /* Compact Top Search Bar (Matching Image 1) */
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

  /* Compact Served / Selectable Tables Header & Cards (Matching Image 1) */
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
  customTableInputRow: {
    marginVertical: 4,
  },
  customTableInput: {
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#16a34a",
    paddingHorizontal: 10,
    fontSize: 12,
  },

  /* MAIN SPLIT LAYOUT (Left Categories + Right Foods) */
  mainSplitBody: {
    flex: 1,
    flexDirection: "row",
  },

  /* LEFT COLUMN: CATEGORIES SIDEBAR (Matching Image 1) */
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
    paddingBottom: 85,
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
  dietToggleCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  dietToggleText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 2,
    textAlign: "center",
  },

  /* RIGHT COLUMN: FOOD CATALOG GRID (Matching Image 1) */
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

  /* Product Card (Matching Image 1) */
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

  /* 🛒 FLOATING BOTTOM CART BAR (Matching Image 1) */
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
    paddingVertical: 10,
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
    flex: 1,
  },
  floatingCartTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  floatingCartSubtitle: {
    color: "#94a3b8",
    fontSize: 10,
    marginTop: 1,
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
    fontSize: 15,
    fontWeight: "900",
    marginRight: 10,
  },
  floatingSendKotBtn: {
    backgroundColor: "#ea580c",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  floatingSendKotText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },

  /* Live Orders Tab View */
  liveOrdersTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  backToTakeOrderBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  backToTakeOrderText: {
    color: "#16a34a",
    fontSize: 13,
    fontWeight: "700",
  },
  liveOrdersCountBadge: {
    backgroundColor: "#dbeafe",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveOrdersCountBadgeText: {
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: "700",
  },
  emptyBox: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  orderCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  orderCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 8,
  },
  orderTableTitle: { fontSize: 16, fontWeight: "800" },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusTagText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  kotItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
  },
  kotItemQty: { width: 28, fontWeight: "800", fontSize: 13 },
  kotItemName: { flex: 1, fontSize: 13, fontWeight: "600" },
  kotNotesBox: {
    backgroundColor: "#fef3c7",
    padding: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  kotNotesText: { fontSize: 11, color: "#b45309", fontWeight: "700" },
  markServedBtn: {
    backgroundColor: "#16a34a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  markServedBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  /* Cart Drawer Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  drawerContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: "85%",
  },
  drawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  drawerTitle: { fontSize: 16, fontWeight: "800" },
  cartItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  cartItemName: { fontSize: 13, fontWeight: "700" },
  itemNoteInput: {
    height: 32,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 11,
    marginTop: 4,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    padding: 2,
  },
  qtyMiniBtn: {
    width: 28,
    height: 28,
    backgroundColor: "#16a34a",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyMiniBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  qtyMiniText: { marginHorizontal: 8, fontWeight: "800", fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
  },
  sendKotBtn: {
    backgroundColor: "#ea580c",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  sendKotBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  /* Variant Modal */
  variantModalBox: {
    margin: 20,
    borderRadius: 16,
    padding: 16,
    elevation: 5,
  },
  variantModalTitle: { fontSize: 16, fontWeight: "800", marginBottom: 2 },
  variantOptionBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    marginBottom: 8,
  },
  variantCancelBtn: {
    alignItems: "center",
    paddingVertical: 10,
    marginTop: 6,
  },
});
