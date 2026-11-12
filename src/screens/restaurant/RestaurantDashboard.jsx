import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Platform,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../utils/firebaseConfig";
import { useTheme } from "../../theme/ThemeContext";

export default function RestaurantDashboard({
  sales = [],
  shopName = "Restaurant",
  navigation,
  isLocked = false,
  setShowUpgradeModal,
  handleRestrictedClick,
}) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { theme } = useTheme();

  // Real-time listener for served orders ready for billing
  const [servedOrders, setServedOrders] = useState([]);
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!currentUser) return;
    const colRef = collection(db, "users", currentUser.uid, "kitchen_orders");
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((o) => o.status === "served");
        setServedOrders(list);
      },
      (err) => console.log("Dashboard served orders listener error:", err)
    );
    return () => unsub();
  }, [currentUser]);

  // Calculations from actual sales data
  const {
    totalRevenue,
    totalOrders,
    todaySales,
    todayOrders,
    monthSales,
    monthOrders,
    topSellingFoods,
    recentOrders,
  } = useMemo(() => {
    const today = new Date();
    const getDate = (ts) => {
      if (!ts) return null;
      if (ts.toDate) return ts.toDate();
      return new Date(ts);
    };

    let totRev = 0;
    let tdSales = 0;
    let tdCount = 0;
    let mSales = 0;
    let mCount = 0;

    const foodSalesMap = {};

    sales.forEach((s) => {
      const saleTotal = Number(s.total || s.totalAmount || 0);
      totRev += saleTotal;

      const d = getDate(s.createdAt);
      if (d) {
        if (d.toDateString() === today.toDateString()) {
          tdSales += saleTotal;
          tdCount += 1;
        }
        if (d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()) {
          mSales += saleTotal;
          mCount += 1;
        }
      }

      // Aggregate food items for top sellers
      if (Array.isArray(s.items)) {
        s.items.forEach((item) => {
          const name = item.name || item.itemName || "Item";
          const qty = Number(item.qty || 1);
          const price = Number(item.salesPrice || item.price || 0);

          if (!foodSalesMap[name]) {
            foodSalesMap[name] = { name, count: 0, revenue: 0 };
          }
          foodSalesMap[name].count += qty;
          foodSalesMap[name].revenue += price * qty;
        });
      }
    });

    const topFoods = Object.values(foodSalesMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const sortedRecent = [...sales]
      .sort((a, b) => {
        const timeA = getDate(a.createdAt)?.getTime() || 0;
        const timeB = getDate(b.createdAt)?.getTime() || 0;
        return timeB - timeA;
      })
      .slice(0, 5);

    return {
      totalRevenue: totRev,
      totalOrders: sales.length,
      todaySales: tdSales,
      todayOrders: tdCount,
      monthSales: mSales,
      monthOrders: mCount,
      topSellingFoods: topFoods,
      recentOrders: sortedRecent,
    };
  }, [sales]);

  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.scrollContainer,
        { paddingBottom: Platform.OS === "ios" ? 140 : 120 },
      ]}
    >
      {/* 1. RESTAURANT QUICK ACTIONS BANNER */}
      <View style={styles.quickActionsContainer}>
        {/* SERVED TABLES BILLING ALERT */}
        {servedOrders.length > 0 && (
          <TouchableOpacity
            style={styles.servedAlertBanner}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("Sales")}
          >
            <View style={styles.servedAlertIconBox}>
              <Icon name="bell-ring" size={24} color="#15803d" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={styles.servedAlertTitle}>
                  {servedOrders.length} {servedOrders.length === 1 ? "Table" : "Tables"} Ready for Bill!
                </Text>
                <View style={styles.servedAlertBadge}>
                  <Text style={styles.servedAlertBadgeText}>SERVED</Text>
                </View>
              </View>
              <Text style={styles.servedAlertSub} numberOfLines={1}>
                {servedOrders.map((o) => `${o.tableNo} (₹${Number(o.totalAmount || 0).toFixed(0)})`).join(", ")} • Tap to Bill Now
              </Text>
            </View>
            <Icon name="chevron-right" size={24} color="#15803d" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.actionBigBtn, { backgroundColor: "#16a34a" }]}
          onPress={() => {
            if (isLocked) setShowUpgradeModal(true);
            else navigation.navigate("Sales");
          }}
          activeOpacity={0.85}
        >
          <View style={styles.actionIconBox}>
            <Icon name="cash-register" size={26} color="#16a34a" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionBigTitle}>Sales Billing</Text>
            <Text style={styles.actionBigSub}>Touch to take food orders</Text>
          </View>
          <Icon name="chevron-right" size={24} color="#ffffff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBigBtn, { backgroundColor: "#6366f1" }]}
          onPress={() => {
            if (isLocked) setShowUpgradeModal(true);
            else navigation.navigate("Scan");
          }}
          activeOpacity={0.85}
        >
          <View style={styles.actionIconBox}>
            <Icon name="food-fork-drink" size={26} color="#6366f1" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionBigTitle}>Add Foods</Text>
            <Text style={styles.actionBigSub}>Create new dishes & drinks</Text>
          </View>
          <Icon name="chevron-right" size={24} color="#ffffff" />
        </TouchableOpacity>

        {/* 3. KITCHEN DISPLAY SYSTEM (KDS) */}
        <TouchableOpacity
          style={[styles.actionBigBtn, { backgroundColor: "#ea580c" }]}
          onPress={() => navigation.navigate("KitchenDisplay")}
          activeOpacity={0.85}
        >
          <View style={styles.actionIconBox}>
            <Icon name="chef-hat" size={26} color="#ea580c" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionBigTitle}>Kitchen Display (KDS)</Text>
            <Text style={styles.actionBigSub}>Live orders, cooking & dish ready</Text>
          </View>
          <Icon name="chevron-right" size={24} color="#ffffff" />
        </TouchableOpacity>

        {/* 4. WAITER ORDER & STAFF LOGINS ROW */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            style={[styles.actionBigBtn, { flex: 1, backgroundColor: "#0284c7" }]}
            onPress={() => navigation.navigate("WaiterOrder")}
            activeOpacity={0.85}
          >
            <View style={[styles.actionIconBox, { width: 36, height: 36, marginRight: 8 }]}>
              <Icon name="silverware-fork-knife" size={20} color="#0284c7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionBigTitle, { fontSize: 13 }]}>Waiter KOT</Text>
              <Text style={[styles.actionBigSub, { fontSize: 10 }]}>Table orders</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBigBtn, { flex: 1, backgroundColor: "#4f46e5" }]}
            onPress={() => navigation.navigate("StaffCreation")}
            activeOpacity={0.85}
          >
            <View style={[styles.actionIconBox, { width: 36, height: 36, marginRight: 8 }]}>
              <Icon name="account-group" size={20} color="#4f46e5" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionBigTitle, { fontSize: 13 }]}>Staff Logins</Text>
              <Text style={[styles.actionBigSub, { fontSize: 10 }]}>Waiter & Kitchen</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. MAIN REVENUE CARD */}
      <TouchableOpacity activeOpacity={0.9} onPress={handleRestrictedClick}>
        <View style={styles.mainRevenueCard}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Icon name="silverware-fork-knife" size={16} color="#86efac" style={{ marginRight: 6 }} />
              <Text style={styles.revenueCardLabel}>Total Restaurant Sales</Text>
            </View>
            <Text
              style={styles.revenueAmount}
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.75}
            >
              {isLocked ? "🔒 Locked" : `₹ ${totalRevenue.toFixed(2)}`}
            </Text>
            <Text style={styles.ordersCountText}>
              {totalOrders} total completed orders • Avg ₹{avgOrderValue.toFixed(0)} / order
            </Text>
          </View>

          <TouchableOpacity
            style={styles.journalBtn}
            onPress={() => {
              if (isLocked) setShowUpgradeModal(true);
              else navigation.navigate("JournalEntry");
            }}
            activeOpacity={0.8}
          >
            <Icon name="book-outline" size={24} color="#16a34a" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* 3. 4 KEY METRIC CARDS */}
      <View style={[styles.statsGrid, isTablet && styles.tabletStatsGrid]}>
        {/* Today Sales */}
        <TouchableOpacity
          style={[styles.statCard, isTablet && styles.tabletStatCard, { backgroundColor: theme.card }]}
          onPress={handleRestrictedClick}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1, marginRight: 6 }}>
            <Text style={styles.statTitle}>Today's Sales</Text>
            <Text style={[styles.statValue, { color: "#16a34a" }]} numberOfLines={1}>
              {isLocked ? "🔒 Locked" : `₹ ${todaySales.toFixed(2)}`}
            </Text>
          </View>
          <View style={[styles.iconCircle, { backgroundColor: "#dcfce7" }]}>
            <Icon name="cash" size={18} color="#16a34a" />
          </View>
        </TouchableOpacity>

        {/* Today Orders */}
        <TouchableOpacity
          style={[styles.statCard, isTablet && styles.tabletStatCard, { backgroundColor: theme.card }]}
          onPress={handleRestrictedClick}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1, marginRight: 6 }}>
            <Text style={styles.statTitle}>Today's Orders</Text>
            <Text style={[styles.statValue, { color: "#6366f1" }]} numberOfLines={1}>
              {isLocked ? "🔒 Locked" : `${todayOrders} orders`}
            </Text>
          </View>
          <View style={[styles.iconCircle, { backgroundColor: "#e0e7ff" }]}>
            <Icon name="food-drumstick" size={18} color="#6366f1" />
          </View>
        </TouchableOpacity>

        {/* Month Sales */}
        <TouchableOpacity
          style={[styles.statCard, isTablet && styles.tabletStatCard, { backgroundColor: theme.card }]}
          onPress={handleRestrictedClick}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1, marginRight: 6 }}>
            <Text style={styles.statTitle}>Monthly Sales</Text>
            <Text style={[styles.statValue, { color: "#16a34a" }]} numberOfLines={1}>
              {isLocked ? "🔒 Locked" : `₹ ${monthSales.toFixed(2)}`}
            </Text>
          </View>
          <View style={[styles.iconCircle, { backgroundColor: "#dcfce7" }]}>
            <Icon name="calendar-month-outline" size={18} color="#16a34a" />
          </View>
        </TouchableOpacity>

        {/* Month Orders */}
        <TouchableOpacity
          style={[styles.statCard, isTablet && styles.tabletStatCard, { backgroundColor: theme.card }]}
          onPress={handleRestrictedClick}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1, marginRight: 6 }}>
            <Text style={styles.statTitle}>Monthly Orders</Text>
            <Text style={[styles.statValue, { color: "#d97706" }]} numberOfLines={1}>
              {isLocked ? "🔒 Locked" : `${monthOrders} orders`}
            </Text>
          </View>
          <View style={[styles.iconCircle, { backgroundColor: "#fef3c7" }]}>
            <Icon name="receipt" size={18} color="#d97706" />
          </View>
        </TouchableOpacity>
      </View>

      {/* 4. TOP SELLING FOOD ITEMS */}
      <View style={[styles.sectionBox, { backgroundColor: theme.card }]}>
        <View style={styles.sectionHeaderRow}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Icon name="fire" size={20} color="#f97316" style={{ marginRight: 6 }} />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Top-Selling Foods</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate("Sales")}>
            <Text style={{ color: "#6366f1", fontSize: 13, fontWeight: "700" }}>+ Bill Now</Text>
          </TouchableOpacity>
        </View>

        {topSellingFoods.length === 0 ? (
          <View style={styles.emptyItemsBox}>
            <Icon name="silverware" size={32} color="#cbd5e1" />
            <Text style={styles.emptyItemsText}>Complete sales to see your top-selling dishes.</Text>
          </View>
        ) : (
          topSellingFoods.map((food, idx) => (
            <View key={food.name} style={styles.topFoodRow}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>#{idx + 1}</Text>
              </View>

              <View style={{ flex: 1, marginHorizontal: 10 }}>
                <Text style={[styles.topFoodName, { color: theme.text }]} numberOfLines={1}>
                  {food.name}
                </Text>
                <Text style={styles.topFoodMeta}>
                  {food.count} orders • ₹{food.revenue.toFixed(2)} total revenue
                </Text>
              </View>

              <TouchableOpacity
                style={styles.quickBillBtn}
                onPress={() => navigation.navigate("Sales")}
                activeOpacity={0.7}
              >
                <Icon name="plus" size={16} color="#16a34a" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* 5. RECENT SALES PREVIEW */}
      <View style={[styles.sectionBox, { backgroundColor: theme.card, marginTop: 14 }]}>
        <View style={styles.sectionHeaderRow}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Icon name="clock-outline" size={20} color="#6366f1" style={{ marginRight: 6 }} />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Restaurant Bills</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate("SalesHistory")}>
            <Text style={{ color: "#6366f1", fontSize: 13, fontWeight: "700" }}>View All</Text>
          </TouchableOpacity>
        </View>

        {recentOrders.length === 0 ? (
          <View style={styles.emptyItemsBox}>
            <Icon name="receipt" size={32} color="#cbd5e1" />
            <Text style={styles.emptyItemsText}>No restaurant sales completed yet.</Text>
          </View>
        ) : (
          recentOrders.map((order) => {
            const billTotal = Number(order.total || order.totalAmount || 0);
            return (
              <View key={order.id} style={styles.recentOrderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recentBillNo, { color: theme.text }]}>
                    {order.billNo || "Order"}
                  </Text>
                  <Text style={styles.recentBillDate}>
                    {order.billDate || "Today"} • {order.items?.length || 0} food items • {order.paymentMode || "CASH"}
                  </Text>
                </View>
                <Text style={styles.recentBillAmount}>₹{billTotal.toFixed(2)}</Text>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  quickActionsContainer: {
    gap: 10,
    marginBottom: 14,
  },
  actionBigBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  actionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  actionBigTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  actionBigSub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    marginTop: 2,
  },
  mainRevenueCard: {
    backgroundColor: "#15803d",
    borderRadius: 24,
    paddingVertical: 22,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#15803d",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    marginBottom: 14,
  },
  revenueCardLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  revenueAmount: {
    color: "#ffffff",
    fontSize: 32,
    fontWeight: "900",
    marginTop: 6,
    letterSpacing: -0.5,
  },
  ordersCountText: {
    color: "#dcfce7",
    fontSize: 12,
    marginTop: 4,
    fontWeight: "500",
  },
  journalBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
    marginBottom: 14,
  },
  tabletStatsGrid: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 10,
  },
  statCard: {
    width: "48%",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  tabletStatCard: {
    width: "auto",
    flex: 1,
  },
  statTitle: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionBox: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  emptyItemsBox: {
    alignItems: "center",
    paddingVertical: 20,
  },
  emptyItemsText: {
    fontSize: 13,
    color: "#94a3b8",
    marginTop: 8,
    textAlign: "center",
  },
  topFoodRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    justifyContent: "center",
    alignItems: "center",
  },
  rankText: {
    color: "#16a34a",
    fontSize: 12,
    fontWeight: "800",
  },
  topFoodName: {
    fontSize: 14,
    fontWeight: "700",
  },
  topFoodMeta: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  quickBillBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#dcfce7",
    justifyContent: "center",
    alignItems: "center",
  },
  recentOrderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  recentBillNo: {
    fontSize: 14,
    fontWeight: "700",
  },
  recentBillDate: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  recentBillAmount: {
    fontSize: 15,
    fontWeight: "800",
    color: "#16a34a",
  },
  servedAlertBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dcfce7",
    borderWidth: 1.5,
    borderColor: "#16a34a",
    padding: 14,
    borderRadius: 18,
    shadowColor: "#16a34a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  servedAlertIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  servedAlertTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#15803d",
  },
  servedAlertBadge: {
    backgroundColor: "#16a34a",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  servedAlertBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "800",
  },
  servedAlertSub: {
    fontSize: 12,
    color: "#166534",
    marginTop: 2,
    fontWeight: "600",
  },
});
