import React, { useState, useEffect, useRef } from "react";
import { auth, db } from "../utils/firebaseConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  StatusBar,
  useWindowDimensions,
  Platform,
  Alert,
  BackHandler,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { collection, onSnapshot, doc, getDoc, setDoc } from "firebase/firestore";
import { LineChart, Grid } from "react-native-svg-charts";
import SalesHistory from "./SalesHistory";
import PurchaseHistory from "./PurchaseHistory";
import InventoryScreen from "./InventoryScreen";
import { useFocusEffect } from "@react-navigation/native";
import { getSession } from "../utils/session";
import { useTheme } from "../theme/ThemeContext";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import NetInfo from "@react-native-community/netinfo";

export default function Dashboard({ navigation }) {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;
  const insets = useSafeAreaInsets();

  // Dynamic Responsive Insets & Paddings for iOS (Dynamic Island / Notch / Home Bar) & Android
  const topInset = Platform.OS === "ios"
    ? (insets.top > 0 ? insets.top + 6 : 50)
    : (StatusBar.currentHeight || insets.top || 24) + 10;

  const bottomInset = Platform.OS === "ios"
    ? (insets.bottom > 0 ? insets.bottom + 6 : 20)
    : 16;

  const horizPad = isTablet ? 24 : 16;

  const [image, setImage] = useState(null);
  const [sales, setSales] = useState([]);
  const [expiredProducts, setExpiredProducts] = useState([]);
  const [showScanOptions, setShowScanOptions] = useState(false);
  const [profitView, setProfitView] = useState("total");
  const [page, setPage] = useState(0);

  // Subscription & Plan States (Default to Basic / Active)
  const [userPlan, setUserPlan] = useState("Basic");
  const [planColor, setPlanColor] = useState("#6366F1");
  const [subscriptionStatus, setSubscriptionStatus] = useState("active");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [hasChosenPlan, setHasChosenPlan] = useState(true);

  const pagerRef = useRef(null);
  const isActive = (index) => page === index;
  const [shopName, setShopName] = useState("");
  const [userUid, setUserUid] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showShopModeMenu, setShowShopModeMenu] = useState(false);
  const [shopLogo, setShopLogo] = useState(null);
  const [isGlobalMode, setIsGlobalMode] = useState(false);
  const [userRole, setUserRole] = useState("master");

  const [isOffline, setIsOffline] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);

  const modeAccent = isGlobalMode ? "#10b981" : "#6366f1";
  const modeLightBg = isGlobalMode ? "#ecfdf5" : "#eef2ff";

  const checkConnection = async () => {
    setIsChecking(true);
    try {
      const state = await NetInfo.fetch();
      const offline = state.isConnected === false || state.isInternetReachable === false;
      setIsOffline(offline);
      if (!offline && userUid) {
        loadUserAndLogo(userUid, isGlobalMode);
      }
    } catch (e) {
      setIsOffline(true);
    } finally {
      setTimeout(() => setIsChecking(false), 500);
    }
  };

  useEffect(() => {
    checkConnection();
    const unsub = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      setIsOffline(offline);
    });
    return () => unsub();
  }, [userUid, isGlobalMode]);

  useEffect(() => {
    loadSession();
  }, []);

  const loadSession = async () => {
    try {
      const session = await getSession();
      if (session?.uid) {
        setUserUid(session.uid);
        setUserRole(session.role || "master");
        checkUserSubscription(session.uid);
      }
    } catch (e) {
      console.log("Session load error:", e);
    }
  };

  // Check User Subscription & Assign Default Basic Plan if none exists
  const checkUserSubscription = async (uid) => {
    try {
      const userRef = doc(db, "users", uid);
      const snap = await getDoc(userRef);

      const now = new Date();
      if (snap.exists()) {
        const data = snap.data();
        const plan = data.userPlan || data.plan || "Basic";
        const expiry = data.subscriptionExpiry ? new Date(data.subscriptionExpiry) : null;

        setHasChosenPlan(true);

        if (plan === "Basic") {
          setUserPlan("Basic");
          setSubscriptionStatus("active");
          setPlanColor("#6366F1");
        } else {
          if (expiry && now > expiry) {
            setUserPlan("Expired");
            setSubscriptionStatus("expired");
            setPlanColor("#EF4444");
            setShowUpgradeModal(true);
          } else {
            setUserPlan(plan);
            setSubscriptionStatus("active");
            if (plan.toLowerCase().includes("basic")) setPlanColor("#2563EB");
            else if (plan.toLowerCase().includes("premium")) setPlanColor("#16A34A");
            else if (plan.toLowerCase().includes("pro")) setPlanColor("#D97706");
            else setPlanColor("#10B981");
          }
        }
      } else {
        // Fallback default for new users
        setUserPlan("Basic");
        setSubscriptionStatus("active");
        setPlanColor("#6366F1");
        setHasChosenPlan(true);
      }
    } catch (e) {
      console.log("Subscription check error:", e);
    }
  };

  const handleRestrictedClick = () => {
    if (subscriptionStatus === "expired") {
      setShowUpgradeModal(true);
    }
  };

  const loadUserAndLogo = async (uid, modeIsGlobal) => {
    const modeStr = modeIsGlobal ? "global" : "local";
    try {
      const userDocRef = doc(db, "users", uid);
      const snapDoc = await getDoc(userDocRef);
      if (snapDoc && snapDoc.exists()) {
        const data = snapDoc.data();
        setShopName(data[`${modeStr}_shopName`] || data.shopName || (modeIsGlobal ? "Global Shop" : "Local Shop"));
        setShopLogo(data[`${modeStr}_shopLogo`] || data.shopLogo || null);
        setImage(data[`${modeStr}_profileImage`] || data.profileImage || null);
      }
    } catch (err) {
      console.log("Firestore user fetch handled offline:", err);
    }

    try {
      const logo =
        (await AsyncStorage.getItem(`${modeStr}_shopLogo_${uid}`)) ||
        (await AsyncStorage.getItem(`shop_qr_code_${uid}`));
      if (logo) setShopLogo(logo);
      const profileImg = await AsyncStorage.getItem(`${modeStr}_profileImage_${uid}`);
      if (profileImg) setImage(profileImg);
    } catch (e) {
      console.log("Storage load error:", e);
    }
  };

  const checkModeAndLoad = async () => {
    if (!userUid) return;
    try {
      const savedMode = await AsyncStorage.getItem("app_mode");
      const modeBool = savedMode === "global";
      setIsGlobalMode(modeBool);
      await loadUserAndLogo(userUid, modeBool);
    } catch (e) {
      console.log("Mode error:", e);
    }
  };

  useEffect(() => {
    if (userUid) {
      checkModeAndLoad();
    }
  }, [userUid]);

  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        setShowExitModal(true);
        return true;
      };
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [])
  );

  const handleExitApp = () => {
    setShowExitModal(false);
    BackHandler.exitApp();
  };

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
    const unsubSales = onSnapshot(
      collection(db, "users", userUid, "sales"),
      (snap) => {
        setSales(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (error) => {
        console.log("Sales listener handled offline");
      }
    );
    const unsubExpired = onSnapshot(
      collection(db, "users", userUid, "expired_products"),
      (snap) => {
        setExpiredProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (error) => {
        console.log("Expired products listener handled offline");
      }
    );
    return () => {
      unsubSales();
      unsubExpired();
    };
  }, [userUid]);

  const { darkMode, theme } = useTheme();

  const goToPage = (index) => {
    if (subscriptionStatus === "expired" && index > 0) {
      setShowUpgradeModal(true);
      return;
    }
    pagerRef.current?.scrollTo({ x: width * index, animated: true });
    setPage(index);
  };

  const today = new Date();
  const getDate = (ts) => {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    return new Date(ts);
  };

  const currentSalesData = sales.filter((s) => {
    const itemModeIsGlobal = s.isGlobalMode === true || s.appMode === "global" || s.isGlobalMode === "global";
    return isGlobalMode ? itemModeIsGlobal : !itemModeIsGlobal;
  });

  const currentExpiredData = expiredProducts.filter((e) => {
    const isGlobal = e.inventoryMode === "global" || e.appMode === "global" || e.isGlobalMode === true || e.isGlobalMode === "global";
    return isGlobalMode ? isGlobal : !isGlobal;
  });

  // Gross Sales Revenue (Not affected by expired products loss)
  const totalSales = currentSalesData.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
  const todaySales = currentSalesData
    .filter((s) => {
      const d = getDate(s.createdAt);
      return d && d.toDateString() === today.toDateString();
    })
    .reduce((sum, s) => sum + (Number(s.total) || 0), 0);

  const monthSales = currentSalesData
    .filter((s) => {
      const d = getDate(s.createdAt);
      return d && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    })
    .reduce((sum, s) => sum + (Number(s.total) || 0), 0);

  // Expired Stock Loss (Purchase Price * Expired Qty)
  const totalExpiredLoss = currentExpiredData.reduce((sum, e) => sum + (Number(e.totalLoss) || 0), 0);

  const todayExpiredLoss = currentExpiredData
    .filter((e) => {
      const d = getDate(e.createdAt);
      return d && d.toDateString() === today.toDateString();
    })
    .reduce((sum, e) => sum + (Number(e.totalLoss) || 0), 0);

  const monthExpiredLoss = currentExpiredData
    .filter((e) => {
      const d = getDate(e.createdAt);
      return d && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    })
    .reduce((sum, e) => sum + (Number(e.totalLoss) || 0), 0);

  // Net Profits (Gross Sales Profit - Expired Stock Losses)
  const grossTotalProfit = currentSalesData.reduce((sum, s) => sum + (Number(s.profit) || Number(s.total) * 0.2 || 0), 0);
  const totalProfit = Math.round((grossTotalProfit - totalExpiredLoss) * 100) / 100;

  const grossTodayProfit = currentSalesData
    .filter((s) => {
      const d = getDate(s.createdAt);
      return d && d.toDateString() === today.toDateString();
    })
    .reduce((sum, s) => sum + (Number(s.profit) || Number(s.total) * 0.2 || 0), 0);
  const todayProfit = Math.round((grossTodayProfit - todayExpiredLoss) * 100) / 100;

  const grossMonthProfit = currentSalesData
    .filter((s) => {
      const d = getDate(s.createdAt);
      return d && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    })
    .reduce((sum, s) => sum + (Number(s.profit) || Number(s.total) * 0.2 || 0), 0);
  const monthProfit = Math.round((grossMonthProfit - monthExpiredLoss) * 100) / 100;

  const displayProfit = profitView === "month" ? monthProfit : totalProfit;

  // Running Profit Chart combining sales profit (+) and expired stock losses (-)
  const allProfitEvents = [
    ...currentSalesData.map((s) => ({
      amount: Number(s.profit) || Number(s.total) * 0.2 || 0,
      createdAt: getDate(s.createdAt),
    })),
    ...currentExpiredData.map((e) => ({
      amount: -(Number(e.totalLoss) || 0),
      createdAt: getDate(e.createdAt),
    })),
  ].sort((a, b) => {
    const timeA = a.createdAt ? a.createdAt.getTime() : 0;
    const timeB = b.createdAt ? b.createdAt.getTime() : 0;
    return timeA - timeB;
  });

  let runningChart = 0;
  const totalChartData = allProfitEvents.map((evt) => {
    runningChart += evt.amount;
    return isNaN(runningChart) ? 0 : runningChart;
  });

  let monthRunning = 0;
  const monthChartData = allProfitEvents
    .filter((evt) => {
      const d = evt.createdAt;
      return d && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    })
    .map((evt) => {
      monthRunning += evt.amount;
      return isNaN(monthRunning) ? 0 : monthRunning;
    });

  const rawChartData = profitView === "month" ? monthChartData : totalChartData;
  const validChartData = rawChartData.filter((v) => !isNaN(v));
  const chartData =
    validChartData.length === 0 || validChartData.every((val) => val === 0)
      ? [0, 0]
      : validChartData.length === 1
      ? [0, validChartData[0]]
      : validChartData;

  const maxValue = Math.max(...chartData);
  let topAxis =
    maxValue <= 1000
      ? 1000
      : maxValue <= 3000
      ? 3000
      : maxValue <= 5000
      ? 5000
      : maxValue <= 6000
      ? 6000
      : maxValue <= 8000
      ? 8000
      : maxValue <= 10000
      ? 10000
      : Math.ceil(maxValue / 5000) * 5000;
  const yAxisLabels = [topAxis, Math.round(topAxis * 0.75), Math.round(topAxis * 0.5), Math.round(topAxis * 0.25), 0];

  const isLocked = subscriptionStatus === "expired" && userRole === "employee";

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        backgroundColor={isOffline ? "#111827" : theme.background}
        barStyle={isOffline || darkMode ? "light-content" : "dark-content"}
        translucent={Platform.OS === "android"}
      />

      {isOffline && (
        <View style={styles.offlineFullScreen}>
          <View style={styles.offlineCard}>
            <View style={styles.offlineIconWrapper}>
              <Icon name="cloud-off-outline" size={72} color="#f97316" />
              <View style={styles.offlineSmallBadge}>
                <Icon name="wifi-off" size={22} color="#fff" />
              </View>
            </View>
            <Text style={styles.offlineHeading}>Looks like there’s a problem with your internet connection</Text>
            <Text style={styles.offlineSubHeading}>The application cannot connect to the server.</Text>
            <View style={styles.offlineTipBox}>
              <Text style={styles.offlineTipTitle}>What can you do about it?</Text>
              <Text style={styles.offlineTipText}>• Check your Wi-Fi router or mobile data.</Text>
              <Text style={styles.offlineTipText}>• Disconnect and reconnect to your network.</Text>
              <Text style={styles.offlineTipText}>• Verify airplane mode is disabled.</Text>
            </View>
            <Text style={styles.offlineErrorCode}>Error Code: ERR_INTERNET_DISCONNECTED</Text>
            <TouchableOpacity
              style={[styles.tryAgainBtn, isChecking && { opacity: 0.6 }]}
              onPress={checkConnection}
              disabled={isChecking}
              activeOpacity={0.8}
            >
              <Icon name={isChecking ? "loading" : "reload"} size={20} color="#032b30" style={{ marginRight: 8 }} />
              <Text style={styles.tryAgainText}>{isChecking ? "Checking..." : "Try Again"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* HEADER / TOP BAR WITH RESPONSIVE SAFE AREA */}
      <View
        style={[
          styles.safeTop,
          {
            backgroundColor: theme.background,
            paddingTop: topInset,
            paddingHorizontal: horizPad,
          },
        ]}
      >
        <View style={styles.topBar}>
          <View style={styles.leftTop}>
            <TouchableOpacity
              onPress={() => {
                setShowShopModeMenu(!showShopModeMenu);
                setShowProfileMenu(false);
              }}
              activeOpacity={0.7}
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              {shopLogo ? (
                <Image source={{ uri: shopLogo }} style={styles.storeLogo} />
              ) : (
                <View
                  style={[
                    styles.storeIconBox,
                    { backgroundColor: modeAccent },
                  ]}
                >
                  <Icon name="store" size={26} color="#fff" />
                </View>
              )}
              <View style={{ flexShrink: 1, justifyContent: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={[
                      styles.shopTitle,
                      {
                        color: theme.text,
                        maxWidth: isTablet ? 360 : Math.max(140, width - 210),
                      },
                    ]}
                  >
                    {shopName || (isGlobalMode ? "Global Shop" : "Local Shop")}
                  </Text>
                  <Icon name="chevron-down" size={18} color={theme.text} style={{ marginLeft: 3 }} />
                </View>
                <View
                  style={[
                    styles.modeBadge,
                    { backgroundColor: modeAccent },
                  ]}
                >
                  <Text style={styles.modeBadgeText}>
                    {isGlobalMode ? "GLOBAL SHOP" : "LOCAL SHOP"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {showShopModeMenu && (
              <View style={[styles.shopModeDropdown, { backgroundColor: theme.card }]}>
                <TouchableOpacity
                  style={[styles.dropdownItem, isGlobalMode === false && styles.activeModeItem]}
                  onPress={() => selectAppMode("local")}
                >
                  <Icon name="storefront-outline" size={20} color={isGlobalMode === false ? "#6366f1" : theme.text} />
                  <Text
                    style={[
                      styles.dropdownText,
                      {
                        color: isGlobalMode === false ? "#6366f1" : theme.text,
                        fontWeight: isGlobalMode === false ? "700" : "600",
                      },
                    ]}
                  >
                    Local Shop
                  </Text>
                  {!isGlobalMode && <Icon name="check" size={16} color="#6366f1" style={{ marginLeft: "auto" }} />}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.dropdownItem, isGlobalMode === true && styles.activeModeItem]}
                  onPress={() => selectAppMode("global")}
                >
                  <Icon name="earth" size={20} color={isGlobalMode ? "#10b981" : theme.text} />
                  <Text
                    style={[
                      styles.dropdownText,
                      {
                        color: isGlobalMode ? "#10b981" : theme.text,
                        fontWeight: isGlobalMode === true ? "700" : "600",
                      },
                    ]}
                  >
                    Global Shop
                  </Text>
                  {isGlobalMode && <Icon name="check" size={16} color="#10b981" style={{ marginLeft: "auto" }} />}
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.topRight}>
            <TouchableOpacity
              style={[styles.orderBtn, { backgroundColor: modeAccent }]}
              onPress={() => navigation.navigate("Orders", { appMode: isGlobalMode ? "global" : "local" })}
              activeOpacity={0.8}
            >
              <Icon name="clipboard-list-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setShowProfileMenu(!showProfileMenu);
                setShowShopModeMenu(false);
              }}
              activeOpacity={0.8}
            >
              {image ? (
                <Image source={{ uri: image }} style={styles.profile} />
              ) : (
                <View style={[styles.profilePlaceholder, { backgroundColor: modeAccent }]}>
                  <Icon name="account" size={24} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          </View>

          {showProfileMenu && (
            <View style={[styles.dropdownMenu, { backgroundColor: theme.card }]}>
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setShowProfileMenu(false);
                  navigation.navigate("Profile");
                }}
              >
                <Icon name="account-circle" size={20} color={theme.text} />
                <Text style={[styles.dropdownText, { color: theme.text }]}>Profile</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setShowProfileMenu(false);
                  navigation.navigate("StaffCreation");
                }}
              >
                <Icon name="account-plus-outline" size={20} color={theme.text} />
                <Text style={[styles.dropdownText, { color: theme.text }]}>Staff Creation</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setShowProfileMenu(false);
                  navigation.navigate("Settings");
                }}
              >
                <Icon name="cog-outline" size={20} color={theme.text} />
                <Text style={[styles.dropdownText, { color: theme.text }]}>Settings</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.dropdownItem,
                  {
                    backgroundColor: planColor,
                    borderRadius: 12,
                    marginHorizontal: 8,
                    marginTop: 6,
                    paddingVertical: 12,
                    elevation: 5,
                    justifyContent: "center",
                  },
                ]}
                onPress={() => {
                  setShowProfileMenu(false);
                  navigation.navigate("Subscription");
                }}
              >
                <Icon name="diamond-stone" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={[styles.dropdownText, { color: "#FFFFFF", fontWeight: "700" }]}>
                  {userPlan}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

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
          if (subscriptionStatus === "expired" && pageIndex > 0) {
            setShowUpgradeModal(true);
            return;
          }
          setPage(pageIndex);
        }}
      >
        {/* PAGE 0 - DASHBOARD */}
        <View style={{ width }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: Platform.OS === "ios" ? bottomInset + 90 : 100,
              paddingHorizontal: horizPad,
            }}
          >
            {/* 1. TOTAL SALES CARD */}
            <TouchableOpacity activeOpacity={0.9} onPress={handleRestrictedClick}>
              <View style={[styles.balanceCard, { backgroundColor: modeAccent, shadowColor: modeAccent }]}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.balanceText}>{isGlobalMode ? "Global Delivered Sales" : "Total Sales"}</Text>
                  <Text
                    style={styles.balanceAmount}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.75}
                  >
                    {isLocked ? "🔒 Locked" : `₹ ${totalSales.toFixed(2)}`}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.journalBtn}
                  onPress={() => {
                    if (isLocked) {
                      setShowUpgradeModal(true);
                      return;
                    }
                    navigation.navigate("JournalEntry");
                  }}
                  activeOpacity={0.8}
                >
                  <Icon name="book-outline" size={24} color={modeAccent} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>

            {/* 2. TOTAL PROFIT & LINE CHART CARD */}
            <TouchableOpacity activeOpacity={0.95} onPress={handleRestrictedClick} style={styles.growthCardWrapper}>
              <View style={styles.growthCard}>
                <View style={styles.growthTopRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.growthTitle}>{isGlobalMode ? "Global Profit" : "Total Profit"}</Text>
                    <Text
                      style={styles.growthAmount}
                      numberOfLines={1}
                      adjustsFontSizeToFit={true}
                      minimumFontScale={0.75}
                    >
                      {isLocked ? "🔒 Locked" : `₹ ${displayProfit.toFixed(2)}`}
                    </Text>
                    <View style={styles.percentBadge}>
                      <Text style={styles.growthPercent}>↑ +18.6%</Text>
                    </View>
                    <Text style={styles.lastMonthText}>vs last month</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.monthChip}
                    onPress={() => {
                      if (isLocked) {
                        setShowUpgradeModal(true);
                        return;
                      }
                      setProfitView(profitView === "total" ? "month" : "total");
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>
                      {profitView === "month" ? "This Month" : "Total Profit"}
                    </Text>
                    <Icon name="chevron-down" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>

                <View style={{ marginTop: 20, position: "relative" }}>
                  <LineChart
                    style={{ height: isTablet ? 260 : 210, width: "100%" }}
                    data={isLocked ? [0, 0] : chartData}
                    svg={{ stroke: "#78ff9a", strokeWidth: 2.5 }}
                    contentInset={{ top: 16, bottom: 20, left: 10, right: 48 }}
                  >
                    <Grid svg={{ stroke: "rgba(255,255,255,.08)", strokeDasharray: [3, 4] }} />
                  </LineChart>
                  <View style={styles.yAxisContainer}>
                    {yAxisLabels.map((v, i) => (
                      <Text key={i} style={styles.axisText}>
                        {v >= 1000 ? (v / 1000).toFixed(0) + "K" : v}
                      </Text>
                    ))}
                  </View>
                </View>
              </View>
            </TouchableOpacity>

            {/* 3. 4 STAT CARDS */}
            <View style={[styles.statsGrid, isTablet && styles.tabletStatsGrid]}>
              <TouchableOpacity
                style={[styles.statCard, isTablet && styles.tabletStatCard, { backgroundColor: theme.card }]}
                onPress={handleRestrictedClick}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1, marginRight: 6 }}>
                  <Text style={styles.statTitle}>Today Sales</Text>
                  <Text
                    style={[styles.amount, { color: modeAccent }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.8}
                  >
                    {isLocked ? "🔒 Locked" : `₹ ${todaySales.toFixed(2)}`}
                  </Text>
                </View>
                <View style={[styles.iconCircleMode, { backgroundColor: modeLightBg }]}>
                  <Icon name="shopping-outline" size={18} color={modeAccent} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statCard, isTablet && styles.tabletStatCard, { backgroundColor: theme.card }]}
                onPress={handleRestrictedClick}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1, marginRight: 6 }}>
                  <Text style={styles.statTitle}>Month Sales</Text>
                  <Text
                    style={[styles.amount, { color: modeAccent }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.8}
                  >
                    {isLocked ? "🔒 Locked" : `₹ ${monthSales.toFixed(2)}`}
                  </Text>
                </View>
                <View style={[styles.iconCircleMode, { backgroundColor: modeLightBg }]}>
                  <Icon name="calendar-month-outline" size={18} color={modeAccent} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statCard, isTablet && styles.tabletStatCard, { backgroundColor: theme.card }]}
                onPress={handleRestrictedClick}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1, marginRight: 6 }}>
                  <Text style={styles.statTitle}>Today Profit</Text>
                  <Text
                    style={styles.amountGreen}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.8}
                  >
                    {isLocked ? "🔒 Locked" : `₹ ${todayProfit.toFixed(2)}`}
                  </Text>
                </View>
                <View style={styles.iconCircleGreen}>
                  <Icon name="trending-up" size={18} color="#16a34a" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statCard, isTablet && styles.tabletStatCard, { backgroundColor: theme.card }]}
                onPress={handleRestrictedClick}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1, marginRight: 6 }}>
                  <Text style={styles.statTitle}>Month Profit</Text>
                  <Text
                    style={styles.amountGreen}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.8}
                  >
                    {isLocked ? "🔒 Locked" : `₹ ${monthProfit.toFixed(2)}`}
                  </Text>
                </View>
                <View style={styles.iconCircleGreen}>
                  <Icon name="cash-multiple" size={18} color="#16a34a" />
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* PAGE 1 - SALES HISTORY */}
        <View style={{ width }}>
          <SalesHistory appMode={isGlobalMode ? "global" : "local"} />
        </View>

        {/* PAGE 2 - PURCHASE HISTORY */}
        <View style={{ width }}>
          <PurchaseHistory appMode={isGlobalMode ? "global" : "local"} />
        </View>

        {/* PAGE 3 - INVENTORY & SCAN */}
        <View style={{ width }}>
          <InventoryScreen appMode={isGlobalMode ? "global" : "local"} />
        </View>
      </ScrollView>

      {/* EXIT MODAL */}
      <Modal visible={showExitModal} transparent={true} animationType="fade" onRequestClose={() => setShowExitModal(false)}>
        <View style={styles.exitModalBackdrop}>
          <View style={[styles.exitModalContainer, { backgroundColor: theme.card || "#1e293b" }]}>
            <View style={styles.exitIconCircle}>
              <Icon name="power" size={32} color="#ef4444" />
            </View>
            <Text style={[styles.exitTitle, { color: theme.text || "#ffffff" }]}>Exit Application?</Text>
            <Text style={styles.exitDescription}>
              Are you sure you want to close the app? Any unsaved active forms or inputs may be lost.
            </Text>
            <View style={styles.exitBtnRow}>
              <TouchableOpacity
                style={[styles.exitCancelBtn, { borderColor: theme.border || "rgba(255,255,255,0.12)" }]}
                activeOpacity={0.7}
                onPress={() => setShowExitModal(false)}
              >
                <Text style={[styles.exitCancelText, { color: theme.text || "#94a3b8" }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.exitConfirmBtn} activeOpacity={0.8} onPress={handleExitApp}>
                <Icon name="logout-variant" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.exitConfirmText}>Exit Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* SCAN OPTIONS MODAL */}
      {showScanOptions && (
        <View style={styles.modalBg}>
          <View style={styles.newModalBox}>
            <Text style={styles.modalTitle}>Choose Scan Type</Text>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => {
                setShowScanOptions(false);
                navigation.navigate("Sales");
              }}
              activeOpacity={0.8}
            >
              <Icon name="cash" size={22} color="#16a34a" />
              <Text style={styles.modalOptionText}>Sales Scan</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => {
                setShowScanOptions(false);
                navigation.navigate("Scan");
              }}
              activeOpacity={0.8}
            >
              <Icon name="cube-scan" size={22} color={modeAccent} />
              <Text style={styles.modalOptionText}>Purchase Scan</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowScanOptions(false)} activeOpacity={0.8}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 🧭 BOTTOM NAV */}
      <View style={[styles.bottomNavWrapper, { bottom: bottomInset }]} pointerEvents="box-none">
        <View
          style={[
            styles.bottomNav,
            {
              backgroundColor: theme.card,
              width: isTablet ? Math.min(560, width - 48) : width - horizPad * 2,
            },
          ]}
        >
          <TouchableOpacity onPress={() => goToPage(0)} style={styles.navItem} activeOpacity={0.7}>
            <Icon name="home" size={24} color={isActive(0) ? modeAccent : "#94a3b8"} />
            <Text style={isActive(0) ? [styles.navText, { color: modeAccent }] : styles.navTextInactive}>Home</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => goToPage(1)} style={styles.navItem} activeOpacity={0.7}>
            <Icon name="chart-line" size={24} color={isActive(1) ? modeAccent : "#94a3b8"} />
            <Text style={isActive(1) ? [styles.navText, { color: modeAccent }] : styles.navTextInactive}>Sales</Text>
          </TouchableOpacity>

          <View style={styles.centerGap} />

          <TouchableOpacity onPress={() => goToPage(2)} style={styles.navItem} activeOpacity={0.7}>
            <Icon name="cube-outline" size={24} color={isActive(2) ? modeAccent : "#94a3b8"} />
            <Text style={isActive(2) ? [styles.navText, { color: modeAccent }] : styles.navTextInactive}>Purchase</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => goToPage(3)} style={styles.navItem} activeOpacity={0.7}>
            <Icon name="archive-outline" size={24} color={isActive(3) ? modeAccent : "#94a3b8"} />
            <Text style={isActive(3) ? [styles.navText, { color: modeAccent }] : styles.navTextInactive}>Inventory</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.scanBtn, { backgroundColor: modeAccent, shadowColor: modeAccent }]}
            onPress={() => {
              if (isLocked) {
                setShowUpgradeModal(true);
              } else {
                setShowScanOptions(true);
              }
            }}
            activeOpacity={0.85}
          >
            <Icon name="qrcode-scan" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // HEADER & TOP BAR
  safeTop: {
    paddingBottom: 8,
    zIndex: 1000,
    overflow: "visible",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 1000,
    position: "relative",
  },
  leftTop: {
    flex: 1,
    marginRight: 10,
    position: "relative",
    zIndex: 1001,
  },
  storeLogo: {
    width: 46,
    height: 46,
    borderRadius: 14,
    marginRight: 10,
  },
  storeIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  shopTitle: {
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  modeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    marginTop: 3,
    alignSelf: "flex-start",
  },
  modeBadgeText: {
    color: "#fff",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    zIndex: 1001,
  },
  orderBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  profile: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  profilePlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },

  // CARD 1: BALANCE
  balanceCard: {
    borderRadius: 24,
    marginTop: 10,
    paddingVertical: 22,
    paddingHorizontal: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 7,
  },
  balanceText: { color: "#ffffff", fontSize: 14.5, opacity: 0.92, fontWeight: "600" },
  balanceAmount: { color: "#ffffff", fontSize: 32, fontWeight: "800", marginTop: 6, letterSpacing: -0.5 },
  journalBtn: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },

  // CARD 2: GROWTH / LINE CHART
  growthCardWrapper: { marginTop: 16 },
  growthCard: {
    backgroundColor: "#021b46",
    borderRadius: 26,
    width: "100%",
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 7,
  },
  growthTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  monthChip: {
    backgroundColor: "#0d2c68",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  percentBadge: {
    marginTop: 10,
    backgroundColor: "#14532d",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  growthTitle: { color: "#fff", fontSize: 17, fontWeight: "600" },
  growthAmount: { color: "#78ff9a", fontSize: 32, fontWeight: "bold", marginTop: 6, letterSpacing: -0.5 },
  growthPercent: { color: "#78ff9a", fontWeight: "700", fontSize: 12.5 },
  lastMonthText: { color: "#94a3b8", marginTop: 6, fontSize: 12 },
  yAxisContainer: {
    position: "absolute",
    right: 4,
    top: 10,
    bottom: 14,
    width: 40,
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  axisText: { color: "#dbeafe", fontSize: 11.5, textAlign: "right" },

  // STATS GRID
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 16,
    rowGap: 12,
  },
  tabletStatsGrid: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 12,
  },
  statCard: {
    width: "48%",
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  tabletStatCard: {
    width: "auto",
    flex: 1,
  },
  statTitle: { color: "#64748b", fontSize: 13, marginBottom: 4, fontWeight: "500" },
  amount: { fontSize: 17, fontWeight: "bold", marginTop: 2 },
  amountGreen: { fontSize: 17, fontWeight: "bold", color: "#22c55e", marginTop: 2 },

  iconCircleMode: { width: 38, height: 38, borderRadius: 19, justifyContent: "center", alignItems: "center" },
  iconCircleGreen: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#eaf8ef", justifyContent: "center", alignItems: "center" },

  // BOTTOM FLOATING NAV
  bottomNavWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  bottomNav: {
    height: 70,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 10,
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  navText: { fontSize: 11, marginTop: 4, fontWeight: "700" },
  navTextInactive: { fontSize: 11, color: "#94a3b8", marginTop: 4 },
  centerGap: { width: 68 },

  scanBtn: {
    position: "absolute",
    top: -24,
    left: "50%",
    marginLeft: -30,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },

  // MODALS
  modalBg: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  newModalBox: {
    width: "85%",
    maxWidth: 380,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 15,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#111827", textAlign: "center", marginBottom: 16 },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginBottom: 12,
    backgroundColor: "#f8fafc",
  },
  modalOptionText: { marginLeft: 12, fontSize: 16, fontWeight: "600", color: "#1e293b" },
  closeBtn: { marginTop: 6, backgroundColor: "#ef4444", paddingVertical: 13, borderRadius: 14, alignItems: "center" },

  dropdownMenu: {
    position: "absolute",
    top: 54,
    right: 0,
    width: 190,
    borderRadius: 16,
    paddingVertical: 8,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: Platform.OS === "ios" ? StyleSheet.hairlineWidth : 0,
    borderColor: "rgba(0,0,0,0.08)",
  },
  shopModeDropdown: {
    position: "absolute",
    top: 54,
    left: 0,
    width: 180,
    borderRadius: 16,
    paddingVertical: 8,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: Platform.OS === "ios" ? StyleSheet.hairlineWidth : 0,
    borderColor: "rgba(0,0,0,0.08)",
  },
  activeModeItem: { backgroundColor: "rgba(99, 102, 241, 0.08)", borderRadius: 12 },
  dropdownItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12 },
  dropdownText: { marginLeft: 10, fontSize: 14, fontWeight: "600" },

  offlineFullScreen: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#181824",
    zIndex: 99999,
    elevation: 99999,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 25,
  },
  offlineCard: { width: "100%", maxWidth: 400, alignItems: "flex-start" },
  offlineIconWrapper: { marginBottom: 20, position: "relative" },
  offlineSmallBadge: { position: "absolute", bottom: -4, right: -6, backgroundColor: "#ef4444", borderRadius: 14, padding: 4 },
  offlineHeading: { fontSize: 22, fontWeight: "800", color: "#f8fafc", lineHeight: 30, marginBottom: 12 },
  offlineSubHeading: { fontSize: 14, color: "#94a3b8", marginBottom: 20 },
  offlineTipBox: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    width: "100%",
    marginBottom: 20,
  },
  offlineTipTitle: { fontSize: 14, fontWeight: "700", color: "#e2e8f0", marginBottom: 8 },
  offlineTipText: { fontSize: 13, color: "#94a3b8", lineHeight: 22 },
  offlineErrorCode: { fontFamily: Platform.OS === "android" ? "monospace" : "Menlo", color: "#64748b", marginBottom: 24, fontSize: 12 },
  tryAgainBtn: {
    backgroundColor: "#06b6d4",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  tryAgainText: { color: "#032b30", fontSize: 15, fontWeight: "800" },

  exitModalBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.72)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  exitModalContainer: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20,
  },
  exitIconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(239, 68, 68, 0.12)", justifyContent: "center", alignItems: "center", marginBottom: 14 },
  exitTitle: { fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  exitDescription: { fontSize: 14, color: "#94a3b8", textAlign: "center", lineHeight: 20, marginBottom: 22 },
  exitBtnRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 12 },
  exitCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.2, alignItems: "center", justifyContent: "center" },
  exitCancelText: { fontSize: 15, fontWeight: "700" },
  exitConfirmBtn: { flex: 1.2, flexDirection: "row", paddingVertical: 12, borderRadius: 12, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center" },
  exitConfirmText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
});