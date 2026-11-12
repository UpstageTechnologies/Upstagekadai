import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  Switch,
  KeyboardAvoidingView,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { auth, db, storage } from "../../utils/firebaseConfig";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { launchImageLibrary } from "react-native-image-picker";
import { useTheme } from "../../theme/ThemeContext";

const DEFAULT_CATEGORIES = [
  "Starters",
  "Main Course",
  "Breads",
  "Rice & Biryani",
  "Beverages",
  "Desserts",
  "Snacks",
  "Combos",
];

const DIET_TYPES = [
  { id: "veg", label: "Veg", color: "#16a34a", icon: "circle-slice-8" },
  { id: "non-veg", label: "Non-Veg", color: "#dc2626", icon: "triangle" },
  { id: "egg", label: "Contains Egg", color: "#d97706", icon: "egg" },
];

export default function AddFoodsScreen({ navigation, route }) {
  const itemToEdit = route?.params?.itemToEdit || null;
  const isEditing = Boolean(itemToEdit?.id);

  const themeContext = useTheme() || {};
  const theme = themeContext.theme || {};
  const darkMode = Boolean(themeContext.darkMode);

  // Form Fields
  const [foodName, setFoodName] = useState(itemToEdit?.name || itemToEdit?.itemName || "");
  const [sellingPrice, setSellingPrice] = useState(
    itemToEdit?.price ? String(itemToEdit.price) : itemToEdit?.salesPrice ? String(itemToEdit.salesPrice) : ""
  );
  const [costPrice, setCostPrice] = useState(
    itemToEdit?.purchasePrice ? String(itemToEdit.purchasePrice) : ""
  );
  const [category, setCategory] = useState(itemToEdit?.category || "Main Course");
  const [customCategory, setCustomCategory] = useState("");
  const [showCustomCatInput, setShowCustomCatInput] = useState(false);
  const [categoriesList, setCategoriesList] = useState(DEFAULT_CATEGORIES);

  const [description, setDescription] = useState(itemToEdit?.description || "");
  const [dietType, setDietType] = useState(itemToEdit?.dietType || "veg");
  const [isAvailable, setIsAvailable] = useState(itemToEdit?.isAvailable !== false);
  const [servingNotes, setServingNotes] = useState(itemToEdit?.servingNotes || "");
  const [foodImage, setFoodImage] = useState(itemToEdit?.imageUrl || itemToEdit?.image || null);

  // Variants (Optional Size pricing: e.g. Half / Full)
  const [hasVariants, setHasVariants] = useState(Boolean(itemToEdit?.variants && itemToEdit.variants.length > 0));
  const [variants, setVariants] = useState(
    itemToEdit?.variants && itemToEdit.variants.length > 0
      ? itemToEdit.variants
      : [
          { name: "Half", price: "" },
          { name: "Full", price: "" },
        ]
  );

  // State
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [allFoods, setAllFoods] = useState([]);
  const [activeTab, setActiveTab] = useState(isEditing ? "form" : "form"); // "form" | "recent"

  const user = auth.currentUser;

  // Listen to existing categories & foods
  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(
      collection(db, "users", user.uid, "restaurant_menu"),
      (snapshot) => {
        const foods = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAllFoods(foods);

        // Extract custom categories
        const existingCats = new Set(DEFAULT_CATEGORIES);
        foods.forEach((f) => {
          if (f.category && typeof f.category === "string") {
            existingCats.add(f.category.trim());
          }
        });
        setCategoriesList(Array.from(existingCats));
      },
      (err) => {
        console.log("Restaurant menu listener handled offline:", err);
      }
    );

    return () => unsub();
  }, [user]);

  // Pick Image from device library
  const handlePickImage = () => {
    launchImageLibrary(
      {
        mediaType: "photo",
        maxWidth: 900,
        maxHeight: 900,
        quality: 0.8,
      },
      async (res) => {
        if (res.didCancel || res.errorCode) return;
        if (res.assets && res.assets.length > 0) {
          const pickedAsset = res.assets[0];
          if (pickedAsset.uri) {
            setFoodImage(pickedAsset.uri);
          }
        }
      }
    );
  };

  // Upload image to Firebase Storage if it's a local URI
  const uploadImageIfLocal = async (localUri) => {
    if (!localUri || localUri.startsWith("http://") || localUri.startsWith("https://")) {
      return localUri;
    }
    if (!user) return localUri;

    try {
      setUploadingImage(true);
      const response = await fetch(localUri);
      const blob = await response.blob();
      const ext = localUri.endsWith(".png") ? "png" : "jpg";
      const contentType = ext === "png" ? "image/png" : "image/jpeg";
      const filename = `restaurant_foods/${user.uid}_${Date.now()}.${ext}`;
      const storageRef = ref(storage, filename);

      const uploadTask = await uploadBytesResumable(storageRef, blob, { contentType });
      const downloadUrl = await getDownloadURL(uploadTask.ref);
      return downloadUrl;
    } catch (err) {
      console.log("Image upload to Firebase Storage error, keeping local:", err);
      return localUri;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAddCustomCategory = () => {
    const trimmed = customCategory.trim();
    if (!trimmed) {
      setShowCustomCatInput(false);
      return;
    }
    if (!categoriesList.includes(trimmed)) {
      setCategoriesList([...categoriesList, trimmed]);
    }
    setCategory(trimmed);
    setCustomCategory("");
    setShowCustomCatInput(false);
  };

  const handleUpdateVariant = (index, field, value) => {
    const updated = [...variants];
    updated[index][field] = value;
    setVariants(updated);
  };

  const handleAddVariantRow = () => {
    setVariants([...variants, { name: "", price: "" }]);
  };

  const handleRemoveVariantRow = (index) => {
    if (variants.length <= 1) return;
    setVariants(variants.filter((_, i) => i !== index));
  };

  const validateForm = () => {
    if (!foodName.trim()) {
      Alert.alert("Validation Error", "Please enter food name.");
      return false;
    }

    const priceNum = Number(sellingPrice);
    if (!hasVariants && (isNaN(priceNum) || priceNum <= 0)) {
      Alert.alert("Validation Error", "Please enter a valid selling price greater than 0.");
      return false;
    }

    if (hasVariants) {
      const validVariants = variants.filter((v) => v.name.trim() && Number(v.price) > 0);
      if (validVariants.length === 0) {
        Alert.alert("Validation Error", "Please provide at least one valid variant with name and price.");
        return false;
      }
    }

    return true;
  };

  const handleSaveFood = async () => {
    if (!validateForm()) return;
    if (saving) return; // Prevent duplicate submission

    if (!user) {
      Alert.alert("Error", "You must be logged in to manage foods.");
      return;
    }

    setSaving(true);
    try {
      // 1. Process image
      let uploadedUrl = foodImage;
      if (foodImage && !foodImage.startsWith("http")) {
        uploadedUrl = await uploadImageIfLocal(foodImage);
      }

      const effectivePrice = Number(sellingPrice) || 0;
      const effectiveCost = Number(costPrice) || 0;

      const cleanedVariants = hasVariants
        ? variants
            .filter((v) => v.name.trim() && Number(v.price) > 0)
            .map((v) => ({ name: v.name.trim(), price: Number(v.price) }))
        : [];

      const foodPayload = {
        name: foodName.trim(),
        itemName: foodName.trim(),
        price: effectivePrice,
        salesPrice: effectivePrice,
        purchasePrice: effectiveCost,
        category: category.trim() || "Main Course",
        description: description.trim(),
        dietType,
        isAvailable,
        servingNotes: servingNotes.trim(),
        imageUrl: uploadedUrl || null,
        image: uploadedUrl || null,
        variants: cleanedVariants,
        hasVariants: cleanedVariants.length > 0,
        updatedAt: serverTimestamp(),
      };

      if (isEditing && itemToEdit?.id) {
        await updateDoc(doc(db, "users", user.uid, "restaurant_menu", itemToEdit.id), foodPayload);
        Alert.alert("Success 🎉", "Food item updated successfully!", [
          {
            text: "OK",
            onPress: () => {
              if (navigation.canGoBack()) navigation.goBack();
              else navigation.navigate("Dashboard");
            },
          },
        ]);
      } else {
        foodPayload.createdAt = serverTimestamp();
        await addDoc(collection(db, "users", user.uid, "restaurant_menu"), foodPayload);

        Alert.alert("Success 🎉", `"${foodName.trim()}" has been added to your menu!`, [
          {
            text: "Add Another",
            onPress: () => {
              setFoodName("");
              setSellingPrice("");
              setCostPrice("");
              setDescription("");
              setServingNotes("");
              setFoodImage(null);
            },
          },
          {
            text: "Go to Sales Billing",
            onPress: () => navigation.navigate("Sales"),
          },
          {
            text: "View Menu",
            onPress: () => {
              if (navigation.canGoBack()) navigation.goBack();
              else navigation.navigate("Dashboard");
            },
          },
        ]);
      }
    } catch (err) {
      console.log("Error saving food:", err);
      Alert.alert("Save Failed ❌", err.message || "Failed to save food item.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFood = (item) => {
    Alert.alert(
      "Confirm Delete",
      `Are you sure you want to delete "${item.name || item.itemName}" from your menu?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (!user) return;
              await deleteDoc(doc(db, "users", user.uid, "restaurant_menu", item.id));
              Alert.alert("Deleted", "Food item removed from menu.");
            } catch (e) {
              Alert.alert("Error", "Could not delete food: " + e.message);
            }
          },
        },
      ]
    );
  };

  const handleToggleAvailability = async (item) => {
    try {
      if (!user) return;
      const newStatus = !(item.isAvailable !== false);
      await updateDoc(doc(db, "users", user.uid, "restaurant_menu", item.id), {
        isAvailable: newStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      Alert.alert("Error", "Could not update availability: " + e.message);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: darkMode ? theme.background : "#f8fafc" }]}>
      <StatusBar
        barStyle={darkMode ? "light-content" : "dark-content"}
        backgroundColor={darkMode ? theme.background : "#ffffff"}
      />

      {/* HEADER */}
      <View style={[styles.header, { backgroundColor: darkMode ? theme.card : "#ffffff" }]}>
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate("Dashboard");
          }}
          style={styles.backBtn}
        >
          <Icon name="arrow-left" size={24} color={darkMode ? theme.text : "#1e293b"} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: darkMode ? theme.text : "#1e293b" }]}>
            {isEditing ? "Edit Food Item" : "Add Foods"}
          </Text>
          <Text style={styles.headerSubtitle}>Restaurant Menu Management</Text>
        </View>

        <TouchableOpacity
          style={styles.headerActionBtn}
          onPress={() => navigation.navigate("Sales")}
          activeOpacity={0.8}
        >
          <Icon name="cash-register" size={20} color="#6366f1" />
          <Text style={styles.headerActionText}>Billing</Text>
        </TouchableOpacity>
      </View>

      {/* TAB SELECTOR (Add Form vs Saved Items) */}
      <View style={[styles.tabRow, { backgroundColor: darkMode ? theme.card : "#e2e8f0" }]}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "form" && styles.tabBtnActive]}
          onPress={() => setActiveTab("form")}
        >
          <Icon
            name="silverware-fork-knife"
            size={18}
            color={activeTab === "form" ? "#ffffff" : "#64748b"}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabText, activeTab === "form" && styles.tabTextActive]}>
            {isEditing ? "Edit Details" : "Food Form"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "recent" && styles.tabBtnActive]}
          onPress={() => setActiveTab("recent")}
        >
          <Icon
            name="book-open-page-variant"
            size={18}
            color={activeTab === "recent" ? "#ffffff" : "#64748b"}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabText, activeTab === "recent" && styles.tabTextActive]}>
            Menu List ({allFoods.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === "form" ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* 1. FOOD IMAGE PICKER */}
            <View style={styles.sectionCard}>
              <Text style={styles.fieldLabel}>Food Image (Optional)</Text>
              <TouchableOpacity
                onPress={handlePickImage}
                activeOpacity={0.8}
                style={[
                  styles.imageUploadBox,
                  { backgroundColor: darkMode ? "#1e293b" : "#f1f5f9" },
                ]}
              >
                {foodImage ? (
                  <View style={{ width: "100%", height: "100%" }}>
                    <Image source={{ uri: foodImage }} style={styles.uploadedPreview} resizeMode="cover" />
                    <View style={styles.imageOverlayBadge}>
                      <Icon name="camera" size={16} color="#fff" />
                      <Text style={{ color: "#fff", fontSize: 12, marginLeft: 4, fontWeight: "600" }}>Change</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Icon name="camera-plus-outline" size={36} color="#6366f1" />
                    <Text style={styles.imagePlaceholderText}>Tap to upload food photo</Text>
                    <Text style={styles.imagePlaceholderSub}>JPEG, PNG up to 5MB</Text>
                  </View>
                )}
              </TouchableOpacity>
              {foodImage && (
                <TouchableOpacity onPress={() => setFoodImage(null)} style={styles.removeImageBtn}>
                  <Text style={{ color: "#ef4444", fontSize: 12, fontWeight: "600" }}>Remove Image</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 2. FOOD NAME & DIET TYPE */}
            <View style={styles.sectionCard}>
              <Text style={styles.fieldLabel}>
                Food Name <Text style={{ color: "#ef4444" }}>*</Text>
              </Text>
              <TextInput
                placeholder="e.g. Paneer Butter Masala, Chicken Biryani"
                placeholderTextColor="#94a3b8"
                value={foodName}
                onChangeText={setFoodName}
                style={[styles.input, { color: darkMode ? "#ffffff" : "#111827" }]}
              />

              {/* Diet Type Selector */}
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Dietary Preference</Text>
              <View style={styles.dietRow}>
                {DIET_TYPES.map((dt) => {
                  const selected = dietType === dt.id;
                  return (
                    <TouchableOpacity
                      key={dt.id}
                      onPress={() => setDietType(dt.id)}
                      style={[
                        styles.dietOption,
                        selected && { borderColor: dt.color, backgroundColor: `${dt.color}15` },
                      ]}
                    >
                      <Icon name={dt.icon} size={16} color={dt.color} style={{ marginRight: 6 }} />
                      <Text style={[styles.dietText, selected && { color: dt.color, fontWeight: "700" }]}>
                        {dt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 3. CATEGORY SELECTION */}
            <View style={styles.sectionCard}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.fieldLabel}>
                  Food Category <Text style={{ color: "#ef4444" }}>*</Text>
                </Text>
                <TouchableOpacity onPress={() => setShowCustomCatInput(!showCustomCatInput)}>
                  <Text style={{ color: "#6366f1", fontSize: 13, fontWeight: "700" }}>
                    {showCustomCatInput ? "Cancel" : "+ Custom Category"}
                  </Text>
                </TouchableOpacity>
              </View>

              {showCustomCatInput && (
                <View style={styles.customCatRow}>
                  <TextInput
                    placeholder="Enter new category name..."
                    placeholderTextColor="#94a3b8"
                    value={customCategory}
                    onChangeText={setCustomCategory}
                    style={[styles.customCatInput, { color: darkMode ? "#ffffff" : "#111827" }]}
                  />
                  <TouchableOpacity onPress={handleAddCustomCategory} style={styles.customCatAddBtn}>
                    <Text style={{ color: "#fff", fontWeight: "700" }}>Add</Text>
                  </TouchableOpacity>
                </View>
              )}

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {categoriesList.map((cat) => {
                  const isSelected = category === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setCategory(cat)}
                      style={[
                        styles.categoryPill,
                        isSelected && styles.categoryPillActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryPillText,
                          isSelected && styles.categoryPillTextActive,
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* 4. PRICING & VARIANTS */}
            <View style={styles.sectionCard}>
              <View style={styles.switchRow}>
                <View>
                  <Text style={styles.fieldLabel}>Has Portion Variants?</Text>
                  <Text style={styles.fieldHint}>e.g. Half / Full, Regular / Large</Text>
                </View>
                <Switch
                  value={hasVariants}
                  onValueChange={setHasVariants}
                  trackColor={{ false: "#cbd5e1", true: "#818cf8" }}
                  thumbColor={hasVariants ? "#6366f1" : "#f1f5f9"}
                />
              </View>

              {!hasVariants ? (
                <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>
                      Selling Price (₹) <Text style={{ color: "#ef4444" }}>*</Text>
                    </Text>
                    <TextInput
                      placeholder="e.g. 250"
                      placeholderTextColor="#94a3b8"
                      keyboardType="numeric"
                      value={sellingPrice}
                      onChangeText={setSellingPrice}
                      style={[styles.input, { color: darkMode ? "#ffffff" : "#111827" }]}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Cost / Prep Price (₹)</Text>
                    <TextInput
                      placeholder="e.g. 120"
                      placeholderTextColor="#94a3b8"
                      keyboardType="numeric"
                      value={costPrice}
                      onChangeText={setCostPrice}
                      style={[styles.input, { color: darkMode ? "#ffffff" : "#111827" }]}
                    />
                  </View>
                </View>
              ) : (
                <View style={{ marginTop: 12 }}>
                  {variants.map((v, idx) => (
                    <View key={idx} style={styles.variantRow}>
                      <TextInput
                        placeholder="Variant (e.g. Half, Full)"
                        placeholderTextColor="#94a3b8"
                        value={v.name}
                        onChangeText={(txt) => handleUpdateVariant(idx, "name", txt)}
                        style={[styles.variantInput, { flex: 1.2, color: darkMode ? "#ffffff" : "#111827" }]}
                      />
                      <TextInput
                        placeholder="Price (₹)"
                        placeholderTextColor="#94a3b8"
                        keyboardType="numeric"
                        value={String(v.price)}
                        onChangeText={(txt) => handleUpdateVariant(idx, "price", txt)}
                        style={[styles.variantInput, { flex: 0.8, color: darkMode ? "#ffffff" : "#111827" }]}
                      />
                      <TouchableOpacity
                        onPress={() => handleRemoveVariantRow(idx)}
                        style={styles.variantDeleteBtn}
                      >
                        <Icon name="close" size={18} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity onPress={handleAddVariantRow} style={styles.addVariantRowBtn}>
                    <Icon name="plus" size={16} color="#6366f1" />
                    <Text style={{ color: "#6366f1", fontWeight: "700", marginLeft: 4 }}>Add Another Size</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* 5. DESCRIPTION & SERVING NOTES */}
            <View style={styles.sectionCard}>
              <Text style={styles.fieldLabel}>Food Description (Optional)</Text>
              <TextInput
                placeholder="Brief description of the dish ingredients or taste..."
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={3}
                value={description}
                onChangeText={setDescription}
                style={[styles.textArea, { color: darkMode ? "#ffffff" : "#111827" }]}
              />

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Serving / Preparation Notes</Text>
              <TextInput
                placeholder="e.g. Medium spicy, contains cashew paste, prep time 15m"
                placeholderTextColor="#94a3b8"
                value={servingNotes}
                onChangeText={setServingNotes}
                style={[styles.input, { color: darkMode ? "#ffffff" : "#111827" }]}
              />

              {/* Availability Switch */}
              <View style={[styles.switchRow, { marginTop: 16 }]}>
                <View>
                  <Text style={styles.fieldLabel}>Food Available for Billing?</Text>
                  <Text style={styles.fieldHint}>Turn off if dish is currently sold out</Text>
                </View>
                <Switch
                  value={isAvailable}
                  onValueChange={setIsAvailable}
                  trackColor={{ false: "#cbd5e1", true: "#86efac" }}
                  thumbColor={isAvailable ? "#16a34a" : "#f1f5f9"}
                />
              </View>
            </View>

            {/* SUBMIT BUTTON */}
            <TouchableOpacity
              onPress={handleSaveFood}
              disabled={saving || uploadingImage}
              activeOpacity={0.85}
              style={[
                styles.saveButton,
                (saving || uploadingImage) && { opacity: 0.6 },
              ]}
            >
              {saving || uploadingImage ? (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                  <Text style={styles.saveButtonText}>
                    {uploadingImage ? "Uploading Image..." : "Saving Food..."}
                  </Text>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Icon name={isEditing ? "content-save-check" : "plus-circle"} size={22} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.saveButtonText}>
                    {isEditing ? "Update Food Item" : "Save Food Item"}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        /* SAVED FOODS LIST */
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {allFoods.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="silverware" size={54} color="#94a3b8" />
              <Text style={styles.emptyTitle}>No Foods Added Yet</Text>
              <Text style={styles.emptySubtitle}>Start adding dishes and beverages to build your restaurant menu.</Text>
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => setActiveTab("form")}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>+ Add Food Now</Text>
              </TouchableOpacity>
            </View>
          ) : (
            allFoods.map((item) => {
              const itemPrice = item.price || item.salesPrice || 0;
              const isAvail = item.isAvailable !== false;
              return (
                <View
                  key={item.id}
                  style={[
                    styles.menuRowCard,
                    { backgroundColor: darkMode ? theme.card : "#ffffff" },
                    !isAvail && { opacity: 0.7 },
                  ]}
                >
                  <View style={styles.foodThumbBox}>
                    {item.imageUrl || item.image ? (
                      <Image source={{ uri: item.imageUrl || item.image }} style={styles.foodThumb} />
                    ) : (
                      <Icon
                        name={item.category === "Beverages" ? "coffee" : item.category === "Desserts" ? "cake" : "food"}
                        size={26}
                        color="#6366f1"
                      />
                    )}
                  </View>

                  <View style={{ flex: 1, marginHorizontal: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text
                        style={[
                          styles.foodItemName,
                          { color: darkMode ? theme.text : "#1e293b" },
                        ]}
                        numberOfLines={1}
                      >
                        {item.name || item.itemName}
                      </Text>
                      <View
                        style={[
                          styles.miniBadge,
                          { backgroundColor: isAvail ? "#dcfce7" : "#fee2e2" },
                        ]}
                      >
                        <Text style={{ color: isAvail ? "#16a34a" : "#ef4444", fontSize: 10, fontWeight: "700" }}>
                          {isAvail ? "Active" : "Out of Stock"}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.foodItemMeta}>
                      {item.category || "General"} • ₹{Number(itemPrice).toFixed(2)}
                    </Text>

                    {item.description ? (
                      <Text numberOfLines={1} style={styles.foodItemDesc}>
                        {item.description}
                      </Text>
                    ) : null}
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <TouchableOpacity
                      onPress={() => handleToggleAvailability(item)}
                      style={[
                        styles.actionIconBtn,
                        { backgroundColor: isAvail ? "#dcfce7" : "#fee2e2" },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Icon
                        name={isAvail ? "check-circle" : "close-circle"}
                        size={20}
                        color={isAvail ? "#16a34a" : "#ef4444"}
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        setFoodName(item.name || item.itemName || "");
                        setSellingPrice(String(item.price || item.salesPrice || ""));
                        setCostPrice(String(item.purchasePrice || ""));
                        setCategory(item.category || "Main Course");
                        setDescription(item.description || "");
                        setDietType(item.dietType || "veg");
                        setIsAvailable(item.isAvailable !== false);
                        setServingNotes(item.servingNotes || "");
                        setFoodImage(item.imageUrl || item.image || null);
                        setHasVariants(Boolean(item.variants && item.variants.length > 0));
                        if (item.variants && item.variants.length > 0) {
                          setVariants(item.variants);
                        }
                        setActiveTab("form");
                      }}
                      style={[styles.actionIconBtn, { backgroundColor: "#eef2ff" }]}
                      activeOpacity={0.7}
                    >
                      <Icon name="pencil" size={18} color="#6366f1" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleDeleteFood(item)}
                      style={[styles.actionIconBtn, { backgroundColor: "#fee2e2" }]}
                      activeOpacity={0.7}
                    >
                      <Icon name="trash-can-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: (Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 0) + 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  backBtn: {
    padding: 6,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 1,
    fontWeight: "500",
  },
  headerActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eef2ff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  headerActionText: {
    color: "#6366f1",
    fontWeight: "700",
    fontSize: 13,
    marginLeft: 4,
  },
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 14,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: "#6366f1",
    shadowColor: "#6366f1",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
  },
  tabTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  sectionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 6,
  },
  fieldHint: {
    fontSize: 11,
    color: "#94a3b8",
  },
  input: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 64,
    textAlignVertical: "top",
  },
  imageUploadBox: {
    height: 140,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  imagePlaceholder: {
    alignItems: "center",
  },
  imagePlaceholderText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "700",
    color: "#6366f1",
  },
  imagePlaceholderSub: {
    marginTop: 2,
    fontSize: 11,
    color: "#94a3b8",
  },
  uploadedPreview: {
    width: "100%",
    height: "100%",
  },
  imageOverlayBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  removeImageBtn: {
    alignSelf: "flex-end",
    marginTop: 6,
  },
  dietRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  dietOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: "#f8fafc",
  },
  dietText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  categoryPillActive: {
    backgroundColor: "#6366f1",
    borderColor: "#6366f1",
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  categoryPillTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  customCatRow: {
    flexDirection: "row",
    marginTop: 8,
    gap: 8,
  },
  customCatInput: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  customCatAddBtn: {
    backgroundColor: "#6366f1",
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    
    alignItems: "center",
  },
  variantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  variantInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  variantDeleteBtn: {
    padding: 6,
  },
  addVariantRowBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    alignSelf: "flex-start",
  },
  saveButton: {
    backgroundColor: "#16a34a",
    paddingVertical: 16,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
    shadowColor: "#16a34a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  saveButtonText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 0.2,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#334155",
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
  emptyActionBtn: {
    marginTop: 20,
    backgroundColor: "#6366f1",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },
  menuRowCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  foodThumbBox: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  foodThumb: {
    width: 52,
    height: 52,
  },
  foodItemName: {
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
  },
  foodItemMeta: {
    fontSize: 13,
    fontWeight: "700",
    color: "#16a34a",
    marginTop: 2,
  },
  foodItemDesc: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 2,
  },
  miniBadge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  actionIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
});
