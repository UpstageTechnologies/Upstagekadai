import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Keyboard,
  TouchableWithoutFeedback,
  Alert,
  Image,
} from "react-native";
import { auth } from "../utils/firebaseConfig";
import Ionicons from "react-native-vector-icons/Ionicons";
import FastImage from "react-native-fast-image";
import { LogBox } from "react-native";
import {
  getFirestore,
  collection,
  getDocs,
} from "firebase/firestore";
import { launchImageLibrary } from "react-native-image-picker";
import RNFS from "react-native-fs";
import { useTheme } from "../theme/ThemeContext";
import { LightTheme } from "../theme/colors";
import useKeyboardFocusScroll from "../hooks/useKeyboardFocusScroll";

LogBox.ignoreLogs(["VirtualizedLists should never be nested"]);

export default function RegisterScreen({ navigation }) {
  const themeContext = useTheme() || {};
  const theme = themeContext.theme || LightTheme;
  const darkMode = Boolean(themeContext.darkMode);
  const { scrollRef, onScroll, inputRef, focusInput } = useKeyboardFocusScroll();
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);
  // Step State (1: Shop Info, 2: Location Master, 3: Account Info)
  const [currentStep, setCurrentStep] = useState(1);

  const [shopName, setShopName] = useState("");
  const [shopType, setShopType] = useState("");
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const shopTypes = ["Store", "Super Market", "Factory", "Medical", "Other"];

  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");

  const [deliveryScope] = useState("Local");

  // Shop Banner / Image State
  const [shopImage, setShopImage] = useState(null);

  // ================= LOCATION MASTER =================
  const [country, setCountry] = useState("India");
  const [countryCode, setCountryCode] = useState("IN");

  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");

  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [cities, setCities] = useState([]);
  const [areas, setAreas] = useState([]);

  const [countrySearch, setCountrySearch] = useState("");
  const [stateSearch, setStateSearch] = useState("");
  const [districtSearch, setDistrictSearch] = useState("");
  const [citySearch, setCitySearch] = useState("");
  const [areaSearch, setAreaSearch] = useState("");

  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [showStateDropdown, setShowStateDropdown] = useState(false);
  const [showDistrictDropdown, setShowDistrictDropdown] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showAreaDropdown, setShowAreaDropdown] = useState(false);

  const [showAddLocation, setShowAddLocation] = useState(false);
  const [addLocationType, setAddLocationType] = useState("");
  const [newLocationName, setNewLocationName] = useState("");
  const [addingLocation, setAddingLocation] = useState(false);

  // Account
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const generatedAddress = [area, city, district, state, country]
    .filter(Boolean)
    .join(", ");

  const db = getFirestore(auth.app);

  const makeDocId = (value) => {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

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

  const pickShopImage = () => {
    launchImageLibrary(
      {
        mediaType: "photo",
        maxWidth: 800,
        maxHeight: 600,
        quality: 0.7,
        includeBase64: true,
      },
      async (res) => {
        if (res.didCancel || res.errorCode) return;
        if (res.assets && res.assets.length > 0) {
          const base64Uri = await getBase64FromAsset(res.assets[0]);
          if (base64Uri) {
            setShopImage(base64Uri);
          }
        }
      }
    );
  };

  // ================= LOAD LOCATIONS =================
  const loadCountries = useCallback(async () => {
    try {
      const snapshot = await getDocs(collection(db, "location_master"));
      const list = snapshot.docs.map((item) => ({
        id: item.id,
        name: item.data()?.name || item.id,
        code: item.data()?.code || item.id,
      }));
      setCountries(list);
    } catch (error) {
      console.error("Load countries error:", error);
    }
  }, [db]);

  useEffect(() => {
    loadCountries();
  }, [loadCountries]);

  const loadStates = async (selectedCountryCode = countryCode) => {
    try {
      const snapshot = await getDocs(
        collection(db, "location_master", selectedCountryCode, "states")
      );
      const list = snapshot.docs.map((item) => ({
        id: item.id,
        name: item.data()?.name || item.id,
      }));
      setStates(list);
    } catch (error) {
      console.error("Load states error:", error);
    }
  };

  const loadDistricts = async (selectedState) => {
    try {
      const stateId = makeDocId(selectedState);
      const snapshot = await getDocs(
        collection(
          db,
          "location_master",
          countryCode,
          "states",
          stateId,
          "districts"
        )
      );
      const list = snapshot.docs.map((item) => ({
        id: item.id,
        name: item.data()?.name || item.id,
      }));
      setDistricts(list);
    } catch (error) {
      console.error("Load districts error:", error);
    }
  };

  const loadCities = async (selectedState, selectedDistrict) => {
    try {
      const stateId = makeDocId(selectedState);
      const districtId = makeDocId(selectedDistrict);
      const snapshot = await getDocs(
        collection(
          db,
          "location_master",
          countryCode,
          "states",
          stateId,
          "districts",
          districtId,
          "cities"
        )
      );
      const list = snapshot.docs.map((item) => ({
        id: item.id,
        name: item.data()?.name || item.id,
      }));
      setCities(list);
    } catch (error) {
      console.error("Load cities error:", error);
    }
  };

  const loadAreas = async (selectedState, selectedDistrict, selectedCity) => {
    try {
      const stateId = makeDocId(selectedState);
      const districtId = makeDocId(selectedDistrict);
      const cityId = makeDocId(selectedCity);
      const snapshot = await getDocs(
        collection(
          db,
          "location_master",
          countryCode,
          "states",
          stateId,
          "districts",
          districtId,
          "cities",
          cityId,
          "areas"
        )
      );
      const list = snapshot.docs.map((item) => ({
        id: item.id,
        name: item.data()?.name || item.id,
      }));
      setAreas(list);
    } catch (error) {
      console.error("Load areas error:", error);
    }
  };

  // ================= ADD LOCATION =================
  const openAddLocation = (type) => {
    setAddLocationType(type);
    setNewLocationName("");
    setShowAddLocation(true);
  };

  const saveNewLocation = async () => {
    const value = newLocationName.trim();

    if (!value) {
      Alert.alert("Required", `Please enter ${addLocationType} name`);
      return;
    }

    try {
      setAddingLocation(true);
      const newId = makeDocId(value);

      if (!newId) {
        Alert.alert("Invalid", "Please enter a valid name");
        return;
      }

      const response = await fetch(
        "https://us-central1-scaner-billing.cloudfunctions.net/addLocation",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: {
              type: addLocationType,
              name: value,
              countryCode,
              state,
              district,
              city,
            },
          }),
        }
      );
      const responseText = await response.text();
      let responseJson;
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        throw new Error("Invalid response from location service");
      }
      if (!response.ok) {
        throw new Error(
          responseJson?.error?.message ||
            `Location service failed (${response.status})`
        );
      }

      if (addLocationType === "Country") {
        await loadCountries();
        setCountry(value);
        setCountryCode(newId);
        setState("");
        setDistrict("");
        setCity("");
        setArea("");
        setStates([]);
        setDistricts([]);
        setCities([]);
        setAreas([]);
        setCountrySearch("");
      }

      if (addLocationType === "State") {
        await loadStates(countryCode);
        setState(value);
        setDistrict("");
        setCity("");
        setArea("");
        setDistricts([]);
        setCities([]);
        setAreas([]);
        await loadDistricts(value);
        setStateSearch("");
      }

      if (addLocationType === "District") {
        await loadDistricts(state);
        setDistrict(value);
        setCity("");
        setArea("");
        setCities([]);
        setAreas([]);
        await loadCities(state, value);
        setDistrictSearch("");
      }

      if (addLocationType === "City") {
        await loadCities(state, district);
        setCity(value);
        setArea("");
        setAreas([]);
        await loadAreas(state, district, value);
        setCitySearch("");
      }

      if (addLocationType === "Area") {
        await loadAreas(state, district, city);
        setArea(value);
        setAreaSearch("");
      }

      setShowAddLocation(false);
      setNewLocationName("");
    } catch (error) {
      console.error("Add location error:", error);
      Alert.alert("Error", error?.message || "Failed to add location");
    } finally {
      setAddingLocation(false);
    }
  };

  // ================= STEP NAVIGATION & VALIDATION =================
  const handleNextStep = () => {
    Keyboard.dismiss();
    setError("");
    if (currentStep === 1) {
      if (!shopName.trim() || !shopType || !ownerName.trim() || !phone.trim()) {
        setError("Please complete all shop details ⚠");
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!country || !state || !district || !city || !area) {
        setError("Please select all location details ⚠");
        return;
      }
      setCurrentStep(3);
    }
  };

  const handlePrevStep = () => {
    Keyboard.dismiss();
    setError("");
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigation.navigate("Login");
    }
  };

  // ================= REGISTRATION =================
  const handleRegister = async () => {
    Keyboard.dismiss();
    setError("");
    setMessage("");

    if (!email.trim() || !password || !confirmPassword) {
      setError("Please fill all account details ⚠");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match ❌");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        email: email.trim(),
        password,
        shopName: shopName.trim(),
        shopType,
        ownerName: ownerName.trim(),
        phone: phone.trim(),
        country: country.trim(),
        countryCode,
        state: state.trim(),
        district: district.trim(),
        city: city.trim(),
        area: area.trim(),
        address: generatedAddress,
        shopLat: null,
        shopLon: null,
        deliveryScope,
        shopImage: shopImage || null,
      };

      const response = await fetch(
        "https://us-central1-scaner-billing.cloudfunctions.net/registerSeller",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            data: payload,
          }),
        }
      );

      const responseText = await response.text();
      let responseJson;
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        throw new Error("Invalid response from Cloud Function");
      }

      if (!response.ok) {
        throw new Error(
          responseJson?.error?.message ||
            `Cloud Function failed (${response.status})`
        );
      }

      const resultData = responseJson?.result;
      if (!resultData) {
        throw new Error("Cloud Function returned no result");
      }

      setMessage(
        `Account created successfully 🎉\nShop UID: ${resultData.uid}`
      );

      setTimeout(() => {
        navigation.navigate("Login");
      }, 1800);
    } catch (e) {
      setError(
        `${e?.code || "unknown"}: ${
          e?.message || "Failed to create account."
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: darkMode ? theme.background : "#eef2ff", paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingVertical: 16,
            paddingHorizontal: 18,
            paddingBottom: 150,
          }}
        >
          <View style={[styles.card, { backgroundColor: darkMode ? theme.card : "#ffffff", shadowColor: "#000" }]}>
            {/* Top Navigation & Progress */}
            <View style={styles.stepHeader}>
              <TouchableOpacity onPress={handlePrevStep} style={styles.backBtn}>
                <Text style={[styles.backArrow, { color: darkMode ? theme.text : "#1e3a8a" }]}>←</Text>
              </TouchableOpacity>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width:
                        currentStep === 1
                          ? "33%"
                          : currentStep === 2
                          ? "66%"
                          : "100%",
                    },
                  ]}
                />
              </View>
              <Text style={[styles.stepCounterText, { color: darkMode ? theme.subText : "#64748b" }]}>{currentStep}/3</Text>
            </View>

            {/* STEP 1: SHOP INFORMATION */}
            {currentStep === 1 && (
              <View>
                <FastImage
                  source={require("../assets/scanner.gif")}
                  style={styles.topImage}
                  resizeMode={FastImage.resizeMode.contain}
                />
                <Text style={[styles.title, { color: darkMode ? theme.text : "#1e3a8a" }]}>Shop Details</Text>
                <Text style={[styles.subtitle, { color: darkMode ? theme.subText : "#64748b" }]}>
                  Enter your store and contact information
                </Text>

                {/* Shop Image / Banner Picker */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={[styles.labelText, { textAlign: "left", marginBottom: 8 }]}>
                    Shop / Store Display Image
                  </Text>
                  <TouchableOpacity onPress={pickShopImage} activeOpacity={0.8} style={styles.shopBannerContainer}>
                    {shopImage ? (
                      <Image source={{ uri: shopImage }} style={styles.shopBannerImage} />
                    ) : (
                      <View style={styles.shopBannerPlaceholder}>
                        <Ionicons name="image-outline" size={32} color="#2563eb" />
                        <Text style={{ color: "#475569", marginTop: 6, fontSize: 13, fontWeight: "500" }}>
                          Tap to upload Shop Image
                        </Text>
                      </View>
                    )}
                    <View style={styles.editBannerBtn}>
                      <Ionicons name="camera" size={16} color="#fff" />
                    </View>
                  </TouchableOpacity>
                </View>

                <TextInput
                  ref={inputRef("shopName")}
                  placeholder="Shop Name"
                  placeholderTextColor="#94a3b8"
                  style={[styles.input, { backgroundColor: darkMode ? theme.card : "#f8fafc", color: darkMode ? theme.text : "#111827", borderColor: darkMode ? theme.border : "#e2e8f0" }]}
                  value={shopName}
                  onChangeText={setShopName}
                  onFocus={() => focusInput("shopName")}
                />

                <TouchableOpacity
                  style={[styles.input, { justifyContent: "center", backgroundColor: darkMode ? theme.card : "#f8fafc", borderColor: darkMode ? theme.border : "#e2e8f0" }]}
                  onPress={() => setShowTypeDropdown(!showTypeDropdown)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={{
                      color: shopType ? (darkMode ? theme.text : "#111827") : "#94a3b8",
                      fontSize: 15,
                    }}
                  >
                    {shopType ? shopType : "Select Shop Type"}
                  </Text>
                </TouchableOpacity>

                {showTypeDropdown && (
                  <View style={[styles.dropdownContainer, { backgroundColor: darkMode ? theme.card : "#ffffff", borderColor: darkMode ? theme.border : "#e2e8f0" }]}>
                    {shopTypes.map((type, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.dropdownItem,
                          index === shopTypes.length - 1 && {
                            borderBottomWidth: 0,
                          },
                        ]}
                        onPress={() => {
                          setShopType(type);
                          setShowTypeDropdown(false);
                        }}
                      >
                        <Text style={[styles.dropdownText, { color: darkMode ? theme.text : "#334155" }]}>{type}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <TextInput
                  ref={inputRef("ownerName")}
                  placeholder="Owner Name"
                  placeholderTextColor="#94a3b8"
                  style={[styles.input, { backgroundColor: darkMode ? theme.card : "#f8fafc", color: darkMode ? theme.text : "#111827", borderColor: darkMode ? theme.border : "#e2e8f0" }]}
                  value={ownerName}
                  onChangeText={setOwnerName}
                  onFocus={() => focusInput("ownerName")}
                />

                <TextInput
                  ref={inputRef("phone")}
                  placeholder="Phone Number"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                  style={[styles.input, { backgroundColor: darkMode ? theme.card : "#f8fafc", color: darkMode ? theme.text : "#111827", borderColor: darkMode ? theme.border : "#e2e8f0" }]}
                  value={phone}
                  onChangeText={setPhone}
                  onFocus={() => focusInput("phone")}
                  returnKeyType="done"
                />
              </View>
            )}

            {/* STEP 2: LOCATION MASTER */}
            {currentStep === 2 && (
              <View>
                <Text style={[styles.title, { marginTop: 10, color: darkMode ? theme.text : "#1e3a8a" }]}>
                  Location Master
                </Text>
                <Text style={[styles.subtitle, { color: darkMode ? theme.subText : "#64748b" }]}>
                  Select or add your shop location hierarchy
                </Text>

                {/* Country */}
                <Text style={[styles.sectionLabel, { color: darkMode ? theme.subText : "#475569" }]}>Country</Text>
                <View style={[styles.locationSearchBox, { backgroundColor: darkMode ? theme.card : "#f8fafc", borderColor: darkMode ? theme.border : "#dbe4f0" }]}>
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    ref={inputRef("countrySearch")}
                    value={countrySearch}
                    onChangeText={(text) => {
                      setCountrySearch(text);
                      setShowCountryDropdown(true);
                    }}
                    placeholder={country || "Search Country"}
                    placeholderTextColor="#94a3b8"
                    style={[styles.locationSearchInput, { color: darkMode ? theme.text : "#111827" }]}
                    onFocus={() => focusInput("countrySearch")}
                  />
                </View>

                {showCountryDropdown && (
                  <View style={[styles.locationList, { backgroundColor: darkMode ? theme.card : "#ffffff", borderColor: darkMode ? theme.border : "#e2e8f0" }]}>
                    {countries
                      .filter((item) =>
                        item.name
                          .toLowerCase()
                          .includes(countrySearch.toLowerCase())
                      )
                      .map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.locationItem}
                          onPress={() => {
                            setCountry(item.name);
                            setCountryCode(item.id);
                            setCountrySearch(item.name);
                            setShowCountryDropdown(false);
                            setState("");
                            setDistrict("");
                            setCity("");
                            setArea("");
                            setStates([]);
                            setDistricts([]);
                            setCities([]);
                            setAreas([]);
                            loadStates(item.id);
                          }}
                        >
                          <Text style={[styles.locationItemText, { color: darkMode ? theme.text : "#334155" }]}>
                            {item.name}
                          </Text>
                        </TouchableOpacity>
                      ))}

                    <TouchableOpacity
                      style={styles.addLocationButton}
                      onPress={() => openAddLocation("Country")}
                    >
                      <Text style={styles.addLocationText}>
                        + Add New Country
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* State */}
                <Text style={[styles.sectionLabel, { color: darkMode ? theme.subText : "#475569" }]}>State</Text>
                <View
                  style={[
                    styles.locationSearchBox,
                    !countryCode && { opacity: 0.5 },
                  ]}
                >
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    ref={inputRef("stateSearch")}
                    editable={!!countryCode}
                    value={stateSearch}
                    onFocus={() => { setShowStateDropdown(true); focusInput("stateSearch"); }}
                    onChangeText={(text) => {
                      setStateSearch(text);
                      setShowStateDropdown(true);
                    }}
                    placeholder={state || "Search State"}
                    placeholderTextColor="#94a3b8"
                    style={[styles.locationSearchInput, { color: darkMode ? theme.text : "#111827" }]}
                  />
                </View>

                {showStateDropdown && countryCode && (
                  <View style={[styles.locationList, { backgroundColor: darkMode ? theme.card : "#ffffff", borderColor: darkMode ? theme.border : "#e2e8f0" }]}>
                    {states
                      .filter((item) =>
                        item.name
                          .toLowerCase()
                          .includes(stateSearch.toLowerCase())
                      )
                      .map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.locationItem}
                          onPress={() => {
                            setState(item.name);
                            setStateSearch(item.name);
                            setShowStateDropdown(false);
                            setDistrict("");
                            setCity("");
                            setArea("");
                            setDistricts([]);
                            setCities([]);
                            setAreas([]);
                            loadDistricts(item.name);
                          }}
                        >
                          <Text style={[styles.locationItemText, { color: darkMode ? theme.text : "#334155" }]}>
                            {item.name}
                          </Text>
                        </TouchableOpacity>
                      ))}

                    <TouchableOpacity
                      style={styles.addLocationButton}
                      onPress={() => openAddLocation("State")}
                    >
                      <Text style={styles.addLocationText}>+ Add New State</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* District */}
                <Text style={[styles.sectionLabel, { color: darkMode ? theme.subText : "#475569" }]}>District</Text>
                <View
                  style={[
                    styles.locationSearchBox,
                    !state && { opacity: 0.5 },
                  ]}
                >
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    ref={inputRef("districtSearch")}
                    editable={!!state}
                    value={districtSearch}
                    onFocus={() => { setShowDistrictDropdown(true); focusInput("districtSearch"); }}
                    onChangeText={(text) => {
                      setDistrictSearch(text);
                      setShowDistrictDropdown(true);
                    }}
                    placeholder={district || "Search District"}
                    placeholderTextColor="#94a3b8"
                    style={[styles.locationSearchInput, { color: darkMode ? theme.text : "#111827" }]}
                  />
                </View>

                {showDistrictDropdown && state && (
                  <View style={[styles.locationList, { backgroundColor: darkMode ? theme.card : "#ffffff", borderColor: darkMode ? theme.border : "#e2e8f0" }]}>
                    {districts
                      .filter((item) =>
                        item.name
                          .toLowerCase()
                          .includes(districtSearch.toLowerCase())
                      )
                      .map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.locationItem}
                          onPress={() => {
                            setDistrict(item.name);
                            setDistrictSearch(item.name);
                            setShowDistrictDropdown(false);
                            setCity("");
                            setArea("");
                            setCities([]);
                            setAreas([]);
                            loadCities(state, item.name);
                          }}
                        >
                          <Text style={[styles.locationItemText, { color: darkMode ? theme.text : "#334155" }]}>
                            {item.name}
                          </Text>
                        </TouchableOpacity>
                      ))}

                    <TouchableOpacity
                      style={styles.addLocationButton}
                      onPress={() => openAddLocation("District")}
                    >
                      <Text style={styles.addLocationText}>
                        + Add New District
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* City */}
                <Text style={[styles.sectionLabel, { color: darkMode ? theme.subText : "#475569" }]}>City</Text>
                <View
                  style={[
                    styles.locationSearchBox,
                    !district && { opacity: 0.5 },
                  ]}
                >
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    ref={inputRef("citySearch")}
                    editable={!!district}
                    value={citySearch}
                    onFocus={() => { setShowCityDropdown(true); focusInput("citySearch"); }}
                    onChangeText={(text) => {
                      setCitySearch(text);
                      setShowCityDropdown(true);
                    }}
                    placeholder={city || "Search City"}
                    placeholderTextColor="#94a3b8"
                    style={[styles.locationSearchInput, { color: darkMode ? theme.text : "#111827" }]}
                  />
                </View>

                {showCityDropdown && district && (
                  <View style={[styles.locationList, { backgroundColor: darkMode ? theme.card : "#ffffff", borderColor: darkMode ? theme.border : "#e2e8f0" }]}>
                    {cities
                      .filter((item) =>
                        item.name
                          .toLowerCase()
                          .includes(citySearch.toLowerCase())
                      )
                      .map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.locationItem}
                          onPress={() => {
                            setCity(item.name);
                            setCitySearch(item.name);
                            setShowCityDropdown(false);
                            setArea("");
                            setAreas([]);
                            loadAreas(state, district, item.name);
                          }}
                        >
                          <Text style={[styles.locationItemText, { color: darkMode ? theme.text : "#334155" }]}>
                            {item.name}
                          </Text>
                        </TouchableOpacity>
                      ))}

                    <TouchableOpacity
                      style={styles.addLocationButton}
                      onPress={() => openAddLocation("City")}
                    >
                      <Text style={styles.addLocationText}>+ Add New City</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Area */}
                <Text style={[styles.sectionLabel, { color: darkMode ? theme.subText : "#475569" }]}>Area</Text>
                <View
                  style={[
                    styles.locationSearchBox,
                    !city && { opacity: 0.5 },
                  ]}
                >
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    ref={inputRef("areaSearch")}
                    editable={!!city}
                    value={areaSearch}
                    onFocus={() => { setShowAreaDropdown(true); focusInput("areaSearch"); }}
                    onChangeText={(text) => {
                      setAreaSearch(text);
                      setShowAreaDropdown(true);
                    }}
                    placeholder={area || "Search Area"}
                    placeholderTextColor="#94a3b8"
                    style={[styles.locationSearchInput, { color: darkMode ? theme.text : "#111827" }]}
                  />
                </View>

                {showAreaDropdown && city && (
                  <View style={[styles.locationList, { backgroundColor: darkMode ? theme.card : "#ffffff", borderColor: darkMode ? theme.border : "#e2e8f0" }]}>
                    {areas
                      .filter((item) =>
                        item.name
                          .toLowerCase()
                          .includes(areaSearch.toLowerCase())
                      )
                      .map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.locationItem}
                          onPress={() => {
                            setArea(item.name);
                            setAreaSearch(item.name);
                            setShowAreaDropdown(false);
                          }}
                        >
                          <Text style={[styles.locationItemText, { color: darkMode ? theme.text : "#334155" }]}>
                            {item.name}
                          </Text>
                        </TouchableOpacity>
                      ))}

                    <TouchableOpacity
                      style={styles.addLocationButton}
                      onPress={() => openAddLocation("Area")}
                    >
                      <Text style={styles.addLocationText}>+ Add New Area</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* STEP 3: ACCOUNT & CREDENTIALS */}
            {currentStep === 3 && (
              <View>
                <Text style={[styles.title, { marginTop: 10, color: darkMode ? theme.text : "#1e3a8a" }]}>Account</Text>
                <Text style={[styles.subtitle, { color: darkMode ? theme.subText : "#64748b" }]}>
                  Set up your login credentials
                </Text>

                <TextInput
                  ref={inputRef("email")}
                  placeholder="Email"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={[styles.input, { backgroundColor: darkMode ? theme.card : "#f8fafc", color: darkMode ? theme.text : "#111827", borderColor: darkMode ? theme.border : "#e2e8f0" }]}
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => focusInput("email")}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />

                {/* Password Input with Vector Icon Toggle */}
                <View style={[styles.passwordContainer, { backgroundColor: darkMode ? theme.card : "#f8fafc", borderColor: darkMode ? theme.border : "#e2e8f0" }]}>
                  <TextInput
                    ref={node => { passwordRef.current = node; inputRef("password")(node); }}
                    placeholder="Password"
                    placeholderTextColor="#94a3b8"
                    style={[styles.passwordInput, { color: darkMode ? theme.text : "#111827" }]}
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => focusInput("password")}
                    textContentType="newPassword"
                    returnKeyType="next"
                    onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={showPassword ? "eye-outline" : "eye-off-outline"}
                      size={20}
                      color="#64748b"
                    />
                  </TouchableOpacity>
                </View>

                {/* Confirm Password Input with Vector Icon Toggle */}
                <View style={[styles.passwordContainer, { backgroundColor: darkMode ? theme.card : "#f8fafc", borderColor: darkMode ? theme.border : "#e2e8f0" }]}>
                  <TextInput
                    ref={node => { confirmPasswordRef.current = node; inputRef("confirmPassword")(node); }}
                    placeholder="Confirm Password"
                    placeholderTextColor="#94a3b8"
                    style={[styles.passwordInput, { color: darkMode ? theme.text : "#111827" }]}
                    secureTextEntry={!showConfirmPassword}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onFocus={() => focusInput("confirmPassword")}
                    textContentType="newPassword"
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={styles.eyeBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={
                        showConfirmPassword ? "eye-outline" : "eye-off-outline"
                      }
                      size={20}
                      color="#64748b"
                    />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Add Location Modal */}
            {showAddLocation && (
              <View style={styles.addLocationModalOverlay}>
                <View style={[styles.addLocationModal, { backgroundColor: darkMode ? theme.card : "#ffffff" }]}>
                  <Text style={[styles.addLocationTitle, { color: darkMode ? theme.text : "#1e3a8a" }]}>
                    Add New {addLocationType}
                  </Text>
                  <TextInput
                    ref={inputRef("newLocationName")}
                    value={newLocationName}
                    onChangeText={setNewLocationName}
                    placeholder={`${addLocationType} Name`}
                    placeholderTextColor="#94a3b8"
                    autoFocus
                    style={[styles.input, { backgroundColor: darkMode ? theme.card : "#f8fafc", color: darkMode ? theme.text : "#111827", borderColor: darkMode ? theme.border : "#e2e8f0" }]}
                    onFocus={() => focusInput("newLocationName")}
                  />
                  <View style={styles.addLocationActions}>
                    <TouchableOpacity
                      style={styles.cancelAddButton}
                      onPress={() => {
                        setShowAddLocation(false);
                        setNewLocationName("");
                      }}
                    >
                      <Text style={styles.cancelAddText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.confirmAddButton}
                      onPress={saveNewLocation}
                      disabled={addingLocation}
                    >
                      {addingLocation ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.confirmAddText}>Add</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* Bottom Actions */}
            {currentStep < 3 ? (
              <TouchableOpacity
                style={styles.button}
                onPress={handleNextStep}
                activeOpacity={0.8}
              >
                <Text style={styles.btnText}>Continue</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.button}
                onPress={handleRegister}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Create Account</Text>
                )}
              </TouchableOpacity>
            )}

            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {message ? <Text accessibilityRole="alert" style={styles.success}>{message}</Text> : null}

            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <Text style={styles.link}>← Back to Login</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderRadius: 26,
    padding: 22,
    shadowColor: "#14532d",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  backBtn: {
    paddingRight: 12,
    paddingVertical: 4,
  },
  backArrow: {
    fontSize: 22,
    color: "#1e3a8a",
    fontWeight: "bold",
  },
  progressBarBg: {
    flex: 1,
    height: 7,
    backgroundColor: "#e2e8f0",
    borderRadius: 10,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#2563eb",
    borderRadius: 10,
  },
  stepCounterText: {
    marginLeft: 12,
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
  },
  topImage: {
    width: 210,
    height: 118,
    alignSelf: "center",
    marginBottom: 5,
  },
  title: {
    fontSize: 30,
    color: "#1e3a8a",
    marginBottom: 6,
    textAlign: "center",
    fontWeight: "bold",
  },
  subtitle: {
    textAlign: "center",
    color: "#64748b",
    marginBottom: 18,
    fontSize: 14,
  },
  shopBannerContainer: {
    width: "100%",
    height: 132,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  shopBannerImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  shopBannerPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  editBannerBtn: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  labelText: {
    fontWeight: "700",
    color: "#475569",
    fontSize: 13,
    marginLeft: 4,
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
    minHeight: 54,
    paddingHorizontal: 15,
    paddingVertical: 13,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    fontSize: 15,
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  passwordInput: {
    flex: 1,
    color: "#111827",
    paddingVertical: 13,
    fontSize: 15,
  },
  eyeBtn: {
    paddingLeft: 10,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
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
    minHeight: 54,
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderRadius: 14,
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
    marginTop: 20,
    textAlign: "center",
    fontWeight: "600",
  },
  locationSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#dbe4f0",
    borderRadius: 16,
    minHeight: 56,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  locationSearchInput: {
    flex: 1,
    color: "#111827",
    fontSize: 15,
    paddingVertical: 14,
  },
  locationList: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 15,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  locationItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  locationItemText: {
    fontSize: 15,
    color: "#334155",
  },
  addLocationButton: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    backgroundColor: "#eff6ff",
  },
  addLocationText: {
    color: "#2563eb",
    fontSize: 15,
    fontWeight: "700",
  },
  addLocationModalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  addLocationModal: {
    width: "88%",
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 22,
    elevation: 10,
  },
  addLocationTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1e3a8a",
    marginBottom: 18,
  },
  addLocationActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  cancelAddButton: {
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
  },
  cancelAddText: {
    color: "#475569",
    fontWeight: "700",
  },
  confirmAddButton: {
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: "#2563eb",
  },
  confirmAddText: {
    color: "#fff",
    fontWeight: "700",
  },
});
