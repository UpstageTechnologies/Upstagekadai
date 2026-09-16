import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Image, TouchableOpacity, Alert, Modal, TextInput, ScrollView } from "react-native";
import { useIsFocused } from "@react-navigation/native"; 
import { auth, db, storage } from "../utils/firebaseConfig";
import { collection, onSnapshot, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { getSession } from "../utils/session";
import { useTheme } from "../theme/ThemeContext";
import { launchImageLibrary } from "react-native-image-picker";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";

export default function InventoryScreen({ appMode }) {
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
          (error) => { console.log("Firestore Error: ", error); }
        );
      } catch (err) { console.log("Error loading snapshot: ", err); }
    };

    if (isFocused) { loadInventoryLive(); }

    return () => { if (unsubscribe) unsubscribe(); };
  }, [isFocused, appMode]);

  const openEdit = (item) => {
    setSelectedItem(item);
    setEditName(item.itemName || "");
    setEditPurchasePrice(String(item.purchasePrice || ""));
    setEditSalesPrice(String(item.salesPrice || ""));
    setEditQty(String(item.quantity || ""));
    setEditBrand(item.brand || ""); 
    setModalVisible(true);
    setEditImage(item.image || "");
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
      Alert.alert("Upload Failed", "Stated using local URI due to error.");
      return localUri;
    }
  };

  const saveEdit = async () => {
    const user = auth.currentUser;
    if (!user || !selectedItem) return;
    const collectionName = currentMode === "global" ? "global_inventory" : "inventory";

    try {
      let finalImageUrl = selectedItem.image || "";
      if (editImage) {
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
          image: finalImageUrl 
        }
      );
      setModalVisible(false);
    } catch (err) { Alert.alert("Error", err.message); }
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
          try { await deleteDoc(doc(db, "users", user.uid, collectionName, id)); } 
          catch (err) { Alert.alert("Error", err.message); }
        },
      },
    ]);
  };

  const categoriesList = [...new Set(items.map(i => i.category || "Uncategorized"))];
  const brandsList = [...new Set(items.map(i => i.brand || "No Brand"))];

  const filteredItems = items.filter(item => {
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
      
      {/* Header */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {(activeTab !== "menu" || selectedCategory || selectedBrand) && (
            <TouchableOpacity onPress={handleBackPress} style={{ marginRight: 10 }}>
              <Text style={{ fontSize: 22, color: theme.text, fontWeight: "bold" }}>←</Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.title, { color: theme.text }]}>
            📦 {selectedCategory ? selectedCategory : selectedBrand ? selectedBrand : activeTab === "menu" ? "Inventory" : activeTab.toUpperCase()}
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: theme.subText }}>{currentMode === "global" ? "Global" : "Local"}</Text>
      </View>

      {/* 1. MENU DASHBOARD VIEW */}
      {activeTab === "menu" && !selectedCategory && !selectedBrand && (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={[styles.menuCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            
            <TouchableOpacity style={styles.menuItem} onPress={() => setActiveTab("products")}>
              <View style={[styles.menuIconBox, { backgroundColor: darkMode ? "#334155" : "#f1f5f9" }]}><Text>📦</Text></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Products</Text>
                <Text style={[styles.menuSub, { color: theme.subText }]}>Manage products and stock</Text>
              </View>
              <Text style={{ color: theme.subText, fontSize: 18 }}>›</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <TouchableOpacity style={styles.menuItem} onPress={() => setActiveTab("categories")}>
              <View style={[styles.menuIconBox, { backgroundColor: darkMode ? "#334155" : "#f1f5f9" }]}><Text>📂</Text></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Categories</Text>
                <Text style={[styles.menuSub, { color: theme.subText }]}>Manage product categories</Text>
              </View>
              <Text style={{ color: theme.subText, fontSize: 18 }}>›</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <TouchableOpacity style={styles.menuItem} onPress={() => setActiveTab("brands")}>
              <View style={[styles.menuIconBox, { backgroundColor: darkMode ? "#334155" : "#f1f5f9" }]}><Text>🏷️</Text></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Brands</Text>
                <Text style={[styles.menuSub, { color: theme.subText }]}>Manage product brands</Text>
              </View>
              <Text style={{ color: theme.subText, fontSize: 18 }}>›</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <TouchableOpacity style={styles.menuItem} onPress={() => setActiveTab("lowStock")}>
              <View style={[styles.menuIconBox, { backgroundColor: darkMode ? "#334155" : "#f1f5f9" }]}><Text>⚠️</Text></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Low Stock Alerts</Text>
                <Text style={[styles.menuSub, { color: theme.subText }]}>Review low and out-of-stock products</Text>
              </View>
              <Text style={{ color: theme.subText, fontSize: 18 }}>›</Text>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <TouchableOpacity style={styles.menuItem} onPress={() => setActiveTab("restock")}>
              <View style={[styles.menuIconBox, { backgroundColor: darkMode ? "#334155" : "#f1f5f9" }]}><Text>📋</Text></View>
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
              <View style={[styles.menuIconBox, { backgroundColor: darkMode ? "#334155" : "#f1f5f9" }]}><Text>📥</Text></View>
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
        <ScrollView>
          {categoriesList.map((cat, index) => (
            <TouchableOpacity key={index} style={[styles.subCard, { backgroundColor: theme.card }]} onPress={() => setSelectedCategory(cat)}>
              <Text style={[styles.menuTitle, { color: theme.text }]}>📂 {cat}</Text>
              <Text style={{ color: theme.subText, fontSize: 12, marginTop: 4 }}>
                Products count: {items.filter(i => (i.category || "Uncategorized") === cat).length}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* 3. BRANDS LIST VIEW */}
      {activeTab === "brands" && !selectedBrand && (
        <ScrollView>
          {brandsList.map((brand, index) => (
            <TouchableOpacity key={index} style={[styles.subCard, { backgroundColor: theme.card }]} onPress={() => setSelectedBrand(brand)}>
              <Text style={[styles.menuTitle, { color: theme.text }]}>🏷️ {brand}</Text>
              <Text style={{ color: theme.subText, fontSize: 12, marginTop: 4 }}>
                Products count: {items.filter(i => (i.brand || "No Brand") === brand).length}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* 4. RESTOCK LIST VIEW */}
      {activeTab === "restock" && (
        <View style={{ padding: 20, alignItems: "center" }}>
          <Text style={{ fontSize: 16, fontWeight: "bold", color: theme.text, textAlign: "center" }}>Restock Plan</Text>
          <Text style={{ color: theme.subText, textAlign: "center", marginTop: 10 }}>
            Track items that need immediate refilling for your store. Low stock items are automatically listed here.
          </Text>
        </View>
      )}

      {/* 5. IMPORT PRODUCTS VIEW */}
      {activeTab === "import" && (
        <View style={{ padding: 20, alignItems: "center" }}>
          <Text style={{ fontSize: 16, fontWeight: "bold", color: theme.text, textAlign: "center" }}>Import Products</Text>
          <Text style={{ color: theme.subText, textAlign: "center", marginTop: 10 }}>
            You can upload your CSV files or sync items directly from external databases.
          </Text>
        </View>
      )}

      {/* 6. PRODUCTS / LOW STOCK / SELECTED CATEGORY / SELECTED BRAND LIST VIEW */}
      {(activeTab === "products" || activeTab === "lowStock" || selectedCategory || selectedBrand) && (
        <>
          <TextInput
            placeholder="Search product, brand, barcode..."
            placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
            value={searchText}
            onChangeText={setSearchText}
            style={{ backgroundColor: theme.card, height: 52, borderColor: theme.border, paddingHorizontal: 16, color: theme.text, marginBottom: 15, borderWidth: 1, borderRadius: 14 }}
          />

          <FlatList
            data={filteredItems}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 20 }}
            renderItem={({ item }) => (
              <View style={[styles.card, { backgroundColor: theme.card }, item.quantity <= 5 && { borderColor: "red", borderWidth: 1 }]}>
                
                {/* Top Section: Image & Details Side-by-Side with Enhanced Quantity on Right */}
                <View style={{ flexDirection: "row", width: "100%", alignItems: "center" }}>
                  <View style={styles.leftSection}>
                    <Image source={{ uri: item.image || "https://via.placeholder.com/150" }} style={styles.image} />
                    {item.createdAt && (() => {
                      const created = item.createdAt.toDate();
                      const now = new Date();
                      return ((now - created) / (1000 * 60 * 60 * 24)) <= 5;
                    })() && <View style={styles.newTag}><Text style={styles.newText}>NEW</Text></View>}
                  </View>

                  <View style={styles.details}>
                    <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.itemName || "No Name"}</Text>
                    <View style={styles.brandTag}><Text style={styles.brandText}>{item.brand || "No Brand"}</Text></View>
                    <Text style={[styles.price, { color: theme.text }]}>₹ {item.salesPrice || 0}</Text>
                    {item.quantity <= 5 && item.quantity > 0 && <Text style={{ color: "orange", fontWeight: "bold", marginTop: 4, fontSize: 11 }}>⚠ Low Stock</Text>}
                    {item.quantity === 0 && <Text style={{ color: "red", fontWeight: "bold", marginTop: 4, fontSize: 11 }}>‼️ Out Of Stock</Text>}
                  </View>

                  {/* Professional Right-side Quantity Badge Display */}
                  <View style={[styles.qtyBadgeBox, { backgroundColor: darkMode ? "#334155" : "#e0e7ff" }]}>
                    <Text style={[styles.qtyLarge, { color: darkMode ? "#38bdf8" : "#4f46e5" }]}>{item.quantity || 0}</Text>
                    <Text style={[styles.qtyLabel, { color: darkMode ? "#94a3b8" : "#6366f1" }]}>{item.unitType || "Qty"}</Text>
                  </View>
                </View>

                {/* Compact Barcode Clickable Box */}
                {item.barcode && (
                  <TouchableOpacity 
                    style={[styles.barcodeBox, { backgroundColor: darkMode ? "#ffffff" : "#f1f5f9" }]}
                    onPress={() => {
                      setSelectedBarcode(item.barcode);
                      setBarcodeModalVisible(true);
                    }}
                  >
                    <Image source={{ uri: `https://bwipjs-api.metafloor.com/?bcid=code128&text=${item.barcode}&scale=2&height=10&backgroundcolor=FFFFFF` }} style={styles.barcode} resizeMode="contain" />
                    <Text style={[styles.barcodeText, { color: "#000" }]}>{item.barcode} (Tap to Zoom & Print)</Text>
                  </TouchableOpacity>
                )}

                {/* Bottom Action Buttons (Edit & Delete) */}
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                    <MaterialCommunityIcons name="pencil" size={16} color="#fff" />
                    <Text style={styles.btnText}> Edit</Text>
                  </TouchableOpacity>
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

      {/* BARCODE ZOOM & PRINT MODAL */}
      <Modal visible={barcodeModalVisible} transparent animationType="fade">
        <View style={styles.modalContainer}>
          <View style={[styles.modalBox, { backgroundColor: theme.card, alignItems: "center" }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Barcode View</Text>
            {selectedBarcode && (
              <View style={{ backgroundColor: "#fff", padding: 15, borderRadius: 12, marginVertical: 10, width: "100%", alignItems: "center" }}>
                <Image 
                  source={{ uri: `https://bwipjs-api.metafloor.com/?bcid=code128&text=${selectedBarcode}&scale=3&height=15&backgroundcolor=FFFFFF` }} 
                  style={{ width: 250, height: 90 }} 
                  resizeMode="contain" 
                />
                <Text style={{ color: "#000", fontSize: 14, fontWeight: "bold", marginTop: 8 }}>{selectedBarcode}</Text>
              </View>
            )}
            <View style={{ flexDirection: "row", width: "100%", marginTop: 10 }}>
              <TouchableOpacity 
                style={[styles.saveBtn, { backgroundColor: "#10b981", justifyContent: "center" }]} 
                onPress={() => Alert.alert("Print Barcode", "Sending barcode to connected printer...")}
              >
                <Text style={[styles.btnText, { fontWeight: "bold", textAlign: "center" }]}>🖨️ Print</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.cancelBtn, { justifyContent: "center" }]} 
                onPress={() => setBarcodeModalVisible(false)}
              >
                <Text style={[styles.btnText, { fontWeight: "bold", textAlign: "center" }]}>❌ Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* EDIT MODAL */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={[styles.modalBox, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Item ({currentMode.toUpperCase()})</Text>
            <TouchableOpacity onPress={() => { launchImageLibrary({ mediaType: "photo" }, (res) => { if (res.assets) { setEditImage(res.assets[0].uri); } }); }}>
              {editImage ? <Image source={{ uri: editImage }} style={{ width: 90, height: 90, borderRadius: 12, alignSelf: "center", marginBottom: 15 }} /> : <View style={{ width: 90, height: 90, borderRadius: 12, backgroundColor: "#e5e7eb", justifyContent: "center", alignItems: "center", alignSelf: "center", marginBottom: 15 }}><Text style={{ fontSize: 35, color: "#6366f1" }}>+</Text></View>}
            </TouchableOpacity>
            <TextInput placeholder="Name" placeholderTextColor="#888" value={editName} onChangeText={setEditName} style={[styles.input, { color: theme.text }]} />
            <TextInput placeholder="Brand" placeholderTextColor="#888" value={editBrand} onChangeText={setEditBrand} style={[styles.input, { color: theme.text }]} />
            <TextInput placeholder="Purchase Price" placeholderTextColor="#888" value={editPurchasePrice} onChangeText={setEditPurchasePrice} keyboardType="numeric" style={[styles.input, { color: theme.text }]} />
            <TextInput placeholder="Sales Price" placeholderTextColor="#888" value={editSalesPrice} onChangeText={setEditSalesPrice} keyboardType="numeric" style={[styles.input, { color: theme.text }]} />
            <TextInput placeholder="Quantity" placeholderTextColor="#888" value={editQty} onChangeText={setEditQty} keyboardType="numeric" style={[styles.input, { color: theme.text }]} />
            <View style={{ flexDirection: "row", marginTop: 10 }}>
              <TouchableOpacity style={styles.saveBtn} onPress={saveEdit}><Text style={styles.btnText}>Save</Text></TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}><Text style={styles.btnText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: "#f8fafc" },
  title: { fontSize: 22, fontWeight: "bold", color: "#1e293b" },
  menuCard: { backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1, borderColor: "#e2e8f0", paddingVertical: 5, paddingHorizontal: 15 },
  menuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  menuIconBox: { width: 38, height: 38, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  menuTitle: { fontSize: 15, fontWeight: "600", color: "#1e293b" },
  menuSub: { fontSize: 12, color: "#64748b", marginTop: 2 },
  divider: { height: 1, backgroundColor: "#f1f5f9", width: "100%" },
  subCard: { padding: 15, borderRadius: 12, marginBottom: 10 },
  card: { backgroundColor: "#ffffff", marginBottom: 14, borderRadius: 18, padding: 14, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  leftSection: { marginRight: 12, position: "relative" },
  image: { width: 75, height: 75, borderRadius: 12 },
  newTag: { position: "absolute", top: 5, left: 5, backgroundColor: "#6366f1", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  newText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  details: { flex: 1, justifyContent: "center" },
  name: { fontSize: 15, fontWeight: "600", color: "#1e293b" },
  brandTag: { backgroundColor: "#6366f1", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 4, alignSelf: "flex-start" },
  brandText: { color: "#fff", fontSize: 10 },
  price: { fontSize: 17, marginTop: 4, fontWeight: "bold" },
  qtyBadgeBox: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, alignItems: "center", justifyContent: "center", minWidth: 60 },
  qtyLarge: { fontSize: 20, fontWeight: "bold", textAlign: "center" },
  qtyLabel: { fontSize: 11, textAlign: "center", fontWeight: "600" },
  barcodeBox: { marginTop: 10, backgroundColor: "#f1f5f9", paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, alignItems: "center" },
  barcode: { width: "100%", height: 35 },
  barcodeText: { color: "#000", fontSize: 10, textAlign: "center", marginTop: 2 },
  actionRow: { flexDirection: "row", marginTop: 12, justifyContent: "space-between" },
  editBtn: { flex: 1, backgroundColor: "#6366f1", paddingVertical: 8, borderRadius: 8, flexDirection: "row", justifyContent: "center", alignItems: "center", marginRight: 6 },
  deleteBtn: { flex: 1, backgroundColor: "#ef4444", paddingVertical: 8, borderRadius: 8, flexDirection: "row", justifyContent: "center", alignItems: "center", marginLeft: 6 },
  btnText: { color: "#fff", fontSize: 13, fontWeight: "500" },
  modalContainer: { flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 20 },
  modalBox: { backgroundColor: "#ffffff", borderRadius: 16, padding: 20 },
  modalTitle: { color: "#1e293b", fontSize: 18, marginBottom: 10, fontWeight: "600" },
  input: { backgroundColor: "#f1f5f9", borderRadius: 10, padding: 10, marginBottom: 10 },
  saveBtn: { flex: 1, backgroundColor: "#6366f1", padding: 12, borderRadius: 10, alignItems: "center", marginRight: 5, justifyContent: "center" },
  cancelBtn: { flex: 1, backgroundColor: "#ef4444", padding: 12, borderRadius: 10, alignItems: "center", justifyContent: "center" }
});