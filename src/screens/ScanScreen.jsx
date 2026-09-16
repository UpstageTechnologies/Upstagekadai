import React, { useEffect, useState, useRef } from "react";
import { 
  Modal, 
  Image, 
  View, 
  Alert, 
  Text, 
  StyleSheet, 
  Dimensions, 
  TextInput, 
  ScrollView, 
  TouchableOpacity, 
  SafeAreaView, 
  StatusBar, 
  Platform,
  ActivityIndicator,
  FlatList
} from "react-native";
import { query, where, getDocs, updateDoc, doc, getDoc, collection, addDoc, deleteDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import RNPrint from "react-native-print";
import { useFocusEffect } from "@react-navigation/native";
import DropDownPicker from 'react-native-dropdown-picker';
import { WebView } from "react-native-webview";
import { NativeModules } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
  useCameraPermission,
} from "react-native-vision-camera";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import { auth, db } from "../utils/firebaseConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { launchImageLibrary } from 'react-native-image-picker';
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../utils/firebaseConfig";
import { useTheme } from "../theme/ThemeContext";

const { width } = Dimensions.get("window");

export default function ScanScreen({ navigation }) {
  const { darkMode, theme } = useTheme();
  const { ScanBeep } = NativeModules;
  const [cameraPosition, setCameraPosition] = useState("back");
  const device = useCameraDevice(cameraPosition);
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
  const [torch, setTorch] = useState("off");
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [currentPurNo, setCurrentPurNo] = useState("");
  const [currentPurDate, setCurrentPurDate] = useState("");
  const [purTotal, setPurTotal] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const scanLockRef = useRef(false);
  const [gstEnabled, setGstEnabled] = useState(false);
  const [taxPercent, setTaxPercent] = useState("0");
  const [taxOpen, setTaxOpen] = useState(false);
  const [formStep, setFormStep] = useState(1);
  const { hasPermission, requestPermission } = useCameraPermission();
  // PREDICT BOTTOM SHEET & WHATSAPP SEARCH WEB STATES
  const [predictModalVisible, setPredictModalVisible] = useState(false);
  const [predictLoading, setPredictLoading] = useState(false);
  const [predictBarcode, setPredictBarcode] = useState("");
  const [predictName, setPredictName] = useState("");
  const [predictBrand, setPredictBrand] = useState("");
  const [predictSubName, setPredictSubName] = useState("");
  const [predictImages, setPredictImages] = useState([]);
  const [predictSelectedImage, setPredictSelectedImage] = useState("");
  const [predictPurchasePrice, setPredictPurchasePrice] = useState("");
  const [predictSalesPrice, setPredictSalesPrice] = useState("");
  const [predictQty, setPredictQty] = useState(1);
  const [predictUnitType, setPredictUnitType] = useState("Qty");

  // WhatsApp-Style Full Screen Modal
  const [webImageGridModal, setWebImageGridModal] = useState(false);
  const [webSearchQuery, setWebSearchQuery] = useState("");
  const [webSearchResults, setWebSearchResults] = useState([]);
  const [webSearchSearching, setWebSearchSearching] = useState(false);

  // Headless Google Scraper State
  const [scraperUrl, setScraperUrl] = useState("");
  const headlessWebRef = useRef(null);

  const taxItems = [
    { label: "No Tax (0%)", value: "0" },
    { label: "GST 5%", value: "5" },
    { label: "GST 12%", value: "12" },
    { label: "GST 18%", value: "18" },
    { label: "GST 28%", value: "28" },
  ];

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
        setWebSearchResults(unique);
        setPredictImages(prev => [...new Set([...unique, ...prev])]);
        if (!predictSelectedImage && unique.length > 0) {
          setPredictSelectedImage(unique[0]);
        }
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
        Object.values(wikiData.query.pages).forEach(page => {
          if (page.imageinfo?.[0]?.url) {
            const u = page.imageinfo[0].url;
            if (!u.endsWith(".svg") && !u.endsWith(".tif")) direct.push(u);
          }
        });
      }
      if (direct.length > 0) {
        setWebSearchResults(direct);
        setPredictImages(prev => [...new Set([...direct, ...prev])]);
        if (!predictSelectedImage) setPredictSelectedImage(direct[0]);
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

  const handleOpenWebSearchModal = async () => {
    const raw = `${predictBrand} ${predictName} ${predictSubName}`.trim() || predictName.trim() || predictBarcode;
    setWebSearchQuery(raw);
    setWebImageGridModal(true);
    if (raw) {
      executeWebSearch(raw);
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
      Alert.alert("Error", "Image upload failed. Storing local image instead.");
      return localUri;
    }
  };
  useEffect(() => {
  if (!hasPermission) {
    requestPermission();
  }
}, [hasPermission, requestPermission]);
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const status = await Camera.getCameraPermissionStatus();
        if (status !== 'granted') {
          await Camera.requestCameraPermission();
        }
      } catch (error) {
        console.log("Permission error:", error);
      }
    }, 500);
    return () => clearTimeout(timer);
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

  const triggerPurchasePrint = async (purNo, purDate, totalAmt) => {
    const supName = supplierName || bill[0]?.supplierName || "Walk-in Supplier";
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
    <div class="header-row" style="display: flex; align-items: center; margin-bottom: 12px; justify-content: center;">
    ${logoUrl ? `<img src="${logoUrl}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; margin-right: 10px; border: 1px solid #ddd;" />` : ""}
    <div style="text-align: center;">
    <div style="font-size:14px; font-weight:bold; text-transform: uppercase;">${shopName}</div>
    <div style="font-size:11px; color: #555;">STOCK PURCHASE RECEIPT</div>
    </div>
    </div>
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
    const invoicesSnap = await getDocs(collection(db, "users", user.uid, invoicesCollection));
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const datePrefix = `${year}${month}${day}`;
    const sequenceNum = String(invoicesSnap.size + 1).padStart(4, "0");
    const purchaseNo = `${datePrefix}-${sequenceNum}`;
    const purchaseDate = now.toLocaleDateString("en-GB");

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
    codeTypes: ["ean-13", "qr", "ean-8", "upc-a"],
    onCodeScanned: async (codes) => {
      const code = codes[0]?.value;
    if (!code) return;

if (scanLockRef.current) return;

scanLockRef.current = true;

ScanBeep?.beep?.();

setTimeout(() => {
  scanLockRef.current = false;
}, 1500);
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
              Alert.alert("Scan Limit Reached", "Crossed your scan limit.");
              return;
            }
            await AsyncStorage.setItem(`scan_count_${userUid}`, String(currentCount + 1));
          }
        }
      } catch (err) { console.log(err); }

      setPredictBarcode(code);
      setPredictLoading(true);
      setPredictModalVisible(true);

      try {
        if (user && inventoryRef) {
          const q = query(inventoryRef, where("barcode", "==", code));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            const d = querySnapshot.docs[0].data();
            setPredictName(d.itemName || "");
            setPredictBrand(d.brand || "");
            setPredictSubName(d.subName || "");
            setPredictPurchasePrice(String(d.purchasePrice || ""));
            setPredictSalesPrice(String(d.salesPrice || ""));
            setPredictQty(1);
            setPredictUnitType(d.unitType || "Qty");
            const imgs = d.image ? [d.image] : [];
            setPredictImages(imgs);
            setPredictSelectedImage(d.image || "");
            setPredictLoading(false);
            return;
          }
        }
        let pName = "";
        let pBrand = "";
        let pSub = "";
        const imageList = [];

        // ---------------------------------------------------------
        // BARCODE LOOKUP HELPERS
        // ---------------------------------------------------------

        // Prevent one slow/dead API from blocking the barcode scan.
        const fetchJsonWithTimeout = async (url, timeoutMs = 5000) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

          try {
            const response = await fetch(url, {
              method: "GET",
              headers: {
                Accept: "application/json",
              },
              signal: controller.signal,
            });

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
          } finally {
            clearTimeout(timeoutId);
          }
        };

        // Only accept a real product name.
        // Never use the barcode itself as a product name.
        const setIfMissing = (currentValue, newValue) => {
          if (currentValue && String(currentValue).trim()) {
            return currentValue;
          }

          if (typeof newValue === "string" && newValue.trim()) {
            return newValue.trim();
          }

          return "";
        };

        const addImages = (images) => {
          if (!Array.isArray(images)) return;

          images.forEach((img) => {
            if (typeof img !== "string") return;

            const clean = img.trim();

            if (
              clean &&
              (clean.startsWith("http://") || clean.startsWith("https://"))
            ) {
              imageList.push(clean.replace("http://", "https://"));
            }
          });
        };

        // ---------------------------------------------------------
        // 1. GOOGLE BOOKS
        // Keep existing ISBN support.
        // ---------------------------------------------------------

        if (code.startsWith("978") || code.startsWith("979")) {
          try {
            const bookData = await fetchJsonWithTimeout(
              `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(code)}`,
              5000
            );

            if (bookData?.items?.length > 0) {
              const info = bookData.items[0]?.volumeInfo || {};

              pName = setIfMissing(pName, info.title);

              pBrand = setIfMissing(
                pBrand,
                info.publisher ||
                  (Array.isArray(info.authors)
                    ? info.authors.join(", ")
                    : "")
              );

              pSub = setIfMissing(
                pSub,
                info.subtitle ||
                  (Array.isArray(info.categories)
                    ? info.categories[0]
                    : "")
              );

              addImages([
                info.imageLinks?.thumbnail,
                info.imageLinks?.smallThumbnail,
              ]);
            }
          } catch (e) {
            console.log("Google Books Error:", e?.message || e);
          }
        }

        // ---------------------------------------------------------
        // 2. OPEN FOOD FACTS
        // Food / grocery / chocolates / crackers / packaged products
        // ---------------------------------------------------------

        try {
          const offData = await fetchJsonWithTimeout(
            `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`,
            5000
          );

          if (offData?.status === 1 && offData?.product) {
            const p = offData.product;

            pName = setIfMissing(
              pName,
              p.product_name ||
                p.product_name_en ||
                p.product_name_in ||
                p.generic_name
            );

            pBrand = setIfMissing(
              pBrand,
              p.brands || p.brand_owner
            );

            pSub = setIfMissing(
              pSub,
              p.generic_name ||
                p.quantity ||
                p.categories
            );

            addImages([
              p.image_front_url,
              p.image_front_small_url,
              p.image_front_thumb_url,
              p.image_url,
              p.image_small_url,
              p.image_thumb_url,
              p.image_packaging_url,
              p.selected_images?.front?.display?.en,
              p.selected_images?.front?.display?.fr,
            ]);
          }
        } catch (e) {
          console.log("Open Food Facts Error:", e?.message || e);
        }

        // ---------------------------------------------------------
        // 3. OPEN PRODUCTS FACTS
        // General non-food retail products.
        // Useful for household / supermarket / consumer products.
        // ---------------------------------------------------------

        try {
          const productsData = await fetchJsonWithTimeout(
            `https://world.openproductsfacts.org/api/v2/product/${encodeURIComponent(code)}.json`,
            5000
          );

          if (
            productsData?.status === 1 &&
            productsData?.product
          ) {
            const p = productsData.product;

            pName = setIfMissing(
              pName,
              p.product_name ||
                p.product_name_en ||
                p.generic_name
            );

            pBrand = setIfMissing(
              pBrand,
              p.brands ||
                p.brand_owner
            );

            pSub = setIfMissing(
              pSub,
              p.generic_name ||
                p.quantity ||
                p.categories
            );

            addImages([
              p.image_front_url,
              p.image_front_small_url,
              p.image_front_thumb_url,
              p.image_url,
              p.image_small_url,
              p.image_thumb_url,
              p.image_packaging_url,
              p.selected_images?.front?.display?.en,
            ]);
          }
        } catch (e) {
          console.log("Open Products Facts Error:", e?.message || e);
        }

        // ---------------------------------------------------------
        // 4. OPEN BEAUTY FACTS
        // Cosmetics / personal-care / beauty products.
        // ---------------------------------------------------------

        try {
          const beautyData = await fetchJsonWithTimeout(
            `https://world.openbeautyfacts.org/api/v2/product/${encodeURIComponent(code)}.json`,
            5000
          );

          if (
            beautyData?.status === 1 &&
            beautyData?.product
          ) {
            const p = beautyData.product;

            pName = setIfMissing(
              pName,
              p.product_name ||
                p.product_name_en ||
                p.generic_name
            );

            pBrand = setIfMissing(
              pBrand,
              p.brands ||
                p.brand_owner
            );

            pSub = setIfMissing(
              pSub,
              p.generic_name ||
                p.quantity ||
                p.categories
            );

            addImages([
              p.image_front_url,
              p.image_front_small_url,
              p.image_front_thumb_url,
              p.image_url,
              p.image_small_url,
              p.image_thumb_url,
              p.image_packaging_url,
              p.selected_images?.front?.display?.en,
            ]);
          }
        } catch (e) {
          console.log("Open Beauty Facts Error:", e?.message || e);
        }

        // ---------------------------------------------------------
        // 5. UPCitemdb
        // General barcode database.
        // Supports UPC / EAN / GTIN / ISBN and many retail items.
        // ---------------------------------------------------------

        try {
          const upcData = await fetchJsonWithTimeout(
            `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`,
            5000
          );

          if (Array.isArray(upcData?.items) && upcData.items.length > 0) {
            const item = upcData.items[0];

            pName = setIfMissing(
              pName,
              item.title
            );

            pBrand = setIfMissing(
              pBrand,
              item.brand
            );

            pSub = setIfMissing(
              pSub,
              item.category ||
                item.model ||
                item.description
            );

            addImages(item.images);
          }
        } catch (e) {
          console.log("UPCitemdb Error:", e?.message || e);
        }

        // ---------------------------------------------------------
        // FINAL IMAGE CLEANUP
        // ---------------------------------------------------------

        const uniqueImageList = [
          ...new Set(
            imageList
              .filter(Boolean)
              .map((img) => String(img).trim())
              .filter(
                (img) =>
                  img.startsWith("http://") ||
                  img.startsWith("https://")
              )
              .map((img) =>
                img.replace("http://", "https://")
              )
          ),
        ];

        imageList.length = 0;
        imageList.push(...uniqueImageList);

        const autoSearchQuery = `${pBrand} ${pName} ${pSub}`.trim() || pName.trim();
        if (autoSearchQuery.length > 2) {
          executeWebSearch(autoSearchQuery);
        }

        const uniqueImgs = [...new Set(imageList.filter(Boolean))];

        setPredictName(pName);
        setPredictBrand(pBrand);
        setPredictSubName(pSub);
        setPredictImages(uniqueImgs);
        setPredictSelectedImage(uniqueImgs[0] || "");
        setPredictPurchasePrice("");
        setPredictSalesPrice("");
        setPredictQty(1);
        setPredictUnitType("Qty");
      } catch (err) {
        console.log("Prediction Fetch Error:", err);
      } finally {
        setPredictLoading(false);
      }
    }
  });

  const pickImage = () => {
    launchImageLibrary(
      { mediaType: 'photo', quality: 0.8, includeBase64: false },
      (response) => {
        if (response.didCancel || response.errorCode) return;
        if (response.assets && response.assets.length > 0) {
          setEditImage(response.assets[0].uri);
        }
      },
    );
  };

  const pickPredictCustomImage = () => {
    launchImageLibrary(
      { mediaType: 'photo', quality: 0.8, includeBase64: false },
      (response) => {
        if (response.didCancel || response.errorCode) return;
        if (response.assets && response.assets.length > 0) {
          const pickedUri = response.assets[0].uri;
          setPredictImages(prev => [pickedUri, ...prev]);
          setPredictSelectedImage(pickedUri);
        }
      },
    );
  };

  // DIRECT INVENTORY STORAGE & LIST INSERTION
  const handleConfirmPredictedProduct = async () => {
    if (!predictName.trim()) {
      Alert.alert("Required", "Please enter product name");
      return;
    }
    if (!user) {
      Alert.alert("Error", "User not logged in");
      return;
    }

    let finalImageUrl = predictSelectedImage;
    if (predictSelectedImage && !predictSelectedImage.startsWith("http")) {
      finalImageUrl = await uploadImageToStorage(predictSelectedImage);
    }

    const compiledDisplayName = predictSubName.trim()
      ? `${predictName.trim()} (${predictSubName.trim()})`
      : predictName.trim();

    const pPrice = Number(predictPurchasePrice) || 0;
    const sPrice = Number(predictSalesPrice) || 0;
    const pQty = Number(predictQty) || 1;

    try {
      // 1. Check if item exists in Firestore inventory
      const q = query(collection(db, "users", user.uid, inventoryCollection), where("barcode", "==", predictBarcode));
      const querySnapshot = await getDocs(q);

      let savedDocId = "";

      if (!querySnapshot.empty) {
        const existingDoc = querySnapshot.docs[0];
        savedDocId = existingDoc.id;
        const existingData = existingDoc.data();
        const currentQty = Number(existingData.quantity) || 0;

        await updateDoc(doc(db, "users", user.uid, inventoryCollection, savedDocId), {
          itemName: compiledDisplayName,
          brand: predictBrand,
          subName: predictSubName,
          image: finalImageUrl || existingData.image || "",
          purchasePrice: pPrice > 0 ? pPrice : (Number(existingData.purchasePrice) || 0),
          salesPrice: sPrice > 0 ? sPrice : (Number(existingData.salesPrice) || 0),
          quantity: currentQty + pQty,
          unitType: predictUnitType,
          supplierName: supplierName || existingData.supplierName || "Walk-in Supplier",
          updatedAt: serverTimestamp()
        });
      } else {
        const docRef = await addDoc(collection(db, "users", user.uid, inventoryCollection), {
          barcode: predictBarcode,
          itemName: compiledDisplayName,
          brand: predictBrand,
          subName: predictSubName,
          image: finalImageUrl || "",
          purchasePrice: pPrice,
          salesPrice: sPrice,
          quantity: pQty,
          unitType: predictUnitType,
          category: selectedCategory || "General",
          supplierName: supplierName || "Walk-in Supplier",
          createdAt: serverTimestamp()
        });
        savedDocId = docRef.id;
      }

      // 2. Add to Scanned list in current session
      const newItem = {
        id: savedDocId,
        barcode: predictBarcode,
        name: compiledDisplayName,
        brand: predictBrand,
        subName: predictSubName,
        image: finalImageUrl,
        purchasePrice: pPrice,
        salesPrice: sPrice,
        qty: pQty,
        unitType: predictUnitType,
      };

      setScannedList(prev => {
        const exist = prev.find(i => i.barcode === predictBarcode);
        if (exist) {
          return prev.map(i => i.barcode === predictBarcode ? { ...i, qty: (i.qty || 1) + pQty } : i);
        }
        return [...prev, newItem];
      });

      setPredictModalVisible(false);
    } catch (err) {
      console.log("Error saving to inventory:", err);
      Alert.alert("Inventory Error", err.message);
    }
  };

  const handleAddOrUpdateProduct = async () => {
    if (!user || !tempProduct) return;
    const finalName = editName || tempProduct.name || "New Product";
    const finalPrice = Number(purchasePrice) > 0 ? Number(purchasePrice) : Number(tempProduct.purchasePrice || 0);
    const finalSalesPrice = Number(salesPrice) || 0;
    const finalQty = Number(editQty) || 1;
    const finalBrand = editBrand || tempProduct.brand || "";
    let finalImage = tempProduct.image || "";
    if (editImage) {
      finalImage = await uploadImageToStorage(editImage);
    }

    try {
      let productId = tempProduct?.id;
      if (tempProduct?.id && tempProduct.id.length > 10 && !tempProduct.id.startsWith("NO-BARCODE-")) {
        await updateDoc(doc(db, "users", user.uid, inventoryCollection, tempProduct.id), {
          itemName: finalName,
          brand: finalBrand,
          image: finalImage,
          purchasePrice: finalPrice,
          salesPrice: finalSalesPrice,
          quantity: finalQty,
          category: selectedCategory,
          unitType: unitType,
          supplierName: supplierName
        });
      } else {
        const docRef = await addDoc(collection(db, "users", user.uid, inventoryCollection), {
          barcode: tempProduct.barcode,
          itemName: finalName,
          brand: finalBrand,
          image: finalImage,
          purchasePrice: finalPrice,
          salesPrice: finalSalesPrice,
          quantity: finalQty,
          category: selectedCategory,
          unitType: unitType,
          supplierName: supplierName,
          createdAt: serverTimestamp()
        });
        productId = docRef.id;
      }

      const newItemForList = {
        id: productId,
        name: finalName,
        brand: finalBrand,
        image: finalImage,
        barcode: tempProduct.barcode,
        purchasePrice: finalPrice,
        salesPrice: finalSalesPrice,
        qty: finalQty,
        category: selectedCategory,
        unitType: unitType,
      };

      setScannedList(prev => {
        const exist = prev.find(i => i.barcode === tempProduct.barcode);
        if (exist) {
          return prev.map(i => i.barcode === tempProduct.barcode ? { ...i, ...newItemForList, qty: i.qty + finalQty } : i);
        }
        return [...prev, newItemForList];
      });

      setModalVisible(false);
      setFormStep(1);
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
        // Double check inventory sync for all items
        for (const it of scannedList) {
          const q = query(collection(db, "users", user.uid, inventoryCollection), where("barcode", "==", it.barcode));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const d = snap.docs[0];
            const currentStock = Number(d.data().quantity) || 0;
            await updateDoc(doc(db, "users", user.uid, inventoryCollection, d.id), {
              quantity: currentStock + (Number(it.qty) || 1),
              updatedAt: serverTimestamp()
            });
          } else {
            await addDoc(collection(db, "users", user.uid, inventoryCollection), {
              barcode: it.barcode,
              itemName: it.name,
              brand: it.brand || "",
              image: it.image || "",
              purchasePrice: Number(it.purchasePrice || 0),
              salesPrice: Number(it.salesPrice || 0),
              quantity: Number(it.qty || 1),
              unitType: it.unitType || "Qty",
              supplierName: supplierName || "Walk-in Supplier",
              createdAt: serverTimestamp()
            });
          }
        }

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
    } catch (err) { console.log("Inventory Bill Sync Error:", err); }

    setBill(newBill);
    setScannedList([]);
    setAddingAll(false);
    setSuccessVisible(true);
    setTimeout(() => { setSuccessVisible(false); }, 1800);
  };

  const filteredCategoryProducts = items.filter(item => {
    const matchesCategory = selectedCategory ? (item.category === selectedCategory) : true;
    const matchesSearch = (item.itemName || "").toLowerCase().includes(editName.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={darkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} />
      
      {/* HIDDEN IN-MEMORY HEADLESS GOOGLE IMAGE SCRAPER WEBVIEW */}
      {scraperUrl !== "" && (
        <View style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }}>
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

      {/* HEADER WITH SHOP NAME & ICONS */}
      <View style={[styles.topWhiteHeader, { backgroundColor: theme.card, borderBottomColor: darkMode ? "#334155" : "#e2e8f0" }]}>
        <View style={[styles.shopBadge, { backgroundColor: darkMode ? "#1e293b" : "#eef2ff" }]}>
          <Icon name="cube-box" size={22} color="#6366f1" />
          <Text style={[styles.shopNameText, { color: darkMode ? "#f8fafc" : "#6366f1" }]}>{shopName}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={[styles.headerIconBtn, { backgroundColor: darkMode ? "#1e293b" : "#f1f5f9" }]}>
            <Icon name="magnify" size={24} color={darkMode ? "#cbd5e1" : "#475569"} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.headerIconBtn, { backgroundColor: darkMode ? "#1e293b" : "#f1f5f9" }]}>
            <Icon name="history" size={24} color={darkMode ? "#cbd5e1" : "#475569"} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ROUNDED SQUARE CAMERA VIEW FRAME */}
      <View style={[styles.cameraOuterWrapper, { backgroundColor: theme.background }]}>
        <View style={styles.cameraFrameContainer}>
          {device && (
            <Camera
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={true}
              codeScanner={codeScanner}
              torch={torch}
            /> 
          )}
          <View style={styles.overlay}>
            {/* CAMERA CONTROLS */}
            <View style={styles.cameraControlRow}>
              <TouchableOpacity
                style={styles.actionCircleBtn}
                onPress={() => setTorch(prev => prev === "on" ? "off" : "on")}
              >
                <Icon name={torch === "on" ? "flash" : "flash-off"} size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionCircleBtn}
                onPress={() => setCameraPosition(prev => prev === "back" ? "front" : "back")}
              >
                <Icon name="camera-flip" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* CENTERED SCAN TARGET */}
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

      {/* BOTTOM PANEL SHEET */}
      <View style={[styles.bottomWhiteContainer, { backgroundColor: theme.card }]}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <TextInput
            placeholder={`Search ${currentMode} inventory...`}
            value={searchText}
            placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
            onChangeText={setSearchText}
            style={{ flex: 1, backgroundColor: darkMode ? "#1e293b" : "#f8fafc", borderWidth: 1, borderColor: darkMode ? "#334155" : "#cbd5e1", padding: 12, borderRadius: 12, color: theme.text }}
          />
          
          {/* (+) ICON CLICK OPENS SAME BOTTOM SHEET PREDICT POPUP */}
          <TouchableOpacity
            onPress={() => {
              const customBarcode = "MANUAL-" + Date.now().toString().slice(-6);
              setPredictBarcode(customBarcode);
              setPredictName("");
              setPredictBrand("");
              setPredictSubName("");
              setPredictImages([]);
              setPredictSelectedImage("");
              setPredictPurchasePrice("");
              setPredictSalesPrice("");
              setPredictQty(1);
              setPredictUnitType("Qty");
              setPredictLoading(false);
              setPredictModalVisible(true);
            }}
            style={{ width: 48, height: 48, backgroundColor: "#6366f1", borderRadius: 12, justifyContent: "center", alignItems: "center", marginLeft: 10 }}
          >
            <Text style={{ color: "#fff", fontSize: 28, fontWeight: "bold" }}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.title, { color: theme.text }]}>Scanned Items</Text>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {searchText.trim().length > 0 ? (
            filteredItems.map((item) => (
              <View key={item.id} style={[styles.itemCard, { backgroundColor: darkMode ? "#1e293b" : "#f8fafc", borderColor: darkMode ? "#334155" : "#e2e8f0" }]}>
                <Text style={{ color: theme.text, flex: 1, fontWeight: '700' }}>{item.itemName}</Text>
                <Text style={{ color: "#22c55e", marginRight: 10, fontWeight: '600' }}>₹{item.salesPrice || 0}</Text>
              </View>
            ))
          ) : (
            scannedList.map((item) => (
              <View key={item.barcode} style={[styles.itemCard, { backgroundColor: darkMode ? "#1e293b" : "#f8fafc", borderColor: darkMode ? "#334155" : "#e2e8f0", justifyContent: 'space-between', alignItems: 'center' }]}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={{ width: 40, height: 40, borderRadius: 8, marginRight: 8 }} />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '700' }}>{item.name}</Text>
                  {item.brand ? <Text style={{ color: darkMode ? "#94a3b8" : "#64748b", fontSize: 11 }}>{item.brand}</Text> : null}
                </View>

                {/* QUANTITY CONTROLLER (- qty +) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setScannedList(prev => prev.map(i => i.barcode === item.barcode ? { ...i, qty: Math.max(1, (i.qty || 1) - 1) } : i));
                    }}
                    style={styles.qtyBtn}
                  >
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>-</Text>
                  </TouchableOpacity>

                  <Text style={{ color: theme.text, marginHorizontal: 8, fontWeight: 'bold' }}>{item.qty || 1}</Text>

                  <TouchableOpacity
                    onPress={() => {
                      setScannedList(prev => prev.map(i => i.barcode === item.barcode ? { ...i, qty: (i.qty || 1) + 1 } : i));
                    }}
                    style={styles.qtyBtn}
                  >
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>+</Text>
                  </TouchableOpacity>
                </View>

                {/* EDIT & CANCEL BUTTONS */}
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity
                    onPress={() => {
                      setTempProduct(item);
                      setFormStep(1);
                      setEditName(item.name || ""); setEditBrand(item.brand || ""); setEditImage(item.image || ""); setPurchasePrice(String(item.purchasePrice || "")); setSalesPrice(String(item.salesPrice || "")); setEditQty(String(item.qty || "1")); setSelectedCategory(item.category || "");
                      setModalVisible(true);
                    }}
                    style={{ backgroundColor: "#22c55e", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, marginRight: 4 }}
                  >
                    <Text style={{ color: "#fff", fontSize: 11, fontWeight: 'bold' }}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => { setScannedList(prev => prev.filter(i => i.barcode !== item.barcode)); }} style={{ backgroundColor: "#ef4444", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 }}>
                    <Text style={{ color: "#fff", fontSize: 11, fontWeight: 'bold' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {scannedList.length > 0 && (
          <TouchableOpacity onPress={handleAddAllItems} style={{ backgroundColor:"#16a34a", padding:14, borderRadius:12, marginVertical:10, alignItems:"center" }}>
            <Text style={{ color:"#fff", fontWeight:"bold", fontSize:16 }}>➕ Add ({scannedList.reduce((acc, curr) => acc + (curr.qty || 1), 0)}) Items</Text>
          </TouchableOpacity>
        )}

        <View style={[styles.billSummaryBox, { backgroundColor: darkMode ? "#1e293b" : "#0f172a" }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Icon name="receipt" size={20} color="#fff" style={{ marginRight: 6 }} />
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: '700' }}>Bill ({currentMode.toUpperCase()})</Text>
          </View>
          <ScrollView style={{ maxHeight: 75 }} showsVerticalScrollIndicator={false}>
            {bill.map((item) => (
              <View key={item.barcode} style={{ flexDirection: "row", justifyContent: "space-between", marginVertical: 3 }}>
                <Text style={{ color: "#cbd5e1", fontSize: 13 }}>{item.name} x {item.unitType === "Kg" ? `${item.qty} Kg` : item.unitType === "Gram" ? `${item.qty} Gram` : item.qty}</Text>
                <Text style={{ color: "#22c55e", fontSize: 13, fontWeight: '600' }}>₹ {item.purchasePrice * item.qty}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 6, marginTop: 4, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: "#fff", fontWeight: 'bold' }}>Total:</Text>
            <Text style={{ color: "#22c55e", fontWeight: 'bold', fontSize: 16 }}>₹ {bill.reduce((sum, i) => sum + (i.purchasePrice || 0) * i.qty, 0)}</Text>
          </View>
          <TouchableOpacity onPress={handleProcessPurchaseInvoice} style={{ backgroundColor: "#22c55e", padding: 12, borderRadius: 12, marginTop: 10 }}>
            <Text style={{ color: "#fff", textAlign: "center", fontWeight: "bold" }}>View Purchase Receipt</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* SMART BARCODE PREDICT CARD MODAL */}
      <Modal visible={predictModalVisible} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: darkMode ? "#1e293b" : "#ffffff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "88%" }}>
            
            {predictLoading ? (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <ActivityIndicator size="large" color="#6366f1" />
                <Text style={{ marginTop: 12, fontWeight: "700", color: theme.text }}>Predicting & Searching Web Images...</Text>
                <Text style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Barcode: {predictBarcode}</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <View>
                    <Text style={{ fontSize: 18, fontWeight: "800", color: theme.text }}>📦 Product Predicted</Text>
                    <Text style={{ fontSize: 12, color: "#64748b" }}>Barcode: {predictBarcode}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setPredictModalVisible(false)} style={{ padding: 4 }}>
                    <Icon name="close" size={24} color={darkMode ? "#94a3b8" : "#64748b"} />
                  </TouchableOpacity>
                </View>

                {/* WhatsApp-Style 'Search Web' Button Row */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: theme.text }}>Select Product Image</Text>
                  
                  <TouchableOpacity 
                    onPress={handleOpenWebSearchModal} 
                    style={{ flexDirection: "row", alignItems: "center", backgroundColor: darkMode ? "#334155" : "#e0e7ff", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 }}
                  >
                    <Icon name="magnify" size={16} color="#6366f1" style={{ marginRight: 4 }} />
                    <Text style={{ fontSize: 11, fontWeight: "800", color: "#6366f1" }}>Search web</Text>
                  </TouchableOpacity>
                </View>

                {/* Horizontal Image Carousel */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: "row", marginBottom: 12 }}>
                  {predictImages.map((imgUri, index) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => setPredictSelectedImage(imgUri)}
                      style={{
                        width: 76,
                        height: 76,
                        borderRadius: 12,
                        marginRight: 10,
                        borderWidth: 2,
                        borderColor: predictSelectedImage === imgUri ? "#22c55e" : (darkMode ? "#334155" : "#cbd5e1"),
                        overflow: "hidden",
                        backgroundColor: "#f8fafc"
                      }}
                    >
                      <Image source={{ uri: imgUri }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
                    </TouchableOpacity>
                  ))}

                  {/* Upload Custom Image */}
                  <TouchableOpacity
                    onPress={pickPredictCustomImage}
                    style={{
                      width: 76,
                      height: 76,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderStyle: "dashed",
                      borderColor: "#6366f1",
                      justifyContent: "center",
                      alignItems: "center",
                      backgroundColor: darkMode ? "#0f172a" : "#eef2ff"
                    }}
                  >
                    <Icon name="camera-plus" size={24} color="#6366f1" />
                    <Text style={{ fontSize: 10, color: "#6366f1", fontWeight: "bold", marginTop: 2 }}>Upload</Text>
                  </TouchableOpacity>
                </ScrollView>

                {/* Product Name Input */}
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b", marginTop: 6 }}>Product Name *</Text>
                <TextInput
                  value={predictName}
                  onChangeText={setPredictName}
                  placeholder="e.g. 3 Roses or Fivestar"
                  placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
                  style={[styles.input, { marginTop: 4, textAlign: "left", backgroundColor: darkMode ? "#0f172a" : "#f8fafc", color: theme.text, borderColor: darkMode ? "#334155" : "#cbd5e1" }]}
                />

                {/* Brand & Sub-Name Row */}
                <View style={{ flexDirection: "row", marginTop: 8 }}>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b" }}>Brand Name</Text>
                    <TextInput
                      value={predictBrand}
                      onChangeText={setPredictBrand}
                      placeholder="e.g. Cadbury / Brooke Bond"
                      placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
                      style={[styles.input, { marginTop: 4, textAlign: "left", backgroundColor: darkMode ? "#0f172a" : "#f8fafc", color: theme.text, borderColor: darkMode ? "#334155" : "#cbd5e1" }]}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b" }}>Sub Name / Variant</Text>
                    <TextInput
                      value={predictSubName}
                      onChangeText={setPredictSubName}
                      placeholder="e.g. Chocolate / Natural Care"
                      placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
                      style={[styles.input, { marginTop: 4, textAlign: "left", backgroundColor: darkMode ? "#0f172a" : "#f8fafc", color: theme.text, borderColor: darkMode ? "#334155" : "#cbd5e1" }]}
                    />
                  </View>
                </View>

                {/* Price & Quantity with +/- Buttons */}
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b" }}>Purchase Price (₹)</Text>
                    <TextInput
                      keyboardType="numeric"
                      value={predictPurchasePrice}
                      onChangeText={setPredictPurchasePrice}
                      placeholder="0"
                      placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
                      style={[styles.input, { marginTop: 4, textAlign: "left", backgroundColor: darkMode ? "#0f172a" : "#f8fafc", color: theme.text, borderColor: darkMode ? "#334155" : "#cbd5e1" }]}
                    />
                  </View>

                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b", marginBottom: 4 }}>Quantity</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: darkMode ? "#334155" : "#cbd5e1", borderRadius: 10, padding: 6, backgroundColor: darkMode ? "#0f172a" : "#f8fafc" }}>
                      <TouchableOpacity
                        onPress={() => setPredictQty(prev => Math.max(1, prev - 1))}
                        style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: "#6366f1", justifyContent: "center", alignItems: "center" }}
                      >
                        <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 18 }}>-</Text>
                      </TouchableOpacity>
                      <Text style={{ fontSize: 16, fontWeight: "bold", color: theme.text }}>{predictQty}</Text>
                      <TouchableOpacity
                        onPress={() => setPredictQty(prev => prev + 1)}
                        style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: "#6366f1", justifyContent: "center", alignItems: "center" }}
                      >
                        <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 18 }}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Confirm Add Button */}
                <TouchableOpacity
                  onPress={handleConfirmPredictedProduct}
                  style={{ backgroundColor: "#16a34a", padding: 14, borderRadius: 12, marginTop: 20, alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>✓ Add to Scanned List</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

          </View>
        </View>
      </Modal>

      {/* WHATSAPP-STYLE FULL-SCREEN WEB IMAGE SEARCH MODAL (GRID VIEW) */}
      <Modal visible={webImageGridModal} animationType="slide" transparent={false}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#0b141a" }}>
          <StatusBar barStyle="light-content" backgroundColor="#0b141a" />
          
          {/* WhatsApp Header */}
          <View style={{ flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: 1, borderBottomColor: "#1f2c34" }}>
            <TouchableOpacity onPress={() => setWebImageGridModal(false)} style={{ padding: 6 }}>
              <Icon name="arrow-left" size={24} color="#e9edef" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginHorizontal: 10, flexDirection: "row", alignItems: "center", backgroundColor: "#1f2c34", borderRadius: 20, paddingHorizontal: 12, height: 42 }}>
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

          {/* 3-Column Grid Layout matching WhatsApp Pack Shots */}
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
                    setPredictSelectedImage(item);
                    setPredictImages(prev => [item, ...prev]);
                    setWebImageGridModal(false);
                  }}
                  style={{ flex: 1 / 3, aspectRatio: 1, margin: 2, backgroundColor: "#ffffff", borderRadius: 4, overflow: "hidden", justifyContent: "center", alignItems: "center" }}
                >
                  <Image source={{ uri: item }} style={{ width: "95%", height: "95%" }} resizeMode="contain" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ flex: 1, alignItems: "center", marginTop: 60 }}>
                  <Icon name="image-search-outline" size={60} color="#8696a0" />
                  <Text style={{ color: "#8696a0", marginTop: 10 }}>No web images found. Try different keyword.</Text>
                </View>
              }
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* RECEIPT MODAL */}
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
                .header-row { display: flex; align-items: center; margin-bottom: 12px; justify-content: center; }
                .logo-img { width: 50px; height: 50px; border-radius: 50%; object-order: cover; margin-right: 10px; border: 1px solid #ddd; }
                .divider { border-top: 1px dashed #000; margin: 12px 0; }
                .row { display: flex; justify-content: space-between; }
                table { width: 100%; border-collapse: collapse; }
                td { font-size: 14px; padding: 4px 0; }
                .right { text-align: right; }
                </style>
                </head>
                <body>
                <div class="header-row" style="display: flex; align-items: center; margin-bottom: 12px; justify-content: center;">
                ${logoUrl ? `<img src="${logoUrl}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; margin-right: 10px; border: 1px solid #ddd;" />` : ""}
                <div style="text-align: center;">
                <div style="font-size:18px; font-weight:bold; text-transform: uppercase;">${shopName}</div>
                <div style="font-size:13px; color: #555;">STOCK PURCHASE RECEIPT</div>
                </div>
                </div>

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

      {/* MODAL - MULTI-STEP PROFESSIONAL WIZARD */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" }}>
          <View style={{ backgroundColor: darkMode ? "#1e293b" : "#fff", width: "90%", borderRadius: 20, padding: 22, elevation: 10 }}>
            {/* HEADER & STEP INDICATOR */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
              <View>
                <Text style={{ fontSize: 18, fontWeight: "800", color: darkMode ? "#f8fafc" : "#0f172a" }}>
                  {formStep === 1 ? "📦 Basic Details" : formStep === 2 ? "💰 Pricing & Qty" : "🏷️ Category & Tax"}
                </Text>
                <Text style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Step {formStep} of 3</Text>
              </View>
              <TouchableOpacity onPress={() => { setModalVisible(false); setFormStep(1); }}>
                <Icon name="close" size={22} color={darkMode ? "#94a3b8" : "#64748b"} />
              </TouchableOpacity>
            </View>

            {/* STEP PROGRESS BAR */}
            <View style={{ flexDirection: "row", height: 4, backgroundColor: darkMode ? "#334155" : "#e2e8f0", borderRadius: 2, marginBottom: 20 }}>
              <View style={{ flex: formStep >= 1 ? 1 : 0, backgroundColor: "#6366f1", borderRadius: 2 }} />
              <View style={{ flex: formStep >= 2 ? 1 : 0, backgroundColor: formStep >= 2 ? "#6366f1" : "transparent", marginLeft: 4, borderRadius: 2 }} />
              <View style={{ flex: formStep >= 3 ? 1 : 0, backgroundColor: formStep >= 3 ? "#6366f1" : "transparent", marginLeft: 4, borderRadius: 2 }} />
            </View>

            {/* STEP 1: IMAGE, SUPPLIER, NAME, BRAND */}
            {formStep === 1 && (
              <View>
                <TouchableOpacity
                  onPress={pickImage}
                  style={[styles.imagePickerBox, { backgroundColor: darkMode ? "#0f172a" : "#f8fafc", borderColor: darkMode ? "#334155" : "#cbd5e1" }]}
                >
                  {editImage ? (
                    <Image source={{ uri: editImage }} style={{ width: "100%", height: "100%", borderRadius: 15 }} />
                  ) : (
                    <View style={{ alignItems: "center" }}>
                      <Icon name="camera-plus" size={28} color="#6366f1" />
                      <Text style={{ color: darkMode ? "#94a3b8" : "#64748b", fontSize: 12, marginTop: 4 }}>Add Product Image</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TextInput placeholder="Supplier Name" placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"} value={supplierName} onChangeText={setSupplierName} style={[styles.input, { backgroundColor: darkMode ? "#0f172a" : "#ffffff", color: darkMode ? "#f8fafc" : "#111827", borderColor: darkMode ? "#334155" : "#cbd5e1" }]} />
                <View>
                  <TextInput placeholder="Product Name *" placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"} value={editName} style={[styles.input, { backgroundColor: darkMode ? "#0f172a" : "#ffffff", color: darkMode ? "#f8fafc" : "#111827", borderColor: darkMode ? "#334155" : "#cbd5e1" }]} onChangeText={(text) => { setEditName(text); setShowDropdown(true); }} />
                  {showDropdown && editName !== "" && (
                    <View style={[styles.searchDropdownContainer, { backgroundColor: darkMode ? "#0f172a" : "#ffffff", borderColor: darkMode ? "#334155" : "#e2e8f0" }]}>
                      <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 120 }}>
                        {filteredCategoryProducts.map(item => (
                          <TouchableOpacity key={item.id} style={[styles.searchDropdownItem, { borderBottomColor: darkMode ? "#334155" : "#e2e8f0" }]} onPress={() => { setEditName(item.itemName); setPurchasePrice(String(item.purchasePrice || 0)); setSalesPrice(String(item.salesPrice || 0)); setEditBrand(item.brand || ""); setEditImage(item.image || ""); setSelectedCategory(item.category || ""); setShowDropdown(false); }}>
                            <Text style={{ fontSize: 14, fontWeight: "600", color: darkMode ? "#f8fafc" : "#000" }}>{item.itemName}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>

                <TextInput placeholder="Brand Name" placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"} value={editBrand} onChangeText={setEditBrand} style={[styles.input, { backgroundColor: darkMode ? "#0f172a" : "#ffffff", color: darkMode ? "#f8fafc" : "#111827", borderColor: darkMode ? "#334155" : "#cbd5e1" }]} />
              </View>
            )}

            {/* STEP 2: PRICING, QTY & UNITS */}
            {formStep === 2 && (
              <View>
                <TextInput placeholder="Purchase Price (₹) *" placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"} keyboardType="numeric" value={purchasePrice} onChangeText={setPurchasePrice} style={[styles.input, { backgroundColor: darkMode ? "#0f172a" : "#ffffff", color: darkMode ? "#f8fafc" : "#111827", borderColor: darkMode ? "#334155" : "#cbd5e1" }]} />
                <TextInput placeholder="Sales Price (₹)" placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"} keyboardType="numeric" value={salesPrice} onChangeText={setSalesPrice} style={[styles.input, { backgroundColor: darkMode ? "#0f172a" : "#ffffff", color: darkMode ? "#f8fafc" : "#111827", borderColor: darkMode ? "#334155" : "#cbd5e1" }]} />
                <TextInput placeholder="Quantity" placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"} keyboardType="numeric" value={editQty} onChangeText={setEditQty} style={[styles.input, { backgroundColor: darkMode ? "#0f172a" : "#ffffff", color: darkMode ? "#f8fafc" : "#111827", borderColor: darkMode ? "#334155" : "#cbd5e1" }]} />

                <Text style={{ marginTop: 15, fontWeight: "600", color: darkMode ? "#f8fafc" : '#000', fontSize: 13 }}>Unit Type</Text>
                <View style={{ flexDirection: "row", marginTop: 8 }}>
                  {["Qty", "Kg", "Gram"].map(unit => (
                    <TouchableOpacity
                      key={unit}
                      onPress={() => setUnitType(unit)}
                      style={[styles.unitTab, unitType === unit ? { backgroundColor: "#16a34a" } : { backgroundColor: darkMode ? "#0f172a" : "#e5e7eb" }]}
                    >
                      <Text style={{ textAlign: "center", color: unitType === unit ? "#fff" : (darkMode ? "#f8fafc" : "#000"), fontWeight: '600' }}>{unit}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* STEP 3: CATEGORY & TAX */}
            {formStep === 3 && (
              <View>
                <Text style={{ marginBottom: 6, fontWeight: "600", color: darkMode ? "#f8fafc" : '#000', fontSize: 13 }}>Tax Percentage</Text>
                <DropDownPicker
                  open={taxOpen}
                  value={taxPercent}
                  items={taxItems}
                  setOpen={setTaxOpen}
                  setValue={setTaxPercent}
                  placeholder="Select Tax %"
                  style={{ borderColor: darkMode ? "#334155" : "#cbd5e1", backgroundColor: darkMode ? "#0f172a" : "#fff" }}
                  textStyle={{ color: darkMode ? "#f8fafc" : "#000" }}
                  dropDownContainerStyle={{ borderColor: darkMode ? "#334155" : "#cbd5e1", backgroundColor: darkMode ? "#0f172a" : "#fff" }}
                  listMode="SCROLLVIEW"
                  zIndex={3000}
                />

                <View style={{ marginTop: 15 }}>
                  <Text style={{ marginBottom: 6, fontWeight: "600", color: darkMode ? "#f8fafc" : '#000', fontSize: 13 }}>Category</Text>
                  <DropDownPicker
                    open={open}
                    value={selectedCategory}
                    items={categoryItems}
                    setOpen={setOpen}
                    setValue={setSelectedCategory}
                    setItems={setCategoryItems}
                    placeholder="Select Category"
                    style={{ borderColor: darkMode ? "#334155" : "#cbd5e1", backgroundColor: darkMode ? "#0f172a" : "#fff" }}
                    textStyle={{ color: darkMode ? "#f8fafc" : "#000" }}
                    dropDownContainerStyle={{ borderColor: darkMode ? "#334155" : "#cbd5e1", backgroundColor: darkMode ? "#0f172a" : "#fff" }}
                    listMode="SCROLLVIEW"
                    zIndex={2000}
                  />
                </View>

                <TouchableOpacity onPress={() => { setNewCategoryModal(true); }} style={{ marginTop: 12, alignSelf: 'flex-start' }}>
                  <Text style={{ color: "#6366f1", fontWeight: "600", fontSize: 13 }}>+ Add New Category</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* FOOTER ACTION BUTTONS */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 25 }}>
              {formStep > 1 ? (
                <TouchableOpacity
                  onPress={() => setFormStep(prev => prev - 1)}
                  style={{ paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: darkMode ? "#334155" : "#cbd5e1" }}
                >
                  <Text style={{ color: darkMode ? "#f8fafc" : "#475569", fontWeight: "bold" }}>Back</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => { setModalVisible(false); setFormStep(1); }} style={{ padding: 12 }}>
                  <Text style={{ color: "#ef4444", fontWeight: "bold" }}>Cancel</Text>
                </TouchableOpacity>
              )}

              {formStep < 3 ? (
                <TouchableOpacity
                  onPress={() => {
                    if (formStep === 1 && !editName.trim()) {
                      Alert.alert("Required", "Please enter a product name.");
                      return;
                    }
                    setFormStep(prev => prev + 1);
                  }}
                  style={{ backgroundColor: "#6366f1", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 }}
                >
                  <Text style={{ color: "#fff", fontWeight: "bold" }}>Next ➔</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    handleAddOrUpdateProduct();
                  }}
                  style={{ backgroundColor: "#16a34a", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 }}
                >
                  <Text style={{ color: "#fff", fontWeight: "bold" }}>✓ Save Product</Text>
                </TouchableOpacity>
              )}
            </View>

          </View>
        </View>
      </Modal>

      {/* GPAY STYLE SUCCESS MODAL */}
      <Modal visible={successVisible} transparent animationType="fade">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(15, 23, 42, 0.7)" }}>
          <View style={{ backgroundColor: darkMode ? "#1e293b" : "#fff", width: 250, height: 250, borderRadius: 125, justifyContent: "center", alignItems: "center", elevation: 10 }}>
            <View style={{ backgroundColor: "#16a34a", width: 120, height: 120, borderRadius: 60, justifyContent: "center", alignItems: "center" }}>
              <Text style={{ fontSize: 65, color: "#fff", fontWeight: "bold" }}>✓</Text>
            </View>
            <Text style={{ marginTop: 15, fontSize: 18, fontWeight: "900", color: darkMode ? "#f8fafc" : "#1e293b" }}>Items Added</Text>
            <Text style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Saved to History</Text>
          </View>
        </View>
      </Modal>

      {/* NEW CATEGORY MODAL */}
      <Modal visible={newCategoryModal} transparent animationType="fade">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ width: "85%", backgroundColor: darkMode ? "#1e293b" : "#fff", borderRadius: 15, padding: 20, maxHeight: "80%" }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10, color: darkMode ? "#f8fafc" : '#000' }}>Manage Categories ({currentMode.toUpperCase()})</Text>
            <TextInput placeholder="New Category Name" placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"} value={categoryName} onChangeText={setCategoryName} style={[styles.input, { backgroundColor: darkMode ? "#0f172a" : "#ffffff", color: darkMode ? "#f8fafc" : "#111827", borderColor: darkMode ? "#334155" : "#cbd5e1" }]} />
            <TouchableOpacity
              onPress={async () => {
                if (!categoryName.trim() || !user) return;
                await addDoc(collection(db, "users", user.uid, categoriesCollection), { name: categoryName.trim() });
                setCategoryName("");
              }}
              style={{ backgroundColor: "#16a34a", padding: 12, borderRadius: 10, marginTop: 10 }}
            >
              <Text style={{ color: "#fff", textAlign: "center", fontWeight: "bold" }}>+ Add Category</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 12, color: "#64748b", marginTop: 15, marginBottom: 5, fontStyle: "italic" }}>* Long press on a category to delete it</Text>
            <ScrollView style={{ minHeight: 100, maxHeight: 200, borderWidth: 1, borderColor: darkMode ? "#334155" : "#cbd5e1", borderRadius: 10, padding: 5 }}>
              {categories.map((cat) => (
                <TouchableOpacity key={cat.id} onLongPress={() => handleDeleteCategory(cat.id, cat.name)} delayLongPress={600} style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: darkMode ? "#334155" : "#e2e8f0", backgroundColor: darkMode ? "#0f172a" : "#f8fafc", marginVertical: 2, borderRadius: 5 }}>
                  <Text style={{ color: darkMode ? "#f8fafc" : "#334155", fontWeight: "500" }}>{cat.name}</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topWhiteHeader: { height: 60, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, elevation: 2, marginTop: Platform.OS === "android" ? StatusBar.currentHeight || 24 : 0 },
  shopBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  shopNameText: { fontSize: 16, fontWeight: '800', marginLeft: 6 },
  headerIconBtn: { padding: 8, marginLeft: 6, borderRadius: 20 },
  cameraOuterWrapper: { height: 260, width: "100%", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  cameraFrameContainer: { flex: 1, overflow: "hidden", backgroundColor: '#000', borderRadius: 24, elevation: 4 },
  cameraControlRow: { position: 'absolute', top: 15, right: 15, zIndex: 10, flexDirection: 'row' },
  actionCircleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', marginLeft: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', paddingTop: 10 },
  scanRow: { flexDirection: "row", alignItems: "center", justifyContent: 'center', padding: 40 },
  salesScanBox: { width: width * 0.75, height: 160, justifyContent: "center", alignItems: "center", backgroundColor: 'none', borderRadius: 16 },
  corner: { position: "absolute", width: 24, height: 24, borderColor: "#22c55e" },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 10 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 10 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 10 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 10 },
  scanText: { color: "#22c55e", marginTop: 10, fontSize: 15, fontWeight: "700", textAlign: 'center' },

  bottomWhiteContainer: { flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, marginTop: 4, elevation: 12 },
  title: { fontSize: 18, marginBottom: 8, fontWeight: "700" },
  itemCard: { borderRadius: 14, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", borderWidth: 1 },
  billSummaryBox: { marginTop: 5, padding: 12, borderRadius: 18 },

  qtyBtn: { backgroundColor: '#6366f1', width: 26, height: 26, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },

  input: { padding: 12, marginTop: 12, borderRadius: 10, width: "100%", textAlign: "center", borderWidth: 1 },
  imagePickerBox: { marginTop: 10, height: 120, width: 120, borderRadius: 15, justifyContent: "center", alignItems: "center", alignSelf: "center", borderWidth: 2, borderStyle: "dashed" },
  unitTab: { flex: 1, padding: 12, marginHorizontal: 4, borderRadius: 10 },
  searchDropdownContainer: { maxHeight: 150, borderRadius: 12, marginTop: 4, overflow: "hidden", elevation: 4, borderWidth: 1 },
  searchDropdownItem: { padding: 12, borderBottomWidth: 1 },

  modalReceiptContainer: { flex: 1, backgroundColor: "#1e293b", paddingTop: 20, paddingBottom: 10 },
  zoomTipText: { color: "#38bdf8", textAlign: "center", fontWeight: "700", marginBottom: 12, fontSize: 13 },
  receiptActionRow: { flexDirection: "row", padding: 15, backgroundColor: "#1e293b", justifyContent: "space-between" },
  recBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: "center", marginHorizontal: 6 },
  recBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 }
});