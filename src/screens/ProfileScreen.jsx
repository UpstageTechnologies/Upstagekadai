import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  SafeAreaView,
  Alert,
  LogBox
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
    const session = await getSession();
    if (!session?.uid) return;
    const uid = session.uid;

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

      let fetchedAddress = data[`${activeMode}_address`] || data.address || "";
      if (typeof fetchedAddress === "object" && fetchedAddress !== null) {
        fetchedAddress = fetchedAddress.fullAddress || JSON.stringify(fetchedAddress); 
      }
      setAddress(fetchedAddress);
    }

    const savedImage = await AsyncStorage.getItem(`${activeMode}_profileImage_${uid}`);
    const savedLogo = await AsyncStorage.getItem(`${activeMode}_shopLogo_${uid}`);

    if (savedImage) setImage(savedImage);
    if (savedLogo) setShopLogo(savedLogo);
  };

  const pickProfileImage = () => {
    launchImageLibrary({ mediaType: "photo" }, async (res) => {
      if (res.assets) {
        const uri = res.assets[0].uri;
        setImage(uri);
        await AsyncStorage.setItem(`${currentMode}_profileImage_${auth.currentUser.uid}`, uri);
      }
    });
  };

  const pickShopLogo = () => {
    launchImageLibrary({ mediaType: "photo" }, async (res) => {
      if (res.assets) {
        const uri = res.assets[0].uri;
        setShopLogo(uri);
        await AsyncStorage.setItem(`${currentMode}_shopLogo_${auth.currentUser.uid}`, uri);
      }
    });
  };

  const saveProfile = async () => {
    try {
      setLoading(true);
      const updateData = {
        [`${currentMode}_ownerName`]: ownerName,
        [`${currentMode}_email`]: email,
        [`${currentMode}_phone`]: phone,
        [`${currentMode}_shopName`]: shopName,
        [`${currentMode}_gstNumber`]: gstNumber,
        [`${currentMode}_address`]: address,
      };

      await updateDoc(doc(db, "users", auth.currentUser.uid), updateData);
      Alert.alert("Success", `${currentMode.toUpperCase()} Details Updated Successfully`);
    } catch (e) {
      Alert.alert("Error", "Update Failed");
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        extraScrollHeight={20}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={28} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>
            Profile ({currentMode === "global" ? "🌍 Global" : "🏠 Local"})
          </Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={[styles.uidBanner, { backgroundColor: isUidActive ? "#ecfdf5" : "#fef2f2", borderColor: isUidActive ? "#10b981" : "#ef4444" }]}>
          <Icon name={isUidActive ? "shield-check" : "shield-alert"} size={22} color={isUidActive ? "#16a34a" : "#ef4444"} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={{ fontWeight: "700", color: isUidActive ? "#16a34a" : "#ef4444" }}>
              Shop UID: {customShopUid} ({isUidActive ? "Active" : "Disabled / Expired"})
            </Text>
            {!isUidActive && (
              <TouchableOpacity onPress={() => navigation.navigate("Subscription")}>
                <Text style={{ color: "#2563eb", fontWeight: "bold", fontSize: 13, marginTop: 2 }}>Renew Subscription to Unlock UID →</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

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

        {activeTab === "profile" && (
          <View style={styles.sectionContainer}>
            <View style={styles.imageWrap}>
              <TouchableOpacity onPress={pickProfileImage}>
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

        {activeTab === "shop" && (
          <View style={styles.sectionContainer}>
            <View style={styles.imageWrap}>
              <TouchableOpacity onPress={pickShopLogo} style={{ alignItems: "center" }}>
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

        <TouchableOpacity style={styles.saveBtn} onPress={saveProfile}>
          <Text style={styles.saveText}>{loading ? "Saving..." : "Save Changes"}</Text>
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
  container: { flex: 1, padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, marginBottom: 15 },
  title: { fontSize: 20, fontWeight: "bold" },
  uidBanner: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 20 },
  tabContainer: { flexDirection: "row", borderRadius: 16, borderWidth: 1, padding: 4, marginBottom: 25 },
  tabButton: { flex: 1, flexDirection: "row", paddingVertical: 12, justifyContent: "center", alignItems: "center", borderRadius: 12, gap: 8 },
  activeTab: { backgroundColor: "#6366f1" },
  tabText: { fontWeight: "bold", fontSize: 14 },
  sectionContainer: { marginBottom: 10 },
  imageWrap: { alignSelf: "center", marginBottom: 25, alignItems: "center" },
  image: { width: 120, height: 120, borderRadius: 60 },
  placeholder: { width: 120, height: 120, borderRadius: 60, backgroundColor: "#6366f1", justifyContent: "center", alignItems: "center" },
  editBtn: { position: "absolute", bottom: 15, right: 0, width: 34, height: 34, borderRadius: 17, backgroundColor: "#16a34a", justifyContent: "center", alignItems: "center" },
  input: { marginBottom: 18, borderRadius: 18, padding: 16, fontSize: 15, borderWidth: 1 },
  saveBtn: { backgroundColor: "#6366f1", padding: 18, borderRadius: 18, alignItems: "center", marginTop: 10 },
  saveText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  logoutBtn: { backgroundColor: "#ef4444", padding: 18, borderRadius: 18, alignItems: "center", marginTop: 15, marginBottom: 40 },
  logoutText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  labelText: { textAlign: "center", marginTop: 8, fontWeight: "600" }
});