import React, { useContext, useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, StatusBar, Animated, LayoutAnimation, Platform, UIManager } from "react-native";
import { auth, db } from "../utils/firebaseConfig";
import RazorpayCheckout from "react-native-razorpay";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { ThemeContext } from "../theme/ThemeContext";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function SubscriptionScreen({ navigation }) {  
  const { theme } = useContext(ThemeContext);
  const insets = useSafeAreaInsets();
  const [currentPlan, setCurrentPlan] = useState("Basic");
  const [billingCycle, setBillingCycle] = useState("monthly"); // "monthly" or "yearly"
  const [subscriptionExpiry, setSubscriptionExpiry] = useState(null);
  
  // State to control expansion of the active plan card details
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);

  useEffect(() => {
    const fetchUserPlan = async () => {
      if (auth.currentUser) {
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setCurrentPlan(data.userPlan || data.subscriptionPlan || "Basic");
          setSubscriptionExpiry(data.subscriptionExpiry || null);
        }
      }
    };
    fetchUserPlan();
  }, []);

  // Calculate days left for expiry accurately from timestamp
  const getDaysLeft = () => {
    if (!subscriptionExpiry) return 365;
    const diffTime = subscriptionExpiry - Date.now();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const daysLeft = getDaysLeft();

  // Format expiry date nicely (e.g., "10 Nov 2026")
  const getFormattedExpiryDate = () => {
    if (!subscriptionExpiry) return "N/A";
    const date = new Date(subscriptionExpiry);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  };

  const plans = [
    {
      name: "Basic",
      price: "0",
      days: 365,
      color: "#6366f1",
      cycle: "yearly",
      features: [
        "Unlimited Scans", 
        "Max 10 Purchases Only", 
        "Inventory Limit: Max 10 Items", 
        "Journal Reports: Last 1 Month Only"
      ],
      isPopular: false
    },
    {
      name: "Premium",
      price: "499",
      days: 30,
      color: "#10b981",
      cycle: "monthly",
      features: [
        "Unlimited Scans", 
        "Max 200 Purchases Only", 
        "Inventory Limit: Max 10 Items", 
        "Journal Reports: Last 1 Month Only"
      ],
      isPopular: true
    },
    {
      name: "Premium",
      price: "4999",
      days: 365,
      color: "#10b981",
      cycle: "yearly",
      features: [
        "Unlimited Scans", 
        "Max 200 Purchases Only", 
        "Inventory Limit: Max 10 Items", 
        "Journal Reports: Last 1 Month Only"
      ],
      isPopular: true
    },
    {
      name: "Pro",
      price: "1999",
      days: 30,
      color: "#f59e0b",
      cycle: "monthly",
      features: [
        "Unlimited Scans", 
        "Unlimited Purchases", 
        "Unlimited Inventory Storage", 
        "Unlimited Journal Reports"
      ],
      isPopular: false
    },
    {
      name: "Pro",
      price: "19999",
      days: 365,
      color: "#f59e0b",
      cycle: "yearly",
      features: [
        "Unlimited Scans", 
        "Unlimited Purchases", 
        "Unlimited Inventory Storage", 
        "Unlimited Journal Reports"
      ],
      isPopular: false
    }
  ];

  // Find active plan object to display its details in the status card
  const activePlanObj = plans.find(p => p.name.toLowerCase() === currentPlan.toLowerCase() && (p.cycle === billingCycle || p.name === "Basic")) || plans[0];

  // Filter plans based on the selected billing cycle, keeping Basic always visible
  const filteredPlans = plans.filter(p => p.name === "Basic" || p.cycle === billingCycle);

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsDetailsExpanded(!isDetailsExpanded);
  };

  const subscribe = async (plan) => {
    if (plan.name.toLowerCase() === currentPlan.toLowerCase() && plan.days === 365) {
      Alert.alert("Notice", `You are already on the ${currentPlan} plan.`);
      return;
    }

    if (plan.name === "Basic") {
      try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        const userSnap = await getDoc(userRef);
        let assignedUid = userSnap.data()?.customShopUid;
        
        if (!assignedUid) {
          assignedUid = `UID-${Math.floor(100000 + Math.random() * 900000)}`;
        }

        const newExpiry = Date.now() + (365 * 24 * 60 * 60 * 1000);
        await updateDoc(userRef, {
          userPlan: "Basic",
          subscriptionPlan: "Basic",
          subscriptionActive: true,
          subscriptionExpiry: newExpiry,
          customShopUid: assignedUid,
          inventoryLimit: 10,
          reportLimitMonths: 1
        });

        Alert.alert("Success ✅", "Switched to Basic Plan Successfully!");
        setCurrentPlan("Basic");
        setSubscriptionExpiry(newExpiry);
        navigation.replace("Dashboard");
      } catch (error) {
        console.log(error);
      }
      return;
    }

    const options = {
      description: `${plan.name} (${plan.cycle === "yearly" ? "Yearly" : "Monthly"}) Subscription`,
      image: "https://yourlogo.com/logo.png",
      currency: "INR",
      key: "rzp_test_RqckwEGqKZFqMk",
      amount: Number(plan.price) * 100,
      name: "SparrowMart",
      prefill: {
        email: auth.currentUser?.email || "",
      },
      theme: {
        color: plan.color,
      },
    };

    try {
      const data = await RazorpayCheckout.open(options);
      const testDurationMs = (plan.days === 365 ? 365 : 30) * 24 * 60 * 60 * 1000;
      const expiry = Date.now() + testDurationMs;      
      const userRef = doc(db, "users", auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      let assignedUid = userSnap.data()?.customShopUid;
      
      if (!assignedUid) {
        assignedUid = `UID-${Math.floor(100000 + Math.random() * 900000)}`;
      }

      const invLimit = plan.name === "Pro" ? -1 : 10;
      const repLimit = plan.name === "Pro" ? -1 : 1;

      await updateDoc(userRef, {
        userPlan: plan.name,
        subscriptionPlan: plan.name,
        subscriptionActive: true,
        subscriptionExpiry: expiry,
        customShopUid: assignedUid,
        razorpayPaymentId: data.razorpay_payment_id,
        inventoryLimit: invLimit,
        reportLimitMonths: repLimit
      });

      Alert.alert("Payment Success ✅", `${plan.name} (${plan.cycle}) Plan Activated Successfully! UID: ${assignedUid}`);
      setCurrentPlan(plan.name);
      setSubscriptionExpiry(expiry);
      navigation.replace("Dashboard");
    } catch (error) {
      Alert.alert("Payment Failed ❌", "Transaction could not be completed. Please try again.");
      console.log(error);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <StatusBar barStyle={theme.darkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} translucent />
      
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Choose Your Plan</Text>
        <Text style={[styles.subtitle, { color: theme.subText || "#64748b" }]}>
          Upgrade your plan to unlock more inventory storage and extended reporting.
        </Text>
        
        {/* Active Plan Status Card (Clickable Collapsible Drawer) */}
        <TouchableOpacity 
          activeOpacity={0.8}
          onPress={toggleExpand}
          style={[styles.expiryCard, { backgroundColor: theme.card, borderColor: theme.darkMode ? "#334155" : "#e2e8f0" }]}
        >
          <View style={styles.expiryTopRow}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Icon name="shield-check" size={18} color="#10b981" style={{ marginRight: 6 }} />
              <Text style={[styles.expiryLabel, { color: theme.text }]}>Active Plan Status</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={styles.expiryDaysText}>{daysLeft} days left</Text>
              <Icon name={isDetailsExpanded ? "chevron-up" : "chevron-down"} size={18} color={theme.text} style={{ marginLeft: 4 }} />
            </View>
          </View>

          {/* Always visible compact subtitle for expiry date */}
          <View style={styles.expiryDateSubRow}>
            <Text style={[styles.expiryDateSubText, { color: theme.subText || "#64748b" }]}>
              Expires on: <Text style={{ fontWeight: "700", color: theme.text }}>{getFormattedExpiryDate()}</Text>
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
          >
            <Text style={[styles.toggleText, billingCycle === "monthly" ? styles.toggleTextActive : { color: theme.text }]}>Monthly</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.toggleBtn, billingCycle === "yearly" && styles.toggleBtnActive]} 
            onPress={() => setBillingCycle("yearly")}
          >
            <Text style={[styles.toggleText, billingCycle === "yearly" ? styles.toggleTextActive : { color: theme.text }]}>Yearly</Text>
            <View style={styles.saveBadge}>
              <Text style={styles.saveBadgeText}>Save 17%</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContainer}>
        {filteredPlans.map((plan) => {
          // Check if this plan is currently active
          const isActivePlan = plan.name.toLowerCase() === currentPlan.toLowerCase() && (plan.cycle === billingCycle || plan.name === "Basic");

          return (
            <View 
              key={`${plan.name}-${plan.cycle}`} 
              style={[
                styles.card, 
                { backgroundColor: theme.card, borderColor: plan.isPopular ? plan.color : (theme.darkMode ? "#262626" : "#e2e8f0") }
              ]}
            >
              {isActivePlan && (
                <View style={styles.activePlanOverlayBadge}>
                  <Text style={styles.activePlanOverlayText}>CURRENT ACTIVE PLAN</Text>
                </View>
              )}

              {plan.isPopular && !isActivePlan && (
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
                  isActivePlan && { backgroundColor: "#94a3b8" }
                ]} 
                disabled={isActivePlan}
                onPress={() => subscribe(plan)}
              >
                <Text style={styles.btnText}>
                  {isActivePlan ? "Current Plan Active" : plan.name === "Basic" ? "Select Basic" : `Subscribe (${plan.cycle === "yearly" ? "Yearly" : "Monthly"})`}
                </Text>
                {!isActivePlan && <Icon name="arrow-right" size={18} color="#fff" style={{ marginLeft: 6 }} />}
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