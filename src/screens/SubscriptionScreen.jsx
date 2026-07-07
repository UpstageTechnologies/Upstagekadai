import React, { useContext, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, SafeAreaView, StatusBar } from "react-native";
import { auth, db } from "../firebaseConfig";
import RazorpayCheckout from "react-native-razorpay";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { ThemeContext } from "../theme/ThemeContext";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

export default function SubscriptionScreen({ navigation, route }) {  
  const { theme } = useContext(ThemeContext);
  const trialActive = route?.params?.trialActive || false;
  const [currentPlan, setCurrentPlan] = useState("Free Trial");

  useEffect(() => {
    const fetchUserPlan = async () => {
      if (auth.currentUser) {
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (snap.exists()) {
          setCurrentPlan(snap.data().subscriptionPlan || "Free Trial");
        }
      }
    };
    fetchUserPlan();
  }, []);

  const plans = [
    {
      name: "Basic",
      price: "199",
      days: 28,
      color: "#6366f1",
      features: ["28 Days Dynamic Access", "Max 5 Scans per Day", "Local/Global Operations", "Standard Invoicing & Reports"],
      isPopular: false
    },
    {
      name: "Premium",
      price: "2000",
      days: 30,
      color: "#10b981",
      features: ["30 Days Full Access", "Unlimited Scans / Day", "Real-time Cloud Syncing", "Priority Core Support"],
      isPopular: true
    },
    {
      name: "Pro",
      price: "20000",
      days: 365,
      color: "#f59e0b",
      features: ["365 Days Enterprise Access", "Unlimited Scans Everywhere", "Advanced Analytics Dashboard", "Dedicated Account Manager"],
      isPopular: false
    }
  ];

  const subscribe = async (plan) => {
    const options = {
      description: `${plan.name} Subscription`,
      image: "https://yourlogo.com/logo.png", // உங்கள் லோகோ URL
      currency: "INR",
      key: "rzp_test_RqckwEGqKZFqMk", // உங்களுடைய Razorpay Key
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
      const expiry = Date.now() + plan.days * 24 * 60 * 60 * 1000;

      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        subscriptionPlan: plan.name,
        subscriptionActive: true,
        subscriptionExpiry: expiry,
        razorpayPaymentId: data.razorpay_payment_id,
        // Basic பிளானுக்கு மட்டும் லிமிட் செட் செய்யப்படுகிறது
        scanLimitPerDay: plan.name === "Basic" ? 5 : -1 
      });

      Alert.alert("Payment Success ✅", `${plan.name} Plan Activated Successfully!`);
      navigation.replace("Dashboard");
    } catch (error) {
      Alert.alert("Payment Failed ❌", "Transaction could not be completed. Please try again.");
      console.log(error);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.darkMode ? "light-content" : "dark-content"} />
      
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Choose Your Plan</Text>
        <Text style={[styles.subtitle, { color: theme.subText || "#64748b" }]}>
          {trialActive ? "🎉 Your 7 Days Free Trial Started" : "⚠️ Upgrade to avoid business interruptions"}
        </Text>
        <View style={styles.currentPlanBadge}>
          <Text style={styles.currentPlanText}>Current Active Plan: {currentPlan.toUpperCase()}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContainer}>
        {plans.map((plan) => (
          <View key={plan.name} style={[styles.card, { backgroundColor: theme.card, borderColor: plan.isPopular ? plan.color : "transparent" }]}>
            {plan.isPopular && (
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
                <Icon name={plan.name === "Pro" ? "crown" : plan.name === "Premium" ? "diamond-stone" : "shield-check"} size={28} color={plan.color} />
              </View>
            </View>

            <View style={styles.priceContainer}>
              <Text style={[styles.currency, { color: plan.color }]}>₹</Text>
              <Text style={[styles.price, { color: theme.text }]}>{Number(plan.price).toLocaleString("en-IN")}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.featuresContainer}>
              {plan.features.map((feature, idx) => (
                <View key={idx} style={styles.featureRow}>
                  <Icon name="check-circle" size={18} color={plan.color} style={{ marginRight: 8 }} />
                  <Text style={[styles.featureText, { color: theme.text }]}>{feature}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={[styles.btn, { backgroundColor: plan.color }]} onPress={() => subscribe(plan)}>
              <Text style={styles.btnText}>Subscribe Now</Text>
              <Icon name="arrow-right" size={18} color="#fff" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        ))}

        {trialActive && (
          <TouchableOpacity style={styles.trialBtn} onPress={() => navigation.replace("Dashboard")}>
            <Text style={styles.trialBtnText}>Continue with Free Trial</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 15, alignItems: "center" },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginTop: 4, textAlign: "center", fontWeight: "500" },
  currentPlanBadge: { backgroundColor: "rgba(99,102,241,0.1)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginTop: 12 },
  currentPlanText: { color: "#6366f1", fontSize: 11, fontWeight: "700" },
  scrollContainer: { padding: 20, paddingBottom: 40 },
  card: { borderRadius: 24, padding: 24, marginBottom: 24, borderWidth: 2, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 12, elevation: 3, position: "relative", overflow: "hidden" },
  popularBadge: { position: "absolute", top: 12, right: -35, transform: [{ rotate: "45deg" }], paddingVertical: 4, width: 130, alignItems: "center" },
  popularText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  planName: { fontSize: 22, fontWeight: "700" },
  planDuration: { fontSize: 13, marginTop: 2, fontWeight: "500" },
  iconContainer: { width: 50, height: 50, borderRadius: 15, justifyContent: "center", alignItems: "center" },
  priceContainer: { flexDirection: "row", alignItems: "baseline", marginTop: 15 },
  currency: { fontSize: 24, fontWeight: "700", marginRight: 4 },
  price: { fontSize: 36, fontWeight: "800" },
  divider: { height: 1, backgroundColor: "rgba(0,0,0,0.05)", marginVertical: 18 },
  featuresContainer: { marginBottom: 10 },
  featureRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  featureText: { fontSize: 14, fontWeight: "500" },
  btn: { borderRadius: 16, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", marginTop: 10, shadowOpacity: 0.15, shadowRadius: 5, elevation: 2 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  trialBtn: { backgroundColor: "#1e293b", padding: 16, borderRadius: 16, alignItems: "center", marginTop: 5 },
  trialBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 }
});