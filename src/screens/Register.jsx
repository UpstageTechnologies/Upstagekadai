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
  SafeAreaView,
  StatusBar,
} from "react-native";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

import { LogBox } from "react-native";
import { auth } from "../utils/firebaseConfig";
import { getFunctions, httpsCallable } from "firebase/functions";

LogBox.ignoreLogs(["VirtualizedLists should never be nested"]);

export default function RegisterScreen({ navigation }) {
  const [shopName, setShopName] = useState("");
  
  const [shopType, setShopType] = useState("");
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const shopTypes = ["Store", "Super Market", "Factory", "Medical", "Other"];

  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [shopLat, setShopLat] = useState(null);
  const [shopLon, setShopLon] = useState(null);
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

    // Required fields validation
    if (
      !shopName ||
      !shopType ||
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

    // Password validation
    if (password !== confirmPassword) {
      setError("Passwords do not match ❌");
      return;
    }

    // Location validation
    if (!shopLat || !shopLon) {
      setError(
        "Please select a valid address from the dropdown list 📍"
      );
      return;
    }

    setLoading(true);

    try {
      // 🌟 சரியாக ரீஜியனுடன் (Region) Functions-ஐ இன்ஸ்டன்ஸ் செய்தல்
      const functions = getFunctions(auth.app, "us-central1");
      const registerSeller = httpsCallable(functions, "registerSeller");

      const payload = {
        email: email.trim(),
        password: password,
        shopName: shopName.trim(),
        shopType: shopType,
        ownerName: ownerName.trim(),
        phone: phone.trim(),
        address: address,
        shopLat: Number(shopLat),
        shopLon: Number(shopLon),
        deliveryScope: deliveryScope,
      };

      const result = await registerSeller(payload);

      console.log("Register response:", result.data);

      setMessage(
        `Account created successfully 🎉\nShop UID: ${result.data.uid}`
      );

      setTimeout(() => {
        navigation.navigate("Login");
      }, 1800);

    } catch (e) {
      console.error("Registration error:", e);
      // விரிவான எரர் மெசேஜைக் காட்டவும்
      setError(e?.message || "Failed to create account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView 
      style={{ 
        flex: 1, 
        backgroundColor: "#eef2ff",
        paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0 
      }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <KeyboardAwareScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingVertical: 40,
            paddingHorizontal: 25,
          }}
        >
          <View style={styles.card}>
            <Image
              source={require("../assets/shopping2.jpg")}
              style={styles.topImage}
              resizeMode="contain"
            />

            <Text style={styles.title}>Sign Up</Text>
            <Text style={styles.subtitle}>
              Create your shop account to continue
            </Text>

            <TextInput
              placeholder="Shop Name"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              onChangeText={setShopName}
            />

            {/* SHOP TYPE DROPDOWN */}
            <TouchableOpacity
              style={[styles.input, { justifyContent: 'center' }]}
              onPress={() => setShowTypeDropdown(!showTypeDropdown)}
              activeOpacity={0.7}
            >
              <Text style={{ color: shopType ? "#111827" : "#94a3b8", fontSize: 15 }}>
                {shopType ? shopType : "Select Shop Type"}
              </Text>
            </TouchableOpacity>

            {showTypeDropdown && (
              <View style={styles.dropdownContainer}>
                {shopTypes.map((type, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.dropdownItem,
                      index === shopTypes.length - 1 && { borderBottomWidth: 0 }
                    ]}
                    onPress={() => {
                      setShopType(type);
                      setShowTypeDropdown(false);
                    }}
                  >
                    <Text style={styles.dropdownText}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

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
                  if (details?.geometry?.location) {
                    setShopLat(details.geometry.location.lat);
                    setShopLon(details.geometry.location.lng);
                  }
                }}
                query={{
                  key: "AIzaSyDh7LkmivSR8am3gPvq0psCR8IH499wj28",
                  language: "en",
                  components: "country:in",
                }}
                styles={{
                  textInput: styles.input,
                  listView: {
                    backgroundColor: "#fff",
                    borderRadius: 15,
                    borderWidth: 1,
                    borderColor: "#e2e8f0",
                  },
                }}
              />
            </View>

            {address ? (
              <Text style={{ marginTop: 10, color: "#16a34a", marginBottom: 10 }}>
                📍 {typeof address === "object" ? address.fullAddress : address}
              </Text>
            ) : null}

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

            <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create Account</Text>}
            </TouchableOpacity>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {message ? <Text style={styles.success}>{message}</Text> : null}

            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <Text style={styles.link}>← Back to Login</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    marginLeft: 4,
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
  dropdownContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 15,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dropdownItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  dropdownText: {
    fontSize: 15,
    color: "#334155",
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