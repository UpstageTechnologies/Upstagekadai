import React, { useEffect, useState, useRef } from "react";
import { Modal } from "react-native";
import { query, where, getDocs, updateDoc, doc, getDoc, collection, addDoc, deleteDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import RNPrint from "react-native-print";
import { useFocusEffect } from "@react-navigation/native";
import DropDownPicker from 'react-native-dropdown-picker';
import { WebView } from "react-native-webview";
import { View, Alert, Text, StyleSheet, Dimensions, TextInput, ScrollView, TouchableOpacity } from "react-native";
import { Camera, useCameraDevice, useCodeScanner } from "react-native-vision-camera";

import { auth, db } from "../firebaseConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("window");

export default function ScanScreen({ navigation }) {
  const device = useCameraDevice("back");
  
  const [currentMode, setCurrentMode] = useState("local");
  const [items, setItems] = useState([]);
  const [scannedList, setScannedList] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [tempProduct, setTempProduct] = useState(null);
  const [open, setOpen] = useState(false);
  const [categoryItems, setCategoryItems] = useState([]);
  const [editName, setEditName] = useState("");
  const [editQty, setEditQty] = useState("1");
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [editImage, setEditImage] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salesPrice, setSalesPrice] = useState("");
  const [bill, setBill] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [addingAll, setAddingAll] = useState(false);
  const [shopName, setShopName] = useState("MY SHOP");
  const [logoUrl, setLogoUrl] = useState("");
  const [unitType, setUnitType] = useState("Qty");
  const [supplierName, setSupplierName] = useState("");
  const [newCategoryModal, setNewCategoryModal] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  
  // 🌟 பிக்ஸ்: பர்ச்சேஸ் ரசீதை ஸ்க்ரீனில் பார்க்க உதவும் ஸ்டேட்கள்
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [currentPurNo, setCurrentPurNo] = useState("");
  const [currentPurDate, setCurrentPurDate] = useState("");
  const [purTotal, setPurTotal] = useState(0);

  const scanLockRef = useRef(false);

  useEffect(() => {
    (async () => {
      await Camera.requestCameraPermission();
    })();
  }, []);

  useEffect(() => {
    const loadShop = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        setShopName(snap.data().shopName || "MY SHOP");
      }

      const logo = await AsyncStorage.getItem(`shopLogo_${user.uid}`) || await AsyncStorage.getItem(`shopLogoBase64_${user.uid}`);
      if (logo) { setLogoUrl(logo); }
    };
    loadShop();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const user = auth.currentUser;
      if (!user) return;

      let unsubscribeInventory;
      let unsubscribeCategories;
      
      const setupListeners = async () => {
        const savedMode = (await AsyncStorage.getItem("app_mode")) || "local";
        setCurrentMode(savedMode);
        
        const inventoryCollection = savedMode === "global" ? "global_inventory" : "inventory";
        const categoriesCollection = savedMode === "global" ? "global_categories" : "categories";

        unsubscribeInventory = onSnapshot(
          collection(db, "users", user.uid, inventoryCollection),
          (snap) => {
            setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          }
        );

        unsubscribeCategories = onSnapshot(
          collection(db, "users", user.uid, categoriesCollection),
          (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setCategories(data);
            setCategoryItems(data.map(cat => ({ label: cat.name, value: cat.name, id: cat.id })));
          }
        );
      };

      setupListeners();
      return () => { 
        if (unsubscribeInventory) unsubscribeInventory(); 
        if (unsubscribeCategories) unsubscribeCategories(); 
      };
    }, [currentMode])
  );

  const user = auth.currentUser;
  const inventoryCollection = currentMode === "global" ? "global_inventory" : "inventory";
  const categoriesCollection = currentMode === "global" ? "global_categories" : "categories";
  const invoicesCollection = currentMode === "global" ? "global_invoices" : "invoices";
  const inventoryRef = user ? collection(db, "users", user.uid, inventoryCollection) : null;

  const filteredItems = items.filter(i =>
    (i.itemName || "").toLowerCase().includes(searchText.toLowerCase())
  );

  const handleDeleteCategory = (catId, catName) => {
    Alert.alert(
      "Delete Category 🗑️",
      `Are you sure you want to delete "${catName}"?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            try {
              if (user) {
                await deleteDoc(doc(db, "users", user.uid, categoriesCollection, catId));
                Alert.alert("Success", "Category deleted successfully!");
              }
            } catch (error) {
              console.log("Error deleting category:", error);
            }
          } 
        }
      ]
    );
  };

  // 🌟 பிக்ஸ்: பர்ச்சேஸ் பில் பிரிண்ட் டிசைன் Sales பில் டிசைன் போல மாற்றப்பட்டுள்ளது
  const triggerPurchasePrint = async (purNo, purDate, totalAmt) => {
    const supName = supplierName || bill[0]?.supplierName || "Walk-in Supplier";
    const html = `
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
      <style>
        @page { size: 58mm auto; margin: 0mm; }
        body { font-family: monospace; margin: 0; padding: 6mm 4mm; font-size: 12px; color: #000; font-weight: bold; }
        .center { text-align: center; } 
        .logo-container { text-align: center; margin-bottom: 5px; }
        .logo-img { width: 50px; height: 50px; border-radius: 50%; object-fit: cover; }
        .divider { border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; }
        table { width: 100%; border-collapse: collapse; }
        td { font-size: 12px; padding: 2px 0; }
        .right { text-align: right; }
      </style>
    </head>
    <body>
      ${logoUrl ? `<div class="logo-container"><img class="logo-img" src="${logoUrl}"/></div>` : ""}
      <div class="center" style="font-size:14px; font-weight:bold;">${shopName}</div>
      <div class="center" style="font-size:11px;">STOCK PURCHASE RECEIPT</div>
      <div class="divider"></div>
      <div>Pur No: ${purNo}</div>
      <div>Date: ${purDate}</div>
      <div>Supplier: ${supName}</div>
      <div class="divider"></div>
      <table>
        ${bill.map(i => `
          <tr>
            <td>${i.name}<br/>&nbsp;&nbsp;${i.qty} x ₹${Number(i.purchasePrice).toFixed(2)}</td>
            <td class="right" style="vertical-align:bottom;">₹${(i.qty * i.purchasePrice).toFixed(2)}</td>
          </tr>
        `).join("")}
      </table>
      <div class="divider"></div>
      <div class="row"><span>Subtotal:</span><span>₹${Number(totalAmt).toFixed(2)}</span></div>
      <div class="row" style="font-size:13px; font-weight:bold;"><span>Grand Total:</span><span>₹${Number(totalAmt).toFixed(2)}</span></div>
      <div class="divider"></div>
      <div class="center" style="margin-top:12px;">Purchase Recorded Successfully!</div>
    </body>
    </html>`;

    await RNPrint.print({ html });
  };

  const handleProcessPurchaseInvoice = async () => {
    if (bill.length === 0) {
      Alert.alert("Error", "Bill is empty!");
      return;
    }

    const purchaseTotal = bill.reduce((sum, i) => sum + (i.purchasePrice || 0) * i.qty, 0);
    const supName = supplierName || bill[0]?.supplierName || "Walk-in Supplier";
    const purchaseNo = "PUR-" + Date.now().toString().slice(-6);
    const purchaseDate = new Date().toLocaleDateString("en-GB");

    try {
      if (user) {
        await addDoc(collection(db, "users", user.uid, invoicesCollection), {
          billNo: purchaseNo,
          invoiceId: purchaseNo,
          supplierName: supName,
          items: bill.map(i => ({
            itemName: i.name,
            purchasePrice: Number(i.purchasePrice || 0),
            qty: Number(i.qty || 1),
            unitType: i.unitType || "Qty"
          })),
          total: Number(purchaseTotal),
          createdAt: serverTimestamp()
        });

        setCurrentPurNo(purchaseNo);
        setCurrentPurDate(purchaseDate);
        setPurTotal(purchaseTotal);
        setShowReceiptModal(true);
      }
    } catch (e) {
      Alert.alert("Save Error", e.message);
    }
  };

  const codeScanner = useCodeScanner({
    codeTypes: ["ean-13", "qr"],
    onCodeScanned: async (codes) => {
      const code = codes[0]?.value;
      if (!code) return;
      if (scanLockRef.current) return;
      scanLockRef.current = true;
      setTimeout(() => { scanLockRef.current = false; }, 1500);

      try {
        const userUid = auth.currentUser?.uid;
        if (!userUid) return;

        const userDoc = await getDoc(doc(db, "users", userUid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const plan = userData.subscriptionPlan || "Free Trial";

          if (plan === "Basic") {
            const todayStr = new Date().toDateString();
            const savedDate = await AsyncStorage.getItem(`scan_date_${userUid}`);
            let currentCount = 0;

            if (savedDate === todayStr) {
              const countStr = await AsyncStorage.getItem(`scan_count_${userUid}`);
              currentCount = parseInt(countStr || "0", 10);
            } else {
              await AsyncStorage.setItem(`scan_date_${userUid}`, todayStr);
              await AsyncStorage.setItem(`scan_count_${userUid}`, "0");
            }

            if (currentCount >= 5) {
              Alert.alert("Scan Limit Reached ⚠️", "Crossed your scan limit.");
              return;
            }
            await AsyncStorage.setItem(`scan_count_${userUid}`, String(currentCount + 1));
          }
        }
      } catch (err) { console.log(err); }

      try {
        const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
        let data;
        try { data = await res.json(); } catch { data = { status: 0 }; }

        const name = data?.status === 1 ? data.product?.product_name || "New Product" : "New Product";
        const brand = data?.status === 1 ? data.product?.brands || "Unknown Brand" : "Unknown Brand";
        const image = data?.status === 1 ? data.product?.image_front_url || "" : "";

        if (!user || !inventoryRef) return;
        const q = query(inventoryRef, where("barcode", "==", code));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const existingDoc = querySnapshot.docs[0];
          const existingData = existingDoc.data();

          const newItem = {
            id: existingDoc.id,
            name: existingData.itemName,
            brand: existingData.brand,
            image: existingData.image,
            barcode: code,
            purchasePrice: existingData.purchasePrice || 0
          };

          setScannedList(prev => {
            const exist = prev.find(i => i.barcode === code);
            if (exist) { return prev.map(i => i.barcode === code ? { ...i, qty: (i.qty || 1) + 1 } : i); }
            return [...prev, { ...newItem, qty: 1 }];
          });
        } else {
          Alert.alert("New Product ⚠️", "Please enter product details");
          const newItem = { name, brand, image, barcode: code, purchasePrice: 0 };
          setScannedList((prev) => {
            const exist = prev.find(i => i.barcode === code);
            if (exist) { return prev.map(i => i.barcode === code ? { ...i, qty: (i.qty || 1) + 1 } : i); }
            return [...prev, { ...newItem, qty: 1 }];
          });
        }
      } catch (err) { console.log(err); }
    }
  });

  const handleAddOrUpdateProduct = async () => {
    if (!user || !tempProduct) return;
    const finalName = editName || tempProduct.name || "New Product";
    const finalPrice = Number(purchasePrice) > 0 ? Number(purchasePrice) : Number(tempProduct.purchasePrice || 0);
    const finalSalesPrice = Number(salesPrice) || 0;
    const finalQty = Number(editQty) || 1;

    try {
      if (tempProduct?.id && tempProduct.id.length > 10 && !tempProduct.id.startsWith("NO-BARCODE-")) {
        await updateDoc(doc(db, "users", user.uid, inventoryCollection, tempProduct.id), {
          itemName: finalName,
          brand: editBrand || tempProduct.brand || "",
          image: editImage || tempProduct.image || "",
          purchasePrice: finalPrice,
          salesPrice: finalSalesPrice,
          quantity: finalQty,
          category: selectedCategory,
          unitType: unitType,
          supplierName: supplierName
        });
      } else {
        await addDoc(collection(db, "users", user.uid, inventoryCollection), {
          barcode: tempProduct.barcode,
          itemName: finalName,
          brand: editBrand || tempProduct.brand || "",
          image: editImage || tempProduct.image || "",
          purchasePrice: finalPrice,
          salesPrice: finalSalesPrice,
          quantity: finalQty,
          category: selectedCategory,
          unitType: unitType,
          supplierName: supplierName,
          createdAt: serverTimestamp()
        });
      }

      setScannedList(prev => prev.map(i => i.barcode === tempProduct.barcode ? { ...i, name: finalName, purchasePrice: finalPrice } : i));
      setBill(prev => {
        const exist = prev.find(i => i.barcode === tempProduct.barcode && i.purchasePrice === finalPrice);
        if (exist) { return prev.map(i => i.barcode === tempProduct.barcode ? { ...i, name: finalName, purchasePrice: finalPrice, qty: i.qty + finalQty } : i); }
        return [...prev, {
          barcode: tempProduct.barcode,
          name: finalName,
          qty: finalQty,
          purchasePrice: finalPrice,
          salesPrice: finalSalesPrice,
          brand: editBrand || "",
          image: editImage || "",
          category: selectedCategory || "",
          unitType: unitType,
          supplierName: supplierName,
        }];
      });

      setModalVisible(false);
      setTempProduct(null); setEditName(""); setEditBrand(""); setEditImage(""); setPurchasePrice(""); setSalesPrice(""); setEditQty("1"); setSelectedCategory("");
    } catch (error) { Alert.alert("Error", error.message); }
  };

  const handleAddAllItems = async () => {
    if (scannedList.length === 0) return;
    setAddingAll(true);
    let newBill = [...bill];

    scannedList.forEach(item => {
      const index = newBill.findIndex(b => b.barcode === item.barcode);
      if (index >= 0) { newBill[index].qty += item.qty || 1; } 
      else {
        newBill.push({
          barcode: item.barcode,
          name: item.name,
          qty: item.qty || 1,
          purchasePrice: Number(item.purchasePrice || 0),
          salesPrice: Number(item.salesPrice || 0),
          category: item.category || "",
          unitType: item.unitType || "Qty",
          supplierName: supplierName || "Walk-in Supplier"
        });
      }
    });

    try {
      if (user) {
        const purchaseTotal = newBill.reduce((sum, i) => sum + (i.purchasePrice || 0) * i.qty, 0);
        const purchaseNo = "PUR-" + Date.now().toString().slice(-6);

        await addDoc(collection(db, "users", user.uid, invoicesCollection), {
          billNo: purchaseNo,
          invoiceId: purchaseNo,
          supplierName: supplierName || "Walk-in Supplier",
          items: newBill.map(i => ({ itemName: i.name, purchasePrice: Number(i.purchasePrice || 0), qty: Number(i.qty || 1), unitType: i.unitType || "Qty" })),
          total: Number(purchaseTotal),
          createdAt: serverTimestamp()
        });
      }
    } catch (err) { console.log(err); }

    setBill(newBill);
    setScannedList([]);
    setAddingAll(false);
    setSuccessVisible(true);
    setTimeout(() => { setSuccessVisible(false); }, 1800);
  };

  // 🌟 பிக்ஸ்: தேர்ந்தெடுக்கப்பட்ட கேட்டகிரியை கொண்டு பர்ச்சேஸ் மாடல் பொருட்களை பில்டர் செய்கிறது
  const filteredCategoryProducts = items.filter(item => {
    const matchesCategory = selectedCategory ? (item.category === selectedCategory) : true;
    const matchesSearch = (item.itemName || "").toLowerCase().includes(editName.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (!device) return <Text>Loading Camera...</Text>;

  return (
    <View style={styles.container}>
      <Camera style={{ width: "100%", height: "50%" }} device={device} isActive={true} codeScanner={codeScanner} />

      <View style={styles.overlay}>
        <View style={styles.dimTop} />
        <View style={styles.row}>
          <View style={styles.dimSide} />
          <View style={styles.scanBox}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
            <Text style={styles.scanText}>Scan Here</Text>
            <View style={{ backgroundColor: currentMode === "global" ? "#16a34a" : "#6366f1", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 10 }}>
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>{currentMode.toUpperCase()} MODE</Text>
            </View>
          </View>
          <View style={styles.dimSide} />
        </View>
        <View style={styles.dimBottom}>
          <Text style={styles.bottomText}>Align barcode inside the box</Text>
        </View>
      </View>

      <View style={{ position: "absolute", bottom: 20, width: "100%", backgroundColor: "#f1f5f9", borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 12, height: 400 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <TextInput placeholder={`Search ${currentMode} inventory...`} value={searchText} onChangeText={setSearchText} style={{ flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd5e1", padding: 12, borderRadius: 12 }} />
          <TouchableOpacity
            onPress={() => {
              setManualMode(true);
              setTempProduct({ barcode: "NO-BARCODE-" + Date.now(), name: "", brand: "", image: "" });
              setEditName(""); setEditBrand(""); setEditImage(""); setPurchasePrice(""); setSalesPrice(""); setEditQty("1"); setSelectedCategory("");
              setModalVisible(true);
            }}
            style={{ width: 48, height: 48, backgroundColor: "#6366f1", borderRadius: 12, justifyContent: "center", alignItems: "center", marginLeft: 10 }}
          >
            <Text style={{ color: "#fff", fontSize: 28, fontWeight: "bold" }}>+</Text>
          </TouchableOpacity>
        </View>

        {scannedList.length > 0 && (
          <TouchableOpacity onPress={handleAddAllItems} style={{ backgroundColor:"#16a34a", padding:14, borderRadius:12, marginBottom:10, alignItems:"center" }}>
              <Text style={{ color:"#fff", fontWeight:"bold", fontSize:16 }}>➕ Add ({scannedList.length}) Items</Text>
          </TouchableOpacity>
        )}

        <ScrollView>
          {searchText.trim().length > 0 ? (
            filteredItems.map((item) => (
              <View key={item.id} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", padding: 10, borderRadius: 12, marginBottom: 8 }}>
                <Text style={{ color: "#fff", flex: 1 }}>{item.itemName}</Text>
                <Text style={{ color: "#22c55e", marginRight: 10 }}>₹{item.salesPrice || 0}</Text>
              </View>
            ))
          ) : (
            scannedList.map((item) => (
              <View key={item.barcode} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#1e293b", padding: 10, borderRadius: 12, marginBottom: 8 }}>
                <Text style={{ color: "#fff", flex: 1 }}>{item.name}</Text>
                <TouchableOpacity onPress={() => { setScannedList(prev => prev.filter(i => i.barcode !== item.barcode)); }} style={{ backgroundColor: "#ef4444", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginRight: 8 }}>
                  <Text style={{ color: "#fff" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setTempProduct(item);
                    setEditName(item.name || ""); setEditBrand(item.brand || ""); setEditImage(item.image || ""); setPurchasePrice(String(item.purchasePrice || "")); setSalesPrice(""); setEditQty("1"); setSelectedCategory("");
                    setModalVisible(true);
                  }}
                  style={{ backgroundColor: "#22c55e", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}
                >
                  <Text style={{ color: "#fff" }}>Add</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>

        <View style={{ marginTop: 10, backgroundColor: "#0f172a", padding: 10, borderRadius: 10 }}>
          <Text style={{ color: "#fff", fontSize: 16 }}>🧾 Bill ({currentMode.toUpperCase()})</Text>
          {bill.map((item) => (
            <View key={item.barcode} style={{ flexDirection: "row", justifyContent: "space-between", marginVertical: 4 }}>
              <Text style={{ color: "#fff" }}>{item.name} x {item.unitType === "Kg" ? `${item.qty} Kg` : item.unitType === "Gram" ? `${item.qty} Gram` : item.qty}</Text>
              <Text style={{ color: "#22c55e" }}>₹ {item.purchasePrice * item.qty}</Text>
            </View>
          ))}
          <Text style={{ color: "#fff", marginTop: 10 }}>Total: ₹ {bill.reduce((sum, i) => sum + (i.purchasePrice || 0) * i.qty, 0)}</Text>
          <TouchableOpacity onPress={handleProcessPurchaseInvoice} style={{ backgroundColor: "#22c55e", padding: 12, borderRadius: 12, marginTop: 10 }}>
            <Text style={{ color: "#fff", textAlign: "center", fontWeight: "bold" }}>View Purchase Receipt</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 🌟 பிக்ஸ்: பர்ச்சேஸ் ரசீது பார்க்க Sales Screen போன்ற WebView மாடல் சேர்க்கப்பட்டுள்ளது */}
      <Modal visible={showReceiptModal} animationType="slide" transparent={false}>
        <View style={styles.modalReceiptContainer}>
          <Text style={styles.zoomTipText}>💡 Use two fingers to Zoom In/Out (Pinch)</Text>
          <View style={{ flex: 1, backgroundColor: "#fff", marginHorizontal: 15, borderRadius: 12, overflow: 'hidden', elevation: 4 }}>
            <WebView
              originWhitelist={['*']}
              source={{ html: `
                <html>
                <head>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes">
                  <style>
                    body { font-family: monospace; margin: 0; padding: 20px 15px; font-size: 14px; color: #000; font-weight: bold; background-color: #fff; }
                    .center { text-align: center; } 
                    .logo-container { text-align: center; margin-bottom: 10px; }
                    .logo-img { width: 65px; height: 65px; border-radius: 50%; object-fit: cover; border: 1px solid #ddd; }
                    .divider { border-top: 1px dashed #000; margin: 12px 0; }
                    .row { display: flex; justify-content: space-between; }
                    table { width: 100%; border-collapse: collapse; }
                    td { font-size: 14px; padding: 4px 0; }
                    .right { text-align: right; }
                  </style>
                </head>
                <body>
                  ${logoUrl ? `<div class="logo-container"><img class="logo-img" src="${logoUrl}"/></div>` : ""}
                  <div class="center" style="font-size:18px; font-weight:bold; text-transform: uppercase;">${shopName}</div>
                  <div class="center" style="font-size:13px; color: #555;">STOCK PURCHASE RECEIPT</div>
                  <div class="divider"></div>
                  <div>Pur No: ${currentPurNo}</div>
                  <div>Date: ${currentPurDate}</div>
                  <div>Supplier: ${supplierName || "Walk-in Supplier"}</div>
                  <div class="divider"></div>
                  <table>
                    ${bill.map(i => `
                      <tr>
                        <td>${i.name}<br/>&nbsp;&nbsp;${i.qty} x ₹${Number(i.purchasePrice).toFixed(2)}</td>
                        <td class="right" style="vertical-align:bottom;">₹${(i.qty * i.purchasePrice).toFixed(2)}</td>
                      </tr>
                    `).join("")}
                  </table>
                  <div class="divider"></div>
                  <div class="row"><span>Subtotal:</span><span>₹${Number(purTotal).toFixed(2)}</span></div>
                  <div class="row" style="font-size:16px; font-weight:bold; border-top: 1px dashed #000; padding-top: 6px; margin-top: 4px;">
                    <span>Grand Total:</span><span>₹${Number(purTotal).toFixed(2)}</span>
                  </div>
                  <div class="divider"></div>
                  <div class="center" style="margin-top:20px; font-style: italic;">Stock Recorded Successfully!</div>
                </body>
                </html>
              ` }}
              scalesPageToFit={true}
            />
          </View>
          <View style={styles.receiptActionRow}>
            <TouchableOpacity style={[styles.recBtn, { backgroundColor: "#ef4444" }]} onPress={() => { setShowReceiptModal(false); setBill([]); }}>
              <Text style={styles.recBtnText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.recBtn, { backgroundColor: "#6366f1" }]} onPress={() => triggerPurchasePrint(currentPurNo, currentPurDate, purTotal)}>
              <Text style={styles.recBtnText}>🖨 Print Invoice</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL - DETAILS INPUT */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" }}>
          <View style={{ backgroundColor: "#fff", width: "85%", borderRadius: 15, padding: 20, maxHeight: "90%" }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 10 }}>Select Category ({currentMode.toUpperCase()})</Text>
              
              <DropDownPicker 
                open={open} 
                value={selectedCategory} 
                items={categoryItems} 
                setOpen={setOpen} 
                setValue={setSelectedCategory} 
                setItems={setCategoryItems} 
                placeholder="Select Category" 
                searchable={false} 
                style={{ marginBottom: 10 }} 
                listMode="SCROLLVIEW"
              />
              
              <TouchableOpacity onPress={() => { setNewCategoryModal(true); }} style={{ marginTop: 5, marginBottom: 15 }}>
                <Text style={{ color: "#2563eb", fontWeight: "600" }}>+ Add / Manage Categories</Text>
              </TouchableOpacity>

              <TextInput placeholder="Supplier Name" placeholderTextColor="#64748b" value={supplierName} onChangeText={setSupplierName} style={styles.input} />
              <TextInput placeholder="Product Name" placeholderTextColor="#64748b" value={editName} style={styles.input} onChangeText={(text) => { setEditName(text); setShowDropdown(true); }} />

              {/* 🌟 பிக்ஸ்: பர்ச்சேஸ் மேனுவல் மாடலிலும் கேட்டகிரிக்கு தகுந்த தயாரிப்புகள் மட்டுமே டிராப்டவுனில் வரும் */}
              {showDropdown && editName !== "" && (
                <View style={{ maxHeight: 150, backgroundColor: "#ffffff", borderRadius: 12, marginTop: 4, overflow: "hidden", elevation: 4, borderWidth: 1, borderColor: "#e2e8f0" }}>
                  <ScrollView nestedScrollEnabled={true}>
                    {filteredCategoryProducts.map(item => (
                      <TouchableOpacity key={item.id} style={{ backgroundColor: "#fff", padding: 12, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" }} onPress={() => { setEditName(item.itemName); setPurchasePrice(String(item.purchasePrice || 0)); setSalesPrice(String(item.salesPrice || 0)); setEditBrand(item.brand || ""); setEditImage(item.image || ""); setSelectedCategory(item.category || ""); setShowDropdown(false); }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: "#000" }}>{item.itemName}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <TextInput placeholder="Brand Name" placeholderTextColor="#64748b" value={editBrand} onChangeText={setEditBrand} style={styles.input} />
              <TextInput placeholder="Image URL" placeholderTextColor="#64748b" value={editImage} onChangeText={setEditImage} style={styles.input} />
              <TextInput placeholder="Purchase Price" placeholderTextColor="#64748b" keyboardType="numeric" value={purchasePrice} onChangeText={setPurchasePrice} style={styles.input} />
              <TextInput placeholder="Sales Price" placeholderTextColor="#64748b" keyboardType="numeric" value={salesPrice} onChangeText={setSalesPrice} style={styles.input} />
              <TextInput placeholder="Quantity" placeholderTextColor="#64748b" keyboardType="numeric" value={editQty} onChangeText={setEditQty} style={styles.input} />

              <Text style={{ marginTop: 15, fontWeight: "600" }}>Unit Type</Text>
              <View style={{ flexDirection: "row", marginTop: 10 }}>
                {["Qty", "Kg", "Gram"].map(unit => (
                  <TouchableOpacity key={unit} onPress={() => setUnitType(unit)} style={{ flex: 1, padding: 12, marginHorizontal: 4, borderRadius: 10, backgroundColor: unitType === unit ? "#22c55e" : "#e5e7eb" }}>
                    <Text style={{ textAlign: "center", color: unitType === unit ? "#fff" : "#000" }}>{unit}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 25, paddingBottom: 10 }}>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={{ padding: 10 }}><Text style={{ color: "red", fontSize: 16, fontWeight: "bold" }}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity onPress={handleAddOrUpdateProduct} style={{ padding: 10 }}>
                  <Text style={{ color: "green", fontSize: 16, fontWeight: "bold" }}>{tempProduct?.id ? "Update" : "Add"}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* GPAY STYLE SUCCESS MODAL */}
      <Modal visible={successVisible} transparent animationType="fade">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(15, 23, 42, 0.7)" }}>
          <View style={{ backgroundColor: "#fff", width: 250, height: 250, borderRadius: 125, justifyContent: "center", alignItems: "center", elevation: 10 }}>
            <View style={{ backgroundColor: "#16a34a", width: 120, height: 120, borderRadius: 60, justifyContent: "center", alignItems: "center" }}>
              <Text style={{ fontSize: 65, color: "#fff", fontWeight: "bold" }}>✓</Text>
            </View>
            <Text style={{ marginTop: 15, fontSize: 18, fontWeight: "900", color: "#1e293b" }}>Items Added</Text>
            <Text style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Saved to History</Text>
          </View>
        </View>
      </Modal>

      {/* NEW CATEGORY & MANAGE MODAL */}
      <Modal visible={newCategoryModal} transparent animationType="fade">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ width: "85%", backgroundColor: "#fff", borderRadius: 15, padding: 20, maxHeight: "80%" }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10 }}>Manage Categories ({currentMode.toUpperCase()})</Text>
            <TextInput placeholder="New Category Name" value={categoryName} onChangeText={setCategoryName} style={styles.input} />
            <TouchableOpacity
              onPress={async () => {
                if (!categoryName.trim() || !user) return;
                await addDoc(collection(db, "users", user.uid, categoriesCollection), { name: categoryName.trim() });
                setCategoryName("");
              }}
              style={{ backgroundColor: "#22c55e", padding: 12, borderRadius: 10, marginTop: 10 }}
            >
              <Text style={{ color: "#fff", textAlign: "center", fontWeight: "bold" }}>+ Add Category</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 14, color: "#64748b", marginTop: 15, marginBottom: 5, fontStyle: "italic" }}>* Long press on a category to delete it</Text>
            <ScrollView style={{ minHeight: 100, maxHeight: 200, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, padding: 5 }}>
              {categories.map((cat) => (
                <TouchableOpacity key={cat.id} onLongPress={() => handleDeleteCategory(cat.id, cat.name)} delayLongPress={600} style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: "#e2e8f0", backgroundColor: "#f8fafc", marginVertical: 2, borderRadius: 5 }}>
                  <Text style={{ color: "#334155", fontWeight: "500" }}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 20 }}>
              <TouchableOpacity onPress={() => { setCategoryName(""); setNewCategoryModal(false); }} style={{ padding: 10 }}>
                <Text style={{ color: "#6366f1", fontSize: 16, fontWeight: "bold" }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const BOX_SIZE = width * 0.7;

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  dimTop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  dimBottom: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center" },
  dimSide: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  scanBox: { width: BOX_SIZE, height: BOX_SIZE, justifyContent: "center", alignItems: "center", bottom: 335 },
  corner: { position: "absolute", width: 30, height: 30, borderColor: "#22c55e" },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 10 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 10 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 10 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 10 },
  input: { backgroundColor: "#ffffff", color: "#111827", padding: 12, marginTop: 12, borderRadius: 10, width: "100%", textAlign: "center", borderWidth: 1, borderColor: "#334155" },
  scanText: { color: "#fff", fontWeight: "bold" },
  bottomText: { color: "#fff", marginTop: 10 },
  modalReceiptContainer: { flex: 1, backgroundColor: "#1e293b", paddingTop: 20, paddingBottom: 10 },
  zoomTipText: { color: "#38bdf8", textAlign: "center", fontWeight: "700", marginBottom: 12, fontSize: 13 },
  receiptActionRow: { flexDirection: "row", padding: 15, backgroundColor: "#1e293b", justifyContent: "space-between" },
  recBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: "center", marginHorizontal: 6 },
  recBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 }
});