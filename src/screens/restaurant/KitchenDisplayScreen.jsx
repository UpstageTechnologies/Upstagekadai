import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Vibration,
  useWindowDimensions,
  Platform,
  Alert,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../../utils/firebaseConfig";
import { getSession, saveSession, clearSession } from "../../utils/session";
import { useTheme } from "../../theme/ThemeContext";

// Time formatting helper for KDS orders
const getElapsedTime = (timestamp, createdAtMs) => {
  let date;
  if (createdAtMs) {
    date = new Date(createdAtMs);
  } else if (!timestamp) {
    return "Just now";
  } else if (typeof timestamp.toDate === "function") {
    date = timestamp.toDate();
  } else if (timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else {
    date = new Date(timestamp);
  }
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMinutes <= 0) return "Just now";
  if (diffMinutes === 1) return "1 min ago";
  if (diffMinutes < 60) return `${diffMinutes} mins ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours}h ${diffMinutes % 60}m ago`;
};

const getUrgencyColor = (timestamp, createdAtMs) => {
  let date;
  if (createdAtMs) {
    date = new Date(createdAtMs);
  } else if (!timestamp) {
    return "#10b981"; // Fresh (green)
  } else if (typeof timestamp.toDate === "function") {
    date = timestamp.toDate();
  } else if (timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else {
    date = new Date(timestamp);
  }
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 10) return "#10b981"; // Fresh: green
  if (diffMinutes < 20) return "#f59e0b"; // Warning: amber
  return "#ef4444"; // Urgent: red (> 20m)
};

export default function KitchenDisplayScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const themeContext = useTheme() || {};
  const theme = themeContext.theme || {};
  const darkMode = Boolean(themeContext.darkMode);

  // Session state
  const [masterUid, setMasterUid] = useState(null);
  const [chefName, setChefName] = useState("Kitchen Chef");
  const [staffId, setStaffId] = useState("");
  const [restaurantName, setRestaurantName] = useState("Restaurant Kitchen");
  const [loadingSession, setLoadingSession] = useState(true);

  // Orders state
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [activeFilter, setActiveFilter] = useState("active"); // "active" | "pending" | "preparing" | "ready" | "served"
  const [updatingOrderId, setUpdatingOrderId] = useState(null);

  // Sound/Chime preference
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Completed items tracking per order (in-memory item checkoffs: { [orderId_itemIndex]: boolean })
  const [checkedItems, setCheckedItems] = useState({});

  // Previous order count ref to detect new incoming orders and trigger vibration
  const prevPendingCountRef = useRef(0);

  // 1. Session initialization
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
            console.log("Kitchen staff lookup error:", lookupErr);
          }
        }

        if (isMounted) {
          setMasterUid(fallbackUid);
          setChefName(session?.staffName || "Kitchen Staff");
          setStaffId(session?.staffId || "");
        }

        if (fallbackUid) {
          const userSnap = await getDoc(doc(db, "users", fallbackUid));
          if (userSnap.exists() && isMounted) {
            const data = userSnap.data();
            setRestaurantName(
              data.restaurantName || data.shopName || "Restaurant Kitchen"
            );
          }
        }
      } catch (err) {
        console.log("KDS Session Error:", err);
      } finally {
        if (isMounted) setLoadingSession(false);
      }
    };

    initSession();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Real-time Kitchen Orders listener (In-memory sort, index-free)
  useEffect(() => {
    if (!masterUid) return;
    setLoadingOrders(true);

    const colRef = collection(db, "users", masterUid, "kitchen_orders");

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const orderList = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
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

        setOrders(orderList);
        setLoadingOrders(false);

        // Detect new pending orders
        const pendingCount = orderList.filter(
          (o) => o.status === "pending"
        ).length;
        if (pendingCount > prevPendingCountRef.current && soundEnabled) {
          if (Platform.OS === "android") {
            Vibration.vibrate([0, 200, 100, 200, 100, 300]);
          }
        }
        prevPendingCountRef.current = pendingCount;
      },
      (error) => {
        console.log("KDS Order Listener Error:", error);
        setLoadingOrders(false);
      }
    );

    return () => unsubscribe();
  }, [masterUid, soundEnabled]);

  // Periodic re-render every 30s to update elapsed times
  const [, setTicker] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTicker((prev) => prev + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (activeFilter === "active") {
        return order.status === "pending" || order.status === "preparing";
      }
      return order.status === activeFilter;
    });
  }, [orders, activeFilter]);

  // Order counts for quick badge tabs
  const counts = useMemo(() => {
    const pending = orders.filter((o) => o.status === "pending").length;
    const preparing = orders.filter((o) => o.status === "preparing").length;
    const ready = orders.filter((o) => o.status === "ready").length;
    const served = orders.filter((o) => o.status === "served").length;
    return {
      active: pending + preparing,
      pending,
      preparing,
      ready,
      served,
      total: orders.length,
    };
  }, [orders]);

  // Handle Order Status Updates
  const handleUpdateStatus = async (orderId, newStatus) => {
    if (!masterUid || !orderId) return;

    setUpdatingOrderId(orderId);
    try {
      const orderRef = doc(db, "users", masterUid, "kitchen_orders", orderId);
      const updateData = {
        status: newStatus,
        updatedAt: serverTimestamp(),
      };

      if (newStatus === "preparing") {
        updateData.cookingStartedAt = serverTimestamp();
      } else if (newStatus === "ready") {
        updateData.dishReadyAt = serverTimestamp();
      } else if (newStatus === "served") {
        updateData.servedAt = serverTimestamp();
      }

      await updateDoc(orderRef, updateData);

      // Also mirror status update to root kitchen_orders if present
      try {
        await updateDoc(doc(db, "kitchen_orders", orderId), updateData);
      } catch (rootUpdErr) {}

      if (Platform.OS === "android") {
        Vibration.vibrate(80);
      }
    } catch (err) {
      console.log("Error updating order status:", err);
      Alert.alert("Update Error", "Failed to update order status. Please try again.");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Toggle item completed checkoff inside kitchen card
  const toggleItemCheck = (orderId, itemIndex) => {
    const key = `${orderId}_${itemIndex}`;
    setCheckedItems((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Logout Kitchen Staff
  const handleLogout = () => {
    Alert.alert("Kitchen Logout", "Are you sure you want to log out of Kitchen Display?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await clearSession();
            navigation.replace("StaffLogin");
          } catch (e) {
            navigation.replace("StaffLogin");
          }
        },
      },
    ]);
  };

  if (loadingSession) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: "#0f172a" }]}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.loadingText}>Connecting to Kitchen KDS...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* TOP HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.kitchenIconBadge}>
            <Icon name="chef-hat" size={26} color="#ffffff" />
          </View>
          <View>
            <View style={styles.titleRow}>
              <Text style={styles.headerTitle}>Kitchen Display (KDS)</Text>
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
            <Text style={styles.headerSubtitle}>
              {restaurantName} • {chefName} {staffId ? `(${staffId})` : ""}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* Notification / Chime Toggle */}
          <TouchableOpacity
            style={[
              styles.headerIconButton,
              soundEnabled && styles.headerIconButtonActive,
            ]}
            onPress={() => {
              setSoundEnabled(!soundEnabled);
              Alert.alert(
                soundEnabled ? "Chime Muted" : "Chime Enabled",
                soundEnabled
                  ? "Kitchen vibration alerts are turned off."
                  : "Kitchen will vibrate when a new order arrives."
              );
            }}
          >
            <Icon
              name={soundEnabled ? "bell-ring" : "bell-off"}
              size={20}
              color={soundEnabled ? "#ffffff" : "#94a3b8"}
            />
          </TouchableOpacity>

          {/* Logout */}
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Icon name="logout" size={18} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* FILTER TABS */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <TouchableOpacity
            style={[styles.filterChip, activeFilter === "active" && styles.filterChipActive]}
            onPress={() => setActiveFilter("active")}
          >
            <Text style={[styles.filterChipText, activeFilter === "active" && styles.filterChipTextActive]}>
              🔥 Active Now
            </Text>
            {counts.active > 0 && (
              <View style={[styles.badge, activeFilter === "active" ? styles.badgeActive : styles.badgeInactive]}>
                <Text style={styles.badgeText}>{counts.active}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, activeFilter === "pending" && styles.filterChipActivePending]}
            onPress={() => setActiveFilter("pending")}
          >
            <Text style={[styles.filterChipText, activeFilter === "pending" && styles.filterChipTextActive]}>
              ⏳ New Orders
            </Text>
            {counts.pending > 0 && (
              <View style={[styles.badge, styles.badgePending]}>
                <Text style={styles.badgeText}>{counts.pending}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, activeFilter === "preparing" && styles.filterChipActivePreparing]}
            onPress={() => setActiveFilter("preparing")}
          >
            <Text style={[styles.filterChipText, activeFilter === "preparing" && styles.filterChipTextActive]}>
              🍳 Cooking
            </Text>
            {counts.preparing > 0 && (
              <View style={[styles.badge, styles.badgePreparing]}>
                <Text style={styles.badgeText}>{counts.preparing}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, activeFilter === "ready" && styles.filterChipActiveReady]}
            onPress={() => setActiveFilter("ready")}
          >
            <Text style={[styles.filterChipText, activeFilter === "ready" && styles.filterChipTextActive]}>
              🔔 Dish Ready
            </Text>
            {counts.ready > 0 && (
              <View style={[styles.badge, styles.badgeReady]}>
                <Text style={styles.badgeText}>{counts.ready}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, activeFilter === "served" && styles.filterChipActiveServed]}
            onPress={() => setActiveFilter("served")}
          >
            <Text style={[styles.filterChipText, activeFilter === "served" && styles.filterChipTextActive]}>
              ✅ Served
            </Text>
            {counts.served > 0 && (
              <View style={[styles.badge, styles.badgeInactive]}>
                <Text style={styles.badgeText}>{counts.served}</Text>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ORDERS LIST */}
      {loadingOrders ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f97316" />
          <Text style={styles.loadingText}>Fetching kitchen orders...</Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="pot-steam" size={72} color="#334155" />
          <Text style={styles.emptyTitle}>No Orders In This Queue</Text>
          <Text style={styles.emptySubtitle}>
            {activeFilter === "active"
              ? "All caught up! New orders from Waiters will appear here instantly."
              : `No orders currently marked as "${activeFilter}".`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          numColumns={isTablet ? 2 : 1}
          key={isTablet ? "tablet-2-col" : "mobile-1-col"}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => {
            const urgencyColor = getUrgencyColor(item.createdAt, item.createdAtMs);
            const isUpdating = updatingOrderId === item.id;

            return (
              <View
                style={[
                  styles.orderCard,
                  isTablet && styles.orderCardTablet,
                  { borderLeftColor: urgencyColor, borderLeftWidth: 6 },
                ]}
              >
                {/* CARD HEADER */}
                <View style={styles.cardHeader}>
                  <View style={styles.tableBadgeContainer}>
                    <View style={styles.tableBadge}>
                      <Icon name="silverware-fork-knife" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text style={styles.tableBadgeText}>{item.tableNo || "Dine In"}</Text>
                    </View>
                    <Text style={styles.orderNumberText}>{item.orderNumber || "KOT"}</Text>
                  </View>

                  <View style={styles.timeBadgeContainer}>
                    <View style={[styles.timeBadge, { backgroundColor: urgencyColor + "22" }]}>
                      <Icon name="clock-outline" size={14} color={urgencyColor} style={{ marginRight: 4 }} />
                      <Text style={[styles.timeText, { color: urgencyColor }]}>
                        {getElapsedTime(item.createdAt, item.createdAtMs)}
                      </Text>
                    </View>

                    {/* STATUS PILL */}
                    <View
                      style={[
                        styles.statusPill,
                        item.status === "pending" && styles.statusPending,
                        item.status === "preparing" && styles.statusPreparing,
                        item.status === "ready" && styles.statusReady,
                        item.status === "served" && styles.statusServed,
                      ]}
                    >
                      <Text style={styles.statusPillText}>
                        {item.status === "pending"
                          ? "NEW"
                          : item.status === "preparing"
                          ? "COOKING"
                          : item.status === "ready"
                          ? "READY"
                          : "SERVED"}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* WAITER INFO */}
                <View style={styles.waiterRow}>
                  <Icon name="account-tie-voice" size={15} color="#94a3b8" style={{ marginRight: 6 }} />
                  <Text style={styles.waiterText}>
                    Waiter: <Text style={{ color: "#f8fafc", fontWeight: "600" }}>{item.waiterName || "Staff"}</Text>
                  </Text>
                </View>

                {/* OVERALL ORDER NOTES */}
                {Boolean(item.orderNotes) && (
                  <View style={styles.orderNotesBanner}>
                    <Icon name="alert-circle" size={16} color="#fbbf24" style={{ marginRight: 6 }} />
                    <Text style={styles.orderNotesText}>
                      Note: <Text style={{ fontStyle: "italic" }}>{item.orderNotes}</Text>
                    </Text>
                  </View>
                )}

                {/* ITEMS LIST (NO PRICES DISPLAYED) */}
                <View style={styles.itemsDivider} />
                <View style={styles.itemsContainer}>
                  {(item.items || []).map((foodItem, idx) => {
                    const isChecked = Boolean(checkedItems[`${item.id}_${idx}`]);
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.itemRow, isChecked && styles.itemRowChecked]}
                        activeOpacity={0.7}
                        onPress={() => toggleItemCheck(item.id, idx)}
                      >
                        <View style={styles.itemLeft}>
                          {/* Item check circle */}
                          <View
                            style={[
                              styles.itemCheckbox,
                              isChecked && styles.itemCheckboxChecked,
                            ]}
                          >
                            {isChecked && <Icon name="check" size={14} color="#ffffff" />}
                          </View>

                          {/* Quantity Badge */}
                          <View style={styles.qtyBadge}>
                            <Text style={styles.qtyText}>{foodItem.qty || 1}x</Text>
                          </View>

                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.itemName,
                                isChecked && styles.itemNameChecked,
                              ]}
                            >
                              {foodItem.name || "Item"}
                            </Text>
                            {Boolean(foodItem.portion && foodItem.portion !== "Standard") && (
                              <Text style={styles.itemPortion}>[{foodItem.portion}]</Text>
                            )}
                            {Boolean(foodItem.notes) && (
                              <Text style={styles.itemSpecialNotes}>👉 {foodItem.notes}</Text>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* ACTION BUTTONS */}
                <View style={styles.actionsContainer}>
                  {isUpdating ? (
                    <View style={styles.updatingIndicator}>
                      <ActivityIndicator size="small" color="#f97316" />
                      <Text style={styles.updatingText}>Updating Kitchen...</Text>
                    </View>
                  ) : (
                    <>
                      {/* PENDING ACTIONS */}
                      {item.status === "pending" && (
                        <View style={styles.actionButtonGroup}>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.btnStartCooking]}
                            onPress={() => handleUpdateStatus(item.id, "preparing")}
                            activeOpacity={0.8}
                          >
                            <Icon name="fire" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                            <Text style={styles.actionBtnText}>Start Cooking</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.actionBtn, styles.btnDishReady]}
                            onPress={() => handleUpdateStatus(item.id, "ready")}
                            activeOpacity={0.8}
                          >
                            <Icon name="bell-ring" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                            <Text style={styles.actionBtnText}>Dish Ready</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* PREPARING ACTIONS */}
                      {item.status === "preparing" && (
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.btnDishReadyFull]}
                          onPress={() => handleUpdateStatus(item.id, "ready")}
                          activeOpacity={0.8}
                        >
                          <Icon name="bell-ring" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                          <Text style={styles.actionBtnLargeText}>🔔 Dish Ready</Text>
                        </TouchableOpacity>
                      )}

                      {/* READY ACTIONS */}
                      {item.status === "ready" && (
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.btnServedFull]}
                          onPress={() => handleUpdateStatus(item.id, "served")}
                          activeOpacity={0.8}
                        >
                          <Icon name="check-all" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                          <Text style={styles.actionBtnLargeText}>✅ Finish / Served</Text>
                        </TouchableOpacity>
                      )}

                      {/* SERVED ACTIONS */}
                      {item.status === "served" && (
                        <View style={styles.completedBadgeRow}>
                          <Icon name="check-circle" size={18} color="#10b981" style={{ marginRight: 6 }} />
                          <Text style={styles.completedBadgeText}>Delivered & Served to Table</Text>
                        </View>
                      )}
                    </>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0b1324",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0b1324",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: "#94a3b8",
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#111c38",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  kitchenIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#ea580c",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#f8fafc",
    letterSpacing: 0.3,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ef444422",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: "#ef444466",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ef4444",
    marginRight: 4,
  },
  liveText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#ef4444",
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#1e293b",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  headerIconButtonActive: {
    backgroundColor: "#3b82f6",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dc2626",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  logoutText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
  },
  filterBar: {
    backgroundColor: "#0f172a",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  filterScroll: {
    paddingHorizontal: 16,
    alignItems: "center",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
  },
  filterChipActive: {
    backgroundColor: "#ea580c",
  },
  filterChipActivePending: {
    backgroundColor: "#3b82f6",
  },
  filterChipActivePreparing: {
    backgroundColor: "#f59e0b",
  },
  filterChipActiveReady: {
    backgroundColor: "#10b981",
  },
  filterChipActiveServed: {
    backgroundColor: "#64748b",
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#94a3b8",
  },
  filterChipTextActive: {
    color: "#ffffff",
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
  },
  badgeActive: {
    backgroundColor: "#ffffff33",
  },
  badgeInactive: {
    backgroundColor: "#0b1324",
  },
  badgePending: {
    backgroundColor: "#1d4ed8",
  },
  badgePreparing: {
    backgroundColor: "#d97706",
  },
  badgeReady: {
    backgroundColor: "#059669",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#cbd5e1",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  listContainer: {
    padding: 12,
  },
  orderCard: {
    backgroundColor: "#162038",
    borderRadius: 14,
    marginBottom: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  orderCardTablet: {
    flex: 1,
    marginHorizontal: 6,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  tableBadgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  tableBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2563eb",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tableBadgeText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 0.5,
  },
  orderNumberText: {
    color: "#94a3b8",
    fontWeight: "700",
    fontSize: 13,
  },
  timeBadgeContainer: {
    alignItems: "flex-end",
    gap: 6,
  },
  timeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPending: {
    backgroundColor: "#3b82f633",
    borderWidth: 1,
    borderColor: "#3b82f6",
  },
  statusPreparing: {
    backgroundColor: "#f59e0b33",
    borderWidth: 1,
    borderColor: "#f59e0b",
  },
  statusReady: {
    backgroundColor: "#10b98133",
    borderWidth: 1,
    borderColor: "#10b981",
  },
  statusServed: {
    backgroundColor: "#64748b33",
    borderWidth: 1,
    borderColor: "#64748b",
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  waiterRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  waiterText: {
    fontSize: 13,
    color: "#94a3b8",
  },
  orderNotesBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#78350f33",
    borderWidth: 1,
    borderColor: "#d97706",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
  },
  orderNotesText: {
    fontSize: 13,
    color: "#fde68a",
    flex: 1,
  },
  itemsDivider: {
    height: 1,
    backgroundColor: "#1e293b",
    marginVertical: 12,
  },
  itemsContainer: {
    gap: 10,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0f172a",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  itemRowChecked: {
    backgroundColor: "#0f172a88",
    opacity: 0.6,
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  itemCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#64748b",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  itemCheckboxChecked: {
    backgroundColor: "#10b981",
    borderColor: "#10b981",
  },
  qtyBadge: {
    backgroundColor: "#ea580c",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 10,
  },
  qtyText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 14,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#f8fafc",
  },
  itemNameChecked: {
    textDecorationLine: "line-through",
    color: "#94a3b8",
  },
  itemPortion: {
    fontSize: 12,
    color: "#38bdf8",
    fontWeight: "600",
    marginTop: 1,
  },
  itemSpecialNotes: {
    fontSize: 12,
    color: "#fbbf24",
    marginTop: 2,
  },
  actionsContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
  },
  actionButtonGroup: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  btnStartCooking: {
    backgroundColor: "#f59e0b",
  },
  btnDishReady: {
    backgroundColor: "#10b981",
  },
  btnDishReadyFull: {
    backgroundColor: "#10b981",
    paddingVertical: 14,
  },
  btnServedFull: {
    backgroundColor: "#3b82f6",
    paddingVertical: 14,
  },
  actionBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14,
  },
  actionBtnLargeText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 0.5,
  },
  updatingIndicator: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 8,
  },
  updatingText: {
    color: "#f97316",
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 8,
  },
  completedBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    backgroundColor: "#064e3b33",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#05966966",
  },
  completedBadgeText: {
    color: "#34d399",
    fontWeight: "700",
    fontSize: 13,
  },
});
