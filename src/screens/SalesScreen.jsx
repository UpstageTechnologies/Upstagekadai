import React, { useEffect, useState, useRef } from "react";

import RazorpayCheckout from "react-native-razorpay";

import { useTheme } from "../theme/ThemeContext";

import RNBluetoothEscposPrinter from "react-native-thermal-receipt-printer";

import RNPrint from "react-native-print";

import { useFocusEffect } from "@react-navigation/native";

import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, Dimensions, Modal, Image, SafeAreaView, StatusBar, Platform } from "react-native";

import { NativeModules } from "react-native";
import { Camera, useCameraDevice, useCodeScanner } from "react-native-vision-camera";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { WebView } from "react-native-webview";

import DropDownPicker from 'react-native-dropdown-picker';

import Icon from "react-native-vector-icons/MaterialCommunityIcons";



import { auth, db } from "../utils/firebaseConfig";

import { addDoc, serverTimestamp, collection, onSnapshot, doc, updateDoc, getDocs, deleteDoc } from "firebase/firestore";

import QRCode from "react-native-qrcode-svg";

import { onAuthStateChanged } from "firebase/auth";



const { width } = Dimensions.get("window");



export default function SalesScreen({ navigation }) {

  const { ScanBeep } = NativeModules;
const [cameraPosition, setCameraPosition] = useState("back");

const device = useCameraDevice(cameraPosition);



const [currentMode, setCurrentMode] = useState("local");

const [inventory, setInventory] = useState([]);

const [bill, setBill] = useState([]);

const [total, setTotal] = useState(0);

const [showReview, setShowReview] = useState(false);

const [paymentMode, setPaymentMode] = useState("CASH");

const [hasPermission, setHasPermission] = useState(false);

const [isActive, setIsActive] = useState(true);

const [torch, setTorch] = useState("off");


const [showReceiptModal, setShowReceiptModal] = useState(false);

const [currentBillNo, setCurrentBillNo] = useState("");

const [currentBillDate, setCurrentBillDate] = useState("");



const [logoUrl, setLogoUrl] = useState("");

const [gstNumber, setGstNumber] = useState("");

const [gstEnabled, setGstEnabled] = useState(false);

const [gstPercentage, setGstPercentage] = useState("18");

const [shopName, setShopName] = useState("MY SHOP");

const [shopUpiId, setShopUpiId] = useState("");


const [showUpiModal, setShowUpiModal] = useState(false);

const [savedSettingsQr, setSavedSettingsQr] = useState(null);

const [showHoldSuccess, setShowHoldSuccess] = useState(false);

const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);

const [showScanToast, setShowScanToast] = useState(false);



// Settings Enabled Statuses for Buttons Gray-out Logic

const [cashEnabled, setCashEnabled] = useState(true);

const [upiEnabled, setUpiEnabled] = useState(true);

const [razorpayEnabled, setRazorpayEnabled] = useState(true);



// HOLD ORDER STATES

const [heldOrders, setHeldOrders] = useState([]);

const [showHoldModal, setShowHoldModal] = useState(false);

const [holdCustomerName, setHoldCustomerName] = useState("");

const [showResumeModal, setShowResumeModal] = useState(false);

const [activeResumedOrderId, setActiveResumedOrderId] = useState(null);



// MANUAL ADD & CATEGORY STATES

const [modalVisible, setModalVisible] = useState(false);

const [open, setOpen] = useState(false);

const [categories, setCategories] = useState([]);

const [categoryItems, setCategoryItems] = useState([]);

const [selectedCategory, setSelectedCategory] = useState("");

const [newCategoryModal, setNewCategoryModal] = useState(false);

const [categoryName, setCategoryName] = useState("");

const [manualName, setManualName] = useState("");

const [manualPrice, setManualPrice] = useState("");

const [manualQty, setManualQty] = useState("1");

const [showDropdown, setShowDropdown] = useState(false);



const [menuItem, setMenuItem] = useState(null);

const [userRazorpayKeyId, setUserRazorpayKeyId] = useState("");

const [currentQrMode, setCurrentQrMode] = useState("generated");

const [search, setSearch] = useState("");

const { darkMode, theme } = useTheme();
const [receiptHeader, setReceiptHeader] = useState("");
const [receiptFooter, setReceiptFooter] = useState("Thank you!");
const [receiptStoreLogo, setReceiptStoreLogo] = useState(false);
const [receiptLogoUri, setReceiptLogoUri] = useState(null);



const scanLockRef = useRef(false);



useEffect(() => {

const loadHeldOrders = async () => {

try {

const user = auth.currentUser;

if (!user) return;

const savedHeld = await AsyncStorage.getItem(`held_orders_${user.uid}`);

if (savedHeld) {

setHeldOrders(JSON.parse(savedHeld));

}

} catch (err) {

console.log("Failed to load held orders", err);

}

};

loadHeldOrders();

}, []);



const saveHeldOrdersToStorage = async (orders) => {

try {

const user = auth.currentUser;

if (!user) return;

await AsyncStorage.setItem(`held_orders_${user.uid}`, JSON.stringify(orders));

} catch (err) {

console.log("Failed to save held orders", err);

}

};




useFocusEffect(

React.useCallback(() => {

setIsActive(true);

const user = auth.currentUser;

if (!user) return;



let unsubscribeInventory;

let unsubscribeCategories;



const setupListeners = async () => {

const savedMode = (await AsyncStorage.getItem("app_mode")) || "local";

setCurrentMode(savedMode);



const savedQr = await AsyncStorage.getItem(`shop_qr_code_${user.uid}`);

if (savedQr) {

setSavedSettingsQr(savedQr);

}

const savedReceiptLogo = await AsyncStorage.getItem(`receipt_logo_${user.uid}`);
        if (savedReceiptLogo) {
          setReceiptLogoUri(savedReceiptLogo);
        }

        const inventoryCollection = savedMode === "global" ? "global_inventory" : "inventory";
        const categoriesCollection = savedMode === "global" ? "global_categories" : "categories";

unsubscribeInventory = onSnapshot(

collection(db, "users", user.uid, inventoryCollection),

(snap) => {

setInventory(snap.docs.map((d) => ({

id: d.id,

fromDB: true,

...d.data()

})));

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

setIsActive(false);

if (unsubscribeInventory) unsubscribeInventory();

if (unsubscribeCategories) unsubscribeCategories();

};

}, [])

);



useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user) return;
        
        // Load receipt logo from AsyncStorage using the correct key
        const savedReceiptLogo = await AsyncStorage.getItem(`receipt_logo_${user.uid}`);
        if (savedReceiptLogo) {
          setReceiptLogoUri(savedReceiptLogo);
        }

        const userRef = doc(db, "users", user.uid);
        return onSnapshot(userRef, (snap) => {
          const data = snap.data();
          if (data) {
            setShopName(data.shopName || "MY SHOP");
            setGstNumber(data.gstNumber || "");
            setGstEnabled(data.gstEnabled ?? false);
            setGstPercentage(data.gstPercentage || "18");
            setShopUpiId(data.upiId || "");
            setUserRazorpayKeyId(data.razorpayKeyId || "");
            setCurrentQrMode(data.qrMode || "generated");
            setCashEnabled(data.cashEnabled ?? true);
            setUpiEnabled(data.upiEnabled ?? true);
            setRazorpayEnabled(data.razorpayEnabled ?? true);

            // Receipt Configurations
            if (data.receiptConfig) {
              setReceiptStoreLogo(data.receiptConfig.storeLogo ?? false);
              setReceiptHeader(data.receiptConfig.header || "");
              setReceiptFooter(data.receiptConfig.footer || "Thank you!");
            }

            if (!(data.cashEnabled ?? true) && data.upiEnabled) setPaymentMode("UPI");
            else if (!(data.cashEnabled ?? true) && !(data.upiEnabled ?? true) && data.razorpayEnabled) setPaymentMode("RAZORPAY");
          }
        });
      }
    );
    return () => unsub();
  }, []);



const triggerUpiSuccessAnimation = () => {

setShowUpiModal(false);

setShowSuccessOverlay(true);


setTimeout(async () => {

setShowSuccessOverlay(false);

await finalizeOrder("UPI_AUTOMATIC_SUCCESS");

}, 2000);

};



const handleRazorpayPayment = () => {

if (!razorpayEnabled) {

Alert.alert("Disabled", "Razorpay is disabled in settings.");

return;

}

if (!userRazorpayKeyId) {

Alert.alert("Configuration Missing", "Please configure Razorpay API Key in settings screen.");

return;

}



var options = {

description: `Payment for Order Total: ₹${total}`,

image: logoUrl || 'https://i.imgur.com/3g7nmJC.png',

currency: 'INR',

key: userRazorpayKeyId,

amount: total * 100,

name: shopName,

prefill: {

email: auth.currentUser?.email || 'test@example.com',

contact: '',

name: auth.currentUser?.displayName || 'Merchant Customer'

},

theme: { color: '#6366f1' }

};



RazorpayCheckout.open(options).then((data) => {

setShowReview(false);

setShowSuccessOverlay(true);

setTimeout(async () => {

setShowSuccessOverlay(false);

await finalizeOrder(data.razorpay_payment_id);

}, 2000);

}).catch((error) => {

Alert.alert("Payment Failed ❌", error.description || "Process cancelled by user.");

});

};




const finalizeOrder = async (payId = "CASH_OR_OTHER") => {

try {

const user = auth.currentUser;

if (!user) return;



const salesSnap = await getDocs(collection(db, "users", user.uid, "sales"));


// Format: YYYYMMDD-XXXX (e.g., 20260705-0001)

const now = new Date();

const year = now.getFullYear();

const month = String(now.getMonth() + 1).padStart(2, "0");

const day = String(now.getDate()).padStart(2, "0");

const datePrefix = `${year}${month}${day}`;


const sequenceNum = String(salesSnap.size + 1).padStart(4, "0");

const bNo = `${datePrefix}-${sequenceNum}`;

const bDate = now.toLocaleDateString("en-GB");



const subtotal = bill.reduce((sum, i) => sum + (Number(i.price) * i.qty), 0);

const taxTotal = gstEnabled ? bill.reduce((sum, i) => {

const itemTaxRate = Number(i.taxPercent || gstPercentage || 0);

return sum + ((Number(i.price) * i.qty) * (itemTaxRate / 100));

}, 0) : 0;


const finalOrderTotal = subtotal + taxTotal;

const totalProfit = bill.reduce((sum, i) => sum + (Number(i.salesPrice || i.price) - Number(i.purchasePrice || 0)) * i.qty, 0);



await addDoc(collection(db, "users", user.uid, "sales"), {

billNo: bNo,

invoiceId: bNo,

billDate: bDate,

items: bill,

total: finalOrderTotal,

profit: totalProfit,

paymentMode,

razorpayPaymentId: payId,

isGlobalMode: currentMode === "global",

createdAt: serverTimestamp()

});



if (activeResumedOrderId) {

const updatedOrders = heldOrders.filter(o => o.id !== activeResumedOrderId);

setHeldOrders(updatedOrders);

saveHeldOrdersToStorage(updatedOrders);

setActiveResumedOrderId(null);

}



setCurrentBillNo(bNo);

setCurrentBillDate(bDate);

setShowReview(false);

setShowReceiptModal(true);



} catch (err) {

Alert.alert("Save failed", err.message);

}

};



useEffect(() => {

(async () => {

const status = await Camera.getCameraPermissionStatus();

if (status === "granted") { setHasPermission(true); }

else {

const newStatus = await Camera.requestCameraPermission();

if (newStatus === "granted") { setHasPermission(true); }

else {

setHasPermission(false);

}

}

})();

}, []);



const categoriesCollection = currentMode === "global" ? "global_categories" : "categories";

const inventoryCollection = currentMode === "global" ? "global_inventory" : "inventory";



const handleDeleteCategory = (catId, catName) => {

const user = auth.currentUser;

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



const addToBill = async (item) => {

if (item.quantity <= 0) return Alert.alert("Out of stock");



setBill(prev => {

const exist = prev.find(i => i.barcode === item.barcode);

if (exist) {

return prev.map(i => i.barcode === item.barcode ? { ...i, qty: i.qty + 1 } : i );

}

return [...prev, {

...item,

qty: 1,

price: item.salesPrice || item.price || 0,

salesPrice: item.salesPrice || item.price || 0,

purchasePrice: Number(item.purchasePrice ?? 0),

taxPercent: item.taxPercent || gstPercentage || 0

}];

});



if (item.id && item.id.length > 10) {

await updateDoc(doc(db, "users", auth.currentUser.uid, inventoryCollection, item.id), { quantity: item.quantity - 1 });

}

};



const decreaseQty = async (item) => {

const exist = bill.find(i => i.barcode === item.barcode);

if (!exist) return;



if (exist.qty === 1) {

setBill(prev => prev.filter(i => i.barcode !== item.barcode));

} else {

setBill(prev => prev.map(i => i.barcode === item.barcode ? { ...i, qty: i.qty - 1 } : i ));

}



if (item.id && item.id.length > 10) {

await updateDoc(doc(db, "users", auth.currentUser.uid, inventoryCollection, item.id), { quantity: item.quantity + 1 });

}

};



const removeItem = async (item) => {

Alert.alert("Remove Item", `Remove ${item.itemName} from bill?`, [

{ text: "No" },

{

text: "Yes",

onPress: async () => {

setBill(prev => prev.filter(i => i.barcode !== item.barcode));

if (item.id && item.id.length > 10) {

await updateDoc(doc(db, "users", auth.currentUser.uid, inventoryCollection, item.id), { quantity: item.quantity + item.qty });

}

}

}

]);

};



const handleHoldOrder = () => {

if (bill.length === 0) {

Alert.alert("Empty Bill", "No items to hold.");

return;

}

setShowHoldModal(true);

};



const confirmHold = async () => {

try {

const user = auth.currentUser;

if (!user) return;



const newHold = {

id: Date.now(),

name: holdCustomerName.trim() || "Guest",

items: bill,

timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

};



const updatedOrders = [...heldOrders, newHold];

setHeldOrders(updatedOrders);

await AsyncStorage.setItem(`held_orders_${user.uid}`, JSON.stringify(updatedOrders));


// Reset bill & inputs

setBill([]);

setHoldCustomerName("");

setShowHoldModal(false);


setShowHoldSuccess(true);

setTimeout(() => setShowHoldSuccess(false), 2000);

} catch (err) {

Alert.alert("Error", "Failed to hold order: " + err.message);

}

};



const resumeOrder = (order) => {

setBill(order.items);

setActiveResumedOrderId(order.id);

setShowResumeModal(false);

};



useEffect(() => {

const subtotal = bill.reduce((sum, i) => sum + (i.price * i.qty), 0);

const taxTotal = gstEnabled ? bill.reduce((sum, i) => {

const itemTaxRate = Number(i.taxPercent || gstPercentage || 0);

return sum + ((i.price * i.qty) * (itemTaxRate / 100));

}, 0) : 0;

setTotal(subtotal + taxTotal);

}, [bill, gstEnabled, gstPercentage]);



const triggerThermalPrint = async (bNo, bDate) => {
  try {
    const printers = await RNBluetoothEscposPrinter.getDeviceList();
    if (printers && printers.length > 0) {
      const printer = printers[0];
      await RNBluetoothEscposPrinter.connectPrinter(printer.address);
      await RNBluetoothEscposPrinter.printerInit();

      if (receiptStoreLogo && receiptLogoUri) {
        await RNBluetoothEscposPrinter.printText(`[LOGO]\n`, { align: "center" });
      }
      await RNBluetoothEscposPrinter.printText(`${shopName}\n`, { align: "center" });
      if (gstEnabled && gstNumber) {
        await RNBluetoothEscposPrinter.printText(`GST: ${gstNumber}\n`, { align: "center" });
      }
      await RNBluetoothEscposPrinter.printText(`Bill: ${bNo} | Date: ${bDate}\n`, { align: "center" });
      await RNBluetoothEscposPrinter.printText("--------------------------------\n");

      for (let item of bill) {
        await RNBluetoothEscposPrinter.printText(`${item.itemName}\n`);
        await RNBluetoothEscposPrinter.printText(` ${item.qty} x ₹${item.price} = ₹${item.qty * item.price}\n`);
      }

      await RNBluetoothEscposPrinter.printText("--------------------------------\n");
      await RNBluetoothEscposPrinter.printText(`TOTAL: ₹${total}\n`, { align: "right" });
      await RNBluetoothEscposPrinter.printText("--------------------------------\n");
      await RNBluetoothEscposPrinter.printText(`${receiptFooter || "Thank you for your business!"}\n\n\n`, { align: "center" });
      return;
    }
    throw "No printer connected";
  } catch (err) {
    const html = `
    <html>
    <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
    <style>
    @page { size: 58mm auto; margin: 0mm; }
    body { font-family: monospace; margin: 0; padding: 6mm 4mm; font-size: 12px; color: #000; font-weight: bold; background-color: #fff; }
    .center { text-align: center; }
    .header-row { display: flex; align-items: center; margin-bottom: 8px; justify-content: center; }
    .logo-img { width: 50px; height: 50px; border-radius: 50%; object-fit: cover; margin-right: 8px; border: 1px solid #ddd; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; }
    table { width: 100%; border-collapse: collapse; }
    td { font-size: 12px; padding: 2px 0; }
    .right { text-align: right; }
    </style>
    </head>
    <body>
    
    <div class="header-row">
      ${receiptStoreLogo && receiptLogoUri ? `<img class="logo-img" src="${receiptLogoUri}"/>` : ""}
      <div style="text-align: center;">
        <div style="font-size:14px; font-weight:bold; text-transform: uppercase;">${shopName}</div>
        ${gstEnabled && gstNumber ? `<div style="font-size:11px;">GST: ${gstNumber}</div>` : ""}
      </div>
    </div>

    ${receiptHeader ? `<div class="center" style="font-size: 11px; margin-bottom: 6px; font-style: italic;">${receiptHeader}</div>` : ""}

    <div class="divider"></div>
    <div>Bill No: ${bNo}</div>
    <div>Date: ${bDate}</div>
    <div class="divider"></div>
    <table>
    ${bill.map(i => `
    <tr>
    <td>${i.itemName}<br/>&nbsp;&nbsp;${i.qty} x ₹${Number(i.price).toFixed(2)}</td>
    <td class="right" style="vertical-align:bottom;">₹${(i.qty * i.price).toFixed(2)}</td>
    </tr>
    `).join("")}
    </table>
    <div class="divider"></div>
    <div class="row" style="font-size:13px; font-weight:bold;"><span>GRAND TOTAL:</span><span>₹${Number(total).toFixed(2)}</span></div>
    <div class="divider"></div>
    <div class="center" style="margin-top:10px;">${receiptFooter || "Thank you for your business!"}</div>
    </body>
    </html>`;
    await RNPrint.print({ html });
  }
};



const codeScanner = useCodeScanner({

codeTypes: ["ean-13", "ean-8", "code-128", "qr"],

onCodeScanned: async (codes) => {

const code = codes[0]?.value;

if (!code) return;

if (scanLockRef.current) return;

scanLockRef.current = true;

ScanBeep?.beep?.();
setTimeout(() => { scanLockRef.current = false; }, 1500);



const scanned = String(code).replace(/\D/g, "");

const item = inventory.find((i) => String(i.barcode || "").replace(/\D/g, "") === scanned);



if (item) {

await addToBill(item);

setShowScanToast(true);

setTimeout(() => { setShowScanToast(false); }, 1200);

} else {

Alert.alert("Product Not Found ❌", "This product is not available in inventory");

}

},

});



const filteredInventory = inventory.filter(i =>

(i.itemName || "").toLowerCase().includes(search.toLowerCase())

);



return (

<SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>

<StatusBar barStyle={darkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} />


{/* WHITE HEADER */}

<View style={[styles.topWhiteHeader, { backgroundColor: theme.card, borderBottomColor: darkMode ? '#334155' : '#e2e8f0' }]}>

<View style={[styles.shopBadge, { backgroundColor: darkMode ? '#1e293b' : '#eef2ff' }]}>

<Icon name="storefront" size={20} color="#16a34a" />

<Text style={[styles.shopNameText, { color: darkMode ? '#f8fafc' : '#6366f1' }]} numberOfLines={1}>{shopName}</Text>

</View>

<View style={{ flexDirection: 'row', alignItems: 'center' }}>

<TouchableOpacity style={[styles.headerIconBtn, { backgroundColor: darkMode ? '#1e293b' : '#f1f5f9' }]}onPress={() => setShowResumeModal(true)}>

<Icon name="pause-circle" size={22} color="#d97706" />

{heldOrders.length > 0 && (

<View style={styles.badgeContainer}>

<Text style={styles.badgeText}>{heldOrders.length}</Text>

</View>

)}

</TouchableOpacity>

<TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.navigate("SalesHistory")}>

<Icon name="history" size={22} color="#6366f1" />

</TouchableOpacity>

</View>

</View>



{/* CAMERA VIEW */}

<View style={[styles.cameraOuterWrapper, { backgroundColor: theme.background }]}>

<View style={styles.cameraFrameContainer}>

{device && hasPermission && (

<Camera

style={StyleSheet.absoluteFill}

device={device}

isActive={isActive}

codeScanner={codeScanner}

torch={torch}

/>

)}

<View style={styles.overlay}>

<View style={styles.cameraControlRow}>

<TouchableOpacity style={styles.actionCircleBtn} onPress={() => setTorch(prev => prev === "on" ? "off" : "on")}>

<Icon name={torch === "on" ? "flash" : "flash-off"} size={22} color="#fff" />

</TouchableOpacity>

<TouchableOpacity style={styles.actionCircleBtn} onPress={() => setCameraPosition(prev => prev === "back" ? "front" : "back")}>

<Icon name="camera-flip" size={22} color="#fff" />

</TouchableOpacity>

</View>



<View style={styles.scanRow}>

<View style={styles.salesScanBox}>

<View style={[styles.corner, styles.topLeft]} />

<View style={[styles.corner, styles.topRight]} />

<View style={[styles.corner, styles.bottomLeft]} />

<View style={[styles.corner, styles.bottomRight]} />

<Text style={styles.scanText}>Scan Here</Text>

<Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>Align barcode inside the box</Text>



<View style={{ backgroundColor: currentMode === "global" ? "#16a34a" : "#6366f1", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 8 }}>

<Text style={{ color: "#fff", fontWeight: "bold", fontSize: 10 }}>{currentMode.toUpperCase()} MODE</Text>

</View>

</View>

</View>

</View>

</View>

</View>



{/* BOTTOM PANEL */}

{!showReview && (

<View style={[styles.bottomWhiteContainer, { backgroundColor: theme.card }]}>

<View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>

<TextInput

placeholder={`Search ${currentMode} inventory product...`}

placeholderTextColor="#64748b"

value={search}

onChangeText={setSearch}

style={{

flex: 1,

backgroundColor: darkMode ? '#1e293b' : '#f8fafc',

borderWidth: 1,

borderColor: darkMode ? '#334155' : '#cbd5e1',

padding: 10,

borderRadius: 12,

color: theme.text,

height: 44

}}

/>

<TouchableOpacity

onPress={() => { setManualName(""); setManualPrice(""); setManualQty("1"); setSelectedCategory(""); setModalVisible(true); }}

style={{ width: 44, height: 44, backgroundColor: "#6366f1", borderRadius: 12, justifyContent: "center", alignItems: "center", marginLeft: 10 }}

>

<Text style={{ color: "#fff", fontSize: 26, fontWeight: "bold" }}>+</Text>

</TouchableOpacity>

</View>



<Text style={[styles.title, { color: theme.text }]}>Scanned Items</Text>

<ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

{search.trim().length > 0 ? (

filteredInventory.map((item) => (

<View key={item.id} style={styles.itemCard}>

<View style={{ flex: 1 }}>

<Text style={{ color: "#000", fontWeight: '700' }}>{item.itemName}</Text>

<Text style={styles.itemSub}>Stock: {item.quantity}</Text>

</View>

{bill.find(b => b.barcode === item.barcode) ? (

<View style={styles.qtyControls}>

<TouchableOpacity style={styles.qtyBtn} onPress={() => decreaseQty(item)}><Text style={styles.qtyBtnText}>-</Text></TouchableOpacity>

<Text style={styles.qtyText}>{bill.find(b => b.barcode === item.barcode).qty}</Text>

<TouchableOpacity style={styles.qtyBtn} onPress={() => addToBill(item)}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>

</View>

) : (

<TouchableOpacity onPress={() => addToBill(item)} style={{ backgroundColor: "#22c55e", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>

<Text style={{ color: "#fff", fontWeight: "600" }}>Add</Text>

</TouchableOpacity>

)}

</View>

))

) : (

bill.map((i) => (

<View key={i.barcode} style={styles.itemCard}>

<View style={{ flex: 1 }}>

<Text numberOfLines={1} style={styles.itemName}>{i.itemName}</Text>

<Text style={styles.itemSub}>₹{i.price} × {i.qty}</Text>

</View>

<View style={styles.qtyControls}>

<TouchableOpacity style={styles.qtyBtn} onPress={() => decreaseQty(i)}><Text style={styles.qtyBtnText}>-</Text></TouchableOpacity>

<Text style={styles.qtyText}>{i.qty}</Text>

<TouchableOpacity style={styles.qtyBtn} onPress={() => addToBill(i)}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>

</View>

<TouchableOpacity onPress={() => setMenuItem(menuItem === i.barcode ? null : i.barcode)} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>

<Text style={{ fontSize: 20, color: "#64748b", fontWeight: "bold" }}>⋮</Text>

</TouchableOpacity>

<Text style={styles.amountText}>₹{(i.price * i.qty).toFixed(2)}</Text>

{menuItem === i.barcode && (

<View style={styles.popoverMenu}>

<TouchableOpacity onPress={() => { setMenuItem(null); removeItem(i); }} style={{ padding: 10 }}>

<Text style={{ color: "#ef4444", fontWeight: "600" }}>🗑 Remove Item</Text>

</TouchableOpacity>

</View>

)}

</View>

))

)}

</ScrollView>



<View style={{ borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 8 }}>

<Text style={styles.total}>₹ {total}</Text>

<View style={styles.actionButtonBarRow}>

<TouchableOpacity style={styles.holdBtnIcon} onPress={handleHoldOrder}>

<Icon name="pause-circle-outline" size={24} color="#d97706" />

</TouchableOpacity>

<TouchableOpacity

style={[styles.payBtnNew, { flex: 1, marginHorizontal: 8 }]}

onPress={() => { if (bill.length === 0) { Alert.alert("No items"); return; } setIsActive(false); setShowReview(true); }}

>

<Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Review Order</Text>

</TouchableOpacity>

</View>

</View>

</View>

)}



{/* REVIEW / CHECKOUT PANEL */}

{showReview && (

<View style={styles.checkoutContainer}>

<Text style={styles.title}>Checkout</Text>

<TextInput placeholder="Shop Name" placeholderTextColor="#64748b" value={shopName} onChangeText={setShopName} style={{ backgroundColor: "#e5e7eb", padding: 10, borderRadius: 10, marginBottom: 8, color: '#000' }} />

<ScrollView style={{ maxHeight: 120 }}>

{bill.map((i) => (

<View key={i.barcode} style={styles.reviewRow}>

<Text style={{ color: "#000" }}>{i.qty} x {i.itemName}</Text>

<Text style={{ color: "#000", fontWeight: "bold" }}>₹{i.price * i.qty}</Text>

</View>

))}

</ScrollView>

<Text style={styles.total}>₹ {total}</Text>


<View style={{ flexDirection: "row", justifyContent: "space-around", marginVertical: 8 }}>

<TouchableOpacity

disabled={!cashEnabled}

onPress={() => setPaymentMode("CASH")}

style={[styles.payModeBtnStyle, paymentMode === "CASH" && styles.payModeBtnActive, !cashEnabled && styles.payModeBtnDisabled]}

>

<Text style={[styles.payModeText, paymentMode === "CASH" && { color: "#fff" }, !cashEnabled && { color: "#9ca3af" }]}>CASH</Text>

</TouchableOpacity>



<TouchableOpacity

disabled={!upiEnabled}

onPress={() => { if (upiEnabled) { setPaymentMode("UPI"); setShowUpiModal(true); } }}

style={[styles.payModeBtnStyle, paymentMode === "UPI" && styles.payModeBtnActive, !upiEnabled && styles.payModeBtnDisabled]}

>

<Text style={[styles.payModeText, paymentMode === "UPI" && { color: "#fff" }, !upiEnabled && { color: "#9ca3af" }]}>UPI</Text>

</TouchableOpacity>



<TouchableOpacity

disabled={!razorpayEnabled}

onPress={() => { if (razorpayEnabled) { setPaymentMode("RAZORPAY"); handleRazorpayPayment(); } }}

style={[styles.payModeBtnStyle, paymentMode === "RAZORPAY" && styles.payModeBtnActive, !razorpayEnabled && styles.payModeBtnDisabled]}

>

<Text style={[styles.payModeText, paymentMode === "RAZORPAY" && { color: "#fff" }, !razorpayEnabled && { color: "#9ca3af" }]}>RAZORPAY</Text>

</TouchableOpacity>

</View>



<TouchableOpacity

style={{ backgroundColor: "#16a34a", padding: 12, borderRadius: 12, alignItems: "center", marginTop: 10 }}

onPress={async () => {

if (bill.length === 0) return;

await finalizeOrder(paymentMode);

}}

>

<Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Complete Payment & Receipt</Text>

</TouchableOpacity>

</View>

)}



{/* MANUAL ADD MODAL */}

<Modal visible={modalVisible} transparent animationType="slide">

<View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>

<View style={{ width: "100%", height: "85%", backgroundColor: theme.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, elevation: 20 }}>


<View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>

<Text style={{ fontSize: 20, fontWeight: "bold", color: theme.text }}>Select Products ({currentMode.toUpperCase()})</Text>

<TouchableOpacity onPress={() => setModalVisible(false)} style={{ padding: 4 }}>

<Icon name="close" size={24} color={theme.text} />

</TouchableOpacity>

</View>



<View style={{ zIndex: 1000, marginBottom: 12 }}>

<DropDownPicker

open={open}

value={selectedCategory}

items={categoryItems}

setOpen={setOpen}

setValue={setSelectedCategory}

setItems={setCategoryItems}

placeholder="All Categories"

style={{ borderColor: darkMode ? "#334155" : "#cbd5e1", backgroundColor: darkMode ? "#1e293b" : "#fff", borderRadius: 12 }}

textStyle={{ color: theme.text }}

dropDownContainerStyle={{ borderColor: darkMode ? "#334155" : "#cbd5e1", backgroundColor: darkMode ? "#1e293b" : "#fff" }}

listMode="SCROLLVIEW"

/>

</View>



<ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>

{inventory

.filter(item => !selectedCategory || item.category === selectedCategory)

.map((item) => {

const existingInBill = bill.find(b => b.barcode === item.barcode);

const currentQtyInBill = existingInBill ? existingInBill.qty : 0;



return (

<View key={item.id} style={{

backgroundColor: darkMode ? "#1e293b" : "#f8fafc",

borderRadius: 16,

padding: 12,

marginBottom: 10,

flexDirection: "row",

alignItems: "center",

borderWidth: 1,

borderColor: darkMode ? "#334155" : "#e2e8f0"

}}>

<View style={{ width: 50, height: 50, borderRadius: 10, backgroundColor: "#e2e8f0", justifyContent: "center", alignItems: "center", overflow: "hidden", marginRight: 12 }}>

{(item.image || item.imageUrl) ? (

<Image source={{ uri: item.image || item.imageUrl }} style={{ width: 50, height: 50 }} resizeMode="cover" />

) : (

<Icon name="package-variant" size={24} color="#64748b" />

)}

</View>



<View style={{ flex: 1 }}>

<Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "700", color: theme.text }}>{item.itemName}</Text>

<Text style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Stock: {item.quantity} | <Text style={{ color: "#16a34a", fontWeight: "bold" }}>₹{item.salesPrice || item.price}</Text></Text>

</View>



{currentQtyInBill > 0 ? (

<View style={styles.qtyControls}>

<TouchableOpacity style={styles.qtyBtn} onPress={() => decreaseQty(item)}>

<Text style={styles.qtyBtnText}>-</Text>

</TouchableOpacity>

<Text style={[styles.qtyText, { color: theme.text }]}>{currentQtyInBill}</Text>

<TouchableOpacity style={styles.qtyBtn} onPress={() => addToBill(item)}>

<Text style={styles.qtyBtnText}>+</Text>

</TouchableOpacity>

</View>

) : (

<TouchableOpacity

onPress={() => addToBill(item)}

style={{ backgroundColor: "#6366f1", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 }}

>

<Text style={{ color: "#fff", fontWeight: "600" }}>Add</Text>

</TouchableOpacity>

)}

</View>

);

})}

</ScrollView>



<TouchableOpacity

style={{ backgroundColor: "#16a34a", padding: 14, borderRadius: 14, alignItems: "center", marginTop: 10 }}

onPress={() => setModalVisible(false)}

>

<Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>Done ({bill.length} items added)</Text>

</TouchableOpacity>



</View>

</View>

</Modal>



{/* RECEIPT MODAL WITH FULL HTML WEBVIEW */}

<Modal visible={showReceiptModal} animationType="slide" transparent={false}>

<View style={styles.modalReceiptContainer}>

<Text style={styles.zoomTipText}>💡 Use two fingers to Zoom In/Out (Pinch)</Text>

<View style={{ flex: 1, backgroundColor: "#fff", marginHorizontal: 15, borderRadius: 12, overflow: 'hidden' }}>

<WebView

originWhitelist={['*']}

// WebView HTML 
source={{ html: `
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: monospace; margin: 0; padding: 15px; font-size: 14px; color: #000; font-weight: bold; background-color: #fff; }
  .header-row { display: flex; align-items: center; margin-bottom: 12px; }
  .logo-img { width: 50px; height: 50px; border-radius: 50%; object-fit: cover; margin-right: 10px; border: 1px solid #ddd; }
  .shop-info { flex: 1; text-align: center; }
  .center { text-align: center; }
  .divider { border-top: 1px dashed #000; margin: 12px 0; }
  .row { display: flex; justify-content: space-between; }
  table { width: 100%; border-collapse: collapse; }
  td { font-size: 14px; padding: 4px 0; }
  .right { text-align: right; }
</style>
</head>
<body>

  <!-- Top-Left Corner Logo + Shop Name -->
  <!-- Top-Left Corner Logo + Shop Name -->
<div class="header-row" style="display: flex; align-items: center; margin-bottom: 12px;">
  ${receiptStoreLogo && receiptLogoUri ? `<img src="${receiptLogoUri}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; margin-right: 10px; border: 1px solid #ddd;" />` : ""}
  <div style="flex: 1; text-align: center;">
    <div style="font-size:18px; font-weight:bold; text-transform: uppercase;">${shopName}</div>
    ${gstEnabled && gstNumber ? `<div style="font-size:12px;">GST: ${gstNumber}</div>` : ""}
  </div>
</div>

  <!-- Custom Receipt Header -->
  ${receiptHeader ? `<div class="center" style="font-size: 13px; margin-bottom: 8px; font-style: italic;">${receiptHeader}</div>` : ""}

  <div class="divider"></div>
  <div>Bill No: ${currentBillNo}</div>
  <div>Date: ${currentBillDate}</div>
  <div class="divider"></div>

  <table>
    ${bill.map(i => `
      <tr>
        <td>${i.itemName}<br/>&nbsp;&nbsp;${i.qty} x ₹${Number(i.price).toFixed(2)}</td>
        <td class="right" style="vertical-align:bottom;">₹${(i.qty * i.price).toFixed(2)}</td>
      </tr>
    `).join("")}
  </table>

  <div class="divider"></div>
  <div class="row" style="font-size:16px; font-weight:bold;">
    <span>GRAND TOTAL:</span><span>₹${Number(total).toFixed(2)}</span>
  </div>
  <div class="divider"></div>

  <!-- Receipt Footer -->
  <div class="center" style="margin-top:20px; font-weight: bold;">${receiptFooter || "Thank you for your business!"}</div>

</body>
</html>
` }}

scalesPageToFit={true}

/>

</View>

<View style={styles.receiptActionRow}>

<TouchableOpacity style={[styles.recBtn, { backgroundColor: "#ef4444" }]} onPress={() => { setShowReceiptModal(false); setBill([]); setIsActive(true); }}>

<Text style={styles.recBtnText}>Close</Text>

</TouchableOpacity>

<TouchableOpacity style={[styles.recBtn, { backgroundColor: "#6366f1" }]} onPress={() => triggerThermalPrint(currentBillNo, currentBillDate)}>

<Text style={styles.recBtnText}>🖨 Print Bill</Text>

</TouchableOpacity>

</View>

</View>

</Modal>



{/* SUCCESS OVERLAY MODAL */}

{showSuccessOverlay && (

<Modal transparent={true} animationType="fade" visible={showSuccessOverlay}>

<View style={styles.successOverlayBg}>

<View style={styles.successMessageBox}>

<View style={styles.successIconCircle}>

<Text style={{ color: "#fff", fontSize: 32, fontWeight: "bold" }}>✓</Text>

</View>

<Text style={styles.successTextTitle}>Payment Received! 🎉</Text>

<Text style={styles.successTextSub}>Amount: ₹ {total.toFixed(2)}</Text>

<Text style={styles.successModeBadge}>{paymentMode} PAYMENT</Text>

</View>

</View>

</Modal>

)}



{showScanToast && (

<View style={{ position: "absolute", top: 40, alignSelf: "center", backgroundColor: "#16a34a", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 30, zIndex: 9999, elevation: 20 }}>

<Text style={{ color: "#fff", fontWeight: "700" }}>✓ Product Added</Text>

</View>

)}



<Modal visible={showHoldModal} transparent animationType="slide">

<View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>

<View style={{ width: '80%', backgroundColor: theme.card, padding: 20, borderRadius: 20 }}>

<Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: theme.text }}>Enter Customer Name</Text>

<TextInput

placeholder="Customer Name (Optional)"

placeholderTextColor="#64748b"

value={holdCustomerName}

onChangeText={setHoldCustomerName}

style={{ borderWidth: 1, borderColor: darkMode ? '#334155' : '#ccc', color: theme.text, padding: 10, borderRadius: 10, marginBottom: 15 }}

/>

<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>

<TouchableOpacity onPress={() => setShowHoldModal(false)}>

<Text style={{ color: 'red', fontWeight: 'bold' }}>Cancel</Text>

</TouchableOpacity>

<TouchableOpacity onPress={confirmHold}>

<Text style={{ color: 'green', fontWeight: 'bold' }}>Confirm Hold</Text>

</TouchableOpacity>

</View>

</View>

</View>

</Modal>



<Modal visible={showResumeModal} transparent animationType="slide">

<View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>

<View style={{ width: '85%', backgroundColor: theme.card, padding: 20, borderRadius: 20, maxHeight: '80%' }}>

<Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 15, color: theme.text }}>Pending Orders</Text>

<ScrollView>

{heldOrders.length === 0 ? (

<Text style={{ textAlign: 'center', color: '#64748b', marginVertical: 20 }}>No pending orders!</Text>

) : (

heldOrders.map((o) => (

<View key={o.id} style={{ padding: 12, borderBottomWidth: 1, borderColor: darkMode ? '#334155' : '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>

<View>

<Text style={{ fontWeight: 'bold', fontSize: 16, color: theme.text }}>{o.name}</Text>

<Text style={{ color: '#64748b' }}>{o.timestamp} • {o.items.length} items</Text>

</View>

<TouchableOpacity onPress={() => resumeOrder(o)} style={{ backgroundColor: '#6366f1', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>

<Text style={{ color: '#fff', fontWeight: 'bold' }}>Resume</Text>

</TouchableOpacity>

</View>

))

)}

</ScrollView>

<TouchableOpacity onPress={() => setShowResumeModal(false)} style={{ marginTop: 20, alignItems: 'center' }}>

<Text style={{ color: 'red', fontWeight: 'bold' }}>Close</Text>

</TouchableOpacity>

</View>

</View>

</Modal>



{/* UPI PAYMENT MODAL */}

{/* UPI PAYMENT MODAL */}

<Modal visible={showUpiModal} transparent={true} animationType="fade">

<View style={styles.modalOverlay}>

<View style={[styles.modalContent, { backgroundColor: theme.card, alignItems: "center" }]}>

<Text style={[styles.modalTitle, { color: theme.text, textAlign: "center" }]}>Scan & Pay via UPI</Text>


<Text style={{ textAlign: "center", color: "#64748b", marginBottom: 10 }}>

Amount: ₹{total.toFixed(2)}

</Text>



{/* QR CODE CONTAINER */}

<View style={{ alignItems: "center", justifyContent: "center", marginVertical: 15, width: "100%" }}>

{currentQrMode === "generated" ? (

shopUpiId ? (

<QRCode

value={`upi://pay?pa=${shopUpiId}&pn=${encodeURIComponent(shopName)}&am=${total}&cu=INR`}

size={180}

/>

) : (

<Text style={{ color: "#ef4444", textAlign: "center", fontWeight: "600" }}>

UPI ID not configured in Settings!

</Text>

)

) : (

savedSettingsQr ? (

<Image

source={{ uri: savedSettingsQr }}

style={{ width: 180, height: 180, borderRadius: 12 }}

resizeMode="contain"

/>

) : (

<Text style={{ color: "#ef4444", textAlign: "center", fontWeight: "600" }}>

Custom QR Image not found in Settings!

</Text>

)

)}

</View>



<TouchableOpacity

style={{ backgroundColor: "#16a34a", padding: 12, borderRadius: 12, alignItems: "center", marginTop: 10, width: "100%" }}

onPress={triggerUpiSuccessAnimation}

>

<Text style={{ color: "#fff", fontWeight: "700" }}>I have received payment ✓</Text>

</TouchableOpacity>



<TouchableOpacity

style={{ alignItems: "center", width: "100%", marginTop: 12 }}

onPress={() => setShowUpiModal(false)}

>

<Text style={{ color: "#ef4444", fontWeight: "700" }}>Cancel</Text>

</TouchableOpacity>

</View>

</View>

</Modal>



</SafeAreaView>

);

}



const styles = StyleSheet.create({

container: { flex: 1, backgroundColor: "#f4f4f5" },

topWhiteHeader: {height: 60,width: '100%',backgroundColor: '#fff',flexDirection: 'row',alignItems: 'center',justifyContent: 'space-between',paddingHorizontal: 16,borderBottomWidth: 1,borderBottomColor: '#e2e8f0',elevation: 2,marginTop: Platform.OS === "android" ? StatusBar.currentHeight || 24 : 0 },

shopBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef2ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, maxWidth: '60%' },

shopNameText: { fontSize: 16, fontWeight: '800', color: '#6366f1', marginLeft: 6 },

headerIconBtn: { padding: 8, marginLeft: 6, backgroundColor: '#f1f5f9', borderRadius: 20, position: 'relative' },

badgeContainer: { position: 'absolute', top: 2, right: 2, backgroundColor: '#ef4444', minWidth: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },

badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

cameraOuterWrapper: { height: 260, width: "100%", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: "#ffffff" },

cameraFrameContainer: { flex: 1, overflow: "hidden", backgroundColor: '#000', borderRadius: 24, elevation: 4 },

cameraControlRow: { position: 'absolute', top: 15, right: 15, zIndex: 10, flexDirection: 'row' },

actionCircleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', marginLeft: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },

bottomWhiteContainer: { flex: 1, backgroundColor: "#ffffff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, marginTop: 4, elevation: 12 },

checkoutContainer: { position: "absolute", bottom: 0, width: "100%", height: "55%", backgroundColor: "#fff", borderTopLeftRadius: 35, borderTopRightRadius: 35, padding: 20, elevation: 12 },

title: { color: "#0f172a", fontSize: 18, marginBottom: 8, fontWeight: "700" },

itemCard: { position: "relative", backgroundColor: "#f8fafc", borderRadius: 14, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e2e8f0" },

itemName: { fontSize: 14, fontWeight: "700", color: "#111827" },

itemSub: { marginTop: 2, fontSize: 12, color: "#64748b" },

qtyControls: { flexDirection: "row", alignItems: "center", marginHorizontal: 8 },

qtyBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: "#6366f1", justifyContent: "center", alignItems: "center" },

qtyBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },

qtyText: { marginHorizontal: 8, fontSize: 15, fontWeight: "700", minWidth: 20, textAlign: "center", color: "#000" },

amountText: { width: 80, textAlign: "right", fontSize: 14, fontWeight: "bold", color: "#16a34a" },

total: { color: "#16a34a", fontSize: 26, textAlign: "center", marginVertical: 8, fontWeight: "bold" },

actionButtonBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 4 },

holdBtnIcon: { width: 54, height: 54, borderRadius: 16, borderWidth: 1.5, borderColor: '#cbd5e1', backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', marginRight: 12 },

payBtnNew: { flex: 1, backgroundColor: "#6366f1", height: 54, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', paddingTop: 10 },

scanRow: { flexDirection: "row", alignItems: "center", justifyContent: 'center', padding: 40 },

salesScanBox: { width: width * 0.75, height: 160, justifyContent: "center", alignItems: "center", backgroundColor: 'none', borderRadius: 16 },

corner: { position: "absolute", width: 24, height: 24, borderColor: "#22c55e" },

topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 10 },

topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 10 },

bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 10 },

bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 10 },

scanText: { color: "#22c55e", marginTop: 10, fontSize: 15, fontWeight: "700", textAlign: 'center' },

popoverMenu: { position: "absolute", right: 10, top: 45, backgroundColor: "#fff", borderRadius: 12, paddingVertical: 8, minWidth: 140, elevation: 8, zIndex: 999 },

modalReceiptContainer: { flex: 1, backgroundColor: "#1e293b", paddingTop: 20, paddingBottom: 10 },

zoomTipText: { color: "#38bdf8", textAlign: "center", fontWeight: "700", marginBottom: 12, fontSize: 13 },

receiptActionRow: { flexDirection: "row", padding: 15, backgroundColor: "#1e293b", justifyContent: "space-between" },

recBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: "center", marginHorizontal: 6, elevation: 2 },

recBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },

reviewRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },

successOverlayBg: { flex: 1, backgroundColor: "rgba(15,23,42,0.85)", justifyContent: "center", alignItems: "center" },

successMessageBox: { width: "80%", backgroundColor: "#fff", borderRadius: 24, padding: 30, alignItems: "center", elevation: 15 },

successIconCircle: { width: 70, height: 70, borderRadius: 35, backgroundColor: "#22c55e", justifyContent: "center", alignItems: "center", marginBottom: 16 },

successTextTitle: { fontSize: 22, fontWeight: "bold", color: "#0f172a", textAlign: "center" },

successTextSub: { fontSize: 16, color: "#475569", marginTop: 6, fontWeight: "600" },

successModeBadge: { marginTop: 14, backgroundColor: "#e2e8f0", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, fontSize: 12, fontWeight: "bold", color: "#475569" },

payModeBtnStyle: { padding: 12, borderRadius: 10, minWidth: 90, alignItems: 'center', backgroundColor: "#e5e7eb" },

payModeBtnActive: { backgroundColor: "#16a34a" },

payModeBtnDisabled: { backgroundColor: "#f3f4f6", opacity: 0.4 },

payModeText: { fontWeight: '700', color: "#000" },

modalOverlay: {

flex: 1,

backgroundColor: "rgba(0, 0, 0, 0.6)",

justifyContent: "center",

alignItems: "center",

padding: 20

},

modalContent: {

width: "90%",

maxWidth: 380,

borderRadius: 24,

padding: 20,

alignItems: "center",

elevation: 20,

shadowColor: "#000",

shadowOffset: { width: 0, height: 4 },

shadowOpacity: 0.3,

shadowRadius: 6

},

modalTitle: {

fontSize: 18,

fontWeight: "bold",

marginBottom: 4

}

});