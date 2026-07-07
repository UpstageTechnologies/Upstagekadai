import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { auth, db } from "../firebaseConfig";
import { LogBox } from "react-native";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

LogBox.ignoreLogs([
  "VirtualizedLists should never be nested",
]);

export default function RegisterScreen({ navigation }) {
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  
  // 📍 NearMe கணக்கீட்டிற்கான புதிய ஸ்டேட்ஸ்
  const [shopLat, setShopLat] = useState(null);
  const [shopLon, setShopLon] = useState(null);

  // 🚚 Local / Global தேர்வுக்கான புதிய ஸ்டேட் (Default: Local)
  const [deliveryScope, setDeliveryScope] = useState("Local"); 

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError("");
    setMessage("");

    if (
      !shopName ||
      !ownerName ||
      !phone ||
      !address ||
      !email ||
      !password ||
      !confirmPassword
    ) {
      setError("All fields required ⚠");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match ❌");
      return;
    }

    // கூகுள் முகவரியில் இருந்து புள்ளிகள் எடுக்கப்பட்டதா என்ற சரிபார்ப்பு
    if (!shopLat || !shopLon) {
      setError("Please select a valid address from the dropdown list 📍");
      return;
    }

    setLoading(true);

    try {
      const result = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      // 🔥 Firestore-ல் டேட்டா சேமிப்பு அமைப்பு
      await setDoc(
        doc(db, "users", result.user.uid),
        {
          shopName,
          ownerName,
          phone,
          email: email.trim(),
          role: "seller",
          
          // 📍 வாடிக்கையாளர் ஆப் 3 கிமீ பில்டருக்கு தேவையான சரியான ஸ்ட்ரக்சர்
          address: {
            fullAddress: address,
            lat: Number(shopLat),
            lon: Number(shopLon)
          },

          // 🚚 பயனர் தேர்ந்தெடுத்த டெலிவரி ஸ்கோப் (Local / Global)
          deliveryScope: deliveryScope, 

          trialStart: Date.now(),
          subscriptionPlan: "Free Trial",
          subscriptionActive: true,
          subscriptionExpiry: Date.now() + 30 * 24 * 60 * 60 * 1000,
          createdAt: new Date().toISOString(),
        }
      );

      setMessage("Account created successfully 🎉");
      setTimeout(() => {
        navigation.navigate("Login");
      }, 1500);

    } catch (e) {
      console.log("ERROR 👉", e);
      setError(e.message);
    }

    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <KeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <View style={styles.card}>
            <Image
              source={require("../assets/shopping2.jpg")}
              style={styles.topImage}
              resizeMode="contain"
            />

            <Text style={styles.title}>Sign Up</Text>
            <Text style={styles.subtitle}>Create your shop account to continue</Text>

            <TextInput
              placeholder="Shop Name"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              onChangeText={setShopName}
            />

            <TextInput
              placeholder="Owner Name"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              onChangeText={setOwnerName}
            />

            <TextInput
              placeholder="Phone Number"
              placeholderTextColor="#94a3b8"
              keyboardType="phone-pad"
              style={styles.input}
              onChangeText={setPhone}
            />

            {/* 📍 கூகுள் மேப் சர்ச் பார் பகுதி */}
            <Text style={styles.sectionLabel}>Shop Location Address 🔍</Text>
            <View style={{ zIndex: 1000, marginBottom: 15 }}>
              <GooglePlacesAutocomplete
                placeholder="Search Shop Address..."
                fetchDetails={true}
                minLength={2}
                debounce={300}
                enablePoweredByContainer={false}
                nearbyPlacesAPI="GooglePlacesSearch"
                onPress={(data, details = null) => {
                  setAddress(details?.formatted_address || data?.description || "");
                  
                  // ஜியோமிதி புள்ளிகளை (Coordinates) பிரித்தெடுத்தல்
                  if (details?.geometry?.location) {
                    setShopLat(details.geometry.location.lat);
                    setShopLon(details.geometry.location.lng);
                  }
                }}
                query={{
                  key: 'AIzaSyDh7LkmivSR8am3gPvq0psCR8IH499wj28',
                  language: 'en',
                  components: 'country:in',
                }}
                styles={{
                  textInput: styles.input,
                  listView: {
                    backgroundColor: '#fff',
                    borderRadius: 15,
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                  },
                }}
              />
            </View>

            {address ? (
            <Text
              style={{
                marginTop: 10,
                color: '#16a34a',
              }}>
              📍 {typeof address === "object"
                ? address.fullAddress
                : address}
            </Text>
          ) : null}

            {/* 🚚 புதிய பட்டன் செக்ஷன்: Local / Global Delivery Selector */}
            <Text style={styles.sectionLabel}>Delivery Scope</Text>
            <View style={styles.toggleContainer}>
              <TouchableOpacity 
                activeOpacity={0.8}
                style={[styles.toggleBtn, deliveryScope === "Local" && styles.activeToggleBtn]}
                onPress={() => setDeliveryScope("Local")}
              >
                <Text style={[styles.toggleBtnText, deliveryScope === "Local" && styles.activeToggleBtnText]}>
                  📍 Local (Nearby)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                activeOpacity={0.8}
                style={[styles.toggleBtn, deliveryScope === "Global" && styles.activeToggleBtn]}
                onPress={() => setDeliveryScope("Global")}
              >
                <Text style={[styles.toggleBtnText, deliveryScope === "Global" && styles.activeToggleBtnText]}>
                  🌍 Global (All Over)
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.toggleHelpTxt}>
              {deliveryScope === "Local" 
                ? "Your shop will be shown to customers within 3 KM radius." 
                : "Your shop will be visible to everyone regardless of distance."}
            </Text>

            <TextInput
              placeholder="Email"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
              onChangeText={setEmail}
            />

            <TextInput
              placeholder="Password"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              secureTextEntry
              onChangeText={setPassword}
            />

            <TextInput
              placeholder="Confirm Password"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              secureTextEntry
              onChangeText={setConfirmPassword}
            />

            <TouchableOpacity
              style={styles.button}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Create Account</Text>
              )}
            </TouchableOpacity>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {message ? <Text style={styles.success}>{message}</Text> : null}

            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <Text style={styles.link}>← Back to Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 25,
    backgroundColor: "#eef2ff",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 35,
    padding: 25,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 6,
  },
  topImage: {
    width: 220,
    height: 220,
    alignSelf: "center",
    marginBottom: 5,
  },
  title: {
    fontSize: 34,
    color: "#1e3a8a",
    marginBottom: 8,
    textAlign: "center",
    fontWeight: "bold",
  },
  subtitle: {
    textAlign: "center",
    color: "#64748b",
    marginBottom: 25,
    fontSize: 15,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 8,
    marginLeft: 4
  },
  input: {
    backgroundColor: "#f8fafc",
    color: "#111827",
    padding: 16,
    marginBottom: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    fontSize: 15,
  },
  liveLocationText: {
    fontSize: 13,
    color: '#16a34a',
    fontWeight: '600',
    marginBottom: 15,
    paddingHorizontal: 4
  },
  // 🚚 Delivery Selector Styles
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    padding: 5,
    borderRadius: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
  },
  activeToggleBtn: {
    backgroundColor: "#2563eb",
  },
  toggleBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569"
  },
  activeToggleBtnText: {
    color: "#fff",
    fontWeight: "700"
  },
  toggleHelpTxt: {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 15,
    marginLeft: 4,
    fontStyle: "italic"
  },
  button: {
    backgroundColor: "#2563eb",
    padding: 17,
    borderRadius: 18,
    alignItems: "center",
    shadowColor: "#2563eb",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    marginTop: 10,
  },
  btnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  error: {
    color: "#ef4444",
    marginTop: 15,
    textAlign: "center",
    fontWeight: "600",
  },
  success: {
    color: "#16a34a",
    marginTop: 15,
    textAlign: "center",
    fontWeight: "600",
  },
  link: {
    color: "#2563eb",
    marginTop: 22,
    textAlign: "center",
    fontWeight: "600",
  },
});