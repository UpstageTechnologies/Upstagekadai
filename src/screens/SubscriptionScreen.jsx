import React, { useContext, useEffect, useState, useRef } from "react";
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView, 
  Alert, 
  StatusBar, 
  LayoutAnimation, 
  Platform, 
  UIManager,
  ActivityIndicator 
} from "react-native";
import { auth, db } from "../utils/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import RazorpayCheckout from "react-native-razorpay";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { ThemeContext } from "../theme/ThemeContext";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getSession, saveSession } from "../utils/session";
import {
  createSubscriptionOrder,
  verifySubscriptionPayment,
} from "../services/subscriptionPaymentService";
import {
  PLAN_NAMES,
  PLAN_CONFIG,
  BILLING_CYCLES,
  normalizePlanName,
  calculateRemainingDays,
  isSubscriptionExpired,
  calculateNewExpiry,
  formatExpiryDate,
  getPlanLimits,
} from "../utils/subscriptionService";

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function SubscriptionScreen({ navigation }) {  
  const { theme } = useContext(ThemeContext);
  const insets = useSafeAreaInsets();
  
  const [currentPlan, setCurrentPlan] = useState("Basic");
  const [userSubscriptionCycle, setUserSubscriptionCycle] = useState("yearly");
  const [billingCycle, setBillingCycle] = useState("monthly"); // "monthly" or "yearly"
  const [subscriptionExpiry, setSubscriptionExpiry] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userData, setUserData] = useState(null);
  
  // State to control expansion of the active plan card details
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  
  // Loading & Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingPlanKey, setProcessingPlanKey] = useState(null);
  const isSubscribingRef = useRef(false);

  const fetchUserPlan = async () => {
    try {
      // 1. Resolve UID from Firebase Auth or local session
      let uid = auth.currentUser?.uid;
      if (!uid) {
        const session = await getSession();
        uid = session?.uid;
      }

      if (!uid) {
        console.log("No authenticated user or session found in SubscriptionScreen.");
        return;
      }

      setUserId(uid);

      // 2. Fetch User Document from Firestore
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = snap.data();
        setUserData(data);

        const plan = normalizePlanName(data.userPlan || data.subscriptionPlan || "Basic");
        const expiry = data.subscriptionExpiry ? Number(data.subscriptionExpiry) : null;
        const cycle = data.subscriptionCycle || (expiry && (expiry - Date.now() > 45 * 24 * 60 * 60 * 1000) ? "yearly" : "monthly");

        setCurrentPlan(plan);
        setSubscriptionExpiry(expiry);
        setUserSubscriptionCycle(cycle);

        // Pre-select toggle cycle to match user's paid plan
        if (plan !== PLAN_NAMES.BASIC && cycle) {
          setBillingCycle(cycle);
        }
      }
    } catch (err) {
      console.log("Error loading subscription in SubscriptionScreen:", err);
    }
  };

  useEffect(() => {
    fetchUserPlan();

    // Listen for auth state changes if auth was hydrating asynchronously
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.uid) {
        fetchUserPlan();
      }
    });

    return () => unsubscribe();
  }, []);

  // Calculate days left and expired status accurately using subscriptionService
  const isExpired = isSubscriptionExpired(subscriptionExpiry);
  const daysLeft = calculateRemainingDays(subscriptionExpiry);
  const formattedExpiryDate = formatExpiryDate(subscriptionExpiry);

  const plans = [
    {
      name: "Basic",
      price: "0",
      days: 365,
      color: PLAN_CONFIG[PLAN_NAMES.BASIC].color,
      cycle: "yearly",
      features: PLAN_CONFIG[PLAN_NAMES.BASIC].features,
      isPopular: false
    },
    {
      name: "Premium",
      price: "499",
      days: 30,
      color: PLAN_CONFIG[PLAN_NAMES.PREMIUM].color,
      cycle: "monthly",
      features: PLAN_CONFIG[PLAN_NAMES.PREMIUM].features,
      isPopular: true
    },
    {
      name: "Premium",
      price: "4999",
      days: 365,
      color: PLAN_CONFIG[PLAN_NAMES.PREMIUM].color,
      cycle: "yearly",
      features: PLAN_CONFIG[PLAN_NAMES.PREMIUM].features,
      isPopular: true
    },
    {
      name: "Pro",
      price: "1999",
      days: 30,
      color: PLAN_CONFIG[PLAN_NAMES.PRO].color,
      cycle: "monthly",
      features: PLAN_CONFIG[PLAN_NAMES.PRO].features,
      isPopular: false
    },
    {
      name: "Pro",
      price: "19999",
      days: 365,
      color: PLAN_CONFIG[PLAN_NAMES.PRO].color,
      cycle: "yearly",
      features: PLAN_CONFIG[PLAN_NAMES.PRO].features,
      isPopular: false
    }
  ];

  // Find user's active plan object based on their real plan & cycle (independent of toggle)
  const activePlanObj = plans.find(p => 
    p.name.toLowerCase() === currentPlan.toLowerCase() && 
    (p.name === "Basic" || p.cycle === userSubscriptionCycle)
  ) || plans.find(p => p.name.toLowerCase() === currentPlan.toLowerCase()) || plans[0];

  // Filter plans based on the selected billing cycle, keeping Basic always visible
  const filteredPlans = plans.filter(p => p.name === "Basic" || p.cycle === billingCycle);

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsDetailsExpanded(!isDetailsExpanded);
  };

  const subscribe = async (plan) => {
    if (isSubscribingRef.current || isProcessing) {
      return;
    }
    isSubscribingRef.current = true;

    // 1. Resolve user ID
    let uid = userId || auth.currentUser?.uid;
    if (!uid) {
      const session = await getSession();
      uid = session?.uid;
    }

    if (!uid) {
      isSubscribingRef.current = false;
      Alert.alert("Authentication Required", "Please sign in again to activate your subscription.");
      navigation.navigate("Login");
      return;
    }

    // 2. Prevent duplicate payment if already actively on this exact plan
    const isMatchingPlan = 
      plan.name.toLowerCase() === currentPlan.toLowerCase() && 
      (plan.name === "Basic" || plan.cycle === userSubscriptionCycle);

    if (isMatchingPlan && !isExpired) {
      isSubscribingRef.current = false;
      Alert.alert("Active Plan Notice", `You are already on the active ${currentPlan} (${plan.cycle}) plan.`);
      return;
    }

    const planKey = `${plan.name}-${plan.cycle}`;
    setProcessingPlanKey(planKey);
    setIsProcessing(true);

    // 3. Handle Free Basic Plan
    if (plan.name === "Basic") {
      try {
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        let assignedUid = userSnap.data()?.customShopUid || uid;
        
        if (!assignedUid) {
          assignedUid = `UID-${Math.floor(100000 + Math.random() * 900000)}`;
        }

        const newExpiry = calculateNewExpiry(365, subscriptionExpiry);
        const limits = getPlanLimits("Basic");

        await updateDoc(userRef, {
          userPlan: "Basic",
          subscriptionPlan: "Basic",
          subscriptionCycle: "yearly",
          subscriptionDays: 365,
          subscriptionActive: true,
          subscriptionExpiry: newExpiry,
          customShopUid: assignedUid,
          inventoryLimit: limits.inventoryLimit,
          purchaseLimit: limits.purchaseLimit,
          reportLimitMonths: limits.reportLimitMonths,
          lastUpdated: Date.now(),
        });

        // Synchronize local session
        const existingSession = await getSession();
        if (existingSession) {
          await saveSession({
            ...existingSession,
            route: "Dashboard",
            userPlan: "Basic",
            subscriptionPlan: "Basic",
            subscriptionActive: true,
            subscriptionExpiry: newExpiry,
          });
        }

        Alert.alert("Success ✅", "Switched to Basic Plan Successfully!");
        setCurrentPlan("Basic");
        setUserSubscriptionCycle("yearly");
        setSubscriptionExpiry(newExpiry);
        navigation.replace("Dashboard");
      } catch (error) {
        console.log("Basic plan switch error:", error);
        Alert.alert("Error", "Could not switch to Basic plan. Please try again.");
      } finally {
        setIsProcessing(false);
        setProcessingPlanKey(null);
        isSubscribingRef.current = false;
      }
      return;
    }

    // 4. Handle Paid Plans (Premium & Pro) via Razorpay Server-Side Architecture
    if (!RazorpayCheckout || typeof RazorpayCheckout.open !== "function") {
      Alert.alert("Payment Gateway Error", "Razorpay is currently unavailable on this device. Please try again.");
      setIsProcessing(false);
      setProcessingPlanKey(null);
      isSubscribingRef.current = false;
      return;
    }

    try {
      // Step 1: Request verified order creation from Firebase Cloud Function
      const orderResult = await createSubscriptionOrder({
        plan: plan.name,
        cycle: plan.cycle,
      });

      const { orderId, amount, currency, keyId } = orderResult;
      if (!orderId || !keyId) {
        throw new Error("Failed to initialize server-side payment order.");
      }

      const userEmail = auth.currentUser?.email || userData?.email || "";
      const userPhone = userData?.phone || userData?.mobile || auth.currentUser?.phoneNumber || "";
      const shopDisplayName = userData?.shopName || userData?.businessName || "UpstageKadai";

      // Step 2: Open Razorpay Checkout using the returned LIVE Key ID and order ID
      const options = {
        description: `${plan.name} (${plan.cycle === "yearly" ? "Yearly" : "Monthly"}) Subscription`,
        currency: currency || "INR",
        key: keyId,
        order_id: orderId,
        amount: amount || Math.round(Number(plan.price) * 100),
        name: shopDisplayName,
        prefill: {
          email: userEmail,
          contact: userPhone,
          name: userData?.ownerName || shopDisplayName,
        },
        theme: {
          color: plan.color,
        },
      };

      const checkoutData = await RazorpayCheckout.open(options);

      // Step 3: Receive payment ID and signature
      const paymentId = checkoutData?.razorpay_payment_id;
      const returnedOrderId = checkoutData?.razorpay_order_id || orderId;
      const signature = checkoutData?.razorpay_signature;

      if (!paymentId || !signature) {
        throw new Error("Payment gateway did not return valid verification details.");
      }

      // Step 4: Send details to backend for cryptographic HMAC-SHA256 signature verification & direct Razorpay API validation
      const verifyResult = await verifySubscriptionPayment({
        orderId: returnedOrderId,
        paymentId,
        signature,
      });

      if (!verifyResult || !verifyResult.success || verifyResult.status !== "ACTIVATED") {
        throw new Error("Server payment verification could not confirm activation.");
      }

      // Step 5: Refresh Firestore user subscription data
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      const freshUserData = userSnap.exists() ? userSnap.data() : {};
      const assignedUid = freshUserData.customShopUid || uid;
      const activeExpiry = freshUserData.subscriptionExpiry || verifyResult.expiry;

      // Step 6: Synchronize local AsyncStorage session
      const existingSession = await getSession();
      if (existingSession) {
        await saveSession({
          ...existingSession,
          route: "Dashboard",
          userPlan: plan.name,
          subscriptionPlan: plan.name,
          subscriptionActive: true,
          subscriptionExpiry: activeExpiry,
        });
      }

      // Step 7: Show verified payment success notice and navigate
      Alert.alert(
        "Payment Success ✅", 
        `${plan.name} (${plan.cycle === "yearly" ? "Yearly" : "Monthly"}) Activated Successfully!\nShop UID: ${assignedUid}`
      );

      setCurrentPlan(plan.name);
      setUserSubscriptionCycle(plan.cycle);
      setSubscriptionExpiry(activeExpiry);
      navigation.replace("Dashboard");
    } catch (error) {
      console.log("Razorpay Checkout Error:", error);

      // Check if user cancelled
      const isCancelled = 
        error?.code === 0 || 
        error?.code === "0" || 
        (typeof error?.description === "string" && error.description.toLowerCase().includes("cancel")) ||
        (typeof error?.message === "string" && error.message.toLowerCase().includes("cancel"));

      if (isCancelled) {
        Alert.alert("Payment Cancelled", "Payment checkout was cancelled.");
      } else {
        const errorMsg = error?.description || error?.message || "Transaction could not be completed. Please try again.";
        Alert.alert("Payment Failed ❌", errorMsg);
      }
    } finally {
      setIsProcessing(false);
      setProcessingPlanKey(null);
      isSubscribingRef.current = false;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <StatusBar barStyle={theme.darkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} translucent />
      
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
          <TouchableOpacity 
            onPress={() => {
              if (navigation.canGoBack()) navigation.goBack();
              else navigation.navigate("Dashboard");
            }}
            style={{ marginRight: 10, padding: 6, borderRadius: 20, backgroundColor: theme.darkMode ? "#1e293b" : "#f1f5f9" }}
            activeOpacity={0.7}
          >
            <Icon name="arrow-left" size={22} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text, marginBottom: 0 }]}>Choose Your Plan</Text>
        </View>
        <Text style={[styles.subtitle, { color: theme.subText || "#64748b" }]}>
          Upgrade your plan to unlock more inventory storage and extended reporting.
        </Text>
        
        {/* Active Plan Status Card (Clickable Collapsible Drawer) */}
        <TouchableOpacity 
          activeOpacity={0.8}
          onPress={toggleExpand}
          style={[styles.expiryCard, { backgroundColor: theme.card, borderColor: isExpired ? "#ef4444" : (theme.darkMode ? "#334155" : "#e2e8f0") }]}
        >
          <View style={styles.expiryTopRow}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Icon 
                name={isExpired ? "alert-circle" : "shield-check"} 
                size={18} 
                color={isExpired ? "#ef4444" : "#10b981"} 
                style={{ marginRight: 6 }} 
              />
              <Text style={[styles.expiryLabel, { color: theme.text }]}>Active Plan Status</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={[styles.expiryDaysText, isExpired && { color: "#ef4444" }]}>
                {isExpired ? "Expired" : `${daysLeft} days left`}
              </Text>
              <Icon name={isDetailsExpanded ? "chevron-up" : "chevron-down"} size={18} color={theme.text} style={{ marginLeft: 4 }} />
            </View>
          </View>

          {/* Always visible compact subtitle for expiry date */}
          <View style={styles.expiryDateSubRow}>
            <Text style={[styles.expiryDateSubText, { color: theme.subText || "#64748b" }]}>
              {isExpired ? "Expired on: " : "Expires on: "}
              <Text style={{ fontWeight: "700", color: isExpired ? "#ef4444" : theme.text }}>
                {formattedExpiryDate}
              </Text>
            </Text>
          </View>

          {/* Expandable Section */}
          {isDetailsExpanded && (
            <View>
              <View style={styles.expiryDivider} />
              <View style={styles.expiryBottomRow}>
                <View>
                  <Text style={[styles.expiryPlanName, { color: theme.text }]}>{currentPlan}</Text>
                  <Text style={[styles.expiryDurationText, { color: theme.subText || "#64748b" }]}>{activePlanObj.days} Days Access</Text>
                </View>
                <View style={styles.expiryPriceContainer}>
                  <Text style={styles.expiryCurrency}>₹</Text>
                  <Text style={styles.expiryPrice}>{Number(activePlanObj.price).toLocaleString("en-IN")}</Text>
                  <Text style={[styles.expiryCycleText, { color: theme.subText || "#64748b" }]}> / {activePlanObj.cycle === "yearly" ? "year" : "month"}</Text>
                </View>
              </View>
            </View>
          )}
        </TouchableOpacity>

        {/* Billing Toggle Switch */}
        <View style={[styles.toggleContainer, { backgroundColor: theme.card, borderColor: theme.darkMode ? "#334155" : "#e2e8f0" }]}>
          <TouchableOpacity 
            style={[styles.toggleBtn, billingCycle === "monthly" && styles.toggleBtnActive]} 
            onPress={() => setBillingCycle("monthly")}
            disabled={isProcessing}
          >
            <Text style={[styles.toggleText, billingCycle === "monthly" ? styles.toggleTextActive : { color: theme.text }]}>Monthly</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.toggleBtn, billingCycle === "yearly" && styles.toggleBtnActive]} 
            onPress={() => setBillingCycle("yearly")}
            disabled={isProcessing}
          >
            <Text style={[styles.toggleText, billingCycle === "yearly" ? styles.toggleTextActive : { color: theme.text }]}>Yearly</Text>
            <View style={styles.saveBadge}>
              <Text style={styles.saveBadgeText}>Save 17%</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContainer, { paddingBottom: 40 + insets.bottom }]}>
        {filteredPlans.map((plan) => {
          // Check if this plan is matching the user's current subscription
          const isMatchingPlan = 
            plan.name.toLowerCase() === currentPlan.toLowerCase() && 
            (plan.name === "Basic" || plan.cycle === userSubscriptionCycle);

          const isCurrentActivePlan = isMatchingPlan && !isExpired;
          const isCurrentExpiredPlan = isMatchingPlan && isExpired;
          const isThisPlanProcessing = processingPlanKey === `${plan.name}-${plan.cycle}`;

          return (
            <View 
              key={`${plan.name}-${plan.cycle}`} 
              style={[
                styles.card, 
                { backgroundColor: theme.card, borderColor: plan.isPopular ? plan.color : (theme.darkMode ? "#262626" : "#e2e8f0") }
              ]}
            >
              {isCurrentActivePlan && (
                <View style={styles.activePlanOverlayBadge}>
                  <Text style={styles.activePlanOverlayText}>CURRENT ACTIVE PLAN</Text>
                </View>
              )}

              {isCurrentExpiredPlan && (
                <View style={[styles.activePlanOverlayBadge, { backgroundColor: "#ef4444" }]}>
                  <Text style={styles.activePlanOverlayText}>EXPIRED PLAN</Text>
                </View>
              )}

              {plan.isPopular && !isCurrentActivePlan && !isCurrentExpiredPlan && (
                <View style={[styles.popularBadge, { backgroundColor: plan.color }]}>
                  <Text style={styles.popularText}>MOST POPULAR</Text>
                </View>
              )}

              <View style={styles.cardHeader}>
                <View>
                  <Text style={[styles.planName, { color: theme.text }]}>{plan.name}</Text>
                  <Text style={[styles.planDuration, { color: theme.subText || "#64748b" }]}>{plan.days} Days Access</Text>
                </View>
                <View style={[styles.iconContainer, { backgroundColor: plan.color + "1A" }]}>
                  <Icon name={plan.name === "Pro" ? "crown" : plan.name === "Premium" ? "diamond-stone" : "shield-check"} size={26} color={plan.color} />
                </View>
              </View>

              <View style={styles.priceContainer}>
                <Text style={[styles.currency, { color: plan.color }]}>₹</Text>
                <Text style={[styles.price, { color: theme.text }]}>{Number(plan.price).toLocaleString("en-IN")}</Text>
                <Text style={[styles.cycleText, { color: theme.subText || "#64748b" }]}> / {plan.cycle === "yearly" ? "year" : "month"}</Text>
              </View>

              <View style={[styles.divider, { backgroundColor: theme.darkMode ? "#334155" : "rgba(0,0,0,0.05)" }]} />

              <View style={styles.featuresContainer}>
                {plan.features.map((feature, idx) => (
                  <View key={idx} style={styles.featureRow}>
                    <Icon name="check-circle" size={18} color={plan.color} style={{ marginRight: 8 }} />
                    <Text style={[styles.featureText, { color: theme.text }]}>{feature}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity 
                style={[
                  styles.btn, 
                  { backgroundColor: plan.color },
                  isCurrentActivePlan && { backgroundColor: "#94a3b8" },
                  isProcessing && { opacity: 0.7 }
                ]} 
                disabled={isCurrentActivePlan || isProcessing}
                onPress={() => subscribe(plan)}
                activeOpacity={0.8}
              >
                {isThisPlanProcessing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Text style={styles.btnText}>
                      {isCurrentActivePlan 
                        ? "Current Plan Active" 
                        : isCurrentExpiredPlan 
                        ? `Renew (${plan.cycle === "yearly" ? "Yearly" : "Monthly"})`
                        : plan.name === "Basic" 
                        ? "Select Basic" 
                        : `Subscribe (${plan.cycle === "yearly" ? "Yearly" : "Monthly"})`}
                    </Text>
                    {!isCurrentActivePlan && <Icon name="arrow-right" size={18} color="#fff" style={{ marginLeft: 6 }} />}
                  </>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 10, alignItems: "center" },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 4, textAlign: "center", fontWeight: "500", paddingHorizontal: 10 },
  
  expiryCard: {
    width: "100%",
    maxWidth: 350,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  expiryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  expiryLabel: { fontSize: 13, fontWeight: "700" },
  expiryDaysText: { fontSize: 13, fontWeight: "800", color: "#f97316" },
  expiryDateSubRow: {
    marginTop: 4,
    paddingLeft: 24,
  },
  expiryDateSubText: {
    fontSize: 11.5,
    fontWeight: "500",
  },
  expiryDivider: { height: 1, backgroundColor: "rgba(0,0,0,0.06)", marginVertical: 10 },
  expiryBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  expiryPlanName: { fontSize: 18, fontWeight: "800" },
  expiryDurationText: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  expiryPriceContainer: { flexDirection: "row", alignItems: "baseline" },
  expiryCurrency: { fontSize: 14, fontWeight: "700", color: "#f97316", marginRight: 1 },
  expiryPrice: { fontSize: 20, fontWeight: "800", color: "#f97316" },
  expiryCycleText: { fontSize: 11, fontWeight: "500", marginLeft: 2 },

  toggleContainer: { flexDirection: "row", borderWidth: 1, borderRadius: 30, padding: 4, marginTop: 14, width: "100%", maxWidth: 350, justifyContent: "space-between" },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 24, flexDirection: "row", justifyContent: "center", position: "relative" },
  toggleBtnActive: { backgroundColor: "#6366f1", shadowColor: "#6366f1", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
  toggleText: { fontSize: 13, fontWeight: "600" },
  toggleTextActive: { color: "#fff", fontWeight: "700" },
  saveBadge: { position: "absolute", top: -8, right: 8, backgroundColor: "#10b981", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  saveBadgeText: { color: "#fff", fontSize: 8, fontWeight: "800" },
  scrollContainer: { padding: 20, paddingBottom: 40 },
  card: { borderRadius: 24, padding: 24, marginBottom: 20, borderWidth: 1.5, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, position: "relative", overflow: "hidden" },
  
  activePlanOverlayBadge: {
    position: "absolute",
    top: 20,
    right: -42,
    transform: [{ rotate: "45deg" }],
    backgroundColor: "#0ea5e9",
    paddingVertical: 5,
    width: 150,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 3,
  },
  activePlanOverlayText: { color: "#fff", fontSize: 6.5, fontWeight: "500", letterSpacing: 0.1 },

  popularBadge: { position: "absolute", top: 12, right: -35, transform: [{ rotate: "45deg" }], paddingVertical: 4, width: 130, alignItems: "center" },
  popularText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  planName: { fontSize: 22, fontWeight: "700" },
  planDuration: { fontSize: 12, marginTop: 2, fontWeight: "500" },
  iconContainer: { width: 48, height: 48, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  priceContainer: { flexDirection: "row", alignItems: "baseline", marginTop: 14 },
  currency: { fontSize: 22, fontWeight: "700", marginRight: 2 },
  price: { fontSize: 32, fontWeight: "800" },
  cycleText: { fontSize: 13, fontWeight: "500", marginLeft: 4 },
  divider: { height: 1, marginVertical: 16 },
  featuresContainer: { marginBottom: 6 },
  featureRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  featureText: { fontSize: 13.5, fontWeight: "500" },
  btn: { borderRadius: 14, paddingVertical: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", marginTop: 12, shadowOpacity: 0.15, shadowRadius: 4, elevation: 2 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});