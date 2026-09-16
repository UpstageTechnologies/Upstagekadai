import React, { useState, useEffect, useRef } from "react";
import { auth, db } from "../utils/firebaseConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView, SafeAreaView, StatusBar, Dimensions, Platform, Alert } from "react-native";
import { collection, onSnapshot, doc, getDoc, setDoc } from "firebase/firestore";
import { getFCMToken } from "../utils/notifications";
import { LineChart, Grid } from "react-native-svg-charts";
import SalesHistory from "./SalesHistory";
import PurchaseHistory from "./PurchaseHistory";
import InventoryScreen from "./InventoryScreen";
import { useFocusEffect } from "@react-navigation/native";
import { getSession } from "../utils/session";
import { useTheme } from "../theme/ThemeContext";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

export default function Dashboard({ navigation }) {
  const [image, setImage] = useState(null);
  const [sales, setSales] = useState([]);
  const [showScanOptions, setShowScanOptions] = useState(false);
  const [profitView, setProfitView] = useState("total"); 
  const [page, setPage] = useState(0);
  const [userPlan, setUserPlan] = useState("Free Trial");
  const pagerRef = useRef(null);
  const isActive = (index) => page === index;
  const width = Dimensions.get("window").width;
  const [shopName, setShopName] = useState("");
  const [userUid, setUserUid] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showShopModeMenu, setShowShopModeMenu] = useState(false);
  const [shopLogo, setShopLogo] = useState(null);
  const [isGlobalMode, setIsGlobalMode] = useState(false);
  const [userRole, setUserRole] = useState("master");

  useEffect(() => {
    loadSession();
  }, []);

const loadSession = async () => {
  const session = await getSession();
  if (session?.uid) {
    setUserUid(session.uid);
    setUserRole(session.role || "master"); // 🌟 Load user role
  }
};

const loadUserAndLogo = async (uid, modeIsGlobal) => {
    const modeStr = modeIsGlobal ? "global" : "local";
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = snap.data();
        setShopName(data[`${modeStr}_shopName`] || data.shopName || "");
        setShopLogo(data[`${modeStr}_shopLogo`] || data.shopLogo || null);
        setImage(data[`${modeStr}_profileImage`] || data.profileImage || null);
      }
    } catch (err) {
      console.log("Error loading data:", err);
    }
    
    // Fallback/Load robustly from AsyncStorage with proper mode prefix
    const logo = await AsyncStorage.getItem(`${modeStr}_shopLogo_${uid}`) || await AsyncStorage.getItem(`shop_qr_code_${uid}`);
    if (logo) setShopLogo(logo);

    const profileImg = await AsyncStorage.getItem(`${modeStr}_profileImage_${uid}`);
    if (profileImg) setImage(profileImg);
  };

  const checkModeAndLoad = async () => {
    if (!userUid) return;
    const savedMode = await AsyncStorage.getItem("app_mode");
    const modeBool = savedMode === "global";
    setIsGlobalMode(modeBool);
    await loadUserAndLogo(userUid, modeBool);
  };

  useEffect(() => {
    if (userUid) {
      checkModeAndLoad();
    }
  }, [userUid]);

  useFocusEffect(
    React.useCallback(() => {
      if (userUid) {
        checkModeAndLoad();
      }
    }, [userUid])
  );

  const selectAppMode = async (mode) => {
    setShowShopModeMenu(false);
    const modeBool = mode === "global";
    setIsGlobalMode(modeBool);
    await AsyncStorage.setItem("app_mode", mode);
    setShopName(""); 
    if (userUid) {
      await loadUserAndLogo(userUid, modeBool);
    }
  };

  useEffect(() => {
    if (!userUid) return;
    const unsubSales = onSnapshot(collection(db, "users", userUid, "sales"), (snap) => {
      setSales(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubSales();
  }, [userUid]);

  const { darkMode, toggleTheme, theme } = useTheme();

  const goToPage = (index) => {
    pagerRef.current?.scrollTo({ x: width * index, animated: true });
    setPage(index);
  };

  const today = new Date(); 
  const getDate = (ts) => {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    return new Date(ts);
  };

// 1. Filter out valid current sales data, making sure total and profit are numbers
  const currentSalesData = sales.filter(s => {
    const itemModeIsGlobal = s.isGlobalMode === true || s.appMode === "global" || s.isGlobalMode === "global";
    return isGlobalMode ? itemModeIsGlobal : !itemModeIsGlobal;
  });

  const totalSales = currentSalesData.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
  const totalProfit = currentSalesData.reduce((sum, s) => sum + (Number(s.profit) || (Number(s.total) * 0.2) || 0), 0);

  const todayProfit = currentSalesData
    .filter(s => {
      const d = getDate(s.createdAt);
      return d && d.toDateString() === today.toDateString();
    })
    .reduce((sum, s) => sum + (Number(s.profit) || (Number(s.total) * 0.2) || 0), 0);

  const monthProfit = currentSalesData
    .filter(s => {
      const d = getDate(s.createdAt);
      return d && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    })
    .reduce((sum, s) => sum + (Number(s.profit) || (Number(s.total) * 0.2) || 0), 0);

  const displayProfit = profitView === "month" ? monthProfit : totalProfit;
  
  const todaySales = currentSalesData
    .filter(s => {
      const d = getDate(s.createdAt);
      return d && d.toDateString() === today.toDateString();
    })
    .reduce((sum, s) => sum + (Number(s.total) || 0), 0);

  const monthSales = currentSalesData
    .filter(s => {
      const d = getDate(s.createdAt);
      return d && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    })
    .reduce((sum, s) => sum + (Number(s.total) || 0), 0);

  // 2. Build running total arrays, ensuring absolutely NO NaN values leak through
  let runningChart = 0;
  const totalChartData = currentSalesData.map(s => {
    const val = Number(s.profit) || (Number(s.total) * 0.2) || 0;
    runningChart += val;
    return isNaN(runningChart) ? 0 : runningChart; // Prevent NaN leaking
  });

  let monthRunning = 0;
  const monthChartData = currentSalesData 
    .filter(s => {
      const d = getDate(s.createdAt);
      return d && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    })
    .map(s => {
      const val = Number(s.profit) || (Number(s.total) * 0.2) || 0;
      runningChart += val;
      monthRunning += val;
      return isNaN(monthRunning) ? 0 : monthRunning; // Prevent NaN leaking
    });

  // 3. Final structural sanitize check before passing to the Chart UI component
  const rawChartData = profitView === "month" ? monthChartData : totalChartData;
  const chartData = rawChartData.length > 0 && !rawChartData.every(val => val === 0) 
    ? rawChartData.filter(v => !isNaN(v)) 
    : [0, 0]; // Chart requires at least two coordinates to render paths beautifully without crashing

  const maxValue = Math.max(...chartData);
  let topAxis = maxValue <= 1000 ? 1000 : maxValue <= 3000 ? 3000 : maxValue <= 5000 ? 5000 : maxValue <= 6000 ? 6000 : maxValue <= 8000 ? 8000 : maxValue <= 10000 ? 10000 : Math.ceil(maxValue / 5000) * 5000;
  const yAxisLabels = [topAxis, Math.round(topAxis * 0.75), Math.round(topAxis * 0.50), Math.round(topAxis * 0.25), 0];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar backgroundColor={theme.background} barStyle={darkMode ? "light-content" : "dark-content"} translucent={true} />
      <SafeAreaView style={[styles.safeTop, { backgroundColor: theme.background }]}>
        <View style={styles.topBar}>
          <View style={styles.leftTop}>
            <TouchableOpacity onPress={() => { setShowShopModeMenu(!showShopModeMenu); setShowProfileMenu(false); }} style={{ flexDirection: "row", alignItems: "center" }}>
              {shopLogo ? (
                <Image source={{ uri: shopLogo }} style={{ width: 42, height: 42, borderRadius: 12, marginRight: 7 }} />
              ) : (
                <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: isGlobalMode ? "#10b981" : "#6366f1", justifyContent: "center", alignItems: "center", marginRight: 12 }}>
                  <Icon name="store" size={26} color="#fff" />
                </View>
              )}
              <View>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.shopTitle, { color: theme.text, maxWidth: 140, fontSize: 22 }]}>
                    {shopName || "My Shop"}
                  </Text>
                  <Icon name="chevron-down" size={20} color={theme.text} style={{ marginLeft: 2, marginTop: 4 }} />
                </View>
                <View style={{ backgroundColor: isGlobalMode ? "#10b981" : "#6366f1", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 2, alignSelf: 'flex-start' }}>
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "bold" }}>
                    {isGlobalMode ? "GLOBAL SHOP" : "LOCAL SHOP"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {showShopModeMenu && (
              <View style={[styles.shopModeDropdown, { backgroundColor: theme.card }]}>
                <TouchableOpacity style={[styles.dropdownItem, isGlobalMode === false && styles.activeModeItem]} onPress={() => selectAppMode("local")}>
                  <Icon name="storefront-outline" size={20} color={isGlobalMode === false ? "#6366f1" : theme.text} />
                  <Text style={[styles.dropdownText, { color: isGlobalMode === false ? "#6366f1" : theme.text, fontWeight: isGlobalMode === false ? "700" : "600" }]}>Local Shop</Text>
                  {!isGlobalMode && <Icon name="check" size={16} color="#6366f1" style={{ marginLeft: "auto" }} />}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.dropdownItem, isGlobalMode === true && styles.activeModeItem]} onPress={() => selectAppMode("global")}>
                  <Icon name="earth" size={20} color={isGlobalMode ? "#10b981" : theme.text} />
                  <Text style={[styles.dropdownText, { color: isGlobalMode ? "#10b981" : theme.text, fontWeight: isGlobalMode ? "700" : "600" }]}>Global Shop</Text>
                  {isGlobalMode && <Icon name="check" size={16} color="#10b981" style={{ marginLeft: "auto" }} />}
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.topRight}>
            <TouchableOpacity style={styles.orderBtn} onPress={() => navigation.navigate("Orders", { appMode: isGlobalMode ? "global" : "local" })}>
              <Icon name="clipboard-list-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setShowProfileMenu(!showProfileMenu); setShowShopModeMenu(false); }}>
              {image ? (
                <Image source={{ uri: image }} style={styles.profile} />
              ) : (
                <View style={styles.profilePlaceholder}>
                  <Icon name="account" size={24} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          </View>

{showProfileMenu && (
    <View style={[styles.dropdownMenu, { backgroundColor: theme.card }]}>
      <TouchableOpacity style={styles.dropdownItem} onPress={() => { setShowProfileMenu(false); navigation.navigate("Profile"); }}>
        <Icon name="account-circle" size={20} color={theme.text} />
        <Text style={[styles.dropdownText, { color: theme.text }]}>Profile</Text>
      </TouchableOpacity>
      
      {/* 🌟 STAFF CREATION */}
      <TouchableOpacity style={styles.dropdownItem} onPress={() => { setShowProfileMenu(false); navigation.navigate("StaffCreation"); }}>
        <Icon name="account-plus-outline" size={20} color={theme.text} />
        <Text style={[styles.dropdownText, { color: theme.text }]}>Staff Creation</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.dropdownItem} onPress={() => { setShowProfileMenu(false); navigation.navigate("Settings"); }}>
        <Icon name="cog-outline" size={20} color={theme.text} />
        <Text style={[styles.dropdownText, { color: theme.text }]}>Settings</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.dropdownItem, { backgroundColor: userPlan === "Basic" ? "#2563EB" : userPlan === "Premium" ? "#16A34A" : userPlan === "Pro" ? "#FFD700" : "#6366F1", borderRadius: 12, marginHorizontal: 8, marginTop: 6, paddingVertical: 14, elevation: 5 }]}
        onPress={() => { setShowProfileMenu(false); navigation.navigate("Subscription"); }}
      >
        <Icon name="diamond-stone" size={20} color={userPlan === "Premium" ? "#111827" : "#FFFFFF"} />
        <Text style={[styles.dropdownText, { color: userPlan === "Premium" ? "#111827" : "#FFFFFF", fontWeight: "700" }]}>Upgrade</Text>
      </TouchableOpacity>
    </View>
  )}
        </View>
      </SafeAreaView>

      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        onMomentumScrollEnd={(e) => {
          const pageIndex = Math.round(e.nativeEvent.contentOffset.x / width);
          setPage(pageIndex);
        }}
      >
        {/* PAGE 0 - DASHBOARD */}
        <View style={{ width }}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140, paddingHorizontal: 16 }}>
            <View style={styles.balanceCard}>
              <View>
                <Text style={styles.balanceText}>{isGlobalMode ? "Global Delivered Sales" : "Total Sales"}</Text>
               <Text style={styles.balanceAmount}>
               {userRole === "employee" ? "🔒 Locked" : `₹ ${totalSales.toFixed(2)}`}
               </Text>
              </View>
              <TouchableOpacity style={styles.journalBtn} onPress={() => navigation.navigate("JournalEntry")}>
                <Icon name="book-outline" size={24} color="#6366f1" />
              </TouchableOpacity>
            </View>

            <View style={styles.growthCard}>
              <View style={styles.growthTopRow}>
                <View>
                  <Text style={styles.growthTitle}>{isGlobalMode ? "Global Profit" : "Total Profit"}</Text>
                  <Text style={styles.growthAmount}>
                   {userRole === "employee" ? "🔒 Locked" : `₹ ${displayProfit.toFixed(2)}`}
                  </Text>
                  <View style={styles.percentBadge}><Text style={styles.growthPercent}>↑ +18.6%</Text></View>
                  <Text style={styles.lastMonthText}>vs last month</Text>
                </View>
                <TouchableOpacity style={styles.monthChip} onPress={() => setProfitView(profitView === "total" ? "month" : "total")}>
                  <Text style={{ color: "#fff", fontWeight: "600" }}>{profitView === "month" ? "This Month" : "Total Profit"}</Text>
                  <Icon name="chevron-down" size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={{ marginTop: 30 }}>
                <LineChart style={{ height: 230, width: "100%" }} data={chartData} svg={{ stroke: "#78ff9a", strokeWidth: 1 }} contentInset={{ top: 30, bottom: 20, left: 15, right: 35 }}>
                  <Grid svg={{ stroke: "rgba(255,255,255,.08)", strokeDasharray: [3, 4] }} />
                </LineChart>
                <View style={{ position: "absolute", right: -6, top: 18 }}>
                  {yAxisLabels.map((v, i) => (
                    <Text key={i} style={styles.axisText}>{v >= 1000 ? (v / 1000).toFixed(0) + "K" : v}</Text>
                  ))}
                </View>
              </View>
            </View>

            {/* STATS */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: theme.card }]}>
                <View style={{ flex: 1 }}><Text style={styles.statTitle}>Today Sales</Text><Text style={styles.amount} numberOfLines={1}>{userRole === "employee" ? "🔒 Locked" : `₹ ${todaySales.toFixed(2)}`}</Text></View> 
                <View style={styles.iconCirclePurple}><Icon name="shopping-outline" size={15} color="#6366f1" /></View>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.card }]}>
                <View style={{ flex: 1 }}><Text style={styles.statTitle}>Month Sales</Text><Text style={styles.amount} numberOfLines={1}>
  {userRole === "employee" ? "🔒 Locked" : `₹ ${monthSales.toFixed(2)}`}
</Text></View>
                <View style={styles.iconCirclePurple}><Icon name="calendar-month-outline" size={15} color="#6366f1" /></View>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: theme.card }]}>
                <View style={{ flex: 1 }}><Text style={styles.statTitle}>Today Profit</Text><Text style={styles.amountGreen} numberOfLines={1}>
  {userRole === "employee" ? "🔒 Locked" : `₹ ${todayProfit.toFixed(2)}`}
</Text></View>
                <View style={styles.iconCircleGreen}><Icon name="trending-up" size={15} color="#16a34a" /></View>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.card }]}>
                <View style={{ flex: 1 }}><Text style={styles.statTitle}>Month Profit</Text><Text style={styles.amountGreen} numberOfLines={1}>
  {userRole === "employee" ? "🔒 Locked" : `₹ ${monthProfit.toFixed(2)}`}
</Text></View>
                <View style={styles.iconCircleGreen}><Icon name="cash-multiple" size={15} color="#16a34a" /></View>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* PAGE 1 */}
        <View style={{ width }}>
          <SalesHistory appMode={isGlobalMode ? "global" : "local"} />
        </View>
        
        {/* PAGE 2 */}
        <View style={{ width }}>  
          <PurchaseHistory appMode={isGlobalMode ? "global" : "local"} />
        </View>
       
        {/* PAGE 3 */}
        <View style={{ width }}>
          <InventoryScreen appMode={isGlobalMode ? "global" : "local"} />
        </View>
      </ScrollView>

      {showScanOptions && (
        <View style={styles.modalBg}>
          <View style={styles.newModalBox}>
            <Text style={styles.modalTitle}>Choose Scan Type</Text>
            <TouchableOpacity style={styles.modalOption} onPress={() => { setShowScanOptions(false); navigation.navigate("Sales"); }}><Icon name="cash" size={22} color="#16a34a" /><Text style={styles.modalOptionText}>Sales Scan</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => { setShowScanOptions(false); navigation.navigate("Scan"); }}><Icon name="cube-scan" size={22} color="#6366f1" /><Text style={styles.modalOptionText}>Purchase Scan</Text></TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowScanOptions(false)}><Text style={{ color: "#fff" }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      )}

      {/* BOTTOM NAV */}
      <View style={[styles.bottomNav, { backgroundColor: theme.card }]}>
        <TouchableOpacity onPress={() => goToPage(0)} style={styles.navItem}><Icon name="home" size={22} color={isActive(0) ? "#6366f1" : "#94a3b8"} /><Text style={isActive(0) ? styles.navText : styles.navTextInactive}>Home</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => goToPage(1)} style={styles.navItem}><Icon name="chart-line" size={22} color={isActive(1) ? "#6366f1" : "#94a3b8"} /><Text style={isActive(1) ? styles.navText : styles.navTextInactive}>Sales</Text></TouchableOpacity>
        <View style={styles.centerPlaceholder} />
        <TouchableOpacity onPress={() => goToPage(2)} style={styles.navItem}><Icon name="cube-outline" size={22} color={isActive(2) ? "#6366f1" : "#94a3b8"} /><Text style={isActive(2) ? styles.navText : styles.navTextInactive}>Purchase</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => goToPage(3)} style={styles.navItem}><Icon name="archive-outline" size={22} color={isActive(3) ? "#6366f1" : "#94a3b8"} /><Text style={isActive(3) ? styles.navText : styles.navTextInactive}>Inventory</Text></TouchableOpacity>
        <TouchableOpacity style={styles.scanBtn} onPress={() => setShowScanOptions(true)}><Icon name="qrcode-scan" size={28} color="#fff" /></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  profile: { width: 45, height: 45, borderRadius: 25 },
  profilePlaceholder: { width: 45, height: 45, borderRadius: 25, backgroundColor: "#6366f1", justifyContent: "center", alignItems: "center" },
  balanceCard: { backgroundColor: "#6366f1", borderRadius: 25, marginTop: 10, paddingVertical: 20, paddingHorizontal: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "center", shadowColor: "#6366f1", shadowOpacity: 0.35, shadowRadius: 12, elevation: 7 },
  balanceText: { color: "#e0e7ff", fontSize: 14 },
  balanceAmount: { color: "#ffffff", fontSize: 30, fontWeight: "bold", marginTop: 5 },
  statsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, paddingHorizontal: 2 },
  statCard: { width: "48%", borderRadius: 20, paddingVertical: 18, paddingHorizontal: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  statTitle: { color: "#64748b", fontSize: 13, marginBottom: 5 },
  bottomNav: { position: "absolute", bottom: 20, left: 20, right: 20, height: 75, borderRadius: 25, flexDirection: "row", alignItems: "center", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10, elevation: 10 },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  navText: { fontSize: 11, color: "#6366f1", marginTop: 4, fontWeight: "600" },
  navTextInactive: { fontSize: 11, color: "#94a3b8", marginTop: 4 },
  centerPlaceholder: { flex: 1 },
  scanBtn: { position: "absolute", top: -25, alignSelf: "center", width: 60, height: 60, borderRadius: 30, backgroundColor: "#6366f1", marginLeft: 150, justifyContent: "center", alignItems: "center", shadowColor: "#6366f1", shadowOpacity: 0.5, shadowRadius: 10, elevation: 10 },
  amount: { fontSize: 16, fontWeight: "bold", color: "#6366f1", marginTop: 4 },
  amountGreen: { fontSize: 16, fontWeight: "bold", color: "#22c55e", marginTop: 4 },
  growthCard: { backgroundColor: "#021b46", marginTop: 16, borderRadius: 30, width: "100%", paddingTop: 22, paddingHorizontal: 20, paddingBottom: 30, height: 470, overflow: "visible", shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 10, elevation: 7 },
  growthTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  monthChip: { backgroundColor: "#0d2c68", paddingHorizontal: 16, paddingVertical: 11, borderRadius: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", minWidth: 140 },
  percentBadge: { marginTop: 14, backgroundColor: "#14532d", alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  growthTitle: { color: "#fff", fontSize: 18, fontWeight: "600" },
  growthAmount: { color: "#78ff9a", fontSize: 32, fontWeight: "bold", marginTop: 10 },
  growthPercent: { color: "#78ff9a", fontWeight: "700" },
  lastMonthText: { color: "#fff", marginTop: 10, fontSize: 15 },
  axisText: { color: "#dbeafe", fontSize: 13, marginBottom: 28, marginLeft: 200 },
  iconCirclePurple: { width: 34, height: 34, borderRadius: 24, backgroundColor: "#eef2ff", justifyContent: "center", alignItems: "center" },
  iconCircleGreen: { width: 34, height: 34, borderRadius: 24, backgroundColor: "#eaf8ef", justifyContent: "center", alignItems: "center" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 5, marginBottom: 10 },
  leftTop: { flex: 1, marginRight: 10, position: "relative" },
  shopTitle: { fontSize: 24, fontWeight: "800" },
  topRight: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", width: 180 },
safeTop: { 
  paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 15 : 40, 
  paddingHorizontal: 20 
},  modalBg: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center" },
  newModalBox: { width: "80%", backgroundColor: "#ffffff", borderRadius: 25, padding: 20, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 15, elevation: 15 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#111827", textAlign: "center", marginBottom: 15 },
  modalOption: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, marginBottom: 10, backgroundColor: "#f8fafc" },
  modalOptionText: { marginLeft: 10, fontSize: 16, fontWeight: "600", color: "#1e293b" },
  closeBtn: { marginTop: 10, backgroundColor: "#ef4444", paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  dropdownMenu: { position: "absolute", top: 60, right: 0, width: 170, borderRadius: 16, paddingVertical: 10, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, elevation: 10, zIndex: 999 },
  shopModeDropdown: { position: "absolute", top: 55, left: 0, width: 180, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 10, elevation: 10, zIndex: 1000 },
  activeModeItem: { backgroundColor: "rgba(99, 102, 241, 0.08)", borderRadius: 12 },
  dropdownItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 15, paddingVertical: 12 },
  dropdownText: { marginLeft: 10, fontSize: 15, fontWeight: "600" },
  journalBtn: { width: 55, height: 55, borderRadius: 18, backgroundColor: "#ffffff", justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 6, elevation: 4 },
  orderBtn: { width: 45, height: 45, borderRadius: 15, backgroundColor: "#6366f1", justifyContent: "center", alignItems: "center", marginRight: 12, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, elevation: 4 }
});