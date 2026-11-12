import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  RefreshControl,
  ScrollView,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { auth, db } from "../../utils/firebaseConfig";
import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useTheme } from "../../theme/ThemeContext";

const CATEGORY_CHIPS = [
  "All",
  "Starters",
  "Main Course",
  "Breads",
  "Rice & Biryani",
  "Beverages",
  "Desserts",
  "Snacks",
];

export default function RestaurantMenuScreen({ navigation, onBack }) {
  const themeContext = useTheme() || {};
  const theme = themeContext.theme || {};
  const darkMode = Boolean(themeContext.darkMode);

  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const user = auth.currentUser;

  // Real-time listener for restaurant food items
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(
      collection(db, "users", user.uid, "restaurant_menu"),
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setFoods(items);
        setLoading(false);
        setRefreshing(false);
      },
      (err) => {
        console.log("Restaurant menu error (handled offline):", err);
        setLoading(false);
        setRefreshing(false);
      }
    );

    return () => unsub();
  }, [user]);

  // Dynamic Categories (includes custom ones)
  const allCategories = useMemo(() => {
    const set = new Set(CATEGORY_CHIPS);
    foods.forEach((f) => {
      if (f.category && typeof f.category === "string") {
        set.add(f.category.trim());
      }
    });
    return Array.from(set);
  }, [foods]);

  // Filtered Foods
  const filteredFoods = useMemo(() => {
    return foods.filter((f) => {
      const name = (f.name || f.itemName || "").toLowerCase();
      const cat = (f.category || "").toLowerCase();
      const desc = (f.description || "").toLowerCase();
      const q = search.trim().toLowerCase();

      const matchesSearch = !q || name.includes(q) || cat.includes(q) || desc.includes(q);
      const matchesCategory =
        selectedCategory === "All" ||
        (f.category || "").toLowerCase() === selectedCategory.toLowerCase();

      return matchesSearch && matchesCategory;
    });
  }, [foods, search, selectedCategory]);

  const handleToggleAvailability = async (item) => {
    try {
      if (!user) return;
      const currentAvail = item.isAvailable !== false;
      await updateDoc(doc(db, "users", user.uid, "restaurant_menu", item.id), {
        isAvailable: !currentAvail,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      Alert.alert("Error", "Could not update availability: " + e.message);
    }
  };

  const handleDeleteFood = (item) => {
    Alert.alert(
      "Delete Menu Item",
      `Are you sure you want to delete "${item.name || item.itemName}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (!user) return;
              await deleteDoc(doc(db, "users", user.uid, "restaurant_menu", item.id));
            } catch (err) {
              Alert.alert("Delete Failed", err.message);
            }
          },
        },
      ]
    );
  };

  const handleEditFood = (item) => {
    navigation.navigate("Scan", { itemToEdit: item });
  };

  const handleAddToOrder = (item) => {
    navigation.navigate("Sales", { preselectedFood: item });
  };

  const renderFoodCard = ({ item }) => {
    const isAvail = item.isAvailable !== false;
    const price = Number(item.price || item.salesPrice || 0);

    return (
      <View
        style={[
          styles.foodCard,
          { backgroundColor: darkMode ? theme.card : "#ffffff" },
          !isAvail && styles.foodCardDisabled,
        ]}
      >
        {/* Food Image / Category Icon */}
        <View style={styles.cardLeft}>
          <View style={styles.foodImageWrap}>
            {item.imageUrl || item.image ? (
              <Image source={{ uri: item.imageUrl || item.image }} style={styles.foodImg} resizeMode="cover" />
            ) : (
              <Icon
                name={
                  item.category === "Beverages"
                    ? "coffee"
                    : item.category === "Desserts"
                    ? "cupcake"
                    : item.category === "Breads"
                    ? "bread-slice"
                    : "silverware-fork-knife"
                }
                size={28}
                color="#6366f1"
              />
            )}
          </View>
        </View>

        {/* Info */}
        <View style={styles.cardCenter}>
          <View style={styles.titleRow}>
            {item.dietType === "veg" && (
              <Icon name="circle-slice-8" size={14} color="#16a34a" style={{ marginRight: 4 }} />
            )}
            {item.dietType === "non-veg" && (
              <Icon name="triangle" size={12} color="#dc2626" style={{ marginRight: 4 }} />
            )}
            {item.dietType === "egg" && (
              <Icon name="egg" size={14} color="#d97706" style={{ marginRight: 4 }} />
            )}
            <Text
              style={[styles.foodNameText, { color: darkMode ? theme.text : "#1e293b" }]}
              numberOfLines={1}
            >
              {item.name || item.itemName}
            </Text>
          </View>

          <Text style={styles.categoryBadge}>{item.category || "General"}</Text>

          {item.description ? (
            <Text style={styles.foodDescText} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}

          <View style={styles.priceRow}>
            <Text style={styles.foodPrice}>₹{price.toFixed(2)}</Text>
            {item.hasVariants && item.variants?.length > 0 && (
              <Text style={styles.variantsHint}>({item.variants.length} sizes)</Text>
            )}
          </View>
        </View>

        {/* Right Actions */}
        <View style={styles.cardRight}>
          <TouchableOpacity
            onPress={() => handleToggleAvailability(item)}
            style={[
              styles.availPill,
              { backgroundColor: isAvail ? "#ecfdf5" : "#fef2f2" },
            ]}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.availDot,
                { backgroundColor: isAvail ? "#16a34a" : "#ef4444" },
              ]}
            />
            <Text
              style={[
                styles.availText,
                { color: isAvail ? "#16a34a" : "#ef4444" },
              ]}
            >
              {isAvail ? "In Stock" : "Sold Out"}
            </Text>
          </TouchableOpacity>

          <View style={styles.buttonActionRow}>
            <TouchableOpacity
              onPress={() => handleEditFood(item)}
              style={styles.actionCircle}
              activeOpacity={0.7}
            >
              <Icon name="pencil" size={16} color="#6366f1" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleDeleteFood(item)}
              style={[styles.actionCircle, { backgroundColor: "#fee2e2" }]}
              activeOpacity={0.7}
            >
              <Icon name="trash-can-outline" size={16} color="#ef4444" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleAddToOrder(item)}
              style={[styles.actionCircle, { backgroundColor: "#16a34a" }]}
              activeOpacity={0.7}
            >
              <Icon name="plus" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: darkMode ? theme.background : "#f8fafc" }]}>
      <StatusBar
        barStyle={darkMode ? "light-content" : "dark-content"}
        backgroundColor={darkMode ? theme.background : "#ffffff"}
      />

      {/* HEADER */}
      <View style={[styles.header, { backgroundColor: darkMode ? theme.card : "#ffffff" }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={{ marginRight: 10, padding: 4 }} activeOpacity={0.7}>
              <Icon name="arrow-left" size={24} color={darkMode ? theme.text : "#1e293b"} />
            </TouchableOpacity>
          )}
          <View>
            <Text style={[styles.headerTitle, { color: darkMode ? theme.text : "#1e293b" }]}>
              {onBack ? "Food Menu & Dishes" : "Restaurant Menu"}
            </Text>
            <Text style={styles.headerSubtitle}>
              {foods.length} items • Touch + to add to billing
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            style={styles.billingBtn}
            onPress={() => navigation.navigate("Sales")}
            activeOpacity={0.8}
          >
            <Icon name="cash-register" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* SEARCH BAR */}
      <View style={[styles.searchBoxWrapper, { backgroundColor: darkMode ? theme.card : "#ffffff" }]}>
        <Icon name="magnify" size={22} color="#94a3b8" style={{ marginRight: 8 }} />
        <TextInput
          placeholder="Search food, category, or ingredients..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          style={[styles.searchInput, { color: darkMode ? theme.text : "#111827" }]}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Icon name="close-circle" size={18} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>

      {/* CATEGORY CHIPS */}
      <View style={{ paddingVertical: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
          {allCategories.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={[
                  styles.catChip,
                  isSelected && styles.catChipActive,
                  { backgroundColor: isSelected ? "#6366f1" : darkMode ? theme.card : "#ffffff" },
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.catChipText,
                    isSelected && styles.catChipTextActive,
                    { color: isSelected ? "#ffffff" : darkMode ? theme.text : "#475569" },
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* FOODS LIST */}
      {loading ? (
        <View style={styles.loaderCenter}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={{ marginTop: 12, color: "#94a3b8", fontWeight: "600" }}>Loading Menu...</Text>
        </View>
      ) : filteredFoods.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="silverware-fork-knife" size={60} color="#cbd5e1" />
          <Text style={[styles.emptyHeader, { color: darkMode ? theme.text : "#334155" }]}>
            {search ? "No matching food items" : "Your Menu is Empty"}
          </Text>
          <Text style={styles.emptySub}>
            {search
              ? "Try searching with a different name or category."
              : "Add your delicious dishes, beverages, and desserts to start billing."}
          </Text>
          <TouchableOpacity
            style={styles.emptyAddBtn}
            onPress={() => navigation.navigate("Scan")}
            activeOpacity={0.8}
          >
            <Icon name="plus" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={{ color: "#fff", fontWeight: "700" }}>Add First Food</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredFoods}
          keyExtractor={(item) => item.id}
          renderItem={renderFoodCard}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => setRefreshing(true)}
              colors={["#6366f1"]}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
    fontWeight: "500",
  },
  addFoodBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#6366f1",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    shadowColor: "#6366f1",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  addFoodBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
    marginLeft: 4,
  },
  billingBtn: {
    backgroundColor: "#16a34a",
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#16a34a",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  searchBoxWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  searchInput: {
    flex: 1,
    height: 42,
    fontSize: 14,
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  catChipActive: {
    borderColor: "#6366f1",
  },
  catChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  catChipTextActive: {
    fontWeight: "700",
  },
  loaderCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  emptyHeader: {
    fontSize: 19,
    fontWeight: "800",
    marginTop: 16,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 13,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  emptyAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#6366f1",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 20,
  },
  foodCard: {
    flexDirection: "row",
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    alignItems: "center",
  },
  foodCardDisabled: {
    opacity: 0.65,
  },
  cardLeft: {
    marginRight: 10,
  },
  foodImageWrap: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  foodImg: {
    width: "100%",
    height: "100%",
  },
  cardCenter: {
    flex: 1,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  foodNameText: {
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
  },
  categoryBadge: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6366f1",
    marginTop: 2,
  },
  foodDescText: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 2,
    lineHeight: 15,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  foodPrice: {
    fontSize: 15,
    fontWeight: "800",
    color: "#16a34a",
  },
  variantsHint: {
    fontSize: 11,
    color: "#64748b",
    marginLeft: 6,
  },
  cardRight: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 64,
  },
  availPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  availDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  availText: {
    fontSize: 10,
    fontWeight: "700",
  },
  buttonActionRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  actionCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#eef2ff",
    justifyContent: "center",
    alignItems: "center",
  },
});
