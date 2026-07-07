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
import { auth, db } from "../firebaseConfig";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { launchImageLibrary } from "react-native-image-picker";
import { clearSession, getSession } from "../../utils/session";
import { signOut } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { useTheme } from "../theme/ThemeContext";
import RNFS from "react-native-fs";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

LogBox.ignoreLogs(["VirtualizedLists should never be nested"]);

export default function ProfileScreen({ navigation }) {
  const [image, setImage] = useState(null);
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [shopLogo, setShopLogo] = useState(null);
  const [currentMode, setCurrentMode] = useState("local"); // 'local' or 'global'

  const { theme } = useTheme();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const session = await getSession();
    if (!session?.uid) return;
    const uid = session.uid;

    // 1. Get current mode from AsyncStorage (Set from Dashboard)
    const savedMode = await AsyncStorage.getItem("app_mode");
    const activeMode = savedMode === "global" ? "global" : "local";
    setCurrentMode(activeMode);

    // 2. Fetch User Profile Data from Firestore
    const snap = await getDoc(doc(db, "users", uid));

    if (snap.exists()) {
      const data = snap.data();
      
      // Load mode specific or fallback fields dynamically
      setShopName(data[`${activeMode}_shopName`] || data.shopName || "");
      setOwnerName(data[`${activeMode}_ownerName`] || data.ownerName || "");
      setPhone(data[`${activeMode}_phone`] || data.phone || "");
      setAddress(data[`${activeMode}_address`] || data.address || "");
      setEmail(data[`${activeMode}_email`] || data.email || "");
    }

    // 3. Load Images based on selected mode
    const saved = await AsyncStorage.getItem(`${activeMode}_profileImage_${uid}`);
    const savedLogo = await AsyncStorage.getItem(`${activeMode}_shopLogo_${uid}`);

    if (savedLogo) setShopLogo(savedLogo);
    if (saved) setImage(saved);
  };

  const pickImage = () => {
    launchImageLibrary({ mediaType: "photo" }, async (res) => {
      if (res.assets) {
        const uri = res.assets[0].uri;
        setImage(uri);
        await AsyncStorage.setItem(
          `${currentMode}_profileImage_${auth.currentUser.uid}`,
          uri
        );
      }
    });
  };

  const pickShopLogo = () => {
    launchImageLibrary({ mediaType: "photo" }, async (res) => {
      if (res.assets) {
        const uri = res.assets[0].uri;
        setShopLogo(uri);

        await AsyncStorage.setItem(
          `${currentMode}_shopLogo_${auth.currentUser.uid}`,
          uri
        );

        const base64 = await RNFS.readFile(uri.replace("file://", ""), "base64");
        await AsyncStorage.setItem(
          `${currentMode}_shopLogoBase64_${auth.currentUser.uid}`,
          `data:image/png;base64,${base64}`
        );
      }
    });
  };

  const saveProfile = async () => {
    try {
      setLoading(true);

      // Save fields with mode prefix dynamically (e.g., local_shopName or global_shopName)
      const updateData = {
        [`${currentMode}_shopName`]: shopName,
        [`${currentMode}_ownerName`]: ownerName,
        [`${currentMode}_phone`]: phone,
        [`${currentMode}_address`]: address,
        [`${currentMode}_email`]: email,
        // Sync with root variables for absolute backward safety
        shopName: shopName, 
      };

      await updateDoc(doc(db, "users", auth.currentUser.uid), updateData);

      Alert.alert("Success", `${currentMode.toUpperCase()} Profile Updated`);
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
            My Profile ({currentMode === "global" ? "🌍 Global" : "🏠 Local"})
          </Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.imageWrap}>
          <TouchableOpacity onPress={pickShopLogo} style={{ alignSelf: "center", marginBottom: 25 }}>
            {shopLogo ? (
              <Image source={{ uri: shopLogo }} style={{ width: 90, height: 90, borderRadius: 20 }} />
            ) : (
              <View style={{ width: 90, height: 90, borderRadius: 20, backgroundColor: "#e5e7eb", justifyContent: "center", alignItems: "center" }}>
                <Icon name="store" size={35} color="#6366f1" />
              </View>
            )}
            <Text style={[styles.labelText, { color: theme.text }]}>Shop Logo</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={pickImage}>
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
          placeholder="Owner Name"
          placeholderTextColor="#94a3b8"
          value={ownerName}
          onChangeText={setOwnerName}
        />

        <TextInput
          style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
          placeholder="Phone Number"
          placeholderTextColor="#94a3b8"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
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
              placeholderTextColor: theme.text === "#ffffff" ? "#94a3b8" : "#64748b",
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

        {address ? (
          <View style={{ backgroundColor: "#ecfdf5", borderRadius: 12, padding: 12, marginBottom: 18, borderWidth: 1, borderColor: "#5fce86ff" }}>
            <Text style={{ color: "#16a34a" }}>📍 {address}</Text>
          </View>
        ) : null}

        <TextInput
          style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
          placeholder="Email Address"
          placeholderTextColor="#94a3b8"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 15, marginBottom: 30 },
  title: { fontSize: 20, fontWeight: "bold" },
  imageWrap: { alignSelf: "center", marginBottom: 30, alignItems: "center" },
  image: { width: 130, height: 130, borderRadius: 65 },
  placeholder: { width: 130, height: 130, borderRadius: 65, backgroundColor: "#6366f1", justifyContent: "center", alignItems: "center" },
  editBtn: { position: "absolute", bottom: 5, right: 5, width: 38, height: 38, borderRadius: 19, backgroundColor: "#16a34a", justifyContent: "center", alignItems: "center" },
  input: { marginBottom: 18, borderRadius: 18, padding: 16, fontSize: 15, borderWidth: 1 },
  saveBtn: { backgroundColor: "#6366f1", padding: 18, borderRadius: 18, alignItems: "center", marginTop: 10 },
  saveText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  logoutBtn: { backgroundColor: "#ef4444", padding: 18, borderRadius: 18, alignItems: "center", marginTop: 15, marginBottom: 40 },
  logoutText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  labelText: { textAlign: "center", marginTop: 8, fontWeight: "600" }
});