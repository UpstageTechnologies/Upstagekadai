import React, { useEffect, useState, useRef } from "react";
import { 
  Modal, 
  Image, 
  View, 
  Alert, 
  Text, 
  StyleSheet, 
  TextInput, 
  ScrollView, 
  TouchableOpacity, 
  SafeAreaView, 
  StatusBar, 
  Platform,
  ActivityIndicator,
  FlatList,
  Keyboard,
  Animated,
  useWindowDimensions
} from "react-native";
import { query, where, getDocs, updateDoc, doc, getDoc, collection, addDoc, deleteDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import RNPrint from "react-native-print";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { WebView } from "react-native-webview";
import { NativeModules } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
  useCameraPermission,
} from "react-native-vision-camera";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import { auth, db, storage } from "../utils/firebaseConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { removeProductBackground, cleanupOldSegmentedImages } from "../utils/backgroundRemover";
import { useTheme } from "../theme/ThemeContext";
import {
  validateHSNCode,
  lookupHSNCode,
  searchHSNByProductDetails,
  suggestHSNCode,
  getHSNDescription,
} from "../services/hsnService";

// PROGRESS STEPPER ITEM COMPONENT
const StepItem = ({ label, stepNumber, isCompleted, isLast }) => {
  const scaleAnim = useRef(new Animated.Value(isCompleted ? 1 : 0.9)).current;
  const lineAnim = useRef(new Animated.Value(isCompleted ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isCompleted ? 1 : 0.9,
      friction: 5,
      tension: 100,
      useNativeDriver: true,
    }).start();

    Animated.timing(lineAnim, {
      toValue: isCompleted ? 1 : 0,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [isCompleted]);

  return (
    <View style={stepperStyles.stepWrapper}>
      <View style={stepperStyles.nodeRow}>
        <Animated.View
          style={[
            stepperStyles.circleNode,
            isCompleted ? stepperStyles.circleActive : stepperStyles.circleInactive,
            { transform: [{ scale: scaleAnim }] }
          ]}
        >
          {isCompleted ? (
            <Icon name="check" size={16} color="#fff" />
          ) : (
            <Text style={stepperStyles.stepNumText}>{stepNumber}</Text>
          )}
        </Animated.View>

        {!isLast && (
          <View style={stepperStyles.lineTrack}>
            <Animated.View
              style={[
                stepperStyles.lineFill,
                {
                  width: lineAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={[stepperStyles.stepLabel, isCompleted && stepperStyles.stepLabelActive]}>
        {label}
      </Text>
    </View>
  );
};

export const UNIT_CATEGORIES = [
  { category: "Weight", units: ["kg", "g", "mg", "ton", "quintal", "lb", "oz"] },
  { category: "Liquid / Capacity", units: ["L", "ml", "kL", "gallon", "pint", "fl oz"] },
  { category: "Count / Pieces", units: ["pcs", "piece", "unit", "item", "pair", "each"] },
  { category: "Pack / Package", units: ["packet", "pack", "box", "bundle", "set", "carton", "case", "sachet", "pouch", "tin", "can", "bottle", "bag"] },
  { category: "Bulk / Wholesale", units: ["dozen", "half dozen", "gross", "score", "bale", "lot"] },
  { category: "Length", units: ["mm", "cm", "m", "km", "inch", "ft", "yard"] },
  { category: "Area", units: ["sq cm", "sq m", "sq ft", "sq yd", "acre", "hectare"] },
  { category: "Volume", units: ["cm³", "m³", "cu ft", "cu yd"] },
  { category: "Clothing Size", units: ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Free Size"] },
  { category: "Shoe Size", units: ["UK 1-13", "EU 35-48", "US size"] },
  { category: "Hardware", units: ["rod", "bar", "plank", "sheet", "roll", "length", "pair", "set", "bag"] },
  { category: "Stationery", units: ["sheet", "page", "ream", "roll", "pad", "bundle", "box"] },
  { category: "Cosmetics", units: ["ml", "g", "bottle", "tube", "jar", "pump", "sachet", "pack"] },
  { category: "Electronics", units: ["pcs", "unit", "pair", "set", "pack", "box"] },
  { category: "Custom", units: ["cylinder", "sack", "crate", "tray", "drum", "roll", "load", "trip"] }
];

export const getMeasurementConfig = (category, unit) => {
  const u = unit || "";
  switch (category) {
    case "Weight":
      return {
        label: `Weight / Quantity (Optional${u ? ` - in ${u}` : ""})`,
        placeholder: u === "kg" ? "e.g. 1, 2.5, 5, 25 (kg)" : u === "g" ? "e.g. 50, 100, 250, 500 (g)" : `e.g. 1, 5, 10 (${u})`,
        keyboardType: "decimal-pad",
        autoCapitalize: "none",
        helperText: u ? `Enter weight in ${u}` : "Enter net weight"
      };
    case "Liquid / Capacity":
      return {
        label: `Volume / Capacity (Optional${u ? ` - in ${u}` : ""})`,
        placeholder: u === "L" ? "e.g. 1, 2, 5 (L)" : u === "ml" ? "e.g. 200, 500, 750 (ml)" : `e.g. 1, 5 (${u})`,
        keyboardType: "decimal-pad",
        autoCapitalize: "none",
        helperText: u ? `Enter volume in ${u}` : "Enter net volume"
      };
    case "Clothing Size":
      return {
        label: "Garment / Clothing Size (Optional)",
        placeholder: "e.g. S, M, L, XL, 28, 30, 32",
        keyboardType: "default",
        autoCapitalize: "characters",
        helperText: "e.g. S, M, L, XL, 32, 34"
      };
    case "Shoe Size":
      return {
        label: `Footwear / Shoe Size (Optional${u ? ` - ${u}` : ""})`,
        placeholder: "e.g. 7, 8, 9, 10 or UK 8",
        keyboardType: "default",
        autoCapitalize: "characters",
        helperText: "e.g. UK 8, EU 42, US 9"
      };
    case "Count / Pieces":
      return {
        label: `Quantity per Pack / Item (Optional${u ? ` - in ${u}` : ""})`,
        placeholder: `e.g. 1, 6, 10, 12 (${u || "pcs"})`,
        keyboardType: "numeric",
        autoCapitalize: "none",
        helperText: `Enter pieces per unit (e.g. 6 ${u || "pcs"})`
      };
    case "Pack / Package":
      return {
        label: `Pack Specifications / Size (Optional${u ? ` - in ${u}` : ""})`,
        placeholder: "e.g. Pack of 4, Box of 10, 500g pouch",
        keyboardType: "default",
        autoCapitalize: "sentences",
        helperText: "e.g. Pack of 4, Box of 10"
      };
    case "Bulk / Wholesale":
      return {
        label: `Bulk Specifications (Optional${u ? ` - in ${u}` : ""})`,
        placeholder: `e.g. 1 Dozen, 10 Bales, 1 Carton (${u || "units"})`,
        keyboardType: "default",
        autoCapitalize: "sentences",
        helperText: "e.g. 1 Dozen, 50 Bales"
      };
    case "Length":
      return {
        label: `Length / Dimension (Optional${u ? ` - in ${u}` : ""})`,
        placeholder: `e.g. 1, 2.5, 5, 10 (${u || "m"})`,
        keyboardType: "decimal-pad",
        autoCapitalize: "none",
        helperText: `Enter length in ${u || "m"}`
      };
    case "Area":
      return {
        label: `Area / Surface Measure (Optional${u ? ` - in ${u}` : ""})`,
        placeholder: `e.g. 50, 100, 500 (${u || "sq ft"})`,
        keyboardType: "decimal-pad",
        autoCapitalize: "none",
        helperText: `Enter area in ${u || "sq ft"}`
      };
    case "Volume":
      return {
        label: `Volume / Space (Optional${u ? ` - in ${u}` : ""})`,
        placeholder: `e.g. 1, 5, 10 (${u || "m³"})`,
        keyboardType: "decimal-pad",
        autoCapitalize: "none",
        helperText: `Enter volume in ${u || "m³"}`
      };
    case "Cosmetics":
      return {
        label: `Net Content / Volume (Optional${u ? ` - in ${u}` : ""})`,
        placeholder: `e.g. 50, 100, 250 (${u || "ml/g"})`,
        keyboardType: "default",
        autoCapitalize: "none",
        helperText: `Enter net content (e.g. 50 ${u || "ml"})`
      };
    case "Hardware":
    case "Stationery":
    case "Electronics":
      return {
        label: `Size / Specification (Optional${u ? ` - in ${u}` : ""})`,
        placeholder: `e.g. 1, Standard, 10-pack (${u || "units"})`,
        keyboardType: "default",
        autoCapitalize: "sentences",
        helperText: "Enter item specifications"
      };
    default:
      return {
        label: `Size / Measurement (Optional${u ? ` - in ${u}` : ""})`,
        placeholder: `e.g. 1, 32, S, 500 (${u || "units"})`,
        keyboardType: "default",
        autoCapitalize: "sentences",
        helperText: "Enter measurement or size"
      };
  }
};

export default function ScanScreen({ navigation }) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { darkMode, theme } = useTheme();
  const { ScanBeep } = NativeModules;
  const [cameraPosition, setCameraPosition] = useState("back");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const isFocused = useIsFocused();
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const device = useCameraDevice(cameraPosition);
  const [currentMode, setCurrentMode] = useState("local");
  const [userPlan, setUserPlan] = useState("Basic");
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
  const [mainCategories, setMainCategories] = useState([]);
  const [sharedSubcategories, setSharedSubcategories] = useState([]);
  const [selectedMainCategory, setSelectedMainCategory] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [mainCategorySearch, setMainCategorySearch] = useState("");
  const [subcategorySearch, setSubcategorySearch] = useState("");
  const [mainCategoriesLoading, setMainCategoriesLoading] = useState(true);
  const [subcategoriesLoading, setSubcategoriesLoading] = useState(false);
  const [subcategoryError, setSubcategoryError] = useState("");
  const [savingSubcategory, setSavingSubcategory] = useState(false);
  const savingSubcategoryRef = useRef(false);
 
  const [editBrand, setEditBrand] = useState("");
  const [editImage, setEditImage] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salesPrice, setSalesPrice] = useState("");
  const [bill, setBill] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [successVisible, setSuccessVisible] = useState(false);
  const [addingAll, setAddingAll] = useState(false);
  const [shopName, setShopName] = useState("MY SHOP");
  const [logoUrl, setLogoUrl] = useState("");
  const [unitType, setUnitType] = useState("Qty");
  const [productSize, setProductSize] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [newCategoryModal, setNewCategoryModal] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [torch, setTorch] = useState("off");
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [currentPurNo, setCurrentPurNo] = useState("");
  const [currentPurDate, setCurrentPurDate] = useState("");
  const [purTotal, setPurTotal] = useState(0);
  const scanLockRef = useRef(false);
  const [taxPercent, setTaxPercent] = useState("0");
  const [taxOpen, setTaxOpen] = useState(false);
  const [formStep, setFormStep] = useState(1);
  const { hasPermission, requestPermission } = useCameraPermission();

  // LIMIT REACHED PROFESSIONAL MODAL STATE
  const [limitModalVisible, setLimitModalVisible] = useState(false);
  const [limitMessage, setLimitMessage] = useState("");

  // PREDICT BOTTOM SHEET STATES (USED FOR EDIT POPUP)
  const [predictModalVisible, setPredictModalVisible] = useState(false);
  const [predictLoading, setPredictLoading] = useState(false);
  const [predictBarcode, setPredictBarcode] = useState("");
  const [predictName, setPredictName] = useState("");
  const [predictBrand, setPredictBrand] = useState("");
  const [predictSubName, setPredictSubName] = useState("");
  const [predictImages, setPredictImages] = useState([]);
  const [predictSelectedImage, setPredictSelectedImage] = useState("");
  const [originalPredictImage, setOriginalPredictImage] = useState("");
  const [studioPredictImage, setStudioPredictImage] = useState("");
  const [transparentPredictImage, setTransparentPredictImage] = useState("");
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [bgRemovalStatus, setBgRemovalStatus] = useState("");
  const bgPredictReqIdRef = useRef(0);
  const [predictPurchasePrice, setPredictPurchasePrice] = useState("");
  const [predictSalesPrice, setPredictSalesPrice] = useState("");
  const [predictQty, setPredictQty] = useState(1);
  const [predictUnitType, setPredictUnitType] = useState("Qty");
  const [predictSize, setPredictSize] = useState("");
  const [missingFields, setMissingFields] = useState([]);

  // HSN CODE & CLASSIFICATION DESCRIPTION STATES
  const [predictHsnCode, setPredictHsnCode] = useState("");
  const [predictDescription, setPredictDescription] = useState("");
  const [isDescriptionManuallyEdited, setIsDescriptionManuallyEdited] = useState(false);
  const [hsnValidationMessage, setHsnValidationMessage] = useState("");
  const [hsnSuggestedItem, setHsnSuggestedItem] = useState(null);
  const [hsnAmbiguousCandidates, setHsnAmbiguousCandidates] = useState([]);
  const [hsnSearchModalVisible, setHsnSearchModalVisible] = useState(false);
  const [hsnSearchQuery, setHsnSearchQuery] = useState("");
  const [hsnSearchResults, setHsnSearchResults] = useState([]);
  const [hsnSearchLoading, setHsnSearchLoading] = useState(false);
  const [hsnLookupLoading, setHsnLookupLoading] = useState(false);

  // WhatsApp-Style Web Search
  const [webImageGridModal, setWebImageGridModal] = useState(false);
  const [webSearchQuery, setWebSearchQuery] = useState("");
  const [webSearchResults, setWebSearchResults] = useState([]);
  const [webSearchSearching, setWebSearchSearching] = useState(false);

  const isCameraActive = Boolean(
    isFocused &&
    cameraEnabled &&
    !isTakingPhoto &&
    !predictModalVisible &&
    !modalVisible &&
    !showReceiptModal &&
    !webImageGridModal &&
    !limitModalVisible &&
    !newCategoryModal &&
    !hsnSearchModalVisible
  );

  // Headless Google Scraper State
  const [scraperUrl, setScraperUrl] = useState("");
  const headlessWebRef = useRef(null);
  const [mainCategoryOpen, setMainCategoryOpen] = useState(false);
  const [subcategoryOpen, setSubcategoryOpen] = useState(false);
  // HARDWARE GUN SCANNER ENGINE
  const hiddenScannerRef = useRef(null);
  const [scannerBuffer, setScannerBuffer] = useState("");
  const scanDebounceTimerRef = useRef(null);
  const [selectedUnitCategory, setSelectedUnitCategory] = useState("Weight");

  const focusGunScanner = () => {
    hiddenScannerRef.current?.focus();
    Keyboard.dismiss();
  };

  useFocusEffect(
    React.useCallback(() => {
      const timer = setTimeout(() => {
        focusGunScanner();
      }, 400);
      return () => clearTimeout(timer);
    }, [])
  );

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
      const isPng = localUri.endsWith(".png") || localUri.includes("bg_removed") || (blob.type && blob.type.includes("png"));
      const ext = isPng ? "png" : "jpg";
      const contentType = isPng ? "image/png" : "image/jpeg";

      const filename = `products/${auth.currentUser.uid}_${Date.now()}.${ext}`;
      const storageRef = ref(storage, filename);
      const uploadTask = await uploadBytesResumable(storageRef, blob, { contentType });
      const downloadUrl = await getDownloadURL(uploadTask.ref);
      return downloadUrl;
    } catch (error) {
      console.log("Image upload error: ", error);
      Alert.alert("Error", "Image upload failed. Storing local image instead.");
      return localUri;
    }
  };

  useEffect(() => {
    cleanupOldSegmentedImages();
  }, []);

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
    const loadShopAndPlan = async () => {
      const u = auth.currentUser;
      if (!u) return;
      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) {
        setShopName(snap.data().shopName || "MY SHOP");
        setUserPlan(snap.data().userPlan || snap.data().subscriptionPlan || "Basic");
      }
      const logo = await AsyncStorage.getItem(`shopLogo_${u.uid}`) || await AsyncStorage.getItem(`shopLogoBase64_${u.uid}`);
      if (logo) { setLogoUrl(logo); }
    };
    loadShopAndPlan();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const u = auth.currentUser;
      if (!u) return;

      let unsubscribeInventory;
      let unsubscribeCategories;
      let active = true;
      const setupListeners = async () => {
        const savedMode = (await AsyncStorage.getItem("app_mode")) || "local";
        if (!active) return;
        setCurrentMode(savedMode);
        const invCollection = savedMode === "global" ? "global_inventory" : "inventory";
        const catCollection = savedMode === "global" ? "global_categories" : "categories";

        unsubscribeInventory = onSnapshot(
          collection(db, "users", u.uid, invCollection),
          (snap) => {
            setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          }
        );

        unsubscribeCategories = onSnapshot(
          collection(db, "users", u.uid, catCollection),
          (snap) => {
            const data = snap.docs.map(d => ({
              id: d.id,
              ...d.data(),
            }));

            setCategories(data);
            setCategoryItems(
              data.map(cat => ({
                  label: String(cat.name || cat.categoryName || cat.id || "Unnamed category"),
                  value: cat.id,
                id: cat.id,
              }))
            );
          },
          error => {
            console.log("CATEGORY LOAD ERROR:", error.code, error.message);
          }
        );
      };

      setupListeners();
      return () => {
        active = false;
        if (unsubscribeInventory) unsubscribeInventory();
        if (unsubscribeCategories) unsubscribeCategories();
      };
    }, [])
  );
  
  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      const unsubscribeMainCategories = onSnapshot(
        collection(db, "categories"),
        snapshot => {
          if (!active) return;
          const data = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
          setMainCategories(data);
          setMainCategoriesLoading(false);
        },
        error => {
          console.log("MAIN CATEGORY ERROR:", error.code, error.message);
          if (active) {
            setMainCategories([]);
            setMainCategoriesLoading(false);
          }
        }
      );
      return () => {
        active = false;
        unsubscribeMainCategories();
      };
    }, [])
  );

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      if (!selectedMainCategory) {
        setSharedSubcategories([]);
        setSelectedSubcategory("");
        setSubcategoriesLoading(false);
        setSubcategoryError("");
        return undefined;
      }

      if (!mainCategories.some(category => category.id === selectedMainCategory)) {
        setSharedSubcategories([]);
        setSelectedSubcategory("");
        setSubcategoriesLoading(false);
        return undefined;
      }

      setSharedSubcategories([]);
      setSubcategoryError("");
      setSubcategoriesLoading(true);
      const unsubscribe = onSnapshot(
        collection(db, "categories", selectedMainCategory, "subcategories"),
        snapshot => {
          if (!active) return;
          const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          setSharedSubcategories(data);
          setSubcategoriesLoading(false);
        },
        error => {
          if (active) {
            setSharedSubcategories([]);
            setSelectedSubcategory("");
            setSubcategoriesLoading(false);
            setSubcategoryError("Could not load subcategories. Please try again.");
          }
        }
      );

      return () => {
        active = false;
        unsubscribe();
      };
    }, [selectedMainCategory, mainCategories])
  );

  const addSubcategoryFromSearch = async () => {
    const name = subcategorySearch.trim().replace(/\s+/g, " ");
    if (!name || !selectedMainCategory || savingSubcategoryRef.current) return;

    const normalizedName = name.toLocaleLowerCase();
    const existing = sharedSubcategories.find(subcategory =>
      String(subcategory.name || subcategory.categoryName || "").trim().replace(/\s+/g, " ").toLocaleLowerCase() === normalizedName
    );
    if (existing) {
      setSelectedSubcategory(existing.id);
      setSubcategorySearch("");
      setSubcategoryOpen(false);
      Keyboard.dismiss();
      return;
    }

    savingSubcategoryRef.current = true;
    setSavingSubcategory(true);
    setSubcategoryError("");
    try {
      const subcategoriesRef = collection(db, "categories", selectedMainCategory, "subcategories");
      const latestSnapshot = await getDocs(subcategoriesRef);
      const duplicate = latestSnapshot.docs.find(subcategoryDoc => {
        const data = subcategoryDoc.data();
        return String(data.name || data.categoryName || "").trim().replace(/\s+/g, " ").toLocaleLowerCase() === normalizedName;
      });

      if (duplicate) {
        setSelectedSubcategory(duplicate.id);
      } else {
        const created = await addDoc(subcategoriesRef, { name, createdAt: serverTimestamp() });
        setSharedSubcategories(current => [...current, { id: created.id, name }]);
        setSelectedSubcategory(created.id);
      }
      setSubcategorySearch("");
      setSubcategoryOpen(false);
      Keyboard.dismiss();
    } catch (error) {
      setSubcategoryError("Could not add this subcategory. Check your connection and try again.");
    } finally {
      savingSubcategoryRef.current = false;
      setSavingSubcategory(false);
    }
  };

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
    <td>${i.name}<br/>&nbsp;&nbsp;${i.qty} ${i.unitType || 'Qty'} ${i.size ? '(' + i.size + ')' : ''} x ₹${Number(i.purchasePrice).toFixed(2)}</td>
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
            salesPrice: Number(i.salesPrice || 0),
            qty: Number(i.qty || 1),
            unitType: i.unitType || "Qty",
            size: i.size || ""
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

  // UNIFIED DUAL SCAN PROCESSOR (DIRECT ADD TO SCANNED LIST)
  const processIncomingBarcode = async (rawCode) => {
    const code = String(rawCode || "").trim();
    if (!code || code.length < 3) return;

    const maxLimit = userPlan === "Pro" ? -1 : userPlan === "Premium" ? 200 : 10;
    if (maxLimit !== -1 && items.length >= maxLimit) {
      const existingItem = items.find(i => i.barcode === code);
      if (!existingItem) {
        setLimitMessage(`Your current ${userPlan} plan allows a maximum of ${maxLimit} items in inventory. Please upgrade to Pro for unlimited storage.`);
        setLimitModalVisible(true);
        return;
      }
    }

    if (scanLockRef.current) return;
    scanLockRef.current = true;

    ScanBeep?.beep?.();

    setTimeout(() => {
      scanLockRef.current = false;
      focusGunScanner();
    }, 1500);

    try {
      let fetchedName = "";
      let fetchedBrand = "";
      let fetchedSub = "";
      let fetchedImage = "";
      let fetchedPurchasePrice = 0;
      let fetchedSalesPrice = 0;
      let fetchedCategory = "General";
      let fetchedCategoryId = "";
      let fetchedCategoryName = "General";
      let fetchedSubcategoryId = "";
      let fetchedSubcategoryName = "";
      let fetchedUnitType = "Qty";
      let fetchedSize = "";
      let fetchedHsnCode = "";
      let fetchedDescription = "";

      if (user && inventoryRef) {
        const q = query(inventoryRef, where("barcode", "==", code));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const d = querySnapshot.docs[0].data();
          fetchedName = d.itemName || "";
          fetchedBrand = d.brand || "";
          fetchedSub = d.subName || "";
          fetchedImage = d.image || "";
          fetchedPurchasePrice = Number(d.purchasePrice || 0);
          fetchedSalesPrice = Number(d.salesPrice || 0);
          fetchedCategory = d.category || "General";
          fetchedCategoryId = d.categoryId || "";
          fetchedCategoryName = d.categoryName || d.category || "General";
          fetchedSubcategoryId = d.subcategoryId || "";
          fetchedSubcategoryName = d.subcategoryName || "";
          fetchedUnitType = d.unitType || "Qty";
          fetchedSize = d.size || "";
          fetchedHsnCode = d.hsnCode || "";
          fetchedDescription = d.description || "";
        }
      }

      const imageList = [];
      const fetchJsonWithTimeout = async (url, timeoutMs = 4000) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return await response.json();
        } finally {
          clearTimeout(timeoutId);
        }
      };

      const setIfMissing = (currentValue, newValue) => {
        if (currentValue && String(currentValue).trim()) return currentValue;
        if (typeof newValue === "string" && newValue.trim()) return newValue.trim();
        return "";
      };

      const addImages = (images) => {
        if (!Array.isArray(images)) return;
        images.forEach((img) => {
          if (typeof img !== "string") return;
          const clean = img.trim();
          if (clean && (clean.startsWith("http://") || clean.startsWith("https://"))) {
            imageList.push(clean.replace("http://", "https://"));
          }
        });
      };

      if (!fetchedName && (code.startsWith("978") || code.startsWith("979"))) {
        try {
          const bookData = await fetchJsonWithTimeout(
            `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(code)}`
          );
          if (bookData?.items?.length > 0) {
            const info = bookData.items[0]?.volumeInfo || {};
            fetchedName = setIfMissing(fetchedName, info.title);
            fetchedBrand = setIfMissing(fetchedBrand, info.publisher || (Array.isArray(info.authors) ? info.authors.join(", ") : ""));
            fetchedSub = setIfMissing(fetchedSub, info.subtitle || (Array.isArray(info.categories) ? info.categories[0] : ""));
            addImages([info.imageLinks?.thumbnail, info.imageLinks?.smallThumbnail]);
          }
        } catch (e) {
          console.log("Books API:", e?.message);
        }
      }

      if (!fetchedName) {
        try {
          const offData = await fetchJsonWithTimeout(
            `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`
          );
          if (offData?.status === 1 && offData?.product) {
            const p = offData.product;
            fetchedName = setIfMissing(fetchedName, p.product_name || p.product_name_en || p.product_name_in || p.generic_name);
            fetchedBrand = setIfMissing(fetchedBrand, p.brands || p.brand_owner);
            fetchedSub = setIfMissing(fetchedSub, p.generic_name || p.quantity || p.categories);
            addImages([p.image_front_url, p.image_front_small_url, p.image_front_thumb_url, p.image_url]);
          }
        } catch (e) {
          console.log("OFF API:", e?.message);
        }
      }

      const uniqueImgs = [...new Set(imageList.filter(Boolean))];
      if (!fetchedImage && uniqueImgs.length > 0) {
        fetchedImage = uniqueImgs[0];
      }

      const finalCompiledName = fetchedSub.trim() ? `${fetchedName.trim()} (${fetchedSub.trim()})` : fetchedName.trim();

      const newItem = {
        barcode: code,
        name: finalCompiledName || "",
        brand: fetchedBrand || "",
        subName: fetchedSub || "",
        image: fetchedImage || "",
        purchasePrice: fetchedPurchasePrice,
        salesPrice: fetchedSalesPrice,
        qty: 1,
        category: fetchedCategoryName || fetchedCategory,
        categoryId: fetchedCategoryId,
        categoryName: fetchedCategoryName,
        subcategoryId: fetchedSubcategoryId,
        subcategoryName: fetchedSubcategoryName,
        unitType: fetchedUnitType,
        size: fetchedSize,
        hsnCode: fetchedHsnCode,
        description: fetchedDescription,
      };

      setScannedList(prev => {
        const exist = prev.find(i => i.barcode === code);
        if (exist) {
          return prev.map(i => i.barcode === code ? { ...i, qty: (i.qty || 1) + 1 } : i);
        }
        return [...prev, newItem];
      });
    } catch (err) {
      console.log("Barcode Processing Error:", err);
    }
  };

  const codeScanner = useCodeScanner({
    codeTypes: ["ean-13", "qr", "ean-8", "upc-a"],
    onCodeScanned: async (codes) => {
      const code = codes[0]?.value;
      if (code) {
        await processIncomingBarcode(code);
      }
    }
  });

  const handleGunKeystroke = (text) => {
    setScannerBuffer(text);
    if (scanDebounceTimerRef.current) clearTimeout(scanDebounceTimerRef.current);
    scanDebounceTimerRef.current = setTimeout(async () => {
      const candidate = text.trim();
      if (candidate.length >= 6) {
        setScannerBuffer("");
        await processIncomingBarcode(candidate);
      }
    }, 280);
  };

  const handleGunSubmit = async () => {
    if (scanDebounceTimerRef.current) clearTimeout(scanDebounceTimerRef.current);
    const finalCode = scannerBuffer.trim();
    setScannerBuffer("");
    if (finalCode.length >= 3) {
      await processIncomingBarcode(finalCode);
    }
  };

  const handleAutoProcessEditImage = async (uri) => {
    if (!uri) return;
    try {
      const result = await removeProductBackground(uri, {
        backgroundMode: "studio",
        backgroundColor: "#FFFFFF",
        padding: 0.10,
        outputSize: 1024,
      });
      setEditImage(result.studioUri || result.uri);
    } catch (err) {
      console.log("[ScanScreen] Edit image processing fallback to original:", err);
      setEditImage(uri);
    }
  };

  const pickImage = () => {
    Alert.alert(
      "Upload Product Image",
      "Choose an option",
      [
        { text: "Take Photo", onPress: () => {
            setIsTakingPhoto(true);
            setTimeout(() => {
              launchCamera({ mediaType: 'photo', quality: 0.8 }, (response) => {
                setIsTakingPhoto(false);
                if (response.didCancel || response.errorCode) return;
                if (response.assets && response.assets.length > 0) {
                  handleAutoProcessEditImage(response.assets[0].uri);
                }
              });
            }, 300);
          }
        },
        { text: "Choose from Gallery", onPress: () => {
            launchImageLibrary({ mediaType: 'photo', quality: 0.8, includeBase64: false }, (response) => {
              if (response.didCancel || response.errorCode) return;
              if (response.assets && response.assets.length > 0) {
                handleAutoProcessEditImage(response.assets[0].uri);
              }
            });
          }
        },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const handleAutoProcessPredictImage = async (uri) => {
    if (!uri) return;
    const currentReqId = ++bgPredictReqIdRef.current;
    setOriginalPredictImage(uri);
    setIsRemovingBackground(true);
    setBgRemovalStatus("Enhancing product photo…");

    try {
      const result = await removeProductBackground(uri, {
        backgroundMode: "studio",
        backgroundColor: "#FFFFFF",
        padding: 0.10,
        outputSize: 1024,
      });
      if (currentReqId === bgPredictReqIdRef.current) {
        const studio = result.studioUri || result.uri;
        const transparent = result.transparentUri || "";
        setStudioPredictImage(studio);
        setTransparentPredictImage(transparent);
        setPredictSelectedImage(studio);
        setPredictImages(prev => [studio, ...prev.filter(u => u !== studio && u !== transparent && u !== uri)]);
        setMissingFields(prev => prev.filter(f => f !== "Product Image"));
        setIsRemovingBackground(false);
        setBgRemovalStatus("");
      }
    } catch (err) {
      console.log("[ScanScreen] Background removal error:", err);
      if (currentReqId === bgPredictReqIdRef.current) {
        setIsRemovingBackground(false);
        setBgRemovalStatus("");
        Alert.alert(
          "Product Photography Enhancement",
          `Could not enhance product photo automatically (${err.message || "Processing failed"}). Would you like to retry or keep the original photo?`,
          [
            {
              text: "Retry",
              onPress: () => handleAutoProcessPredictImage(uri)
            },
            {
              text: "Use Original",
              onPress: () => {
                setPredictSelectedImage(uri);
                setPredictImages(prev => [uri, ...prev.filter(u => u !== uri)]);
                setMissingFields(prev => prev.filter(f => f !== "Product Image"));
              }
            },
            {
              text: "Cancel",
              style: "cancel"
            }
          ]
        );
      }
    }
  };

  const pickPredictCustomImage = () => {
    Alert.alert(
      "Upload Product Image",
      "Choose an option",
      [
        {
          text: "Take Photo",
          onPress: () => {
            setIsTakingPhoto(true);
            setTimeout(() => {
              launchCamera({ mediaType: 'photo', quality: 0.8 }, (response) => {
                setIsTakingPhoto(false);
                if (response.didCancel || response.errorCode) {
                  if (response.errorMessage) {
                    console.log("[ScanScreen] Camera error:", response.errorMessage);
                  }
                  return;
                }
                if (response.assets && response.assets.length > 0) {
                  handleAutoProcessPredictImage(response.assets[0].uri);
                }
              });
            }, 300);
          }
        },
        {
          text: "Choose from Gallery",
          onPress: () => {
            launchImageLibrary({ mediaType: 'photo', quality: 0.8, includeBase64: false }, (response) => {
              if (response.didCancel || response.errorCode) return;
              if (response.assets && response.assets.length > 0) {
                handleAutoProcessPredictImage(response.assets[0].uri);
              }
            });
          }
        },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  // 🏷️ HSN Code & Classification Logic
  // 1. Contextual suggestion debounced effect
  useEffect(() => {
    if (!predictModalVisible) return;
    // If user has already entered an HSN code, preserve their code
    if (predictHsnCode && predictHsnCode.trim().length > 0) return;

    const timer = setTimeout(async () => {
      const selectedCat = mainCategories.find(c => c.id === selectedMainCategory);
      const selectedSub = sharedSubcategories.find(s => s.id === selectedSubcategory);
      const catName = selectedCat?.name || selectedCat?.categoryName || "";
      const subName = selectedSub?.name || selectedSub?.categoryName || "";

      try {
        const { suggestion, candidates } = await suggestHSNCode({
          category: catName,
          subcategory: subName,
          brand: predictBrand,
          productName: predictName,
        });

        if (suggestion) {
          setHsnSuggestedItem(suggestion);
          setHsnAmbiguousCandidates(candidates);
        } else {
          setHsnSuggestedItem(null);
          setHsnAmbiguousCandidates([]);
        }
      } catch (e) {
        console.log("HSN suggestion error:", e);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [predictModalVisible, predictName, selectedMainCategory, selectedSubcategory, predictBrand, predictHsnCode, mainCategories, sharedSubcategories]);

  // 2. Debounced official description lookup when user types a valid HSN code
  useEffect(() => {
    if (!predictHsnCode || !predictHsnCode.trim()) {
      setHsnValidationMessage("");
      return;
    }
    const validation = validateHSNCode(predictHsnCode);
    if (!validation.isValid) return;

    const timer = setTimeout(async () => {
      setHsnLookupLoading(true);
      try {
        const res = await lookupHSNCode(validation.code);
        if (res.found && res.description) {
          // Only auto-populate description if user has not manually customized the description
          if (!isDescriptionManuallyEdited) {
            setPredictDescription(res.description);
          }
        }
      } catch (err) {
        console.log("HSN lookup error:", err);
      } finally {
        setHsnLookupLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [predictHsnCode, isDescriptionManuallyEdited]);

  const handleHsnTextChange = (val) => {
    setPredictHsnCode(val);
    if (val.trim()) {
      const validation = validateHSNCode(val);
      if (!validation.isValid) {
        setHsnValidationMessage(validation.error);
      } else {
        setHsnValidationMessage("");
      }
    } else {
      setHsnValidationMessage("");
    }
  };

  const handleDescriptionTextChange = (val) => {
    setPredictDescription(val);
    setIsDescriptionManuallyEdited(true);
  };

  const applySuggestedHsn = (suggested) => {
    if (!suggested) return;
    setPredictHsnCode(suggested.hsnCode);
    if (!isDescriptionManuallyEdited) {
      setPredictDescription(suggested.description);
    }
    setHsnValidationMessage("");
    setHsnSuggestedItem(null);
  };

  const handleClearHsn = () => {
    setPredictHsnCode("");
    setHsnValidationMessage("");
    if (!isDescriptionManuallyEdited) {
      setPredictDescription("");
    }
  };

  const handleOpenHsnSearch = async (initialQuery = "") => {
    const selectedCat = mainCategories.find(c => c.id === selectedMainCategory);
    const selectedSub = sharedSubcategories.find(s => s.id === selectedSubcategory);
    const catName = selectedCat?.name || selectedCat?.categoryName || "";
    const subName = selectedSub?.name || selectedSub?.categoryName || "";

    const queryToUse = initialQuery || predictHsnCode || predictName || subName || "";
    setHsnSearchQuery(queryToUse);
    setHsnSearchModalVisible(true);
    executeHsnSearch(queryToUse, catName, subName);
  };

  const executeHsnSearch = async (queryText, catName = "", subName = "") => {
    setHsnSearchLoading(true);
    try {
      const selectedCat = mainCategories.find(c => c.id === selectedMainCategory);
      const selectedSub = sharedSubcategories.find(s => s.id === selectedSubcategory);
      const currentCat = catName || selectedCat?.name || selectedCat?.categoryName || "";
      const currentSub = subName || selectedSub?.name || selectedSub?.categoryName || "";

      const results = await searchHSNByProductDetails({
        category: currentCat,
        subcategory: currentSub,
        brand: predictBrand,
        productName: predictName,
        query: queryText,
        limit: 30,
      });
      setHsnSearchResults(results);
    } catch (err) {
      console.log("HSN search error:", err);
      setHsnSearchResults([]);
    } finally {
      setHsnSearchLoading(false);
    }
  };

  const handleSelectHsnResult = (item) => {
    setPredictHsnCode(item.hsnCode);
    setPredictDescription(item.description);
    setIsDescriptionManuallyEdited(false);
    setHsnValidationMessage("");
    setHsnSearchModalVisible(false);
  };

  const handleConfirmPredictedProduct = async () => {
    if (isRemovingBackground) {
      Alert.alert("Please Wait", "Background removal is in progress. Please wait until processing completes.");
      return;
    }
    if (!predictName.trim()) {
      Alert.alert("Required", "Please enter product name");
      return;
    }
    if (!user) {
      Alert.alert("Error", "User not logged in");
      return;
    }

    const maxLimit = userPlan === "Pro" ? -1 : userPlan === "Premium" ? 200 : 10;
    if (maxLimit !== -1 && items.length >= maxLimit) {
      const existing = items.find(i => i.barcode === predictBarcode);
      if (!existing) {
        setLimitMessage(`Your current ${userPlan} plan allows a maximum of ${maxLimit} items in inventory. Please upgrade to Pro for unlimited storage.`);
        setLimitModalVisible(true);
        return;
      }
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
    const selectedMainCategoryData = mainCategories.find(category => category.id === selectedMainCategory);
    const selectedSubcategoryData = sharedSubcategories.find(subcategory => subcategory.id === selectedSubcategory);
    const savedCategoryName = selectedMainCategoryData?.name || selectedMainCategoryData?.categoryName || "General";
    const savedSubcategoryName = selectedSubcategoryData?.name || selectedSubcategoryData?.categoryName || "";

    try {
      const q = query(collection(db, "users", user.uid, inventoryCollection), where("barcode", "==", predictBarcode));
      const querySnapshot = await getDocs(q);

      let savedDocId = "";

      if (!querySnapshot.empty) {
        const existingDoc = querySnapshot.docs[0];
        savedDocId = existingDoc.id;
        const existingData = existingDoc.data();
        const currentQty = Number(existingData.quantity) || 0;

        await updateDoc(doc(db, "users", user.uid, inventoryCollection, savedDocId), {
          category: savedCategoryName,
          categoryId: selectedMainCategory || "",
          categoryName: savedCategoryName,
          subcategoryId: selectedSubcategory || "",
          subcategoryName: savedSubcategoryName,
          itemName: compiledDisplayName,
          brand: predictBrand,
          subName: predictSubName,
          image: finalImageUrl || existingData.image || "",
          purchasePrice: pPrice > 0 ? pPrice : (Number(existingData.purchasePrice) || 0),
          salesPrice: sPrice > 0 ? sPrice : (Number(existingData.salesPrice) || 0),
          quantity: currentQty + pQty,
          unitType: predictUnitType,
          size: predictSize || existingData.size || "",
          supplierName: supplierName || existingData.supplierName || "Walk-in Supplier",
          hsnCode: (predictHsnCode || "").trim(),
          description: (predictDescription || "").trim(),
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
          size: predictSize,
          category: savedCategoryName,
          categoryId: selectedMainCategory || "",
          categoryName: savedCategoryName,
          subcategoryId: selectedSubcategory || "",
          subcategoryName: savedSubcategoryName,
          supplierName: supplierName || "Walk-in Supplier",
          hsnCode: (predictHsnCode || "").trim(),
          description: (predictDescription || "").trim(),
          isOnlineSaleEnabled: true,
          createdAt: serverTimestamp()
        });
        savedDocId = docRef.id;
      }

      const updatedItem = {
        id: savedDocId,
        barcode: predictBarcode,
        name: compiledDisplayName,
        brand: predictBrand,
        subName: predictSubName,
        image: finalImageUrl,
        purchasePrice: pPrice,
        salesPrice: sPrice,
        qty: pQty,
        category: savedCategoryName,
        categoryId: selectedMainCategory || "",
        categoryName: savedCategoryName,
        subcategoryId: selectedSubcategory || "",
        subcategoryName: savedSubcategoryName,
        unitType: predictUnitType,
        size: predictSize,
        hsnCode: (predictHsnCode || "").trim(),
        description: (predictDescription || "").trim(),
      };

      setScannedList(prev => {
        const exist = prev.find(i => i.barcode === predictBarcode);
        if (exist) {
          return prev.map(i => i.barcode === predictBarcode ? updatedItem : i);
        }
        return [...prev, updatedItem];
      });

      setPredictModalVisible(false);
      focusGunScanner();
    } catch (err) {
      console.log("Error saving to inventory:", err);
      Alert.alert("Inventory Error", err.message);
    }
  };

  const handleAddOrUpdateProduct = async () => {
    if (!tempProduct) return;
     
    const maxLimit = userPlan === "Pro" ? -1 : userPlan === "Premium" ? 200 : 10;
    if (maxLimit !== -1 && items.length >= maxLimit) {
      const existing = items.find(i => i.barcode === tempProduct.barcode);
      if (!existing) {
        setLimitMessage(`Your current ${userPlan} plan allows a maximum of ${maxLimit} items in inventory.`);
        setLimitModalVisible(true);
        return;
      }
    }

    const finalName = editName || tempProduct.name || "New Product";
    const finalPrice = Number(purchasePrice) > 0 ? Number(purchasePrice) : Number(tempProduct.purchasePrice || 0);
    const finalSalesPrice = Number(salesPrice) || 0;
    const finalQty = Number(editQty) || 1;
    const finalBrand = editBrand || tempProduct.brand || "";
     
    let finalImage = tempProduct.image || "";
    if (editImage) {
      finalImage = await uploadImageToStorage(editImage);
    }

    const updatedItem = {
      ...tempProduct,
      name: finalName,
      brand: finalBrand,
      image: finalImage,
      purchasePrice: finalPrice,
      salesPrice: finalSalesPrice,
      qty: finalQty,
      category: selectedCategory,
      unitType: unitType,
      size: productSize,
    };

    setScannedList(prev => {
      const exist = prev.find(i => i.barcode === tempProduct.barcode);
      if (exist) {
        return prev.map(i => i.barcode === tempProduct.barcode ? updatedItem : i);
      }
      return [...prev, updatedItem];
    });

    setModalVisible(false);
    setFormStep(1);
    setTempProduct(null); 
    setEditName(""); 
    setEditBrand(""); 
    setEditImage(""); 
    setPurchasePrice(""); 
    setSalesPrice(""); 
    setEditQty("1"); 
    setSelectedCategory("");
    setProductSize("");
    focusGunScanner();
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
          category: item.categoryName || item.category || "General",
          categoryId: item.categoryId || "",
          categoryName: item.categoryName || item.category || "General",
          subcategoryId: item.subcategoryId || "",
          subcategoryName: item.subcategoryName || "",
          unitType: item.unitType || "Qty",
          size: item.size || "",
          supplierName: supplierName || "Walk-in Supplier"
        });
      }
    });

    try {
      if (user) {
        for (const it of scannedList) {
          const q = query(collection(db, "users", user.uid, inventoryCollection), where("barcode", "==", it.barcode));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const d = snap.docs[0];
            const currentStock = Number(d.data().quantity) || 0;
            const updatePayload = {
              quantity: currentStock + (Number(it.qty) || 1),
              updatedAt: serverTimestamp()
            };
            if (it.categoryId) updatePayload.categoryId = it.categoryId;
            if (it.categoryName || it.category) {
              updatePayload.categoryName = it.categoryName || it.category;
              updatePayload.category = it.categoryName || it.category;
            }
            if (it.subcategoryId) updatePayload.subcategoryId = it.subcategoryId;
            if (it.subcategoryName) updatePayload.subcategoryName = it.subcategoryName;
            if (it.unitType) updatePayload.unitType = it.unitType;
            if (it.size) updatePayload.size = it.size;
            await updateDoc(doc(db, "users", user.uid, inventoryCollection, d.id), updatePayload);
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
              size: it.size || "",
              category: it.categoryName || it.category || "General",
              categoryId: it.categoryId || "",
              categoryName: it.categoryName || it.category || "General",
              subcategoryId: it.subcategoryId || "",
              subcategoryName: it.subcategoryName || "",
              supplierName: supplierName || "Walk-in Supplier",
              isOnlineSaleEnabled: true,
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
          items: newBill.map(i => ({ 
            itemName: i.name, 
            purchasePrice: Number(i.purchasePrice || 0), 
            salesPrice: Number(i.salesPrice || 0), 
            qty: Number(i.qty || 1), 
            unitType: i.unitType || "Qty",
            size: i.size || ""
          })),
          total: Number(purchaseTotal),
          createdAt: serverTimestamp()
        });
      }
    } catch (err) { console.log("Inventory Bill Sync Error:", err); }

    setBill(newBill);
    setScannedList([]);
    setAddingAll(false);
    setSuccessVisible(true);
    setTimeout(() => { 
      setSuccessVisible(false); 
      focusGunScanner();
    }, 1800);
  };

  const filteredCategoryProducts = items.filter(item => {
    const matchesCategory = selectedCategory ? (item.category === selectedCategory) : true;
    const matchesSearch = (item.itemName || "").toLowerCase().includes(editName.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={darkMode ? "light-content" : "dark-content"} backgroundColor={theme.background} />

      {/* SILENT HARDWARE GUN SCANNER ENGINE */}
      <View style={styles.gunListenerWrapper} pointerEvents="box-none">
        <TextInput
          ref={hiddenScannerRef}
          style={styles.gunHiddenInput}
          autoFocus={true}
          showSoftInputOnFocus={false}
          caretHidden={true}
          contextMenuHidden={true}
          disableFullscreenUI={true}
          keyboardType="numeric"
          autoCorrect={false}
          autoCapitalize="none"
          value={scannerBuffer}
          onChangeText={handleGunKeystroke}
          onSubmitEditing={handleGunSubmit}
          blurOnSubmit={false}
        />
      </View>
       
      {/* HIDDEN IN-MEMORY HEADLESS GOOGLE IMAGE SCRAPER */}
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

      {/* HEADER */}
      <View style={[styles.topWhiteHeader, { backgroundColor: theme.card, borderBottomColor: darkMode ? "#334155" : "#e2e8f0" }]}>
        <View style={[styles.shopBadge, { backgroundColor: darkMode ? "#1e293b" : "#eef2ff" }]}>
          <Icon name="cube-box" size={22} color="#6366f1" />
          <Text style={[styles.shopNameText, { color: darkMode ? "#f8fafc" : "#6366f1" }]}>{shopName}</Text>
        </View>
        <Text style={{ fontSize: 11, color: theme.subText, fontWeight: "600" }}>Plan: {userPlan}</Text>
      </View>

      {/* 📱💻 RESPONSIVE MASTER LAYOUT */}
      <View style={[styles.mainLayout, isLandscape && styles.landscapeMainLayout]}>
          
        {/* 📷 LEFT PANE (CAMERA & SEARCH BAR) */}
        <View style={[styles.leftSection, isLandscape && styles.landscapeLeftSection]}>
          <View style={[styles.cameraOuterWrapper, isLandscape && styles.landscapeCameraOuterWrapper, { backgroundColor: theme.background }]}>
            <View style={styles.cameraFrameContainer}>
              {device && isCameraActive ? (
                <Camera
                  style={StyleSheet.absoluteFill}
                  device={device}
                  isActive={isCameraActive}
                  codeScanner={codeScanner}
                  torch={torch}
                /> 
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }]}>
                  <Icon name="camera-off" size={40} color="#64748b" />
                  <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 6, fontWeight: '600' }}>Camera Paused</Text>
                </View>
              )}
              <View style={styles.overlay}>
                <View style={styles.cameraControlRow}>
                  <TouchableOpacity
                    focusable={false}
                    style={styles.actionCircleBtn}
                    onPress={() => setTorch(prev => prev === "on" ? "off" : "on")}
                  >
                    <Icon name={torch === "on" ? "flash" : "flash-off"} size={22} color="#fff" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    focusable={false}
                    style={styles.actionCircleBtn}
                    onPress={() => setCameraPosition(prev => prev === "back" ? "front" : "back")}
                  >
                    <Icon name="camera-flip" size={22} color="#fff" />
                  </TouchableOpacity>
  <TouchableOpacity
  focusable={false}
  activeOpacity={0.8}
  onPress={() => {
    setCameraEnabled(prev => {
      const nextEnabled = !prev;
      if (!nextEnabled) {
        setTorch("off");
      }
      return nextEnabled;
    });
  }}
  style={styles.actionCircleBtn}
>
  <Icon
    name={cameraEnabled ? "pause-circle-outline" : "play-circle-outline"}
    size={22}
    color="#fff"
  />
</TouchableOpacity>
                </View>

                <View style={styles.scanRow}>
                  <View style={[styles.salesScanBox, isLandscape && styles.tabletSalesScanBox]}>
                    <View style={[styles.corner, styles.topLeft]} />
                    <View style={[styles.corner, styles.topRight]} />
                    <View style={[styles.corner, styles.bottomLeft]} />
                    <View style={[styles.corner, styles.bottomRight]} />
                    <Text style={styles.scanText}>Camera / Gun Scanner Active</Text>
                    <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 }}>Scan using Camera or Bluetooth Scanner</Text>

                    <View style={{ backgroundColor: currentMode === "global" ? "#16a34a" : "#6366f1", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 6 }}>
                      <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 10 }}>{currentMode.toUpperCase()} MODE</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* 🔍 PRODUCT SEARCH BAR */}
          <View style={[styles.searchRowContainer, { backgroundColor: theme.card, paddingHorizontal: isLandscape ? 0 : 16 }]}>
            <TextInput
              placeholder={`Search ${currentMode} inventory...`}
              value={searchText}
              placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
              onChangeText={setSearchText}
              onBlur={focusGunScanner}
              style={{ flex: 1, backgroundColor: darkMode ? "#1e293b" : "#f8fafc", borderWidth: 1, borderColor: darkMode ? "#334155" : "#cbd5e1", padding: 10, borderRadius: 12, color: theme.text, height: 44 }}
            />
             
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                const maxLimit = userPlan === "Pro" ? -1 : userPlan === "Premium" ? 200 : 10;
                if (maxLimit !== -1 && items.length >= maxLimit) {
                  setLimitMessage(`Your current ${userPlan} plan allows a maximum of ${maxLimit} items in inventory.`);
                  setLimitModalVisible(true);
                  return;
                }
                const customBarcode = "MANUAL-" + Date.now().toString().slice(-6);
                setPredictBarcode(customBarcode);
                setPredictName("");
                setSelectedMainCategory("");
                setSelectedSubcategory("");
                setPredictBrand("");
                setPredictSubName("");
                setPredictImages([]);
                setPredictSelectedImage("");
                setOriginalPredictImage("");
                setStudioPredictImage("");
                setTransparentPredictImage("");
                setIsRemovingBackground(false);
                setBgRemovalStatus("");
                setPredictPurchasePrice("");
                setPredictSalesPrice("");
                setPredictQty(1);
                setPredictUnitType("Qty");
                setPredictSize("");
                setPredictHsnCode("");
                setPredictDescription("");
                setIsDescriptionManuallyEdited(false);
                setHsnValidationMessage("");
                setHsnSuggestedItem(null);
                setHsnAmbiguousCandidates([]);
                setMissingFields(["Product Name", "Purchase Price", "Sales Price", "Product Image"]);
                setPredictLoading(false);
                Keyboard.dismiss();
                setTimeout(() => {
                  setPredictModalVisible(true);
                }, 50);
              }}
              style={{ width: 44, height: 44, backgroundColor: "#6366f1", borderRadius: 12, justifyContent: "center", alignItems: "center", marginLeft: 8 }}
            >
              <Text style={{ color: "#fff", fontSize: 24, fontWeight: "bold" }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 🛒 RIGHT PANE (SCANNED ITEMS & BILL SUMMARY) */}
        <View style={[styles.bottomWhiteContainer, isLandscape && styles.landscapeRightSection, { backgroundColor: theme.card }]}>
          <Text style={[styles.title, { color: theme.text }]}>Scanned Items</Text>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {searchText.trim().length > 0 ? (
              filteredItems.map((item) => (
                <View key={item.id} style={[styles.itemCard, { backgroundColor: darkMode ? "#1e293b" : "#f8fafc", borderColor: darkMode ? "#334155" : "#e2e8f0" }]}>
                  <Text style={{ color: theme.text, flex: 1, fontWeight: '700' }}>{item.itemName} {item.size ? `[${item.size}]` : ''}</Text>
                  <Text style={{ color: "#22c55e", marginRight: 10, fontWeight: '600' }}>₹{item.salesPrice || 0}</Text>
                </View>
              ))
            ) : (
              scannedList.map((item) => {
                const isNameDone = Boolean(item.name && item.name.trim().length > 0);
                const isBrandDone = Boolean(item.brand && item.brand.trim().length > 0);
                const isPriceDone = Boolean(Number(item.purchasePrice) > 0 && Number(item.salesPrice) > 0);
                const isImageDone = Boolean(item.image && item.image.trim().length > 0);

                return (
                  <View key={item.barcode} style={[styles.itemCard, { backgroundColor: darkMode ? "#1e293b" : "#f8fafc", borderColor: darkMode ? "#334155" : "#e2e8f0", flexDirection: 'column', alignItems: 'stretch' }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      {item.image ? (
                        <Image source={{ uri: item.image }} style={{ width: 40, height: 40, borderRadius: 8, marginRight: 8 }} />
                      ) : null}
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: '700' }}>
                          {item.name || "Product Name"} {item.size ? (
                            ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Free Size"].includes(item.unitType)
                              ? `• Size: ${item.size}`
                              : `• ${item.size}${item.unitType && item.unitType !== 'Qty' ? ` ${item.unitType}` : ''}`
                          ) : ''}
                        </Text>
                        {item.brand ? <Text style={{ color: darkMode ? "#94a3b8" : "#64748b", fontSize: 11 }}>{item.brand}</Text> : null}
                        <Text style={{ color: darkMode ? "#94a3b8" : "#64748b", fontSize: 10 }}>Pur: ₹{item.purchasePrice || 0} | Sale: ₹{item.salesPrice || 0} | Unit: {item.unitType || 'Qty'}</Text>
                      </View>

                      {/* QUANTITY CONTROLLER */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
                        <TouchableOpacity
                          focusable={false}
                          onPress={() => {
                            setScannedList(prev => prev.map(i => i.barcode === item.barcode ? { ...i, qty: Math.max(1, (i.qty || 1) - 1) } : i));
                          }}
                          style={styles.qtyBtn}
                        >
                          <Text style={{ color: '#fff', fontWeight: 'bold' }}>-</Text>
                        </TouchableOpacity>

                        <Text style={{ color: theme.text, marginHorizontal: 8, fontWeight: 'bold' }}>{item.qty || 1}</Text>

                        <TouchableOpacity
                          focusable={false}
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
                          activeOpacity={0.7}
                          onPress={() => {
                            Keyboard.dismiss();
                            setPredictBarcode(item.barcode);
                            setPredictName(item.name || "");
                            setSelectedMainCategory(item.categoryId || "");
                            setSelectedSubcategory(item.subcategoryId || "");
                            setPredictBrand(item.brand || "");
                            setPredictSubName(item.subName || "");
                            setPredictPurchasePrice(String(item.purchasePrice || ""));
                            setPredictSalesPrice(String(item.salesPrice || ""));
                            setPredictQty(item.qty || 1);
                            const uType = item.unitType || "Qty";
                            setPredictUnitType(uType);
                            const foundCat = UNIT_CATEGORIES.find(c => c.units.includes(uType));
                            setSelectedUnitCategory(foundCat ? foundCat.category : "Weight");
                            setPredictSize(item.size || "");
                            setPredictHsnCode(item.hsnCode || "");
                            setPredictDescription(item.description || "");
                            setIsDescriptionManuallyEdited(Boolean(item.description));
                            setHsnValidationMessage("");
                            setHsnSuggestedItem(null);
                            setHsnAmbiguousCandidates([]);
                            setPredictSelectedImage(item.image || "");
                            setOriginalPredictImage(item.image || "");
                            setStudioPredictImage(item.image && item.image.includes("bg_studio") ? item.image : "");
                            setTransparentPredictImage(item.image && item.image.includes("bg_removed") ? item.image : "");
                            setIsRemovingBackground(false);
                            setBgRemovalStatus("");
                            setPredictImages(item.image ? [item.image] : []);
                            setTimeout(() => {
                            setPredictModalVisible(true);
                            }, 50);
                          }}
                          style={{ backgroundColor: "#22c55e", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, marginRight: 4 }}
                        >
                          <Text style={{ color: "#fff", fontSize: 11, fontWeight: 'bold' }}>Edit</Text>
                        </TouchableOpacity>

                        <TouchableOpacity focusable={false} onPress={() => { setScannedList(prev => prev.filter(i => i.barcode !== item.barcode)); }} style={{ backgroundColor: "#ef4444", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 }}>
                          <Text style={{ color: "#fff", fontSize: 11, fontWeight: 'bold' }}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* 🎯 STEPPER PROGRESS BAR FOR SCANNED ITEM */}
                    <View style={[stepperStyles.container, { backgroundColor: darkMode ? "#0f172a" : "#f8fafc", borderColor: darkMode ? "#334155" : "#e2e8f0", marginTop: 8, marginBottom: 0, paddingVertical: 8 }]}>
                      <View style={stepperStyles.stepsRow}>
                        <StepItem 
                          label="Product Name" 
                          stepNumber={1} 
                          isCompleted={isNameDone} 
                        />
                        <StepItem 
                          label="Brand Name" 
                          stepNumber={2} 
                          isCompleted={isBrandDone} 
                        />
                        <StepItem 
                          label="Pricing" 
                          stepNumber={3} 
                          isCompleted={isPriceDone} 
                        />
                        <StepItem 
                          label="Image" 
                          stepNumber={4} 
                          isCompleted={isImageDone} 
                          isLast={true}
                        />
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={[styles.billSummaryBox, { backgroundColor: darkMode ? "#1e293b" : "#0f172a" }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Icon name="receipt" size={20} color="#fff" style={{ marginRight: 6 }} />
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: '700' }}>Bill ({currentMode.toUpperCase()})</Text>
            </View>
            <ScrollView style={{ maxHeight: 75 }} showsVerticalScrollIndicator={false}>
              {bill.map((item) => (
                <View key={item.barcode} style={{ flexDirection: "row", justifyContent: "space-between", marginVertical: 3 }}>
                  <Text style={{ color: "#cbd5e1", fontSize: 13 }}>{item.name} {item.size ? `(${item.size})` : ''} x {item.qty} {item.unitType || 'Qty'}</Text>
                  <Text style={{ color: "#22c55e", fontSize: 13, fontWeight: '600' }}>₹ {item.purchasePrice * item.qty}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 6, marginTop: 4, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: "#fff", fontWeight: 'bold' }}>Total:</Text>
              <Text style={{ color: "#22c55e", fontWeight: 'bold', fontSize: 16 }}>₹ {bill.reduce((sum, i) => sum + (i.purchasePrice || 0) * i.qty, 0)}</Text>
            </View>

            {/* 🎛️ INTEGRATED BOTTOM BUTTONS ROW */}
            <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
              {scannedList.length > 0 && (
                <TouchableOpacity focusable={false} onPress={handleAddAllItems} style={{ flex: 1, backgroundColor: "#16a34a", padding: 12, borderRadius: 12, alignItems: "center" }}>
                  <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 13 }}>➕ Add ({scannedList.reduce((acc, curr) => acc + (curr.qty || 1), 0)}) Items</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity focusable={false} onPress={handleProcessPurchaseInvoice} style={{ flex: 1, backgroundColor: "#6366f1", padding: 12, borderRadius: 12, alignItems: "center" }}>
                <Text style={{ color: "#fff", textAlign: "center", fontWeight: "bold", fontSize: 13 }}>View Purchase Receipt</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

      </View>

      {/* 🌟 PROFESSIONAL LIMIT REACHED UI MODAL */}
      <Modal visible={limitModalVisible} transparent animationType="fade" onRequestClose={() => setLimitModalVisible(false)}>
        <View style={limitModalStyles.backdrop}>
          <View style={[limitModalStyles.card, { backgroundColor: darkMode ? "#1e293b" : "#ffffff" }]}>
            <View style={limitModalStyles.iconCircle}>
              <Icon name="alert-circle-outline" size={38} color="#f59e0b" />
            </View>
            <Text style={[limitModalStyles.heading, { color: darkMode ? "#ffffff" : "#0f172a" }]}>Limit Reached ⚠️</Text>
            <Text style={limitModalStyles.subtext}>{limitMessage}</Text>
             
            <View style={limitModalStyles.btnRow}>
              <TouchableOpacity
                style={limitModalStyles.cancelBtn}
                activeOpacity={0.7}
                onPress={() => setLimitModalVisible(false)}
              >
                <Text style={limitModalStyles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={limitModalStyles.upgradeBtn}
                activeOpacity={0.8}
                onPress={() => {
                  setLimitModalVisible(false);
                  navigation.navigate("Subscription");
                }}
              >
                <Icon name="arrow-up-bold-circle-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={limitModalStyles.upgradeText}>Upgrade Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 🚀 SMART BARCODE PREDICT CARD MODAL */}
      <Modal visible={predictModalVisible} transparent animationType="slide" onRequestClose={() => setPredictModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: darkMode ? "#1e293b" : "#ffffff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" }}>
             
            {predictLoading ? (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <ActivityIndicator size="large" color="#6366f1" />
                <Text style={{ marginTop: 12, fontWeight: "700", color: theme.text }}>Gathering details from barcode...</Text>
                <Text style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Barcode: {predictBarcode}</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <View>
                    <Text style={{ fontSize: 18, fontWeight: "800", color: theme.text }}>📦 Product Predicted</Text>
                    <Text style={{ fontSize: 12, color: "#64748b" }}>Barcode: {predictBarcode}</Text>
                  </View>
                  <TouchableOpacity activeOpacity={0.7} onPress={() => { setPredictModalVisible(false); focusGunScanner(); }} style={{ padding: 4 }}>
                    <Icon name="close" size={24} color={darkMode ? "#94a3b8" : "#64748b"} />
                  </TouchableOpacity>
                </View>

                {/* 🎯 STEPPER PROGRESS BAR */}
                <View style={[stepperStyles.container, { backgroundColor: darkMode ? "#0f172a" : "#f8fafc", borderColor: darkMode ? "#334155" : "#e2e8f0" }]}>
                  <View style={stepperStyles.stepsRow}>
                    <StepItem 
                      label="Product Name" 
                      stepNumber={1} 
                      isCompleted={Boolean(predictName && predictName.trim().length > 0)} 
                    />
                    <StepItem 
                      label="Brand Name" 
                      stepNumber={2} 
                      isCompleted={Boolean(predictBrand && predictBrand.trim().length > 0)} 
                    />
                    <StepItem 
                      label="Pricing" 
                      stepNumber={3} 
                      isCompleted={Boolean(predictPurchasePrice && Number(predictPurchasePrice) > 0 && predictSalesPrice && Number(predictSalesPrice) > 0)} 
                    />
                    <StepItem 
                      label="Image" 
                      stepNumber={4} 
                      isCompleted={Boolean(predictSelectedImage && predictSelectedImage.trim().length > 0)} 
                      isLast={true}
                    />
                  </View>
                </View>

{/* MAIN CATEGORY */}
<View style={{ marginBottom: 12, zIndex: 3000 }}>
  <Text
    style={{
      fontSize: 12,
      fontWeight: "700",
      color: theme.text,
      marginBottom: 6,
    }}
  >
    Main Category *
  </Text>

  <TouchableOpacity
    activeOpacity={0.8}
    onPress={() => {
      setMainCategoryOpen(current => !current);
      setSubcategoryOpen(false);
      setMainCategorySearch("");
      Keyboard.dismiss();
    }}
    style={{ minHeight: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: mainCategoryOpen ? "#16a34a" : "#d1d5db", backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center", justifyContent: "space-between", shadowColor: "#0f172a", shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
  >
    <Text style={{ color: selectedMainCategory ? "#111827" : "#6b7280", fontSize: 15, fontWeight: selectedMainCategory ? "600" : "400" }}>
      {mainCategories.find(category => category.id === selectedMainCategory)?.name || mainCategories.find(category => category.id === selectedMainCategory)?.categoryName || "Select main category"}
    </Text>
    <Icon name={mainCategoryOpen ? "chevron-up" : "chevron-down"} size={22} color="#64748b" />
  </TouchableOpacity>
  {mainCategoryOpen && (
    <View style={{ marginTop: 8, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#ffffff", shadowColor: "#0f172a", shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 }}>
      <View style={{ minHeight: 44, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "#f3f4f6", flexDirection: "row", alignItems: "center" }}>
        <Icon name="magnify" size={20} color="#64748b" />
        <TextInput value={mainCategorySearch} onChangeText={setMainCategorySearch} placeholder="Search categories" placeholderTextColor="#9ca3af" returnKeyType="search" style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 8, color: "#111827", fontSize: 14 }} />
      </View>
      {mainCategoriesLoading ? <ActivityIndicator color="#16a34a" style={{ padding: 16 }} /> : (
        <ScrollView style={{ maxHeight: Math.min(height * 0.3, 230), marginTop: 6 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {mainCategories.filter(category => String(category.name || category.categoryName || category.id || "").toLowerCase().includes(mainCategorySearch.trim().toLowerCase())).map(category => {
            const label = String(category.name || category.categoryName || category.id || "Unnamed category");
            const isSelected = category.id === selectedMainCategory;
            return (
              <TouchableOpacity key={category.id} activeOpacity={0.7} onPress={() => {
                setSelectedMainCategory(category.id);
                setSelectedSubcategory("");
                setSubcategorySearch("");
                setMainCategorySearch("");
                setMainCategoryOpen(false);
                Keyboard.dismiss();
              }} style={{ minHeight: 46, paddingHorizontal: 10, borderRadius: 9, backgroundColor: isSelected ? "#ecfdf3" : "#ffffff", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: isSelected ? "#15803d" : "#1f2937", fontSize: 14, fontWeight: isSelected ? "700" : "500" }}>{label}</Text>
                {isSelected && <Icon name="check-circle" size={20} color="#16a34a" />}
              </TouchableOpacity>
            );
          })}
          {!mainCategories.length && <Text style={{ padding: 12, color: "#6b7280", fontSize: 13 }}>No main categories found.</Text>}
        </ScrollView>
      )}
    </View>
  )}
</View>

{/* SUBCATEGORY */}
<View style={{ marginBottom: 14, zIndex: 2000 }}>
  <Text
    style={{
      fontSize: 12,
      fontWeight: "700",
      color: theme.text,
      marginBottom: 6,
    }}
  >
    Subcategory *
  </Text>

  <TouchableOpacity activeOpacity={0.8} disabled={!selectedMainCategory} onPress={() => {
    setSubcategoryOpen(current => !current);
    setMainCategoryOpen(false);
    setSubcategorySearch("");
    setSubcategoryError("");
    Keyboard.dismiss();
  }} style={{ minHeight: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: subcategoryOpen ? "#16a34a" : "#d1d5db", backgroundColor: selectedMainCategory ? "#ffffff" : "#f3f4f6", flexDirection: "row", alignItems: "center", justifyContent: "space-between", shadowColor: "#0f172a", shadowOpacity: selectedMainCategory ? 0.05 : 0, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: selectedMainCategory ? 2 : 0 }}>
    <Text style={{ color: selectedSubcategory ? "#111827" : "#6b7280", fontSize: 15, fontWeight: selectedSubcategory ? "600" : "400" }}>
      {sharedSubcategories.find(subcategory => subcategory.id === selectedSubcategory)?.name || sharedSubcategories.find(subcategory => subcategory.id === selectedSubcategory)?.categoryName || (selectedMainCategory ? "Select subcategory" : "Select main category first")}
    </Text>
    <Icon name={subcategoryOpen ? "chevron-up" : "chevron-down"} size={22} color="#64748b" />
  </TouchableOpacity>
  {subcategoryOpen && selectedMainCategory && (
    <View style={{ marginTop: 8, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#ffffff", shadowColor: "#0f172a", shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 }}>
      <View style={{ minHeight: 44, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "#f3f4f6", flexDirection: "row", alignItems: "center" }}>
        <Icon name="magnify" size={20} color="#64748b" />
        <TextInput value={subcategorySearch} onChangeText={setSubcategorySearch} placeholder="Search or add a subcategory" placeholderTextColor="#9ca3af" returnKeyType="search" style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 8, color: "#111827", fontSize: 14 }} />
      </View>
      {subcategoriesLoading ? <ActivityIndicator color="#16a34a" style={{ padding: 16 }} /> : (
        <ScrollView style={{ maxHeight: Math.min(height * 0.3, 230), marginTop: 6 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {sharedSubcategories.filter(subcategory => String(subcategory.name || subcategory.categoryName || subcategory.id || "").toLowerCase().includes(subcategorySearch.trim().toLowerCase())).map(subcategory => {
            const label = String(subcategory.name || subcategory.categoryName || subcategory.id || "Unnamed subcategory");
            const isSelected = subcategory.id === selectedSubcategory;
            return (
              <TouchableOpacity key={subcategory.id} activeOpacity={0.7} onPress={() => {
                setSelectedSubcategory(subcategory.id);
                setSubcategorySearch("");
                setSubcategoryOpen(false);
                Keyboard.dismiss();
              }} style={{ minHeight: 46, paddingHorizontal: 10, borderRadius: 9, backgroundColor: isSelected ? "#ecfdf3" : "#ffffff", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: isSelected ? "#15803d" : "#1f2937", fontSize: 14, fontWeight: isSelected ? "700" : "500" }}>{label}</Text>
                {isSelected && <Icon name="check-circle" size={20} color="#16a34a" />}
              </TouchableOpacity>
            );
          })}
          {!sharedSubcategories.length && <Text style={{ padding: 12, color: "#6b7280", fontSize: 13 }}>No subcategories yet.</Text>}
          {!!subcategorySearch.trim() && !sharedSubcategories.some(subcategory => String(subcategory.name || subcategory.categoryName || "").trim().replace(/\s+/g, " ").toLocaleLowerCase() === subcategorySearch.trim().replace(/\s+/g, " ").toLocaleLowerCase()) && (
            <TouchableOpacity activeOpacity={0.7} disabled={savingSubcategory} onPress={addSubcategoryFromSearch} style={{ minHeight: 48, marginTop: 5, paddingHorizontal: 10, borderRadius: 9, backgroundColor: "#ecfdf3", flexDirection: "row", alignItems: "center" }}>
              {savingSubcategory ? <ActivityIndicator size="small" color="#16a34a" /> : <Icon name="plus-circle-outline" size={20} color="#16a34a" />}
              <Text numberOfLines={2} style={{ flex: 1, marginLeft: 8, color: "#15803d", fontSize: 14, fontWeight: "700" }}>
                {savingSubcategory ? "Adding subcategory…" : "Add \"" + subcategorySearch.trim() + "\""}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
      {!!subcategoryError && <Text style={{ marginTop: 7, paddingHorizontal: 4, color: "#dc2626", fontSize: 12 }}>{subcategoryError}</Text>}
    </View>
  )}
</View>

{/* DYNAMIC UNIT SELECTOR (Category & Sub-Unit Horizontal Scroll) */}
<View style={{ marginBottom: 14, backgroundColor: darkMode ? "#0f172a" : "#f8fafc", padding: 12, borderRadius: 14, borderWidth: 1, borderColor: darkMode ? "#334155" : "#e2e8f0" }}>
  <Text style={{ fontSize: 13, fontWeight: "800", color: theme.text, marginBottom: 8 }}>Unit Category</Text>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 10 }}>
    {UNIT_CATEGORIES.map((cat) => {
      const isCatActive = selectedUnitCategory === cat.category;
      return (
        <TouchableOpacity
          key={cat.category}
          activeOpacity={0.7}
          onPress={() => {
            setSelectedUnitCategory(cat.category);
            setPredictUnitType(cat.units[0]);
          }}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 8,
            backgroundColor: isCatActive ? "#16a34a" : (darkMode ? "#1e293b" : "#ffffff"),
            borderWidth: 1,
            borderColor: isCatActive ? "#16a34a" : (darkMode ? "#334155" : "#cbd5e1")
          }}
        >
          <Text style={{ color: isCatActive ? "#fff" : theme.text, fontWeight: "700", fontSize: 12 }}>{cat.category}</Text>
        </TouchableOpacity>
      );
    })}
  </ScrollView>

  <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b", marginBottom: 6 }}>Choose Unit</Text>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
    {(UNIT_CATEGORIES.find(c => c.category === selectedUnitCategory)?.units || ["Qty"]).map((u) => {
      const isUnitActive = predictUnitType === u;
      return (
        <TouchableOpacity
          key={u}
          activeOpacity={0.7}
          onPress={() => setPredictUnitType(u)}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 8,
            backgroundColor: isUnitActive ? "#22c55e" : (darkMode ? "#1e293b" : "#ffffff"),
            borderWidth: 1,
            borderColor: isUnitActive ? "#22c55e" : (darkMode ? "#334155" : "#cbd5e1"),
            flexDirection: "row",
            alignItems: "center"
          }}
        >
          <Text style={{ color: isUnitActive ? "#fff" : theme.text, fontWeight: "700", fontSize: 12 }}>{u}</Text>
          {isUnitActive && <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12, marginLeft: 4 }}>✓</Text>}
        </TouchableOpacity>
      );
    })}
  </ScrollView>
</View>

{/* DYNAMIC MEASUREMENT / QUANTITY / SIZE INPUT */}
{(() => {
  const measurementConfig = getMeasurementConfig(selectedUnitCategory, predictUnitType);
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: theme.text }}>
          {measurementConfig.label}
        </Text>
        {predictUnitType ? (
          <View style={{ backgroundColor: darkMode ? "#064e3b" : "#ecfdf3", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: "#16a34a" }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#16a34a" }}>
              Unit: {predictUnitType}
            </Text>
          </View>
        ) : null}
      </View>
      <TextInput
        value={predictSize}
        onChangeText={setPredictSize}
        placeholder={measurementConfig.placeholder}
        placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
        keyboardType={measurementConfig.keyboardType}
        autoCapitalize={measurementConfig.autoCapitalize}
        style={[
          styles.input,
          {
            marginTop: 0,
            textAlign: "left",
            backgroundColor: darkMode ? "#0f172a" : "#f8fafc",
            color: theme.text,
            borderColor: darkMode ? "#334155" : "#cbd5e1"
          }
        ]}
      />
    </View>
  );
})()}

                <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 14 }}>
                  <View style={{ marginRight: 12, alignItems: "center" }}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={pickPredictCustomImage}
                      disabled={isRemovingBackground}
                      style={{
                        width: 84,
                        height: 84,
                        borderRadius: 14,
                        borderWidth: 2,
                        borderColor: predictSelectedImage ? "#22c55e" : "#6366f1",
                        borderStyle: predictSelectedImage ? "solid" : "dashed",
                        justifyContent: "center",
                        alignItems: "center",
                        backgroundColor: darkMode ? "#0f172a" : "#f1f5f9",
                        overflow: "hidden",
                        position: "relative"
                      }}
                    >
                      {predictSelectedImage ? (
                        <Image source={{ uri: predictSelectedImage }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
                      ) : (
                        <View style={{ alignItems: "center" }}>
                          <Icon name="camera-plus" size={28} color="#6366f1" />
                          <Text style={{ fontSize: 10, color: "#6366f1", fontWeight: "bold", marginTop: 2 }}>Upload</Text>
                        </View>
                      )}

                      {isRemovingBackground && (
                        <View
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: "rgba(0, 0, 0, 0.7)",
                            justifyContent: "center",
                            alignItems: "center",
                            padding: 3
                          }}
                        >
                          <ActivityIndicator size="small" color="#22c55e" />
                          <Text style={{ color: "#ffffff", fontSize: 8, fontWeight: "700", marginTop: 3, textAlign: "center" }}>
                            {bgRemovalStatus || "Enhancing…"}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>

                    {predictSelectedImage && (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 3, marginTop: 4, maxWidth: 90 }}>
                        {studioPredictImage ? (
                          <TouchableOpacity
                            onPress={() => setPredictSelectedImage(studioPredictImage)}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              backgroundColor: predictSelectedImage === studioPredictImage ? "#16a34a" : (darkMode ? "#334155" : "#e2e8f0"),
                              paddingHorizontal: 4,
                              paddingVertical: 2,
                              borderRadius: 6
                            }}
                          >
                            <Icon name="camera-iris" size={10} color={predictSelectedImage === studioPredictImage ? "#fff" : (darkMode ? "#94a3b8" : "#475569")} style={{ marginRight: 2 }} />
                            <Text style={{ fontSize: 8, fontWeight: "700", color: predictSelectedImage === studioPredictImage ? "#fff" : (darkMode ? "#94a3b8" : "#475569") }}>Studio</Text>
                          </TouchableOpacity>
                        ) : (predictSelectedImage.includes("bg_studio") && (
                          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: darkMode ? "#064e3b" : "#dcfce7", paddingHorizontal: 4, paddingVertical: 2, borderRadius: 6 }}>
                            <Icon name="camera-iris" size={10} color="#16a34a" style={{ marginRight: 2 }} />
                            <Text style={{ fontSize: 8, color: "#16a34a", fontWeight: "700" }}>Studio</Text>
                          </View>
                        ))}

                        {transparentPredictImage ? (
                          <TouchableOpacity
                            onPress={() => setPredictSelectedImage(transparentPredictImage)}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              backgroundColor: predictSelectedImage === transparentPredictImage ? "#16a34a" : (darkMode ? "#334155" : "#e2e8f0"),
                              paddingHorizontal: 4,
                              paddingVertical: 2,
                              borderRadius: 6
                            }}
                          >
                            <Icon name="checkerboard" size={10} color={predictSelectedImage === transparentPredictImage ? "#fff" : (darkMode ? "#94a3b8" : "#475569")} style={{ marginRight: 2 }} />
                            <Text style={{ fontSize: 8, fontWeight: "700", color: predictSelectedImage === transparentPredictImage ? "#fff" : (darkMode ? "#94a3b8" : "#475569") }}>Cutout</Text>
                          </TouchableOpacity>
                        ) : (predictSelectedImage.includes("bg_removed") && (
                          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: darkMode ? "#064e3b" : "#dcfce7", paddingHorizontal: 4, paddingVertical: 2, borderRadius: 6 }}>
                            <Icon name="check-decagram" size={10} color="#16a34a" style={{ marginRight: 2 }} />
                            <Text style={{ fontSize: 8, color: "#16a34a", fontWeight: "700" }}>Cutout</Text>
                          </View>
                        ))}

                        {originalPredictImage && originalPredictImage !== predictSelectedImage && !isRemovingBackground && (
                          <TouchableOpacity
                            onPress={() => setPredictSelectedImage(originalPredictImage)}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              backgroundColor: darkMode ? "#334155" : "#e2e8f0",
                              paddingHorizontal: 4,
                              paddingVertical: 2,
                              borderRadius: 6
                            }}
                          >
                            <Text style={{ fontSize: 8, fontWeight: "600", color: darkMode ? "#94a3b8" : "#475569" }}>Original</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b" }}>Product Name *</Text>
                      <TouchableOpacity 
                        activeOpacity={0.7} 
                        onPress={handleOpenWebSearchModal} 
                        style={{ flexDirection: "row", alignItems: "center", backgroundColor: darkMode ? "#334155" : "#e0e7ff", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}
                      >
                        <Icon name="magnify" size={14} color="#6366f1" style={{ marginRight: 2 }} />
                        <Text style={{ fontSize: 10, fontWeight: "700", color: "#6366f1" }}>Search web</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      value={predictName}
                      onChangeText={(val) => {
                        setPredictName(val);
                        if (val.trim()) setMissingFields(prev => prev.filter(f => f !== "Product Name"));
                      }}
                      placeholder="e.g. 3 Roses or Fivestar"
                      placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
                      style={[styles.input, { marginTop: 6, textAlign: "left", backgroundColor: darkMode ? "#0f172a" : "#f8fafc", color: theme.text, borderColor: darkMode ? "#334155" : "#cbd5e1" }]}
                    />
                  </View>
                </View>

                {predictImages.length > 0 && (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: "#64748b", marginBottom: 6 }}>Suggested Images</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {predictImages.map((imgUri, index) => (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          key={index}
                          onPress={() => {
                            if (imgUri.includes("bg_studio") || imgUri.includes("bg_removed")) {
                              setPredictSelectedImage(imgUri);
                              setMissingFields(prev => prev.filter(f => f !== "Product Image"));
                            } else {
                              handleAutoProcessPredictImage(imgUri);
                            }
                          }}
                          style={{
                            width: 50,
                            height: 50,
                            borderRadius: 10,
                            marginRight: 8,
                            borderWidth: 2,
                            borderColor: predictSelectedImage === imgUri ? "#22c55e" : (darkMode ? "#334155" : "#cbd5e1"),
                            overflow: "hidden",
                            backgroundColor: "#f8fafc"
                          }}
                        >
                          <Image source={{ uri: imgUri }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <View style={{ flexDirection: "row", marginTop: 4 }}>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b" }}>Brand Name</Text>
                    <TextInput
                      value={predictBrand}
                      onChangeText={(val) => {
                        setPredictBrand(val);
                        if (val.trim()) setMissingFields(prev => prev.filter(f => f !== "Brand Name"));
                      }}
                      placeholder="e.g. Cadbury / Nestle"
                      placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
                      style={[styles.input, { marginTop: 4, textAlign: "left", backgroundColor: darkMode ? "#0f172a" : "#f8fafc", color: theme.text, borderColor: darkMode ? "#334155" : "#cbd5e1" }]}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b" }}>Sub Name / Variant</Text>
                    <TextInput
                      value={predictSubName}
                      onChangeText={setPredictSubName}
                      placeholder="e.g. Chocolate / 250g"
                      placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
                      style={[styles.input, { marginTop: 4, textAlign: "left", backgroundColor: darkMode ? "#0f172a" : "#f8fafc", color: theme.text, borderColor: darkMode ? "#334155" : "#cbd5e1" }]}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: "row", marginTop: 8 }}>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b" }}>Purchase Price (₹)</Text>
                    <TextInput
                      keyboardType="numeric"
                      value={predictPurchasePrice}
                      onChangeText={(val) => {
                        setPredictPurchasePrice(val);
                        if (val && Number(val) > 0) setMissingFields(prev => prev.filter(f => f !== "Purchase Price"));
                      }}
                      placeholder="0"
                      placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
                      style={[styles.input, { marginTop: 4, textAlign: "left", backgroundColor: darkMode ? "#0f172a" : "#f8fafc", color: theme.text, borderColor: darkMode ? "#334155" : "#cbd5e1" }]}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b" }}>Sales Price (₹)</Text>
                    <TextInput
                      keyboardType="numeric"
                      value={predictSalesPrice}
                      onChangeText={(val) => {
                        setPredictSalesPrice(val);
                        if (val && Number(val) > 0) setMissingFields(prev => prev.filter(f => f !== "Sales Price"));
                      }}
                      placeholder="0"
                      placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
                      style={[styles.input, { marginTop: 4, textAlign: "left", backgroundColor: darkMode ? "#0f172a" : "#f8fafc", color: theme.text, borderColor: darkMode ? "#334155" : "#cbd5e1" }]}
                    />
                  </View>
                </View>

    <View style={{ marginTop: 10 }}>
      <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b", marginBottom: 4 }}>Quantity</Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: darkMode ? "#334155" : "#cbd5e1", borderRadius: 10, padding: 6, backgroundColor: darkMode ? "#0f172a" : "#f8fafc" }}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setPredictQty(prev => Math.max(1, Number(prev || 1) - 1))}
          style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: "#6366f1", justifyContent: "center", alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 18 }}>-</Text>
        </TouchableOpacity>
         
        <TextInput
          keyboardType="numeric"
          value={String(predictQty)}
          onChangeText={(val) => {
            const num = val === "" ? "" : parseInt(val, 10);
            setPredictQty(num);
          }}
          onBlur={() => {
            if (!predictQty || isNaN(predictQty) || Number(predictQty) < 1) {
              setPredictQty(1);
            }
          }}
          style={{ fontSize: 16, fontWeight: "bold", color: theme.text, textAlign: "center", minWidth: 60, padding: 0 }}
        />

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setPredictQty(prev => Number(prev || 0) + 1)}
          style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: "#6366f1", justifyContent: "center", alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 18 }}>+</Text>
        </TouchableOpacity>
      </View>
    </View>

    {/* 🏷️ HSN CODE SECTION */}
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b" }}>HSN Code</Text>
          <Text style={{ fontSize: 11, color: "#94a3b8", marginLeft: 6 }}>(GST Classification)</Text>
        </View>
        {hsnLookupLoading && (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <ActivityIndicator size="small" color="#6366f1" style={{ marginRight: 4 }} />
            <Text style={{ fontSize: 11, color: "#6366f1", fontWeight: "600" }}>Resolving HSN…</Text>
          </View>
        )}
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 10,
          borderWidth: 1,
          borderColor: hsnValidationMessage ? "#ef4444" : darkMode ? "#334155" : "#cbd5e1",
          backgroundColor: darkMode ? "#0f172a" : "#f8fafc",
          paddingHorizontal: 10,
          minHeight: 46,
        }}
      >
        <Icon name="barcode-scan" size={20} color="#6366f1" style={{ marginRight: 8 }} />
        <TextInput
          value={predictHsnCode}
          onChangeText={handleHsnTextChange}
          placeholder="Enter or search HSN code"
          placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
          keyboardType="number-pad"
          maxLength={8}
          style={{
            flex: 1,
            fontSize: 14,
            fontWeight: "700",
            color: theme.text,
            paddingVertical: 6,
          }}
        />

        {predictHsnCode.length > 0 && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleClearHsn}
            style={{ padding: 4, marginRight: 4 }}
          >
            <Icon name="close-circle" size={18} color="#94a3b8" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => handleOpenHsnSearch()}
          style={{
            backgroundColor: "#6366f1",
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 6,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <Icon name="magnify" size={16} color="#ffffff" style={{ marginRight: 4 }} />
          <Text style={{ color: "#ffffff", fontSize: 12, fontWeight: "700" }}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Validation warning */}
      {!!hsnValidationMessage && (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, paddingHorizontal: 2 }}>
          <Icon name="alert-circle-outline" size={14} color="#ef4444" style={{ marginRight: 4 }} />
          <Text style={{ color: "#ef4444", fontSize: 11, fontWeight: "600" }}>{hsnValidationMessage}</Text>
        </View>
      )}

      {/* Contextual Suggestion Banner */}
      {hsnSuggestedItem && !predictHsnCode && (
        <View
          style={{
            marginTop: 8,
            padding: 10,
            borderRadius: 10,
            backgroundColor: darkMode ? "#1e293b" : "#eef2ff",
            borderWidth: 1,
            borderColor: darkMode ? "#3730a3" : "#c7d2fe",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, marginRight: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Icon name="lightbulb-on-outline" size={14} color="#6366f1" style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 11, fontWeight: "800", color: "#4f46e5" }}>
                Suggested: HSN {hsnSuggestedItem.hsnCode} ({hsnSuggestedItem.gstRate || "5%"})
              </Text>
            </View>
            <Text numberOfLines={1} style={{ fontSize: 11, color: theme.text, marginTop: 2 }}>
              {hsnSuggestedItem.description}
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => applySuggestedHsn(hsnSuggestedItem)}
            style={{
              backgroundColor: "#4f46e5",
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 6,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>Apply</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>

    {/* 📝 DESCRIPTION (OPTIONAL) SECTION */}
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b" }}>Description (Optional)</Text>
        {isDescriptionManuallyEdited && (
          <Text style={{ fontSize: 10, color: "#16a34a", fontWeight: "700" }}>Custom description preserved</Text>
        )}
      </View>

      <TextInput
        value={predictDescription}
        onChangeText={handleDescriptionTextChange}
        placeholder="Official HSN description or custom notes..."
        placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
        multiline={true}
        numberOfLines={3}
        textAlignVertical="top"
        style={[
          styles.input,
          {
            marginTop: 0,
            textAlign: "left",
            minHeight: 68,
            paddingTop: 8,
            paddingBottom: 8,
            backgroundColor: darkMode ? "#0f172a" : "#f8fafc",
            color: theme.text,
            borderColor: darkMode ? "#334155" : "#cbd5e1",
          },
        ]}
      />
    </View>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleConfirmPredictedProduct}
                  style={{ backgroundColor: "#16a34a", padding: 14, borderRadius: 12, marginTop: 18, alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>✓ Add to Scanned List</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

          </View>
        </View>
      </Modal>

      {/* 🔍 HSN CODE SEARCH & SELECTION MODAL */}
      <Modal
        visible={hsnSearchModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setHsnSearchModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: darkMode ? "#0f172a" : "#f8fafc" }}>
          <StatusBar barStyle={darkMode ? "light-content" : "dark-content"} />

          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderColor: darkMode ? "#1e293b" : "#e2e8f0",
              backgroundColor: darkMode ? "#1e293b" : "#ffffff",
            }}
          >
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setHsnSearchModalVisible(false)}
              style={{ padding: 4, marginRight: 10 }}
            >
              <Icon name="arrow-left" size={24} color={theme.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: theme.text }}>Search HSN Classification</Text>
              <Text style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>CBIC GST Official Tariff Directory</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setHsnSearchModalVisible(false)}
              style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: darkMode ? "#334155" : "#f1f5f9" }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: theme.text }}>Close</Text>
            </TouchableOpacity>
          </View>

          {/* Search Input Bar */}
          <View style={{ padding: 14, backgroundColor: darkMode ? "#1e293b" : "#ffffff", borderBottomWidth: 1, borderColor: darkMode ? "#334155" : "#e2e8f0" }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: darkMode ? "#475569" : "#cbd5e1",
                backgroundColor: darkMode ? "#0f172a" : "#f1f5f9",
                paddingHorizontal: 12,
                height: 46,
              }}
            >
              <Icon name="magnify" size={20} color="#6366f1" style={{ marginRight: 8 }} />
              <TextInput
                value={hsnSearchQuery}
                onChangeText={(text) => {
                  setHsnSearchQuery(text);
                  executeHsnSearch(text);
                }}
                placeholder="Search by HSN code, product, category, keywords..."
                placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
                returnKeyType="search"
                style={{ flex: 1, fontSize: 14, color: theme.text, padding: 0 }}
              />
              {hsnSearchQuery.length > 0 && (
                <TouchableOpacity activeOpacity={0.7} onPress={() => { setHsnSearchQuery(""); executeHsnSearch(""); }}>
                  <Icon name="close-circle" size={18} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Results List */}
          {hsnSearchLoading ? (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
              <ActivityIndicator size="large" color="#6366f1" />
              <Text style={{ marginTop: 12, fontSize: 13, color: "#64748b", fontWeight: "600" }}>Searching HSN classifications…</Text>
            </View>
          ) : (
            <FlatList
              data={hsnSearchResults}
              keyExtractor={(item) => item.hsnCode}
              contentContainerStyle={{ padding: 14 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => handleSelectHsnResult(item)}
                  style={{
                    backgroundColor: darkMode ? "#1e293b" : "#ffffff",
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: darkMode ? "#334155" : "#e2e8f0",
                    padding: 14,
                    marginBottom: 10,
                    elevation: 1,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ backgroundColor: "#eef2ff", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                        <Text style={{ fontSize: 14, fontWeight: "900", color: "#4f46e5", letterSpacing: 0.5 }}>
                          HSN {item.hsnCode}
                        </Text>
                      </View>
                      {item.gstRate && (
                        <View style={{ backgroundColor: "#dcfce7", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontSize: 11, fontWeight: "800", color: "#15803d" }}>GST {item.gstRate}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 11, color: "#6366f1", fontWeight: "700" }}>Select →</Text>
                  </View>

                  <Text style={{ fontSize: 13, fontWeight: "600", color: theme.text, lineHeight: 18, marginBottom: 4 }}>
                    {item.description}
                  </Text>

                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                    <Text style={{ fontSize: 11, color: "#64748b" }}>{item.category || "General Classification"}</Text>
                    <Text style={{ fontSize: 10, color: "#94a3b8" }}>{item.source}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: "center", justifyContent: "center", marginTop: 60, paddingHorizontal: 30 }}>
                  <Icon name="file-search-outline" size={56} color="#94a3b8" />
                  <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text, marginTop: 12, textAlign: "center" }}>
                    No HSN Classification Found
                  </Text>
                  <Text style={{ fontSize: 13, color: "#64748b", marginTop: 6, textAlign: "center", lineHeight: 19 }}>
                    No official match found for &ldquo;{hsnSearchQuery}&rdquo;. You can close this search and enter an HSN code and description manually.
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setHsnSearchModalVisible(false)}
                    style={{ marginTop: 20, backgroundColor: "#6366f1", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Enter Code Manually</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* WHATSAPP WEB IMAGE SEARCH MODAL */}
      <Modal visible={webImageGridModal} animationType="slide" transparent={false} onRequestClose={() => setWebImageGridModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#0b141a" }}>
          <StatusBar barStyle="light-content" backgroundColor="#0b141a" />
             
          <View style={{ flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: 1, borderBottomColor: "#1f2c34" }}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => { setWebImageGridModal(false); focusGunScanner(); }} style={{ padding: 6 }}>
              <Icon name="arrow-left" size={24} color="#e9edef" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginHorizontal: 10, flexDirection: "row", alignItems: "center", backgroundColor: "#1f2c34", borderRadius: 20, paddingHorizontal: 12, height: 42 }}>
              <TextInput
                value={webSearchQuery}
                onChangeText={setWebSearchQuery}
                placeholder="Search web"
                placeholderTextColor="#8696a0"
                style={{ flex: 1, color: "#090606", fontSize: 15 }}
                onSubmitEditing={() => executeWebSearch(webSearchQuery)}
                returnKeyType="search"
              />
              {webSearchQuery.length > 0 && (
                <TouchableOpacity activeOpacity={0.7} onPress={() => setWebSearchQuery("")}>
                  <Icon name="close" size={18} color="#8696a0" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity activeOpacity={0.7} onPress={() => executeWebSearch(webSearchQuery)} style={{ padding: 6 }}>
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
                  activeOpacity={0.7}
                  onPress={() => {
                    setWebImageGridModal(false);
                    focusGunScanner();
                    handleAutoProcessPredictImage(item);
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
      <Modal visible={showReceiptModal} animationType="slide" transparent={false} onRequestClose={() => setShowReceiptModal(false)}>
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
                <td>${i.name} ${i.size ? '(' + i.size + ')' : ''}<br/>&nbsp;&nbsp;${i.qty} ${i.unitType || 'Qty'} x ₹${Number(i.purchasePrice).toFixed(2)}</td>                <td class="right" style="vertical-align:bottom;">₹${(i.qty * i.purchasePrice).toFixed(2)}</td>
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
            <TouchableOpacity activeOpacity={0.7} style={[styles.recBtn, { backgroundColor: "#ef4444" }]} onPress={() => { setShowReceiptModal(false); setBill([]); focusGunScanner(); }}>
              <Text style={styles.recBtnText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} style={[styles.recBtn, { backgroundColor: "#6366f1" }]} onPress={() => triggerPurchasePrint(currentPurNo, currentPurDate, purTotal)}>
              <Text style={styles.recBtnText}>🖨 Print Invoice</Text>
            </TouchableOpacity>
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
      <Modal visible={newCategoryModal} transparent animationType="fade" onRequestClose={() => setNewCategoryModal(false)}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ width: "85%", backgroundColor: darkMode ? "#1e293b" : "#fff", borderRadius: 15, padding: 20, maxHeight: "80%" }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10, color: darkMode ? "#f8fafc" : '#000' }}>Manage Categories ({currentMode.toUpperCase()})</Text>
            <TextInput placeholder="New Category Name" placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"} value={categoryName} onChangeText={setCategoryName} style={[styles.input, { backgroundColor: darkMode ? "#0f172a" : "#ffffff", color: darkMode ? "#f8fafc" : "#111827", borderColor: darkMode ? "#334155" : "#cbd5e1" }]} />
            <TouchableOpacity
              activeOpacity={0.7}
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
                <TouchableOpacity activeOpacity={0.7} key={cat.id} onLongPress={() => handleDeleteCategory(cat.id, cat.name)} delayLongPress={600} style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: darkMode ? "#334155" : "#e2e8f0", backgroundColor: darkMode ? "#0f172a" : "#f8fafc", marginVertical: 2, borderRadius: 5 }}>
                  <Text style={{ color: darkMode ? "#f8fafc" : "#334155", fontWeight: "500" }}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 20 }}>
              <TouchableOpacity activeOpacity={0.7} onPress={() => { setCategoryName(""); setNewCategoryModal(false); focusGunScanner(); }} style={{ padding: 10 }}>
                <Text style={{ color: "#6366f1", fontSize: 16, fontWeight: "bold" }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const stepperStyles = StyleSheet.create({
  container: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  stepsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  stepWrapper: {
    flex: 1,
    alignItems: "center",
  },
  nodeRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    justifyContent: "center",
  },
  circleNode: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
  circleActive: {
    backgroundColor: "#22c55e",
  },
  circleInactive: {
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#cbd5e1",
  },
  stepNumText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
  },
  lineTrack: {
    position: "absolute",
    left: "50%",
    right: "-50%",
    top: 13,
    height: 3,
    backgroundColor: "#e2e8f0",
    zIndex: 1,
  },
  lineFill: {
    height: "100%",
    backgroundColor: "#22c55e",
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94a3b8",
    marginTop: 6,
    textAlign: "center",
  },
  stepLabelActive: {
    color: "#22c55e",
    fontWeight: "700",
  },
});

const limitModalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 22,
    alignItems: "center",
    elevation: 20,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  heading: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 22,
  },
  btnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: "rgba(148, 163, 184, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#94a3b8",
  },
  upgradeBtn: {
    flex: 1.2,
    flexDirection: "row",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
  },
  upgradeText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  gunListenerWrapper: {
    position: 'absolute',
    top: -200,
    left: -200,
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  gunHiddenInput: {
    width: 1,
    height: 1,
    opacity: 0,
    padding: 0,
    margin: 0,
  },
  topWhiteHeader: { height: 60, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, elevation: 2, marginTop: Platform.OS === "android" ? StatusBar.currentHeight || 24 : 0 },
  shopBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  shopNameText: { fontSize: 16, fontWeight: '800', marginLeft: 6 },
  headerIconBtn: { padding: 8, marginLeft: 6, borderRadius: 20 },

  mainLayout: { flex: 1, flexDirection: 'column' },
  landscapeMainLayout: { flexDirection: 'row', padding: 12, gap: 14 },
    
  leftSection: { width: '100%' },
  landscapeLeftSection: { flex: 0.52, height: '100%', justifyContent: 'flex-start' },

  cameraOuterWrapper: { height: 260, width: "100%", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  landscapeCameraOuterWrapper: { height: 175, flex: 0, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  cameraFrameContainer: { flex: 1, overflow: "hidden", backgroundColor: '#000', borderRadius: 20, elevation: 4 },
  cameraControlRow: { position: 'absolute', top: 10, right: 10, zIndex: 10, flexDirection: 'row' },
actionCircleBtn: { 
  width: 34, 
  height: 34, 
  borderRadius: 17, 
  backgroundColor: 'rgba(0,0,0,0.6)', 
  justifyContent: 'center', 
  alignItems: 'center', 
  marginLeft: 8, 
  borderWidth: 1, 
  borderColor: 'rgba(255,255,255,0.2)' 
} , overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scanRow: { flexDirection: "row", alignItems: "center", justifyContent: 'center', padding: 0 },
  salesScanBox: { width: '80%', height: 140, justifyContent: "center", alignItems: "center", backgroundColor: 'transparent', borderRadius: 16,marginTop: 45, },
  tabletSalesScanBox: { width: "90%", height: 105 },
  corner: { position: "absolute", width: 20, height: 20,borderColor: "#22c55e" },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 },
  scanText: { color: "#22c55e", marginTop: 4, fontSize: 13, fontWeight: "700", textAlign: 'center' },

  searchRowContainer: { flexDirection: "row", alignItems: "center", paddingTop: 14, paddingBottom: 6, borderRadius: 12 },

  bottomWhiteContainer: { flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, marginTop: 4, elevation: 12 },
  landscapeRightSection: { flex: 1.48, height: '100%', borderRadius: 22, marginTop: 0, elevation: 4, padding: 14 },
    
  title: { fontSize: 17, marginBottom: 8, fontWeight: "700" },
  itemCard: { borderRadius: 14, padding: 10, marginBottom: 6, flexDirection: "row", alignItems: "center", borderWidth: 1 },
  billSummaryBox: { marginTop: 6, padding: 10, borderRadius: 14 },

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