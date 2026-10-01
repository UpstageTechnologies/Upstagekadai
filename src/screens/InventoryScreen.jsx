import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  useWindowDimensions
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { auth, db, storage } from "../utils/firebaseConfig";
import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
  addDoc,
  serverTimestamp
} from "firebase/firestore";
import { getSession } from "../utils/session";
import { useTheme } from "../theme/ThemeContext";
import { launchImageLibrary } from "react-native-image-picker";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { WebView } from "react-native-webview";

export default function InventoryScreen({ appMode }) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { theme, darkMode } = useTheme();
  const isFocused = useIsFocused();

  const [items, setItems] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPurchasePrice, setEditPurchasePrice] = useState("");
  const [editSalesPrice, setEditSalesPrice] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [searchText, setSearchText] = useState("");
  const [editImage, setEditImage] = useState("");
  const [currentMode, setCurrentMode] = useState("local");

  // Barcode Zoom Modal State
  const [barcodeModalVisible, setBarcodeModalVisible] = useState(false);
  const [selectedBarcode, setSelectedBarcode] = useState(null);

  // States for tracking selected Category or Brand view inside details
  const [activeTab, setActiveTab] = useState("menu");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedBrand, setSelectedBrand] = useState(null);

  // --- RESTOCK MODAL STATES ---
  const [restockModalVisible, setRestockModalVisible] = useState(false);
  const [restockItem, setRestockItem] = useState(null);
  const [restockQty, setRestockQty] = useState("1");
  const [restockPurchasePrice, setRestockPurchasePrice] = useState("");
  const [restockSupplier, setRestockSupplier] = useState("");

  // =========================================================
  // 🌐 WEB SEARCH & HEADLESS SCRAPER ENGINE
  // =========================================================
  const [webImageGridModal, setWebImageGridModal] = useState(false);
  const [webSearchQuery, setWebSearchQuery] = useState("");
  const [webSearchResults, setWebSearchResults] = useState([]);
  const [webSearchSearching, setWebSearchSearching] = useState(false);
  const [scraperUrl, setScraperUrl] = useState("");
  const headlessWebRef = useRef(null);

  const extractImagesJS = `
    (function() {
      try {
        var imgs = [];
        var elements = document.querySelectorAll('img');
        for (var i = 0; i < elements.length; i++) {
          var src = elements[i].src || elements[i].getAttribute('data-src') || elements[i].getAttribute('src');
          if (src && (src.startsWith('http://') || src.startsWith('https://')) && !src.includes('google.com/images/cleardot') && !src.includes('favicon')) {
            imgs.push(src);
          }
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'GOOGLE_IMGS', data: imgs }));
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: e.toString() }));
      }
    })();
    true;
  `;

  const handleHeadlessMessage = (event) => {
    try {
      const parsed = JSON.parse(event.nativeEvent.data);
      if (parsed.type === "GOOGLE_IMGS" && Array.isArray(parsed.data) && parsed.data.length > 0) {
        const unique = [...new Set(parsed.data.filter(Boolean))];
        setWebSearchResults(prev => [...new Set([...unique, ...prev])]);
        setWebSearchSearching(false);
      }
    } catch (e) {
      console.log("Headless parse error:", e);
    }
  };

  const executeWebSearch = async (termToSearch) => {
    if (!termToSearch || !termToSearch.trim()) return;
    setWebSearchSearching(true);

    const cleaned = termToSearch
      .replace(/\b\d+(\.\d+)?\s*(g|gm|gms|kg|ml|l|ltr|pcs|pack|pk)\b/gi, "")
      .replace(/[^\w\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    const targetTerm = cleaned || termToSearch.trim();

    try {
      const encoded = encodeURIComponent(targetTerm);
      const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encoded}&gsrlimit=20&prop=imageinfo&iiprop=url&format=json&origin=*`;
      const wikiRes = await fetch(wikiUrl);
      const wikiData = await wikiRes.json();
      const direct = [];
      if (wikiData?.query?.pages) {
        Object.values(wikiData.query.pages).forEach((page) => {
          if (page.imageinfo?.[0]?.url) {
            const u = page.imageinfo[0].url;
            if (!u.endsWith(".svg") && !u.endsWith(".tif")) direct.push(u);
          }
        });
      }
      if (direct.length > 0) {
        setWebSearchResults(direct);
      }
    } catch (e) {
      console.log("Wiki error:", e);
    }

    const googleSearchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(targetTerm + " product")}`;
    setScraperUrl(googleSearchUrl);

    setTimeout(() => {
      setWebSearchSearching(false);
    }, 4500);
  };

  const handleOpenWebSearchModal = () => {
    const raw = `${editBrand} ${editName}`.trim() || editName.trim() || selectedItem?.barcode || "";
    setWebSearchQuery(raw);
    setWebSearchResults([]);
    setWebImageGridModal(true);
    if (raw) {
      executeWebSearch(raw);
    }
  };

  useEffect(() => {
    let unsubscribe;

    const loadInventoryLive = async () => {
      try {
        const session = await getSession();
        if (!session?.uid) return;

        const targetMode = appMode || "local";
        setCurrentMode(targetMode);

        const collectionName = targetMode === "global" ? "global_inventory" : "inventory";

        if (unsubscribe) unsubscribe();

        unsubscribe = onSnapshot(
          collection(db, "users", session.uid, collectionName),
          (snap) => {
            const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setItems(data);
          },
          (error) => {
            console.log("Firestore Error: ", error);
          }
        );
      } catch (err) {
        console.log("Error loading snapshot: ", err);
      }
    };

    if (isFocused) {
      loadInventoryLive();
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isFocused, appMode]);

  const openEdit = (item) => {
    setSelectedItem(item);
    setEditName(item.itemName || "");
    setEditPurchasePrice(String(item.purchasePrice || ""));
    setEditSalesPrice(String(item.salesPrice || ""));
    setEditQty(String(item.quantity || ""));
    setEditBrand(item.brand || "");
    setEditImage(item.image || "");
    setModalVisible(true);
  };

  const openRestockModal = (item) => {
    setRestockItem(item);
    setRestockQty("1");
    setRestockPurchasePrice(String(item.purchasePrice || ""));
    setRestockSupplier(item.supplierName || "Walk-in Supplier");
    setRestockModalVisible(true);
  };

  const handleConfirmRestock = async () => {
    const user = auth.currentUser;
    if (!user || !restockItem) return;

    const addedQty = Number(restockQty) || 0;
    if (addedQty <= 0) {
      Alert.alert("Invalid Quantity", "Please enter a valid quantity to restock.");
      return;
    }

    const pPrice =
      Number(restockPurchasePrice) >= 0
        ? Number(restockPurchasePrice)
        : Number(restockItem.purchasePrice || 0);
    const supplier = restockSupplier.trim() || "Walk-in Supplier";
    const inventoryCollection = currentMode === "global" ? "global_inventory" : "inventory";
    const invoicesCollection = currentMode === "global" ? "global_invoices" : "invoices";

    try {
      const currentStock = Number(restockItem.quantity) || 0;
      const newStock = currentStock + addedQty;

      await updateDoc(
        doc(db, "users", user.uid, inventoryCollection, restockItem.id),
        {
          quantity: newStock,
          purchasePrice: pPrice,
          supplierName: supplier,
          updatedAt: serverTimestamp()
        }
      );

      const purchaseTotal = pPrice * addedQty;
      const purchaseNo = "PUR-" + Date.now().toString().slice(-6);

      await addDoc(collection(db, "users", user.uid, invoicesCollection), {
        billNo: purchaseNo,
        invoiceId: purchaseNo,
        supplierName: supplier,
        paymentMode: "CASH",
        items: [
          {
            itemName: restockItem.itemName || "Restocked Item",
            purchasePrice: pPrice,
            qty: addedQty,
            unitType: restockItem.unitType || "Qty",
            barcode: restockItem.barcode || ""
          }
        ],
        total: Number(purchaseTotal),
        createdAt: serverTimestamp()
      });

      setRestockModalVisible(false);
      Alert.alert(
        "Restock Success",
        `${restockItem.itemName} stock increased by +${addedQty} and recorded in Purchase History!`
      );
    } catch (err) {
      console.log("Restock Error:", err);
      Alert.alert("Restock Error", err.message);
    }
  };

  const uploadImageToStorage = async (localUri) => {
    if (!localUri || localUri.startsWith("http")) return localUri;

    try {
      const response = await fetch(localUri);
      const blob = await response.blob();

      const filename = `products/${auth.currentUser.uid}_${Date.now()}.jpg`;
      const storageRef = ref(storage, filename);

      const uploadTask = await uploadBytesResumable(storageRef, blob);
      const downloadUrl = await getDownloadURL(uploadTask.ref);
      return downloadUrl;
    } catch (error) {
      console.log("Image upload error: ", error);
      Alert.alert("Upload Failed", "Stored local URI due to error.");
      return localUri;
    }
  };

  const saveEdit = async () => {
    const user = auth.currentUser;
    if (!selectedItem) return;
    const collectionName = currentMode === "global" ? "global_inventory" : "inventory";

    try {
      let finalImageUrl = editImage || selectedItem.image || "";
      if (editImage && !editImage.startsWith("http")) {
        finalImageUrl = await uploadImageToStorage(editImage);
      }

      await updateDoc(
        doc(db, "users", user.uid, collectionName, selectedItem.id),
        {
          itemName: editName,
          purchasePrice: Number(editPurchasePrice),
          salesPrice: Number(editSalesPrice),
          quantity: Number(editQty),
          brand: editBrand,
          image: finalImageUrl,
          updatedAt: serverTimestamp()
        }
      );
      setModalVisible(false);
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  };

  const deleteItem = async (id) => {
    const user = auth.currentUser;
    if (!user) return;
    const collectionName = currentMode === "global" ? "global_inventory" : "inventory";

    Alert.alert("Delete Item", "Are you sure you want to delete this item?", [
      { text: "Cancel" },
      {
        text: "Delete",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "users", user.uid, collectionName, id));
          } catch (err) {
            Alert.alert("Error", err.message);
          }
        }
      }
    ]);
  };

  const categoriesList = [...new Set(items.map((i) => i.category || "Uncategorized"))];

  // --- BRAND PERFORMANCE ANALYTICS ---
  const brandsAnalytics = useMemo(() => {
    const stats = {};
    items.forEach((item) => {
      const brandName = item.brand?.trim() || "No Brand";
      const qty = Number(item.quantity) || 0;
      const pPrice = Number(item.purchasePrice) || 0;
      const sPrice = Number(item.salesPrice) || 0;

      if (!stats[brandName]) {
        stats[brandName] = {
          name: brandName,
          productCount: 0,
          totalQty: 0,
          totalPurchaseValue: 0,
          totalSalesValue: 0
        };
      }

      stats[brandName].productCount += 1;
      stats[brandName].totalQty += qty;
      stats[brandName].totalPurchaseValue += pPrice * qty;
      stats[brandName].totalSalesValue += sPrice * qty;
    });

    const list = Object.values(stats);
    list.sort((a, b) => b.totalSalesValue - a.totalSalesValue);

    const maxSales = list.length > 0 ? Math.max(...list.map((b) => b.totalSalesValue)) : 0;

    return { list, maxSales };
  }, [items]);

  const filteredItems = items.filter((item) => {
    const q = searchText.toLowerCase();

    if (selectedCategory) {
      const itemCat = item.category || "Uncategorized";
      if (itemCat !== selectedCategory) return false;
    }

    if (selectedBrand) {
      const itemBrand = item.brand || "No Brand";
      if (itemBrand !== selectedBrand) return false;
    }

    if (activeTab === "lowStock") {
      if ((item.quantity || 0) > 5) return false;
    }

    return (
      (item.itemName || "").toLowerCase().includes(q) ||
      (item.brand || "").toLowerCase().includes(q) ||
      (item.barcode || "").toString().toLowerCase().includes(q) ||
      (item.category || "").toLowerCase().includes(q)
    );
  });

  const handleBackPress = () => {
    if (selectedCategory) {
      setSelectedCategory(null);
    } else if (selectedBrand) {
      setSelectedBrand(null);
    } else {
      setActiveTab("menu");
      setSelectedCategory(null);
      setSelectedBrand(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* HIDDEN IN-MEMORY HEADLESS GOOGLE IMAGE SCRAPER WEBVIEW */}
      {scraperUrl !== "" && (
        <View style={{ width: 0, height: 0, opacity: 0, position: "absolute" }}>
          <WebView
            ref={headlessWebRef}
            source={{ uri: scraperUrl }}
            injectedJavaScript={extractImagesJS}
            onMessage={handleHeadlessMessage}
            userAgent="Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36"
            javaScriptEnabled={true}
            domStorageEnabled={true}
          />
        </View>
      )}

      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 15
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {(activeTab !== "menu" || selectedCategory || selectedBrand) && (
            <TouchableOpacity onPress={handleBackPress} style={{ marginRight: 10 }}>
              <Text style={{ fontSize: 22, color: theme.text, fontWeight: "bold" }}>←</Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.title, { color: theme.text }]}>
            📦{" "}
            {selectedCategory
              ? selectedCategory
              : selectedBrand
              ? selectedBrand
              : activeTab === "menu"
              ? "Inventory"
              : activeTab === "lowStock"
              ? "LOW STOCK"
              : activeTab.toUpperCase()}
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: theme.subText }}>
          {currentMode === "global" ? "Global" : "Local"}
        </Text>
      </View>

      {/* 1. MENU DASHBOARD VIEW */}
      {activeTab === "menu" && !selectedCategory && !selectedBrand && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: isLandscape ? 120 : 135 }}>
          <View style={[styles.menuCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <TouchableOpacity style={styles.menuItem} onPress={() => setActiveTab("products")}>
              <View style={[styles.menuIconBox, { backgroundColor: darkMode ? "#334155" : "#f1f5f9" }]}>
                <Text>📦</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Products</Text>
                <Text style={[styles.menuSub, { color: theme.subText }]}>Manage products and stock</Text>
              </View>
              <Text style={{ color: theme.subText, fontSize: 18 }}>›</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <TouchableOpacity style={styles.menuItem} onPress={() => setActiveTab("categories")}>
              <View style={[styles.menuIconBox, { backgroundColor: darkMode ? "#334155" : "#f1f5f9" }]}>
                <Text>📂</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Categories</Text>
                <Text style={[styles.menuSub, { color: theme.subText }]}>Manage product categories</Text>
              </View>
              <Text style={{ color: theme.subText, fontSize: 18 }}>›</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <TouchableOpacity style={styles.menuItem} onPress={() => setActiveTab("brands")}>
              <View style={[styles.menuIconBox, { backgroundColor: darkMode ? "#334155" : "#f1f5f9" }]}>
                <Text>🏷️</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Brands Performance</Text>
                <Text style={[styles.menuSub, { color: theme.subText }]}>Sales & purchase analytics by brand</Text>
              </View>
              <Text style={{ color: theme.subText, fontSize: 18 }}>›</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <TouchableOpacity style={styles.menuItem} onPress={() => setActiveTab("lowStock")}>
              <View style={[styles.menuIconBox, { backgroundColor: darkMode ? "#334155" : "#f1f5f9" }]}>
                <Text>⚠️</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Low Stock Alerts</Text>
                <Text style={[styles.menuSub, { color: theme.subText }]}>Review low and out-of-stock products</Text>
              </View>
              <Text style={{ color: theme.subText, fontSize: 18 }}>›</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <TouchableOpacity style={styles.menuItem} onPress={() => setActiveTab("restock")}>
              <View style={[styles.menuIconBox, { backgroundColor: darkMode ? "#334155" : "#f1f5f9" }]}>
                <Text>📋</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={[styles.menuTitle, { color: theme.text, marginRight: 8 }]}>Restock List</Text>
                  <View style={{ backgroundColor: "#dcfce7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ color: "#16a34a", fontSize: 10, fontWeight: "bold" }}>Included in Pro</Text>
                  </View>
                </View>
                <Text style={[styles.menuSub, { color: theme.subText }]}>Plan and track products to restock</Text>
              </View>
              <Text style={{ color: theme.subText, fontSize: 18 }}>›</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <TouchableOpacity style={styles.menuItem} onPress={() => setActiveTab("import")}>
              <View style={[styles.menuIconBox, { backgroundColor: darkMode ? "#334155" : "#f1f5f9" }]}>
                <Text>📥</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Import Products</Text>
                <Text style={[styles.menuSub, { color: theme.subText }]}>Choose where your products come from.</Text>
              </View>
              <Text style={{ color: theme.subText, fontSize: 18 }}>›</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* 2. CATEGORIES LIST VIEW */}
      {activeTab === "categories" && !selectedCategory && (
        <ScrollView contentContainerStyle={{ paddingBottom: isLandscape ? 120 : 135 }}>
          <View style={isLandscape ? styles.tabletGridContainer : null}>
            {categoriesList.map((cat, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.subCard, isLandscape && styles.tabletHalfCard, { backgroundColor: theme.card }]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[styles.menuTitle, { color: theme.text }]}>📂 {cat}</Text>
                <Text style={{ color: theme.subText, fontSize: 12, marginTop: 4 }}>
                  Products count: {items.filter((i) => (i.category || "Uncategorized") === cat).length}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* 3. BRANDS PERFORMANCE LIST VIEW */}
      {activeTab === "brands" && !selectedBrand && (
        <ScrollView contentContainerStyle={{ paddingBottom: isLandscape ? 120 : 135 }} showsVerticalScrollIndicator={false}>
          <View style={isLandscape ? styles.tabletGridContainer : null}>
            {brandsAnalytics.list.map((brand, index) => {
              const isBestSeller = brand.totalSalesValue > 0 && brand.totalSalesValue === brandsAnalytics.maxSales;
              const estProfit = brand.totalSalesValue - brand.totalPurchaseValue;

              return (
                <TouchableOpacity
                  key={index}
                  activeOpacity={0.8}
                  style={[
                    styles.brandCard,
                    isLandscape && styles.tabletHalfCard,
                    { backgroundColor: theme.card, borderColor: isBestSeller ? "#10b981" : theme.border },
                    isBestSeller && { borderWidth: 1.5 }
                  ]}
                  onPress={() => setSelectedBrand(brand.name)}
                >
                  <View style={styles.brandHeader}>
                    <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                      <View style={[styles.brandIconBox, { backgroundColor: darkMode ? "#1e293b" : "#eef2ff" }]}>
                        <Text style={{ fontSize: 18 }}>🏷️</Text>
                      </View>
                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={[styles.brandNameText, { color: theme.text }]} numberOfLines={1}>
                          {brand.name}
                        </Text>
                        <Text style={{ color: theme.subText, fontSize: 11 }}>
                          {brand.productCount} Products • {brand.totalQty} Units In Stock
                        </Text>
                      </View>
                    </View>

                    {isBestSeller && (
                      <View style={styles.bestSellerBadge}>
                        <Text style={styles.bestSellerText}>⭐ Best Seller</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.metricsContainer}>
                    <View style={[styles.metricBox, { backgroundColor: darkMode ? "#0f172a" : "#f8fafc" }]}>
                      <Text style={[styles.metricLabel, { color: theme.subText }]}>Purchase Value</Text>
                      <Text style={[styles.metricVal, { color: darkMode ? "#94a3b8" : "#475569" }]}>
                        ₹ {brand.totalPurchaseValue.toLocaleString("en-IN")}
                      </Text>
                    </View>

                    <View style={[styles.metricBox, { backgroundColor: darkMode ? "#064e3b" : "#ecfdf5" }]}>
                      <Text style={[styles.metricLabel, { color: "#10b981" }]}>Sales Value</Text>
                      <Text style={[styles.metricVal, { color: "#059669", fontWeight: "bold" }]}>
                        ₹ {brand.totalSalesValue.toLocaleString("en-IN")}
                      </Text>
                    </View>

                    <View style={[styles.metricBox, { backgroundColor: darkMode ? "#1e1b4b" : "#eef2ff" }]}>
                      <Text style={[styles.metricLabel, { color: "#6366f1" }]}>Est. Margin</Text>
                      <Text
                        style={[
                          styles.metricVal,
                          { color: estProfit >= 0 ? "#4f46e5" : "#ef4444", fontWeight: "bold" }
                        ]}
                      >
                        {estProfit >= 0 ? "+₹ " : "-₹ "}
                        {Math.abs(estProfit).toLocaleString("en-IN")}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.viewItemsRow}>
                    <Text style={{ fontSize: 12, color: theme.subText }}>Tap to view products under this brand</Text>
                    <Text style={{ color: theme.subText, fontSize: 14 }}>›</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* 4. IMPORT PRODUCTS VIEW */}
      {activeTab === "import" && (
        <View style={{ padding: 20, alignItems: "center" }}>
          <Text style={{ fontSize: 16, fontWeight: "bold", color: theme.text, textAlign: "center" }}>
            Import Products
          </Text>
          <Text style={{ color: theme.subText, textAlign: "center", marginTop: 10 }}>
            You can upload your CSV files or sync items directly from external databases.
          </Text>
        </View>
      )}

      {/* 5. PRODUCTS / LOW STOCK / RESTOCK / SELECTED CATEGORY / SELECTED BRAND LIST VIEW */}
      {(activeTab === "products" ||
        activeTab === "lowStock" ||
        activeTab === "restock" ||
        selectedCategory ||
        selectedBrand) && (
        <>
          <TextInput
            placeholder="Search product, brand, barcode..."
            placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
            value={searchText}
            onChangeText={setSearchText}
            style={{
              backgroundColor: theme.card,
              height: 48,
              borderColor: theme.border,
              paddingHorizontal: 16,
              color: theme.text,
              marginBottom: 12,
              borderWidth: 1,
              borderRadius: 14
            }}
          />

          <FlatList
            key={isLandscape ? "grid_2" : "list_1"}
            data={filteredItems}
            keyExtractor={(item) => item.id}
            numColumns={isLandscape ? 2 : 1}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 2, paddingBottom: isLandscape ? 180 : 135 }}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.card,
                  isLandscape && styles.tabletGridCard,
                  { backgroundColor: theme.card },
                  item.quantity <= 5 && { borderColor: "red", borderWidth: 1 }
                ]}
              >
                {/* Top Section */}
                <View style={{ flexDirection: "row", width: "100%", alignItems: "center" }}>
                  <View style={styles.leftSection}>
                    <Image
                      source={{ uri: item.image || "https://via.placeholder.com/150" }}
                      style={styles.image}
                    />
                    {item.createdAt &&
                      (() => {
                        const created = item.createdAt.toDate
                          ? item.createdAt.toDate()
                          : new Date(item.createdAt.seconds * 1000);
                        const now = new Date();
                        return (now - created) / (1000 * 60 * 60 * 24) <= 5;
                      })() && (
                        <View style={styles.newTag}>
                          <Text style={styles.newText}>NEW</Text>
                        </View>
                      )}
                  </View>

                  <View style={styles.details}>
                    <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                      {item.itemName || "No Name"}
                    </Text>
                    <View style={styles.brandTag}>
                      <Text style={styles.brandText}>{item.brand || "No Brand"}</Text>
                    </View>
                    <Text style={[styles.price, { color: theme.text }]}>₹ {item.salesPrice || 0}</Text>
                    {item.quantity <= 5 && item.quantity > 0 && (
                      <Text style={{ color: "orange", fontWeight: "bold", marginTop: 4, fontSize: 11 }}>
                        ⚠ Low Stock
                      </Text>
                    )}
                    {item.quantity === 0 && (
                      <Text style={{ color: "red", fontWeight: "bold", marginTop: 4, fontSize: 11 }}>
                        ‼️ Out Of Stock
                      </Text>
                    )}
                  </View>

                  <View
                    style={[
                      styles.qtyBadgeBox,
                      { backgroundColor: darkMode ? "#334155" : "#e0e7ff" }
                    ]}
                  >
                    <Text
                      style={[styles.qtyLarge, { color: darkMode ? "#38bdf8" : "#4f46e5" }]}
                    >
                      {item.quantity || 0}
                    </Text>
                    <Text
                      style={[styles.qtyLabel, { color: darkMode ? "#94a3b8" : "#6366f1" }]}
                    >
                      {item.unitType || "Qty"}
                    </Text>
                  </View>
                </View>

                {/* Barcode Box */}
                {item.barcode && (
                  <TouchableOpacity
                    style={[
                      styles.barcodeBox,
                      { backgroundColor: darkMode ? "#ffffff" : "#f1f5f9" }
                    ]}
                    onPress={() => {
                      setSelectedBarcode(item.barcode);
                      setBarcodeModalVisible(true);
                    }}
                  >
                    <Image
                      source={{
                        uri: `https://bwipjs-api.metafloor.com/?bcid=code128&text=${item.barcode}&scale=2&height=10&backgroundcolor=FFFFFF`
                      }}
                      style={styles.barcode}
                      resizeMode="contain"
                    />
                    <Text style={[styles.barcodeText, { color: "#000" }]}>
                      {item.barcode} (Tap to Zoom & Print)
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Bottom Action Buttons */}
                <View style={styles.actionRow}>
                  {activeTab === "lowStock" || activeTab === "restock" ? (
                    <TouchableOpacity
                      style={[styles.editBtn, { backgroundColor: "#10b981" }]}
                      onPress={() => openRestockModal(item)}
                    >
                      <MaterialCommunityIcons name="plus-box" size={16} color="#fff" />
                      <Text style={styles.btnText}> Restock</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                      <MaterialCommunityIcons name="pencil" size={16} color="#fff" />
                      <Text style={styles.btnText}> Edit</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteItem(item.id)}>
                    <MaterialCommunityIcons name="delete" size={16} color="#fff" />
                    <Text style={styles.btnText}> Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </>
      )}

      {/* RESTOCK MODAL */}
      <Modal visible={restockModalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={[styles.modalBox, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              📦 Restock: {restockItem?.itemName || "Item"}
            </Text>
            <Text style={{ color: theme.subText, fontSize: 13, marginBottom: 12 }}>
              Current In-Stock:{" "}
              <Text style={{ fontWeight: "bold", color: "#10b981" }}>
                {restockItem?.quantity || 0} {restockItem?.unitType || "Qty"}
              </Text>
            </Text>

            <Text style={{ fontSize: 12, fontWeight: "700", color: theme.subText, marginBottom: 4 }}>
              Add Quantity to Restock *
            </Text>
            <TextInput
              placeholder="Quantity"
              placeholderTextColor="#888"
              value={restockQty}
              onChangeText={setRestockQty}
              keyboardType="numeric"
              style={[styles.input, { color: theme.text }]}
            />

            <Text style={{ fontSize: 12, fontWeight: "700", color: theme.subText, marginBottom: 4 }}>
              Purchase Price (₹) *
            </Text>
            <TextInput
              placeholder="Purchase Price"
              placeholderTextColor="#888"
              value={restockPurchasePrice}
              onChangeText={setRestockPurchasePrice}
              keyboardType="numeric"
              style={[styles.input, { color: theme.text }]}
            />

            <Text style={{ fontSize: 12, fontWeight: "700", color: theme.subText, marginBottom: 4 }}>
              Supplier Name
            </Text>
            <TextInput
              placeholder="Supplier Name (e.g. Walk-in Supplier)"
              placeholderTextColor="#888"
              value={restockSupplier}
              onChangeText={setRestockSupplier}
              style={[styles.input, { color: theme.text }]}
            />

            <View style={{ flexDirection: "row", marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: "#10b981" }]}
                onPress={handleConfirmRestock}
              >
                <Text style={styles.btnText}>Confirm & Add Stock</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setRestockModalVisible(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* BARCODE ZOOM & PRINT MODAL */}
      <Modal visible={barcodeModalVisible} transparent animationType="fade">
        <View style={styles.modalContainer}>
          <View style={[styles.modalBox, { backgroundColor: theme.card, alignItems: "center" }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Barcode View</Text>
            {selectedBarcode && (
              <View
                style={{
                  backgroundColor: "#fff",
                  padding: 15,
                  borderRadius: 12,
                  marginVertical: 10,
                  width: "100%",
                  alignItems: "center"
                }}
              >
                <Image
                  source={{
                    uri: `https://bwipjs-api.metafloor.com/?bcid=code128&text=${selectedBarcode}&scale=3&height=15&backgroundcolor=FFFFFF`
                  }}
                  style={{ width: 250, height: 90 }}
                  resizeMode="contain"
                />
                <Text style={{ color: "#000", fontSize: 14, fontWeight: "bold", marginTop: 8 }}>
                  {selectedBarcode}
                </Text>
              </View>
            )}
            <View style={{ flexDirection: "row", width: "100%", marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: "#10b981", justifyContent: "center" }]}
                onPress={() => Alert.alert("Print Barcode", "Sending barcode to connected printer...")}
              >
                <Text style={[styles.btnText, { fontWeight: "bold", textAlign: "center" }]}>
                  🖨️ Print
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cancelBtn, { justifyContent: "center" }]}
                onPress={() => setBarcodeModalVisible(false)}
              >
                <Text style={[styles.btnText, { fontWeight: "bold", textAlign: "center" }]}>
                  ❌ Close
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* EDIT MODAL */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={[styles.modalBox, { backgroundColor: theme.card }]}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10
              }}
            >
              <Text style={[styles.modalTitle, { color: theme.text, marginBottom: 0 }]}>
                Edit Item ({currentMode.toUpperCase()})
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={{ padding: 4 }}>
                <Icon name="close" size={22} color={darkMode ? "#94a3b8" : "#64748b"} />
              </TouchableOpacity>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
                marginTop: 4
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: theme.subText }}>
                Product Image
              </Text>
              <TouchableOpacity
                onPress={handleOpenWebSearchModal}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: darkMode ? "#334155" : "#e0e7ff",
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 14
                }}
              >
                <Icon name="magnify" size={16} color="#6366f1" style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 11, fontWeight: "800", color: "#6366f1" }}>Search web</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => {
                launchImageLibrary({ mediaType: "photo" }, (res) => {
                  if (res.assets && res.assets.length > 0) {
                    setEditImage(res.assets[0].uri);
                  }
                });
              }}
              style={{ alignSelf: "center", marginBottom: 12 }}
            >
              {editImage ? (
                <Image
                  source={{ uri: editImage }}
                  style={{
                    width: 95,
                    height: 95,
                    borderRadius: 14,
                    borderWidth: 2,
                    borderColor: "#6366f1",
                    backgroundColor: "#f8fafc"
                  }}
                  resizeMode="contain"
                />
              ) : (
                <View
                  style={{
                    width: 95,
                    height: 95,
                    borderRadius: 14,
                    backgroundColor: darkMode ? "#0f172a" : "#f1f5f9",
                    justifyContent: "center",
                    alignItems: "center",
                    borderWidth: 2,
                    borderStyle: "dashed",
                    borderColor: "#6366f1"
                  }}
                >
                  <Icon name="camera-plus" size={32} color="#6366f1" />
                  <Text style={{ fontSize: 10, color: "#6366f1", fontWeight: "bold", marginTop: 2 }}>
                    Upload
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TextInput
              placeholder="Name"
              placeholderTextColor="#888"
              value={editName}
              onChangeText={setEditName}
              style={[styles.input, { color: theme.text }]}
            />
            <TextInput
              placeholder="Brand"
              placeholderTextColor="#888"
              value={editBrand}
              onChangeText={setEditBrand}
              style={[styles.input, { color: theme.text }]}
            />
            <TextInput
              placeholder="Purchase Price"
              placeholderTextColor="#888"
              value={editPurchasePrice}
              onChangeText={setEditPurchasePrice}
              keyboardType="numeric"
              style={[styles.input, { color: theme.text }]}
            />
            <TextInput
              placeholder="Sales Price"
              placeholderTextColor="#888"
              value={editSalesPrice}
              onChangeText={setEditSalesPrice}
              keyboardType="numeric"
              style={[styles.input, { color: theme.text }]}
            />
            <TextInput
              placeholder="Quantity"
              placeholderTextColor="#888"
              value={editQty}
              onChangeText={setEditQty}
              keyboardType="numeric"
              style={[styles.input, { color: theme.text }]}
            />

            <View style={{ flexDirection: "row", marginTop: 10 }}>
              <TouchableOpacity style={styles.saveBtn} onPress={saveEdit}>
                <Text style={styles.btnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* WHATSAPP-STYLE WEB IMAGE SEARCH MODAL */}
      <Modal visible={webImageGridModal} animationType="slide" transparent={false}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#0b141a" }}>
          <StatusBar barStyle="light-content" backgroundColor="#0b141a" />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 12,
              borderBottomWidth: 1,
              borderBottomColor: "#1f2c34"
            }}
          >
            <TouchableOpacity onPress={() => setWebImageGridModal(false)} style={{ padding: 6 }}>
              <Icon name="arrow-left" size={24} color="#e9edef" />
            </TouchableOpacity>

            <View
              style={{
                flex: 1,
                marginHorizontal: 10,
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#1f2c34",
                borderRadius: 20,
                paddingHorizontal: 12,
                height: 42
              }}
            >
              <TextInput
                value={webSearchQuery}
                onChangeText={setWebSearchQuery}
                placeholder="Search web"
                placeholderTextColor="#8696a0"
                style={{ flex: 1, color: "#fff", fontSize: 15 }}
                onSubmitEditing={() => executeWebSearch(webSearchQuery)}
                returnKeyType="search"
              />
              {webSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setWebSearchQuery("")}>
                  <Icon name="close" size={18} color="#8696a0" />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity onPress={() => executeWebSearch(webSearchQuery)} style={{ padding: 6 }}>
              <Icon name="magnify" size={24} color="#00a884" />
            </TouchableOpacity>
          </View>

          {webSearchSearching ? (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
              <ActivityIndicator size="large" color="#00a884" />
              <Text style={{ color: "#8696a0", marginTop: 12 }}>Searching Google Web Images...</Text>
            </View>
          ) : (
            <FlatList
              data={webSearchResults}
              numColumns={3}
              keyExtractor={(item, index) => index.toString()}
              contentContainerStyle={{ padding: 2 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    setEditImage(item);
                    setWebImageGridModal(false);
                  }}
                  style={{
                    flex: 1 / 3,
                    aspectRatio: 1,
                    margin: 2,
                    backgroundColor: "#ffffff",
                    borderRadius: 4,
                    overflow: "hidden",
                    justifyContent: "center",
                    alignItems: "center"
                  }}
                >
                  <Image source={{ uri: item }} style={{ width: "95%", height: "95%" }} resizeMode="contain" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ flex: 1, alignItems: "center", marginTop: 60 }}>
                  <Icon name="image-search-outline" size={60} color="#8696a0" />
                  <Text style={{ color: "#8696a0", marginTop: 10 }}>
                    No web images found. Try different keyword.
                  </Text>
                </View>
              }
            />
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: "#f8fafc" },
  title: { fontSize: 22, fontWeight: "bold", color: "#1e293b" },
  menuCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 5,
    paddingHorizontal: 15
  },
  menuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  menuIconBox: { width: 38, height: 38, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  menuTitle: { fontSize: 15, fontWeight: "600", color: "#1e293b" },
  menuSub: { fontSize: 12, color: "#64748b", marginTop: 2 },
  divider: { height: 1, backgroundColor: "#f1f5f9", width: "100%" },
  subCard: { padding: 15, borderRadius: 12, marginBottom: 10 },

  // Tablet Grid Layout Support
  tabletGridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12
  },
  tabletHalfCard: {
    width: "48.5%"
  },
  tabletGridCard: {
    flex: 1,
    marginHorizontal: 6
  },

  // Brand Performance Card Styles
  brandCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2
  },
  brandHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brandIconBox: { width: 40, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  brandNameText: { fontSize: 16, fontWeight: "bold" },
  bestSellerBadge: {
    backgroundColor: "#dcfce7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#86efac"
  },
  bestSellerText: { color: "#15803d", fontSize: 11, fontWeight: "bold" },
  metricsContainer: { flexDirection: "row", gap: 8, marginTop: 12 },
  metricBox: { flex: 1, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10, alignItems: "center" },
  metricLabel: { fontSize: 10, fontWeight: "600", marginBottom: 2 },
  metricVal: { fontSize: 12, fontWeight: "700" },
  viewItemsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: "#e2e8f0"
  },

  card: {
    backgroundColor: "#ffffff",
    marginBottom: 10,
    borderRadius: 18,
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    paddingVertical: 10,
  },
  leftSection: { marginRight: 12, position: "relative" },
  image: { width: 60, height: 75, borderRadius: 12 },
  newTag: {
    position: "absolute",
    top: 5,
    left: 5,
    backgroundColor: "#6366f1",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  newText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  details: { flex: 1, justifyContent: "center" },
  name: { fontSize: 15, fontWeight: "600", color: "#1e293b" },
  brandTag: {
    backgroundColor: "#6366f1",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 4,
    alignSelf: "flex-start"
  },
  brandText: { color: "#fff", fontSize: 10 },
  price: { fontSize: 17, marginTop: 4, fontWeight: "bold" },
  qtyBadgeBox: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 60
  },
  qtyLarge: { fontSize: 20, fontWeight: "bold", textAlign: "center" },
  qtyLabel: { fontSize: 11, textAlign: "center", fontWeight: "600" },
  barcodeBox: {
    marginTop: 10,
    backgroundColor: "#f1f5f9",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center"
  },
  barcode: { width: "100%", height: 28 },
  barcodeText: { color: "#000", fontSize: 10, textAlign: "center", marginTop: 2 },
  actionRow: { flexDirection: "row", marginTop: 12, justifyContent: "space-between" },
  editBtn: {
    flex: 1,
    backgroundColor: "#6366f1",
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: "#ef4444",
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6
  },
  btnText: { color: "#fff", fontSize: 13, fontWeight: "500" },
  modalContainer: { flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 20 },
  modalBox: { backgroundColor: "#ffffff", borderRadius: 16, padding: 20 },
  modalTitle: { color: "#1e293b", fontSize: 18, marginBottom: 10, fontWeight: "600" },
  input: { backgroundColor: "#f1f5f9", borderRadius: 10, padding: 10, marginBottom: 10 },
  saveBtn: {
    flex: 1,
    backgroundColor: "#6366f1",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginRight: 5,
    justifyContent: "center"
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#ef4444",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  }
});