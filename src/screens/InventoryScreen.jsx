import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Image, TouchableOpacity, Alert, Modal, TextInput } from "react-native";
import { useIsFocused } from "@react-navigation/native"; 
import { auth, db } from "../firebaseConfig";
import { collection, onSnapshot, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { getSession } from "../../utils/session";
import { useTheme } from "../theme/ThemeContext";
import { launchImageLibrary } from "react-native-image-picker";

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
  const [searchText, setSearchText] = useState("");
  const [editImage, setEditImage] = useState("");
  const [currentMode, setCurrentMode] = useState("local"); 

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
    setModalVisible(true);
    setEditImage(item.image || "");
  };

  const saveEdit = async () => {
    const user = auth.currentUser;
    if (!user || !selectedItem) return;
    const collectionName = currentMode === "global" ? "global_inventory" : "inventory";

    try {
      await updateDoc(
        doc(db, "users", user.uid, collectionName, selectedItem.id),
        {
          itemName: editName,
          purchasePrice: Number(editPurchasePrice),
          salesPrice: Number(editSalesPrice),
          quantity: Number(editQty),
          image: editImage
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

  const filteredItems = items.filter(item => {
    const q = searchText.toLowerCase();
    return (
      (item.itemName || "").toLowerCase().includes(q) ||
      (item.brand || "").toLowerCase().includes(q) ||
      (item.barcode || "").toString().toLowerCase().includes(q) ||
      (item.category || "").toLowerCase().includes(q)
    );
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
        <Text style={[styles.title, { color: theme.text }]}>
          📦 Inventory ({currentMode === "global" ? "Global Shop" : "Local Shop"})
        </Text>
      </View>

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
              <Text style={styles.price}>Buy: ₹ {item.purchasePrice || 0}</Text>
              <Text style={styles.price}>Sell: ₹ {item.salesPrice || 0}</Text>
              <Text style={[styles.qty, { color: theme.subText }]}>Qty: {item.quantity || 0} {item.unitType || "Qty"}</Text>
              {item.quantity <= 5 && item.quantity > 0 && <Text style={{ color: "orange", fontWeight: "bold", marginTop: 4 }}>⚠ Low Stock</Text>}
              {item.quantity === 0 && <Text style={{ color: "red", fontWeight: "bold", marginTop: 4 }}>‼️Out Of Stock</Text>}

              {item.barcode && (
                <View style={[styles.barcodeBox, { backgroundColor: darkMode ? "#ffffff" : "#f1f5f9" }]}>
                  <Image source={{ uri: `https://bwipjs-api.metafloor.com/?bcid=code128&text=${item.barcode}&scale=2&height=10&backgroundcolor=FFFFFF` }} style={styles.barcode} resizeMode="contain" />
                  <Text style={[styles.barcodeText, { color: "#000" }]}>{item.barcode}</Text>
                </View>
              )}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}><Text style={styles.btnText}>✏</Text></TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteItem(item.id)}><Text style={styles.btnText}>🗑</Text></TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* EDIT MODAL */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Edit Item ({currentMode.toUpperCase()})</Text>
            <TouchableOpacity onPress={() => { launchImageLibrary({ mediaType: "photo" }, (res) => { if (res.assets) { setEditImage(res.assets[0].uri); } }); }}>
              {editImage ? <Image source={{ uri: editImage }} style={{ width: 90, height: 90, borderRadius: 12, alignSelf: "center", marginBottom: 15 }} /> : <View style={{ width: 90, height: 90, borderRadius: 12, backgroundColor: "#e5e7eb", justifyContent: "center", alignItems: "center", alignSelf: "center", marginBottom: 15 }}><Text style={{ fontSize: 35, color: "#6366f1" }}>+</Text></View>}
            </TouchableOpacity>
            <TextInput placeholder="Name" value={editName} onChangeText={setEditName} style={styles.input} />
            <TextInput placeholder="Purchase Price" value={editPurchasePrice} onChangeText={setEditPurchasePrice} keyboardType="numeric" style={styles.input} />
            <TextInput placeholder="Sales Price" value={editSalesPrice} onChangeText={setEditSalesPrice} keyboardType="numeric" style={styles.input} />
            <TextInput placeholder="Quantity" value={editQty} onChangeText={setEditQty} keyboardType="numeric" style={styles.input} />
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
  title: { fontSize: 24, fontWeight: "bold", color: "#1e293b" },
  card: { flexDirection: "row", backgroundColor: "#ffffff", marginBottom: 14, borderRadius: 18, padding: 14, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  leftSection: { marginRight: 12, position: "relative" },
  image: { width: 70, height: 70, borderRadius: 12 },
  newTag: { position: "absolute", top: 5, left: 5, backgroundColor: "#6366f1", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  newText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  details: { flex: 1, justifyContent: "center" },
  name: { fontSize: 15, fontWeight: "600", color: "#1e293b" },
  brandTag: { backgroundColor: "#6366f1", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 4, alignSelf: "flex-start" },
  brandText: { color: "#fff", fontSize: 10 },
  price: { fontSize: 14, color: "#6366f1", marginTop: 4, fontWeight: "600" },
  qty: { fontSize: 12, color: "#64748b", marginTop: 2 },
  barcodeBox: { marginTop: 8, backgroundColor: "#f1f5f9", paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10 },
  barcode: { width: "100%", height: 50 },
  barcodeText: { color: "#000", fontSize: 11, textAlign: "center" },
  actions: { justifyContent: "space-between", alignItems: "center", height: 80, marginLeft: 10 },
  editBtn: { backgroundColor: "#6366f1", padding: 8, borderRadius: 8 },
  deleteBtn: { backgroundColor: "#ef4444", padding: 8, borderRadius: 8 },
  btnText: { color: "#fff", fontSize: 14 },
  modalContainer: { flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  modalBox: { backgroundColor: "#ffffff", margin: 20, borderRadius: 16, padding: 20 },
  modalTitle: { color: "#1e293b", fontSize: 18, marginBottom: 10, fontWeight: "600" },
  input: { backgroundColor: "#f1f5f9", borderRadius: 10, padding: 10, marginBottom: 10 },
  saveBtn: { flex: 1, backgroundColor: "#6366f1", padding: 12, borderRadius: 10, alignItems: "center", marginRight: 5 },
  cancelBtn: { flex: 1, backgroundColor: "#ef4444", padding: 12, borderRadius: 10, alignItems: "center" }
});