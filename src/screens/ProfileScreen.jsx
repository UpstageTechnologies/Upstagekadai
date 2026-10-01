import React, { useEffect, useState } from "react";
import Clipboard from "@react-native-clipboard/clipboard";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  SafeAreaView,
  Alert,
  LogBox,
  Platform,
  StatusBar,
  ToastAndroid,
  ActivityIndicator
} from "react-native";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { launchImageLibrary } from "react-native-image-picker";
import { clearSession, getSession } from "../utils/session";
import { signOut } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { useTheme } from "../theme/ThemeContext";
import RNFS from "react-native-fs";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { auth, db } from "../utils/firebaseConfig";

LogBox.ignoreLogs(["VirtualizedLists should never be nested"]);

export default function ProfileScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState("profile");
  const [currentMode, setCurrentMode] = useState("local");

  // Profile States
  const [image, setImage] = useState(null);
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Shop Profile States
  const [shopLogo, setShopLogo] = useState(null);
  const [shopName, setShopName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [address, setAddress] = useState("");
  const [customShopUid, setCustomShopUid] = useState("");
  const [isUidActive, setIsUidActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const session = await getSession();
      const uid = session?.uid || auth.currentUser?.uid;
      if (!uid) return;

      const savedMode = await AsyncStorage.getItem("app_mode");
      const activeMode = savedMode === "global" ? "global" : "local";
      setCurrentMode(activeMode);

      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = snap.data();
        setOwnerName(data[`${activeMode}_ownerName`] || data.ownerName || "");
        setEmail(data[`${activeMode}_email`] || data.email || "");
        setPhone(data[`${activeMode}_phone`] || data.phone || "");

        setShopName(data[`${activeMode}_shopName`] || data.shopName || "");
        setGstNumber(data[`${activeMode}_gstNumber`] || data.gstNumber || "");
        
        const expiry = data.subscriptionExpiry || 0;
        const activeFlag = data.subscriptionActive !== false && Date.now() < expiry;
        setIsUidActive(activeFlag);
        setCustomShopUid(data.customShopUid || "Not Generated / Expired");

       if (activeFlag) {
          setCustomShopUid(uid);
        } else {
          setCustomShopUid("Disabled / Expired");
        }

        let fetchedAddress = data[`${activeMode}_address`] || data.address || "";
        if (typeof fetchedAddress === "object" && fetchedAddress !== null) {
          fetchedAddress = fetchedAddress.fullAddress || JSON.stringify(fetchedAddress); 
        }
        setAddress(fetchedAddress);

        // Cloud Firestore-ல் இருந்து இமேஜ்களை முதலில் எடுக்கும்
        const cloudImage = data[`${activeMode}_profileImage`] || data.profileImage || null;
        const cloudLogo = data[`${activeMode}_shopLogo`] || data.shopLogo || null;

        if (cloudImage) {
          setImage(cloudImage);
          await AsyncStorage.setItem(`${activeMode}_profileImage_${uid}`, cloudImage);
        } else {
          const savedImage = await AsyncStorage.getItem(`${activeMode}_profileImage_${uid}`);
          if (savedImage) setImage(savedImage);
        }

        if (cloudLogo) {
          setShopLogo(cloudLogo);
          await AsyncStorage.setItem(`${activeMode}_shopLogo_${uid}`, cloudLogo);
        } else {
          const savedLogo = await AsyncStorage.getItem(`${activeMode}_shopLogo_${uid}`);
          if (savedLogo) setShopLogo(savedLogo);
        }
      }
    } catch (err) {
      console.log("Load user error:", err);
    }
  };

  // Base64 helper: ஒருவேளை picker-ல் base64 கிடைக்கவில்லை என்றால் RNFS மூலம் மாற்றித் தரும்
  const getBase64FromAsset = async (asset) => {
    if (asset.base64) {
      return `data:${asset.type || "image/jpeg"};base64,${asset.base64}`;
    }
    if (asset.uri) {
      try {
        const base64Data = await RNFS.readFile(asset.uri, "base64");
        return `data:${asset.type || "image/jpeg"};base64,${base64Data}`;
      } catch (err) {
        console.error("RNFS Base64 convert error:", err);
        return asset.uri;
      }
    }
    return null;
  };

  const pickProfileImage = () => {
    launchImageLibrary(
      {
        mediaType: "photo",
        maxWidth: 400,
        maxHeight: 400,
        quality: 0.6,
        includeBase64: true,
      },
      async (res) => {
        if (res.didCancel || res.errorCode) return;
        if (res.assets && res.assets.length > 0) {
          const base64Uri = await getBase64FromAsset(res.assets[0]);
          if (base64Uri) {
            setImage(base64Uri);
            const session = await getSession();
            const uid = session?.uid || auth.currentUser?.uid;
            if (uid) {
              await AsyncStorage.setItem(`${currentMode}_profileImage_${uid}`, base64Uri);
            }
          }
        }
      }
    );
  };

  const pickShopLogo = () => {
    launchImageLibrary(
      {
        mediaType: "photo",
        maxWidth: 400,
        maxHeight: 400,
        quality: 0.6,
        includeBase64: true,
      },
      async (res) => {
        if (res.didCancel || res.errorCode) return;
        if (res.assets && res.assets.length > 0) {
          const base64Uri = await getBase64FromAsset(res.assets[0]);
          if (base64Uri) {
            setShopLogo(base64Uri);
            const session = await getSession();
            const uid = session?.uid || auth.currentUser?.uid;
            if (uid) {
              await AsyncStorage.setItem(`${currentMode}_shopLogo_${uid}`, base64Uri);
            }
          }
        }
      }
    );
  };

  const saveProfile = async () => {
    try {
      setLoading(true);
      const session = await getSession();
      const uid = session?.uid || auth.currentUser?.uid;

      if (!uid) {
        Alert.alert("Error", "User session not found. Please re-login.");
        setLoading(false);
        return;
      }

      // Firestore document size limit 1MB என்பதால் base64 சரியான அளவில் சேமிக்கப்படுகிறது
      const updateData = {
        // Mode-specific fields
        [`${currentMode}_ownerName`]: ownerName || "",
        [`${currentMode}_email`]: email || "",
        [`${currentMode}_phone`]: phone || "",
        [`${currentMode}_shopName`]: shopName || "",
        [`${currentMode}_gstNumber`]: gstNumber || "",
        [`${currentMode}_address`]: address || "",
        [`${currentMode}_profileImage`]: image || null,
        [`${currentMode}_shopLogo`]: shopLogo || null,

        // Common Fallback fields (மற்ற screens & devices-க்கு)
        ownerName: ownerName || "",
        email: email || "",
        phone: phone || "",
        shopName: shopName || "",
        gstNumber: gstNumber || "",
        address: address || "",
        profileImage: image || null,
        shopLogo: shopLogo || null,
      };

      await updateDoc(doc(db, "users", uid), updateData);

      // Save to local cache
      if (image) await AsyncStorage.setItem(`${currentMode}_profileImage_${uid}`, image);
      if (shopLogo) await AsyncStorage.setItem(`${currentMode}_shopLogo_${uid}`, shopLogo);

      Alert.alert("Success", `${currentMode.toUpperCase()} Details Updated Successfully`);
    } catch (e) {
      console.error("Save profile error:", e);
      Alert.alert("Error", "Update Failed: " + (e.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar
        backgroundColor={theme.background}
        barStyle={theme.dark ? "light-content" : "dark-content"}
      />
      <KeyboardAwareScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        extraScrollHeight={25}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={28} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>
            Profile ({currentMode === "global" ? "🌍 Global" : "🏠 Local"})
          </Text>
          <View style={{ width: 28 }} />
        </View>

      {/* UID Status Banner */}
<View
  style={[
    styles.uidBanner,
    {
      backgroundColor: isUidActive ? "#ecfdf5" : "#fef2f2",
      borderColor: isUidActive ? "#10b981" : "#ef4444",
    },
  ]}
>
  <Icon
    name={isUidActive ? "shield-check" : "shield-alert"}
    size={24}
    color={isUidActive ? "#16a34a" : "#ef4444"}
  />

  <View style={{ marginLeft: 10, flex: 1 }}>
    <Text
      numberOfLines={1}
      ellipsizeMode="middle"
      style={{
        fontWeight: "700",
        color: isUidActive ? "#16a34a" : "#ef4444",
        fontSize: 13,
      }}
    >
      Shop UID: {isUidActive ? customShopUid : "Subscription Inactive"}
    </Text>
    <Text
      style={{
        fontSize: 12,
        color: isUidActive ? "#15803d" : "#b91c1c",
        marginTop: 2,
      }}
    >
      Status: {isUidActive ? "Active" : "Disabled / Expired"}
    </Text>

    {!isUidActive && (
      <TouchableOpacity onPress={() => navigation.navigate("Subscription")}>
        <Text
          style={{
            color: "#2563eb",
            fontWeight: "bold",
            fontSize: 13,
            marginTop: 4,
          }}
        >
          Renew Subscription to Unlock UID →
        </Text>
      </TouchableOpacity>
    )}
  </View>

  {/* Active ஆக இருக்கும் போது மட்டும் Copy Button காட்டும் */}
  {isUidActive && (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => {
        Clipboard.setString(customShopUid);
        if (Platform.OS === "android") {
          ToastAndroid.show("Shop UID copied!", ToastAndroid.SHORT);
        } else {
          Alert.alert("Copied", "Shop UID copied to clipboard!");
        }
      }}
      style={styles.copyBtn}
    >
      <Icon name="content-copy" size={18} color="#16a34a" />
    </TouchableOpacity>
  )}
</View>

        {/* Tab Toggle */}
        <View style={[styles.tabContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === "profile" && styles.activeTab]}
            onPress={() => setActiveTab("profile")}
          >
            <Icon name="account" size={18} color={activeTab === "profile" ? "#fff" : theme.text} />
            <Text style={[styles.tabText, { color: activeTab === "profile" ? "#fff" : theme.text }]}>
              Profile
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === "shop" && styles.activeTab]}
            onPress={() => setActiveTab("shop")}
          >
            <Icon name="store" size={18} color={activeTab === "shop" ? "#fff" : theme.text} />
            <Text style={[styles.tabText, { color: activeTab === "shop" ? "#fff" : theme.text }]}>
              Shop Profile
            </Text>
          </TouchableOpacity>
        </View>

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <View style={styles.sectionContainer}>
            <View style={styles.imageWrap}>
              <TouchableOpacity onPress={pickProfileImage} activeOpacity={0.8}>
                {image ? (
                  <Image source={{ uri: image }} style={styles.image} />
                ) : (
                  <View style={styles.placeholder}>
                    <Icon name="account" size={60} color="#fff" />
                  </View>
                )}
                <View style={styles.editBtn}>
                  <Icon name="camera" size={18} color="#fff" />
                </View>
              </TouchableOpacity>
              <Text style={[styles.labelText, { color: theme.text }]}>Profile Picture</Text>
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
              placeholder="Owner Name"
              placeholderTextColor="#94a3b8"
              value={ownerName}
              onChangeText={setOwnerName}
            />

            <TextInput
              style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
              placeholder="Email Address"
              placeholderTextColor="#94a3b8"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />

            <TextInput
              style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
              placeholder="Mobile Number"
              placeholderTextColor="#94a3b8"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
          </View>
        )}

        {/* Shop Tab */}
        {activeTab === "shop" && (
          <View style={styles.sectionContainer}>
            <View style={styles.imageWrap}>
              <TouchableOpacity onPress={pickShopLogo} activeOpacity={0.8} style={{ alignItems: "center" }}>
                {shopLogo ? (
                  <Image source={{ uri: shopLogo }} style={{ width: 100, height: 100, borderRadius: 20 }} />
                ) : (
                  <View style={{ width: 100, height: 100, borderRadius: 20, backgroundColor: "#e5e7eb", justifyContent: "center", alignItems: "center" }}>
                    <Icon name="store" size={40} color="#6366f1" />
                  </View>
                )}
                <View style={styles.editBtn}>
                  <Icon name="camera" size={16} color="#fff" />
                </View>
              </TouchableOpacity>
              <Text style={[styles.labelText, { color: theme.text }]}>Shop Logo</Text>
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
              placeholder="Shop Name"
              placeholderTextColor="#94a3b8"
              value={shopName}
              onChangeText={setShopName}
            />

            <TextInput
              style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
              placeholder="GST Number"
              placeholderTextColor="#94a3b8"
              autoCapitalize="characters"
              value={gstNumber}
              onChangeText={setGstNumber}
            />

            <View style={{ zIndex: 1000, marginBottom: 20 }}>
              <GooglePlacesAutocomplete
                placeholder="Shop Address"
                fetchDetails={true}
                minLength={2}
                debounce={300}
                enablePoweredByContainer={false}
                nearbyPlacesAPI="GooglePlacesSearch"
                keyboardShouldPersistTaps="handled"
                textInputProps={{
                  value: address,
                  onChangeText: setAddress,
                  placeholderTextColor: "#94a3b8",
                }}
                onPress={(data, details = null) => {
                  setAddress(details?.formatted_address || data?.description || "");
                }}
                query={{
                  key: "AIzaSyDh7LkmivSR8am3gPvq0psCR8IH499wj28",
                  language: "en",
                  components: "country:in",
                }}
                styles={{
                  container: { flex: 0 },
                  textInput: {
                    height: 58,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: theme.border,
                    paddingHorizontal: 16,
                    backgroundColor: theme.card,
                    color: theme.text,
                    fontSize: 15,
                  },
                  listView: {
                    backgroundColor: "#fff",
                    borderRadius: 15,
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                    marginTop: 5,
                    position: "absolute",
                    top: 60,
                    left: 0,
                    right: 0,
                    zIndex: 9999,
                    elevation: 9999,
                  },
                  row: { paddingVertical: 14, paddingHorizontal: 12 },
                  description: { color: "#111827" },
                }}
              />
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <TouchableOpacity style={styles.saveBtn} onPress={saveProfile} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={async () => {
            await signOut(auth);
            await clearSession();
            navigation.reset({
              index: 0,
              routes: [{ name: "Onboarding" }],
            });
          }}
        >
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 15,
  },
  title: { fontSize: 20, fontWeight: "bold" },
  uidBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 20,
  },
  tabContainer: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    padding: 4,
    marginBottom: 25,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    gap: 8,
  },
  activeTab: { backgroundColor: "#6366f1" },
  tabText: { fontWeight: "bold", fontSize: 14 },
  sectionContainer: { marginBottom: 10 },
  imageWrap: { alignSelf: "center", marginBottom: 25, alignItems: "center" },
  image: { width: 120, height: 120, borderRadius: 60 },
  placeholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#6366f1",
    justifyContent: "center",
    alignItems: "center",
  },
  editBtn: {
    position: "absolute",
    bottom: 5,
    right: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#16a34a",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  input: {
    marginBottom: 18,
    borderRadius: 18,
    padding: 16,
    fontSize: 15,
    borderWidth: 1,
  },
  saveBtn: {
    backgroundColor: "#6366f1",
    padding: 18,
    borderRadius: 18,
    alignItems: "center",
    marginTop: 10,
  },
  saveText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  logoutBtn: {
    backgroundColor: "#ef4444",
    padding: 18,
    borderRadius: 18,
    alignItems: "center",
    marginTop: 15,
    marginBottom: 40,
  },
  copyBtn: {
  padding: 8,
  backgroundColor: "#d1fae5",
  borderRadius: 8,
  marginLeft: 8,
  justifyContent: "center",
  alignItems: "center",
},
  logoutText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  labelText: { textAlign: "center", marginTop: 8, fontWeight: "600" },
});