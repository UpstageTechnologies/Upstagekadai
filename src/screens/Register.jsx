import React, { useEffect, useState } from "react";
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
  Alert,
} from "react-native";
import { auth } from "../utils/firebaseConfig";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import Ionicons from "react-native-vector-icons/Ionicons";
import FastImage from "react-native-fast-image";
import { LogBox } from "react-native";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
} from "firebase/firestore";

LogBox.ignoreLogs(["VirtualizedLists should never be nested"]);

export default function RegisterScreen({ navigation }) {
  // Step State (1: Shop Info, 2: Location Master, 3: Account Info)
  const [currentStep, setCurrentStep] = useState(1);

  const [shopName, setShopName] = useState("");
  const [shopType, setShopType] = useState("");
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const shopTypes = ["Store", "Super Market", "Factory", "Medical", "Other"];

  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");

  const [deliveryScope] = useState("Local");

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

  useEffect(() => {
    loadCountries();
  }, []);

  const db = getFirestore(auth.app);

  const makeDocId = (value) => {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  // ================= LOAD LOCATIONS =================
  const loadCountries = async () => {
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
  };

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

      if (addLocationType === "Country") {
        await setDoc(doc(db, "location_master", newId), {
          name: value,
          code: newId.toUpperCase(),
          type: "country",
          isActive: true,
        });
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
        await setDoc(
          doc(db, "location_master", countryCode, "states", newId),
          {
            name: value,
            type: "state",
            country: countryCode,
            isActive: true,
          }
        );
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
        await setDoc(
          doc(
            db,
            "location_master",
            countryCode,
            "states",
            makeDocId(state),
            "districts",
            newId
          ),
          {
            name: value,
            type: "district",
            country: countryCode,
            state: state,
            isActive: true,
          }
        );
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
        await setDoc(
          doc(
            db,
            "location_master",
            countryCode,
            "states",
            makeDocId(state),
            "districts",
            makeDocId(district),
            "cities",
            newId
          ),
          {
            name: value,
            type: "city",
            country: countryCode,
            state: state,
            district: district,
            isActive: true,
          }
        );
        await loadCities(state, district);
        setCity(value);
        setArea("");
        setAreas([]);
        await loadAreas(state, district, value);
        setCitySearch("");
      }

      if (addLocationType === "Area") {
        await setDoc(
          doc(
            db,
            "location_master",
            countryCode,
            "states",
            makeDocId(state),
            "districts",
            makeDocId(district),
            "cities",
            makeDocId(city),
            "areas",
            newId
          ),
          {
            name: value,
            type: "area",
            country: countryCode,
            state: state,
            district: district,
            city: city,
            isActive: true,
          }
        );
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
    setError("");
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigation.navigate("Login");
    }
  };

  // ================= REGISTRATION =================
  const handleRegister = async () => {
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
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: "#eef2ff",
        paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
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
            paddingVertical: 25,
            paddingHorizontal: 20,
          }}
        >
          <View style={styles.card}>
            {/* Top Navigation & Progress */}
            <View style={styles.stepHeader}>
              <TouchableOpacity onPress={handlePrevStep} style={styles.backBtn}>
                <Text style={styles.backArrow}>←</Text>
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
              <Text style={styles.stepCounterText}>{currentStep}/3</Text>
            </View>

            {/* STEP 1: SHOP INFORMATION */}
            {currentStep === 1 && (
              <View>
                <FastImage
                  source={require("../assets/scanner.gif")}
                  style={styles.topImage}
                  resizeMode={FastImage.resizeMode.contain}
                />
                <Text style={styles.title}>Shop Details</Text>
                <Text style={styles.subtitle}>
                  Enter your store and contact information
                </Text>

                <TextInput
                  placeholder="Shop Name"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  value={shopName}
                  onChangeText={setShopName}
                />

                <TouchableOpacity
                  style={[styles.input, { justifyContent: "center" }]}
                  onPress={() => setShowTypeDropdown(!showTypeDropdown)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={{
                      color: shopType ? "#111827" : "#94a3b8",
                      fontSize: 15,
                    }}
                  >
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
                          index === shopTypes.length - 1 && {
                            borderBottomWidth: 0,
                          },
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
                  value={ownerName}
                  onChangeText={setOwnerName}
                />

                <TextInput
                  placeholder="Phone Number"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                />
              </View>
            )}

            {/* STEP 2: LOCATION MASTER */}
            {currentStep === 2 && (
              <View>
                <Text style={[styles.title, { marginTop: 10 }]}>
                  Location Master
                </Text>
                <Text style={styles.subtitle}>
                  Select or add your shop location hierarchy
                </Text>

                {/* Country */}
                <Text style={styles.sectionLabel}>Country</Text>
                <View style={styles.locationSearchBox}>
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    value={countrySearch}
                    onChangeText={(text) => {
                      setCountrySearch(text);
                      setShowCountryDropdown(true);
                    }}
                    placeholder={country || "Search Country"}
                    placeholderTextColor="#94a3b8"
                    style={styles.locationSearchInput}
                  />
                </View>

                {showCountryDropdown && (
                  <View style={styles.locationList}>
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
                          <Text style={styles.locationItemText}>
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
                <Text style={styles.sectionLabel}>State</Text>
                <View
                  style={[
                    styles.locationSearchBox,
                    !countryCode && { opacity: 0.5 },
                  ]}
                >
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    editable={!!countryCode}
                    value={stateSearch}
                    onFocus={() => setShowStateDropdown(true)}
                    onChangeText={(text) => {
                      setStateSearch(text);
                      setShowStateDropdown(true);
                    }}
                    placeholder={state || "Search State"}
                    placeholderTextColor="#94a3b8"
                    style={styles.locationSearchInput}
                  />
                </View>

                {showStateDropdown && countryCode && (
                  <View style={styles.locationList}>
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
                          <Text style={styles.locationItemText}>
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
                <Text style={styles.sectionLabel}>District</Text>
                <View
                  style={[
                    styles.locationSearchBox,
                    !state && { opacity: 0.5 },
                  ]}
                >
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    editable={!!state}
                    value={districtSearch}
                    onFocus={() => setShowDistrictDropdown(true)}
                    onChangeText={(text) => {
                      setDistrictSearch(text);
                      setShowDistrictDropdown(true);
                    }}
                    placeholder={district || "Search District"}
                    placeholderTextColor="#94a3b8"
                    style={styles.locationSearchInput}
                  />
                </View>

                {showDistrictDropdown && state && (
                  <View style={styles.locationList}>
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
                          <Text style={styles.locationItemText}>
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
                <Text style={styles.sectionLabel}>City</Text>
                <View
                  style={[
                    styles.locationSearchBox,
                    !district && { opacity: 0.5 },
                  ]}
                >
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    editable={!!district}
                    value={citySearch}
                    onFocus={() => setShowCityDropdown(true)}
                    onChangeText={(text) => {
                      setCitySearch(text);
                      setShowCityDropdown(true);
                    }}
                    placeholder={city || "Search City"}
                    placeholderTextColor="#94a3b8"
                    style={styles.locationSearchInput}
                  />
                </View>

                {showCityDropdown && district && (
                  <View style={styles.locationList}>
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
                          <Text style={styles.locationItemText}>
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
                <Text style={styles.sectionLabel}>Area</Text>
                <View
                  style={[
                    styles.locationSearchBox,
                    !city && { opacity: 0.5 },
                  ]}
                >
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    editable={!!city}
                    value={areaSearch}
                    onFocus={() => setShowAreaDropdown(true)}
                    onChangeText={(text) => {
                      setAreaSearch(text);
                      setShowAreaDropdown(true);
                    }}
                    placeholder={area || "Search Area"}
                    placeholderTextColor="#94a3b8"
                    style={styles.locationSearchInput}
                  />
                </View>

                {showAreaDropdown && city && (
                  <View style={styles.locationList}>
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
                          <Text style={styles.locationItemText}>
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
                <Text style={[styles.title, { marginTop: 10 }]}>Account</Text>
                <Text style={styles.subtitle}>
                  Set up your login credentials
                </Text>

                <TextInput
                  placeholder="Email"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                />

                {/* Password Input with Vector Icon Toggle */}
                <View style={styles.passwordContainer}>
                  <TextInput
                    placeholder="Password"
                    placeholderTextColor="#94a3b8"
                    style={styles.passwordInput}
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
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
                <View style={styles.passwordContainer}>
                  <TextInput
                    placeholder="Confirm Password"
                    placeholderTextColor="#94a3b8"
                    style={styles.passwordInput}
                    secureTextEntry={!showConfirmPassword}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
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
                <View style={styles.addLocationModal}>
                  <Text style={styles.addLocationTitle}>
                    Add New {addLocationType}
                  </Text>
                  <TextInput
                    value={newLocationName}
                    onChangeText={setNewLocationName}
                    placeholder={`${addLocationType} Name`}
                    placeholderTextColor="#94a3b8"
                    autoFocus
                    style={styles.input}
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
    width: 320,
    height: 230,
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
    marginBottom: 20,
    fontSize: 14,
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
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 15,
    paddingHorizontal: 16,
  },
  passwordInput: {
    flex: 1,
    color: "#111827",
    paddingVertical: 16,
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