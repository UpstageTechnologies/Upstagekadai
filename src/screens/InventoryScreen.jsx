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
  useWindowDimensions,
  Keyboard,
  Switch,
  Platform,
  ToastAndroid
} from "react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { auth, db, storage } from "../utils/firebaseConfig";
import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
  addDoc,
  getDocs,
  serverTimestamp,
  getDoc,
  deleteField
} from "firebase/firestore";
import { getSession } from "../utils/session";
import { getEffectiveProductPrice } from "../utils/pricing";
import { useTheme } from "../theme/ThemeContext";
import { launchImageLibrary, launchCamera } from "react-native-image-picker";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { removeProductBackground, cleanupOldSegmentedImages } from "../utils/backgroundRemover";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { WebView } from "react-native-webview";
import {
  markProductAsExpired,
  calculateExpiredLoss,
} from "../utils/expiredProductsService";
import bluetoothPrinter from "../utils/bluetoothPrinter";
import {
  validateHSNCode,
  lookupHSNCode,
  searchHSNByProductDetails,
  suggestHSNCode,
  getHSNDescription,
} from "../services/hsnService";

const UNIT_CATEGORIES = [
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

const FloatingLabelInput = ({ label, value, onChangeText, theme, keyboardType, autoCapitalize = "sentences" }) => {
  const [focused, setFocused] = useState(false);
  const floated = focused || String(value ?? "").length > 0;
  return (
    <View style={{ minHeight: 58, marginBottom: 10, justifyContent: "center", borderWidth: 1, borderRadius: 12, borderColor: focused ? "#16a34a" : theme.border, backgroundColor: theme.card }}>
      <Text pointerEvents="none" style={{ position: "absolute", left: 12, top: floated ? 5 : 18, zIndex: 1, color: focused ? "#16a34a" : theme.subText, fontSize: floated ? 10 : 14, fontWeight: floated ? "700" : "400" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ minHeight: 56, paddingHorizontal: 12, paddingTop: floated ? 18 : 12, paddingBottom: 5, color: theme.text, fontSize: 14 }}
        selectionColor="#16a34a"
      />
    </View>
  );
};

export default function InventoryScreen({ appMode }) {
  const navigation = useNavigation(); 
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { theme, darkMode } = useTheme();
  const isFocused = useIsFocused();

  const [items, setItems] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPurchasePrice, setEditPurchasePrice] = useState("");
  const [editSalesPrice, setEditSalesPrice] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [editDiscountValue, setEditDiscountValue] = useState("");
  const [editDiscountType, setEditDiscountType] = useState("percent");
  const [searchText, setSearchText] = useState("");
  const [editImage, setEditImage] = useState("");
  const [originalImage, setOriginalImage] = useState("");
  const [studioImage, setStudioImage] = useState("");
  const [transparentImage, setTransparentImage] = useState("");
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [bgRemovalStatus, setBgRemovalStatus] = useState("");
  const bgRequestIdRef = useRef(0);
  const [currentMode, setCurrentMode] = useState("local");
  const [shopName, setShopName] = useState("MY SHOP");
  const [userPlan, setUserPlan] = useState("Basic");

  // EDIT MODAL: ONLINE SALE TOGGLE STATE
  const [editIsOnlineSaleEnabled, setEditIsOnlineSaleEnabled] = useState(true);
  const [savingOnlineSaleToggle, setSavingOnlineSaleToggle] = useState(false);

  // EDIT MODAL: HSN CODE & CLASSIFICATION DESCRIPTION STATES
  const [editHsnCode, setEditHsnCode] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isDescriptionManuallyEdited, setIsDescriptionManuallyEdited] = useState(false);
  const [hsnSearchModalVisible, setHsnSearchModalVisible] = useState(false);
  const [hsnSearchQuery, setHsnSearchQuery] = useState("");
  const [hsnSearchResults, setHsnSearchResults] = useState([]);
  const [hsnSearchLoading, setHsnSearchLoading] = useState(false);
  const [hsnLookupLoading, setHsnLookupLoading] = useState(false);
  const [hsnValidationMessage, setHsnValidationMessage] = useState("");

  // EDIT MODAL: CATEGORY & SUBCATEGORY STATES
  const [editMainCategory, setEditMainCategory] = useState("");
  const [editSubcategory, setEditSubcategory] = useState("");
  const [mainCategoryOpen, setMainCategoryOpen] = useState(false);
  const [subcategoryOpen, setSubcategoryOpen] = useState(false);
  const [mainCategorySearch, setMainCategorySearch] = useState("");
  const [subcategorySearch, setSubcategorySearch] = useState("");
  const [sharedSubcategories, setSharedSubcategories] = useState([]);
  const [subcategoriesLoadingEdit, setSubcategoriesLoadingEdit] = useState(false);
  const [subcategoryErrorEdit, setSubcategoryErrorEdit] = useState("");
  const [savingSubcategory, setSavingSubcategory] = useState(false);
  const savingSubcategoryRef = useRef(false);

  // EDIT MODAL: UNIT CATEGORY & SIZE
  const [selectedUnitCategory, setSelectedUnitCategory] = useState("Weight");
  const [editUnitType, setEditUnitType] = useState("Qty");
  const [editSize, setEditSize] = useState("");

  // Plan Selection States for Basic & Premium
  const [selectedAllowedIds, setSelectedAllowedIds] = useState([]);
  const [selectionModalVisible, setSelectionModalVisible] = useState(false);
  const [tempSelectedIds, setTempSelectedIds] = useState([]);

  // Barcode Zoom Modal State
  const [barcodeModalVisible, setBarcodeModalVisible] = useState(false);
  const [selectedBarcode, setSelectedBarcode] = useState(null);
  const [selectedBarcodeItem, setSelectedBarcodeItem] = useState(null);

  // States for tracking selected Category or Brand view inside details
  const [activeTab, setActiveTab] = useState("menu");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState(null);
  const [mainCategories, setMainCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [subcategoriesLoading, setSubcategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState("");
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [promotions, setPromotions] = useState([]);
  const [promotionLoading, setPromotionLoading] = useState(false);
  const [promotionError, setPromotionError] = useState("");
  const [promotionName, setPromotionName] = useState("");
  const [promotionDescription, setPromotionDescription] = useState("");
  const [selectedPromoProduct, setSelectedPromoProduct] = useState(null);
  const [promoProductModalVisible, setPromoProductModalVisible] = useState(false);
  const [promotionEditing, setPromotionEditing] = useState(null);
  const [promotionSaving, setPromotionSaving] = useState(false);
  const [promotionFormError, setPromotionFormError] = useState("");
  const promotionSaveLock = useRef(false);

  // --- RESTOCK MODAL STATES ---
  const [restockModalVisible, setRestockModalVisible] = useState(false);
  const [restockItem, setRestockItem] = useState(null);
  const [restockQty, setRestockQty] = useState("1");
  const [restockPurchasePrice, setRestockPurchasePrice] = useState("");
  const [restockSupplier, setRestockSupplier] = useState("");

  // --- EXPIRED MODAL STATES ---
  const [expireModalVisible, setExpireModalVisible] = useState(false);
  const [expireItem, setExpireItem] = useState(null);
  const [expireQty, setExpireQty] = useState("1");
  const [expireDate, setExpireDate] = useState("");
  const [expireReason, setExpireReason] = useState("");
  const [isSubmittingExpire, setIsSubmittingExpire] = useState(false);
  const expireLockRef = useRef(false);

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
    cleanupOldSegmentedImages();
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe;

    const loadInventoryLive = async () => {
      setInventoryLoading(true);
      setInventoryError("");
      setItems([]);
      try {
        const session = await getSession();
        if (!active) return;
        if (!session?.uid) {
          setInventoryError("Sign in to view discounted products.");
          setInventoryLoading(false);
          return;
        }

        const userSnap = await getDoc(doc(db, "users", session.uid));
        if (!active) return;
        if (userSnap.exists()) {
          const uData = userSnap.data();
          const fetchedPlan = uData.userPlan || uData.subscriptionPlan || "Basic";
          setUserPlan(fetchedPlan);
          const savedAllowed = uData.selectedBasicProducts || [];
          setSelectedAllowedIds(savedAllowed);
          setTempSelectedIds(savedAllowed);
          if (uData.shopName) setShopName(uData.shopName);
        }

        const targetMode = appMode || "local";
        setCurrentMode(targetMode);

        const collectionName = targetMode === "global" ? "global_inventory" : "inventory";

        unsubscribe = onSnapshot(
          collection(db, "users", session.uid, collectionName),
          (snap) => {
            if (!active) return;
            const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setItems(data);
            setInventoryLoading(false);
            setInventoryError("");
          },
          (error) => {
            console.log("INVENTORY LOAD ERROR:", error.code, error.message);
            if (active) {
              setInventoryLoading(false);
              setInventoryError("Inventory could not be loaded. Check your connection and access.");
            }
          }
        );
      } catch (err) {
        console.log("Error loading inventory snapshot: ", err);
        if (active) {
          setInventoryLoading(false);
          setInventoryError(err.message || "Inventory could not be loaded.");
        }
      }
    };

    if (isFocused) {
      loadInventoryLive();
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [isFocused, appMode]);

  useEffect(() => {
    let active = true;
    let unsubscribe;
    if (!isFocused || activeTab !== "promotions") return undefined;
    const loadPromotions = async () => {
      setPromotionLoading(true);
      setPromotionError("");
      try {
        const session = await getSession();
        const ownerUid = session?.uid || auth.currentUser?.uid;
        if (!active) return;
        if (!ownerUid) throw new Error("Sign in to manage offers.");
        unsubscribe = onSnapshot(collection(db, "users", ownerUid, "promotions"), snapshot => {
          if (!active) return;
          setPromotions(snapshot.docs.map(promo => ({ id: promo.id, ...promo.data() })));
          setPromotionLoading(false);
        }, error => {
          console.log("PROMOTIONS LOAD ERROR:", error.code, error.message);
          if (active) {
            setPromotionError("Offers could not be loaded. Check your connection and access.");
            setPromotionLoading(false);
          }
        });
      } catch (error) {
        console.log("PROMOTIONS SESSION ERROR:", error);
        if (active) {
          setPromotionError(error.message || "Offers could not be loaded.");
          setPromotionLoading(false);
        }
      }
    };
    loadPromotions();
    return () => { active = false; unsubscribe?.(); };
  }, [isFocused, activeTab]);

  useEffect(() => {
    if (!isFocused) return undefined;
    let active = true;
    setCategoriesLoading(true);
    setCategoriesError("");
    const unsubscribe = onSnapshot(collection(db, "categories"), snapshot => {
      if (!active) return;
      setMainCategories(snapshot.docs.map(categoryDoc => ({ id: categoryDoc.id, ...categoryDoc.data() })));
      setCategoriesLoading(false);
    }, error => {
      console.log("INVENTORY MAIN CATEGORIES LOAD ERROR:", error.code, error.message);
      if (active) {
        setCategoriesError("Categories could not be loaded. Check your connection and access.");
        setCategoriesLoading(false);
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [isFocused]);

  // Listener for subcategories in Edit Product modal
  useEffect(() => {
    let active = true;
    if (!editMainCategory) {
      setSharedSubcategories([]);
      setEditSubcategory("");
      setSubcategoriesLoadingEdit(false);
      setSubcategoryErrorEdit("");
      return undefined;
    }

    setSharedSubcategories([]);
    setSubcategoryErrorEdit("");
    setSubcategoriesLoadingEdit(true);

    const unsubscribe = onSnapshot(
      collection(db, "categories", editMainCategory, "subcategories"),
      snapshot => {
        if (!active) return;
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setSharedSubcategories(data);
        setSubcategoriesLoadingEdit(false);
      },
      error => {
        if (active) {
          setSharedSubcategories([]);
          setEditSubcategory("");
          setSubcategoriesLoadingEdit(false);
          setSubcategoryErrorEdit("Could not load subcategories. Check connection.");
        }
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [editMainCategory]);

  const addSubcategoryFromSearch = async () => {
    const name = subcategorySearch.trim().replace(/\s+/g, " ");
    if (!name || !editMainCategory || savingSubcategoryRef.current) return;

    const normalizedName = name.toLocaleLowerCase();
    const existing = sharedSubcategories.find(subcategory =>
      String(subcategory.name || subcategory.categoryName || "").trim().replace(/\s+/g, " ").toLocaleLowerCase() === normalizedName
    );
    if (existing) {
      setEditSubcategory(existing.id);
      setSubcategorySearch("");
      setSubcategoryOpen(false);
      Keyboard.dismiss();
      return;
    }

    savingSubcategoryRef.current = true;
    setSavingSubcategory(true);
    setSubcategoryErrorEdit("");
    try {
      const subcategoriesRef = collection(db, "categories", editMainCategory, "subcategories");
      const latestSnapshot = await getDocs(subcategoriesRef);
      const duplicate = latestSnapshot.docs.find(subcategoryDoc => {
        const data = subcategoryDoc.data();
        return String(data.name || data.categoryName || "").trim().replace(/\s+/g, " ").toLocaleLowerCase() === normalizedName;
      });

      if (duplicate) {
        setEditSubcategory(duplicate.id);
      } else {
        const created = await addDoc(subcategoriesRef, { name, createdAt: serverTimestamp() });
        setSharedSubcategories(current => [...current, { id: created.id, name }]);
        setEditSubcategory(created.id);
      }
      setSubcategorySearch("");
      setSubcategoryOpen(false);
      Keyboard.dismiss();
    } catch (error) {
      setSubcategoryErrorEdit("Could not add subcategory. Check connection.");
    } finally {
      savingSubcategoryRef.current = false;
      setSavingSubcategory(false);
    }
  };

  useEffect(() => {
    if (!isFocused || activeTab !== "categories" || !selectedCategory?.id) {
      setSubcategories([]);
      setSubcategoriesLoading(false);
      return undefined;
    }
    let active = true;
    setSubcategoriesLoading(true);
    setCategoriesError("");
    const subcategoriesRef = collection(db, "categories", selectedCategory.id, "subcategories");
    const unsubscribe = onSnapshot(subcategoriesRef, snapshot => {
      if (!active) return;
      setSubcategories(snapshot.docs.map(subcategoryDoc => ({ id: subcategoryDoc.id, ...subcategoryDoc.data() })));
      setSubcategoriesLoading(false);
    }, error => {
      console.log("INVENTORY SUBCATEGORIES LOAD ERROR:", selectedCategory.id, error.code, error.message);
      if (active) {
        setCategoriesError("Subcategories could not be loaded. Check your connection and access.");
        setSubcategories([]);
        setSubcategoriesLoading(false);
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [isFocused, activeTab, selectedCategory?.id]);

  const saveSelectedProducts = async () => {
    const currentLimit = userPlan === "Premium" ? 200 : userPlan === "Basic" ? 10 : -1;
    if (currentLimit !== -1 && tempSelectedIds.length > currentLimit) {
      Alert.alert("Limit Exceeded", `${userPlan} plan-ku maximum ${currentLimit} products mattum thaan choose panna mudiyum!`);
      return;
    }
    try {
      const session = await getSession();
      if (!session?.uid) return;
      
      await updateDoc(doc(db, "users", session.uid), {
        selectedBasicProducts: tempSelectedIds
      });
      setSelectedAllowedIds(tempSelectedIds);
      setSelectionModalVisible(false);
      Alert.alert("Success ✅", `${userPlan} plan active products updated successfully!`);
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  };

  const openEdit = (item) => {
    setSelectedItem(item);
    setEditName(item.itemName || "");
    setEditPurchasePrice(String(item.purchasePrice ?? ""));
    setEditSalesPrice(String(item.originalSalesPrice ?? item.salesPrice ?? ""));
    setEditQty(String(item.quantity ?? ""));
    setEditBrand(item.brand || "");
    setEditDiscountValue(Number(item.discountValue) > 0 ? String(item.discountValue) : "");
    setEditDiscountType(item.discountType === "fixed" || item.discountType === "₹" ? "fixed" : "percent");
    setEditImage(item.image || "");
    setOriginalImage(item.image || "");
    setStudioImage(item.image && item.image.includes("bg_studio") ? item.image : "");
    setTransparentImage(item.image && item.image.includes("bg_removed") ? item.image : "");
    setIsRemovingBackground(false);
    setBgRemovalStatus("");

    // Populate Category & Subcategory
    setEditMainCategory(item.categoryId || "");
    setEditSubcategory(item.subcategoryId || "");
    setMainCategoryOpen(false);
    setSubcategoryOpen(false);
    setMainCategorySearch("");
    setSubcategorySearch("");
    setSubcategoryErrorEdit("");

    // Populate Unit & Size
    const unit = item.unitType || "Qty";
    setEditUnitType(unit);
    setEditSize(item.size || "");
    const foundCat = UNIT_CATEGORIES.find(c => c.units.includes(unit));
    setSelectedUnitCategory(foundCat ? foundCat.category : "Weight");

    // Populate HSN & Description
    setEditHsnCode(item.hsnCode || "");
    setEditDescription(item.description || "");
    setIsDescriptionManuallyEdited(Boolean(item.description));
    setHsnValidationMessage("");

    // Populate Online Sale setting (Default: true if missing or undefined)
    setEditIsOnlineSaleEnabled(item.isOnlineSaleEnabled !== false);

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

  const openExpireModal = (item) => {
    setExpireItem(item);
    setExpireQty("1");
    setExpireDate(new Date().toISOString().split("T")[0]);
    setExpireReason("Past shelf life / Damaged");
    setExpireModalVisible(true);
  };

  const handleConfirmExpire = async () => {
    let uid = auth.currentUser?.uid;
    if (!uid) {
      try {
        const session = await getSession();
        uid = session?.uid;
      } catch (_) {}
    }
    if (!uid || !expireItem) return;

    const qty = Number(expireQty) || 0;
    const availableStock = Number(expireItem.quantity) || 0;
    const pPrice = Number(expireItem.purchasePrice) >= 0 ? Number(expireItem.purchasePrice) : 0;
    const loss = calculateExpiredLoss(pPrice, qty);
    const remainingStock = Math.max(0, availableStock - qty);

    if (qty <= 0) {
      Alert.alert("Invalid Quantity", "Please enter a valid expired quantity greater than 0.");
      return;
    }
    if (qty > availableStock) {
      Alert.alert(
        "Quantity Exceeds Stock",
        `Expired quantity (${qty}) cannot exceed currently available stock (${availableStock} ${expireItem.unitType || "Qty"}).`
      );
      return;
    }

    Alert.alert(
      "Confirm Product Expiration",
      `Are you sure you want to mark ${qty} ${expireItem.unitType || "unit(s)"} of "${expireItem.itemName}" as expired?\n\n• Purchase Cost: ₹${pPrice.toFixed(2)} / unit\n• Total Loss: ₹${loss.toFixed(2)}\n• Remaining Stock: ${remainingStock} ${expireItem.unitType || "Qty"}\n\nInventory will be atomically reduced and financial loss recorded.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm Expired",
          style: "destructive",
          onPress: async () => {
            if (expireLockRef.current || isSubmittingExpire) return;
            expireLockRef.current = true;
            setIsSubmittingExpire(true);

            try {
              const result = await markProductAsExpired({
                db,
                uid,
                productId: expireItem.id,
                expiredQty: qty,
                expirationDate: expireDate.trim(),
                reason: expireReason.trim(),
                inventoryMode: currentMode,
              });

              setExpireModalVisible(false);
              expireLockRef.current = false;
              setIsSubmittingExpire(false);

              Alert.alert(
                "Expired Stock Recorded ✅",
                `Successfully marked ${result.expiredQuantity} ${expireItem.unitType || "units"} of "${expireItem.itemName}" as expired.\nTotal Loss: ₹${result.totalLoss.toFixed(2)}\nRemaining Stock: ${result.remainingQuantity} ${expireItem.unitType || "Qty"}.`
              );
            } catch (err) {
              expireLockRef.current = false;
              setIsSubmittingExpire(false);
              console.log("Expire Error:", err);
              Alert.alert("Expiration Failed ❌", err.message || "Failed to mark stock as expired.");
            }
          },
        },
      ]
    );
  };

  const handleAutoProcessImage = async (uri) => {
    if (!uri) return;
    const currentReqId = ++bgRequestIdRef.current;
    setOriginalImage(uri);
    setIsRemovingBackground(true);
    setBgRemovalStatus("Enhancing product photo…");

    try {
      const result = await removeProductBackground(uri, {
        backgroundMode: "studio",
        backgroundColor: "#FFFFFF",
        padding: 0.10,
        outputSize: 1024,
      });
      if (currentReqId === bgRequestIdRef.current) {
        const studio = result.studioUri || result.uri;
        const transparent = result.transparentUri || "";
        setStudioImage(studio);
        setTransparentImage(transparent);
        setEditImage(studio);
        setIsRemovingBackground(false);
        setBgRemovalStatus("");
      }
    } catch (err) {
      console.log("[InventoryScreen] Background removal error:", err);
      if (currentReqId === bgRequestIdRef.current) {
        setIsRemovingBackground(false);
        setBgRemovalStatus("");
        Alert.alert(
          "Product Photography Enhancement",
          `Could not enhance product photo automatically (${err.message || "Processing failed"}). Would you like to retry or keep the original photo?`,
          [
            {
              text: "Retry",
              onPress: () => handleAutoProcessImage(uri)
            },
            {
              text: "Use Original",
              onPress: () => setEditImage(uri)
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

  const promptPickProductImage = () => {
    Alert.alert(
      "Product Image",
      "Choose an option",
      [
        {
          text: "Take Photo",
          onPress: () => {
            launchCamera({ mediaType: "photo", quality: 0.8 }, (res) => {
              if (res.didCancel || res.errorCode) return;
              if (res.assets && res.assets.length > 0) {
                handleAutoProcessImage(res.assets[0].uri);
              }
            });
          }
        },
        {
          text: "Choose from Gallery",
          onPress: () => {
            launchImageLibrary({ mediaType: "photo", quality: 0.8 }, (res) => {
              if (res.didCancel || res.errorCode) return;
              if (res.assets && res.assets.length > 0) {
                handleAutoProcessImage(res.assets[0].uri);
              }
            });
          }
        },
        { text: "Cancel", style: "cancel" }
      ]
    );
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
      Alert.alert("Upload Failed", "Stored local URI due to error.");
      return localUri;
    }
  };

  const handleToggleOnlineSale = async (val) => {
    const prevVal = editIsOnlineSaleEnabled;
    setEditIsOnlineSaleEnabled(val);
    if (!selectedItem) return;

    setSavingOnlineSaleToggle(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Authentication required");
      const collectionName = currentMode === "global" ? "global_inventory" : "inventory";

      await updateDoc(
        doc(db, "users", user.uid, collectionName, selectedItem.id),
        {
          isOnlineSaleEnabled: val,
          updatedAt: serverTimestamp(),
        }
      );

      // Keep selectedItem in sync
      setSelectedItem((prev) => (prev ? { ...prev, isOnlineSaleEnabled: val } : prev));
      if (Platform.OS === "android") {
        ToastAndroid.show(
          `Online sale ${val ? "Enabled (ON)" : "Disabled (OFF)"}`,
          ToastAndroid.SHORT
        );
      }
    } catch (err) {
      console.error("Toggle online sale error:", err);
      setEditIsOnlineSaleEnabled(prevVal); // Rollback on failure
      Alert.alert(
        "Save Failed",
        "Could not update Online Sale setting: " + (err.message || "Unknown error")
      );
    } finally {
      setSavingOnlineSaleToggle(false);
    }
  };

  const saveEdit = async () => {
    if (isRemovingBackground) {
      Alert.alert("Please Wait", "Background removal is in progress. Please wait until processing completes.");
      return;
    }
    const user = auth.currentUser;
    if (!selectedItem) return;
    const collectionName = currentMode === "global" ? "global_inventory" : "inventory";
    const originalSalesPrice = Number(editSalesPrice);
    const discountValue = editDiscountValue.trim() === "" ? 0 : Number(editDiscountValue);
    const pricing = getEffectiveProductPrice({ originalSalesPrice, salesPrice: originalSalesPrice, discountValue, discountType: editDiscountType });
    if (!Number.isFinite(originalSalesPrice) || originalSalesPrice < 0) {
      Alert.alert("Invalid Sales Price", "Enter a valid sales price greater than or equal to ₹0.");
      return;
    }
    if (!pricing.valid) {
      Alert.alert("Invalid Discount", editDiscountType === "percent"
        ? "Enter a percentage from 0% to 100%."
        : "Discount cannot be greater than the sales price.");
      return;
    }
    const offerPrice = pricing.effectivePrice;

    const selectedMainCatData = mainCategories.find(c => c.id === editMainCategory);
    const selectedSubcatData = sharedSubcategories.find(s => s.id === editSubcategory);
    const savedCategoryName = selectedMainCatData?.name || selectedMainCatData?.categoryName || selectedItem.category || "General";
    const savedSubcategoryName = selectedSubcatData?.name || selectedSubcatData?.categoryName || selectedItem.subcategoryName || "";

    try {
      let finalImageUrl = editImage || selectedItem.image || "";
      if (editImage && !editImage.startsWith("http")) {
        finalImageUrl = await uploadImageToStorage(editImage);
      }

      await updateDoc(
        doc(db, "users", user.uid, collectionName, selectedItem.id),
        {
          itemName: editName,
          purchasePrice: Number(editPurchasePrice) || 0,
          salesPrice: originalSalesPrice,
          originalSalesPrice,
          discountValue,
          discountType: editDiscountType,
          offerPrice,
          quantity: Number(editQty) || 0,
          brand: editBrand,
          image: finalImageUrl,
          category: savedCategoryName,
          categoryId: editMainCategory || "",
          categoryName: savedCategoryName,
          subcategoryId: editSubcategory || "",
          subcategoryName: savedSubcategoryName,
          unitType: editUnitType || "Qty",
          size: editSize || "",
          hsnCode: (editHsnCode || "").trim(),
          description: (editDescription || "").trim(),
          isOnlineSaleEnabled: editIsOnlineSaleEnabled !== false,
          updatedAt: serverTimestamp()
        }
      );
      setModalVisible(false);
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  };

  // 🏷️ HSN helper functions for Edit Modal
  const handleEditHsnTextChange = (val) => {
    setEditHsnCode(val);
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

  useEffect(() => {
    if (!editHsnCode || !editHsnCode.trim()) {
      setHsnValidationMessage("");
      return;
    }
    const validation = validateHSNCode(editHsnCode);
    if (!validation.isValid) return;

    const timer = setTimeout(async () => {
      setHsnLookupLoading(true);
      try {
        const res = await lookupHSNCode(validation.code);
        if (res.found && res.description) {
          if (!isDescriptionManuallyEdited) {
            setEditDescription(res.description);
          }
        }
      } catch (e) {
        console.log("HSN lookup error in Inventory:", e);
      } finally {
        setHsnLookupLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [editHsnCode, isDescriptionManuallyEdited]);

  const handleOpenEditHsnSearch = async () => {
    const selectedCat = mainCategories.find(c => c.id === editMainCategory);
    const selectedSub = sharedSubcategories.find(s => s.id === editSubcategory);
    const catName = selectedCat?.name || selectedCat?.categoryName || "";
    const subName = selectedSub?.name || selectedSub?.categoryName || "";
    const queryToUse = editHsnCode || editName || subName || "";
    setHsnSearchQuery(queryToUse);
    setHsnSearchModalVisible(true);
    executeEditHsnSearch(queryToUse, catName, subName);
  };

  const executeEditHsnSearch = async (queryText, catName = "", subName = "") => {
    setHsnSearchLoading(true);
    try {
      const selectedCat = mainCategories.find(c => c.id === editMainCategory);
      const selectedSub = sharedSubcategories.find(s => s.id === editSubcategory);
      const currentCat = catName || selectedCat?.name || selectedCat?.categoryName || "";
      const currentSub = subName || selectedSub?.name || selectedSub?.categoryName || "";

      const results = await searchHSNByProductDetails({
        category: currentCat,
        subcategory: currentSub,
        brand: editBrand,
        productName: editName,
        query: queryText,
        limit: 30,
      });
      setHsnSearchResults(results);
    } catch (err) {
      console.log("HSN search error in Inventory:", err);
      setHsnSearchResults([]);
    } finally {
      setHsnSearchLoading(false);
    }
  };

  const handleSelectEditHsnResult = (item) => {
    setEditHsnCode(item.hsnCode);
    setEditDescription(item.description);
    setIsDescriptionManuallyEdited(false);
    setHsnValidationMessage("");
    setHsnSearchModalVisible(false);
  };

  const handleClearEditHsn = () => {
    setEditHsnCode("");
    setHsnValidationMessage("");
    if (!isDescriptionManuallyEdited) {
      setEditDescription("");
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

  const getCategoryLabel = category => String(category?.name || category?.categoryName || category?.id || "Unnamed category");
  const getSubcategoryLabel = subcategory => String(subcategory?.name || subcategory?.categoryName || subcategory?.subcategoryName || subcategory?.id || "Unnamed subcategory");
  const normalizeCategoryValue = value => String(value || "").trim().toLocaleLowerCase();
  const itemMatchesCategory = (item, category) => item.categoryId === category?.id ||
    normalizeCategoryValue(item.categoryName || item.category) === normalizeCategoryValue(getCategoryLabel(category));
  const itemMatchesSubcategory = (item, subcategory) => item.subcategoryId === subcategory?.id ||
    normalizeCategoryValue(item.subcategoryName || item.subcategory || item.subCategory) === normalizeCategoryValue(getSubcategoryLabel(subcategory));
  const categoriesList = mainCategories;

  const resetPromotionForm = (offer = null) => {
    setPromotionName(offer?.offerName || "");
    setPromotionDescription(offer?.description || "");
    setSelectedPromoProduct(offer?.productId ? items.find(i => i.id === offer.productId) || { id: offer.productId, itemName: offer.productName, image: offer.productImage } : null);
    setPromotionEditing(offer);
    setPromotionFormError("");
  };

  const savePromotion = async () => {
    if (promotionSaveLock.current) return;
    let error = "";
    if (!promotionName.trim()) error = "Enter an offer name.";
    else if (!promotionDescription.trim()) error = "Enter a promotion description.";
    if (error) { setPromotionFormError(error); return; }

    promotionSaveLock.current = true;
    setPromotionSaving(true);
    setPromotionFormError("");
    try {
      const session = await getSession();
      const ownerUid = session?.uid || auth.currentUser?.uid;
      if (!ownerUid) throw new Error("Sign in to save offers.");
      const offersRef = collection(db, "users", ownerUid, "promotions");
      const offerData = {
        offerName: promotionName.trim(),
        description: promotionDescription.trim(),
        promotionScope: "shop",
        productId: selectedPromoProduct?.id || null,
        productName: selectedPromoProduct?.itemName || null,
        productImage: selectedPromoProduct?.image || null,
        updatedAt: serverTimestamp(),
      };
      if (promotionEditing?.createdAt) offerData.createdAt = promotionEditing.createdAt;
      else offerData.createdAt = serverTimestamp();
      if (promotionEditing?.id) await updateDoc(doc(db, "users", ownerUid, "promotions", promotionEditing.id), offerData);
      else await addDoc(offersRef, offerData);
      Alert.alert("Promotion sent", "Your shop promotion was saved successfully.");
      setPromotionName("");
      setPromotionDescription("");
      setSelectedPromoProduct(null);
      setPromotionEditing(null);
    } catch (saveError) {
      console.log("PROMOTION SAVE ERROR:", saveError.code, saveError.message);
      setPromotionFormError(saveError.message || "Offer could not be saved. Please try again.");
    } finally {
      promotionSaveLock.current = false;
      setPromotionSaving(false);
    }
  };

  const removeOffer = offer => Alert.alert("Delete offer", `Delete “${offer.offerName}”?`, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: async () => {
      try {
        const session = await getSession();
        const ownerUid = session?.uid || auth.currentUser?.uid;
        if (!ownerUid) throw new Error("Sign in to manage offers.");
        await deleteDoc(doc(db, "users", ownerUid, "promotions", offer.id));
      } catch (error) { Alert.alert("Delete failed", error.message || "Please try again."); }
    } },
  ]);

  const removeProductDiscount = product => Alert.alert(
    "Remove Discount",
    `Remove the discount from “${product.itemName || "this product"}”?`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove Discount",
        style: "destructive",
        onPress: async () => {
          try {
            const session = await getSession();
            const ownerUid = session?.uid || auth.currentUser?.uid;
            if (!ownerUid) throw new Error("Sign in to manage product discounts.");
            const originalPrice = Number(product.originalSalesPrice ?? product.salesPrice);
            if (!Number.isFinite(originalPrice) || originalPrice < 0) {
              throw new Error("This product has an invalid original selling price. Correct it before removing the discount.");
            }
            const collectionName = currentMode === "global" ? "global_inventory" : "inventory";
            await updateDoc(doc(db, "users", ownerUid, collectionName, product.id), {
              salesPrice: originalPrice,
              originalSalesPrice: originalPrice,
              discountValue: 0,
              discountType: deleteField(),
              offerPrice: deleteField(),
              updatedAt: serverTimestamp()
            });
            setItems(previous => previous.map(item => {
              if (item.id !== product.id) return item;
              const { discountType, offerPrice, ...rest } = item;
              return { ...rest, salesPrice: originalPrice, originalSalesPrice: originalPrice, discountValue: 0 };
            }));
            Alert.alert("Discount Removed", "The product selling price has been restored.");
          } catch (error) {
            console.log("PRODUCT DISCOUNT REMOVE ERROR:", error.code, error.message);
            Alert.alert("Could Not Remove Discount", error.message || "Please try again.");
          }
        }
      }
    ]
  );

  const openPromotionForm = offer => resetPromotionForm(offer);
  const shopPromotions = promotions.filter(offer => offer.promotionScope === "shop" || (!offer.promotionScope && typeof offer.description === "string"));
  const discountedProducts = items.reduce((result, product) => {
    const pricing = getEffectiveProductPrice(product);
    const hasRecordedStock = product?.quantity != null && product.quantity !== "";
    const outOfStock = hasRecordedStock && Number.isFinite(Number(product.quantity)) && Number(product.quantity) <= 0;
    if (pricing.valid && pricing.hasDiscount && !outOfStock) result.push({ product, pricing });
    return result;
  }, []);

  // --- BRAND PERFORMANCE ANALYTICS ---
  const brandsAnalytics = useMemo(() => {
    const stats = {};
    items.forEach((item) => {
      const brandName = item.brand?.trim() || "No Brand";
      const qty = Number(item.quantity) || 0;
      const pPrice = Number(item.purchasePrice) || 0;
      const itemPricing = getEffectiveProductPrice(item);
      const sPrice = itemPricing.valid ? itemPricing.effectivePrice : (Number(item.salesPrice) || 0);

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
    const q = String(searchText || "").toLowerCase();

    if (selectedCategory) {
      if (!itemMatchesCategory(item, selectedCategory)) return false;
    }

    if (selectedSubcategory && !itemMatchesSubcategory(item, selectedSubcategory)) {
      return false;
    }

    if (selectedBrand) {
      const itemBrand = item.brand || "No Brand";
      if (itemBrand !== selectedBrand) return false;
    }

    if (activeTab === "lowStock") {
      if ((item.quantity || 0) > 5) return false;
    }

    return (
      String(item.itemName || "").toLowerCase().includes(q) ||
      String(item.brand || "").toLowerCase().includes(q) ||
      (item.barcode || "").toString().toLowerCase().includes(q) ||
      String(item.categoryName || item.category || "").toLowerCase().includes(q) ||
      String(item.subcategoryName || item.subcategory || item.subCategory || "").toLowerCase().includes(q)
    );
  });

  const handleBackPress = () => {
    if (selectedSubcategory) {
      setSelectedSubcategory(null);
      setSearchText("");
    } else if (selectedCategory) {
      setSelectedCategory(null);
      setSearchText("");
    } else if (selectedBrand) {
      setSelectedBrand(null);
    } else {
      setActiveTab("menu");
      setSelectedCategory(null);
      setSelectedBrand(null);
    }
  };

  const editOriginalPrice = Number(editSalesPrice);
  const editDiscountNumber = editDiscountValue.trim() === "" ? 0 : Number(editDiscountValue);
  const editPricing = getEffectiveProductPrice({ originalSalesPrice: editOriginalPrice, salesPrice: editOriginalPrice, discountValue: editDiscountNumber, discountType: editDiscountType });
  const editOfferPrice = editPricing.valid ? editPricing.effectivePrice : null;

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
            {selectedSubcategory
              ? getSubcategoryLabel(selectedSubcategory)
              : selectedCategory
              ? getCategoryLabel(selectedCategory)
              : selectedBrand
              ? selectedBrand
              : activeTab === "menu"
              ? "Inventory"
              : activeTab === "lowStock"
              ? "LOW STOCK"
              : activeTab === "expired"
              ? "EXPIRED PRODUCTS"
              : activeTab.toUpperCase()}
          </Text>
        </View>

        {/* Professional Header Action: Green Choose Button replacing Plan Badge */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {((userPlan === "Basic" && items.length > 10) || (userPlan === "Premium" && items.length > 200)) && (
            <TouchableOpacity 
              onPress={() => {
                setTempSelectedIds(selectedAllowedIds);
                setSelectionModalVisible(true);
              }}
              style={{ 
                backgroundColor: "#10b981", 
                paddingHorizontal: 12, 
                paddingVertical: 7, 
                borderRadius: 12,
                flexDirection: "row",
                alignItems: "center",
                shadowColor: "#000",
                shadowOpacity: 0.15,
                shadowRadius: 4,
                elevation: 3
              }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "bold" }}>
                ⚙️ Choose {userPlan === "Basic" ? "10" : "200"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
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
                <Text style={[styles.menuSub, { color: theme.subText }]}>
                  Manage products ({userPlan === "Pro" ? "Unlimited" : userPlan === "Premium" ? `${items.length}/200` : `${items.length}/10`})
                </Text>
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

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <TouchableOpacity style={styles.menuItem} onPress={() => { resetPromotionForm(); setActiveTab("promotions"); }}>
              <View style={[styles.menuIconBox, { backgroundColor: darkMode ? "#064e3b" : "#ecfdf5" }]}>
                <MaterialCommunityIcons name="tag-heart-outline" size={20} color="#16a34a" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.menuTitle, { color: theme.text }]}>Promotions</Text>
                <Text style={[styles.menuSub, { color: theme.subText }]}>Create and manage shop promotions</Text>
              </View>
              <Text style={{ color: theme.subText, fontSize: 18 }}>›</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {activeTab === "promotions" && (
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: isLandscape ? 120 : 135 }}>
          <View style={{ padding: 16, marginBottom: 14, borderRadius: 16, borderWidth: 1, borderColor: darkMode ? "#166534" : "#bbf7d0", backgroundColor: darkMode ? "#10261e" : "#f0fdf4" }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 13 }}>
              <MaterialCommunityIcons name="storefront-outline" size={23} color="#16a34a" />
              <Text style={{ marginLeft: 9, color: theme.text, fontSize: 16, fontWeight: "800" }}>{promotionEditing ? "Edit Shop Promotion" : "Shop Promotion"}</Text>
            </View>
            <Text style={{ color: theme.subText, fontSize: 11, fontWeight: "700", marginBottom: 5 }}>Offer Name</Text>
            <TextInput value={promotionName} onChangeText={setPromotionName} placeholder="e.g. Weekend Special" placeholderTextColor={theme.subText} style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]} />
            
            <Text style={{ color: theme.subText, fontSize: 11, fontWeight: "700", marginTop: 5, marginBottom: 5 }}>Select Product (Optional)</Text>
            <TouchableOpacity 
              onPress={() => setPromoProductModalVisible(true)}
              style={[styles.input, { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <Text style={{ color: selectedPromoProduct ? theme.text : theme.subText, fontSize: 14 }}>
                {selectedPromoProduct?.itemName || "Select a product for this promotion"}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={20} color={theme.subText} />
            </TouchableOpacity>

            <Text style={{ color: theme.subText, fontSize: 11, fontWeight: "700", marginTop: 5, marginBottom: 5 }}>Description</Text>
            <TextInput value={promotionDescription} onChangeText={setPromotionDescription} placeholder="Explain the promotion to your customers" placeholderTextColor={theme.subText} multiline textAlignVertical="top" style={[styles.input, { minHeight: 92, color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]} />
            {!!promotionFormError && <Text style={{ marginTop: 9, color: "#b91c1c", fontSize: 12 }}>{promotionFormError}</Text>}
            <TouchableOpacity disabled={promotionSaving} onPress={savePromotion} style={{ minHeight: 46, marginTop: 13, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: promotionSaving ? "#86efac" : "#16a34a" }}>
              {promotionSaving ? <ActivityIndicator color="#ffffff" /> : <Text style={{ color: "#ffffff", fontSize: 14, fontWeight: "800" }}>Send Promotion</Text>}
            </TouchableOpacity>
            {promotionEditing && <TouchableOpacity onPress={() => resetPromotionForm()} style={{ alignSelf: "center", padding: 9, marginTop: 3 }}><Text style={{ color: theme.subText, fontSize: 12 }}>Cancel edit</Text></TouchableOpacity>}
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800" }}>Discounted Products</Text>
            {inventoryLoading && <ActivityIndicator size="small" color="#16a34a" />}
          </View>
          {!!inventoryError && <Text style={{ padding: 11, marginBottom: 8, borderRadius: 10, color: "#b91c1c", backgroundColor: darkMode ? "#450a0a" : "#fef2f2", fontSize: 12 }}>{inventoryError}</Text>}
          {!inventoryLoading && !inventoryError && discountedProducts.length === 0 && (
            <View style={{ padding: 18, marginBottom: 15, alignItems: "center", borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card }}>
              <MaterialCommunityIcons name="tag-off-outline" size={27} color={theme.subText} />
              <Text style={{ marginTop: 7, color: theme.subText, fontSize: 12 }}>No discounted products in this inventory.</Text>
            </View>
          )}
          {discountedProducts.map(({ product, pricing }) => {
            const stock = Number(product.quantity);
            const discountBadge = pricing.discountType === "percent"
              ? `${pricing.discountValue}% OFF`
              : `₹${pricing.discountAmount.toFixed(2)} OFF`;
            return (
              <View key={product.id} style={{ flexDirection: "row", alignItems: "center", padding: 12, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card }}>
                {product.image ? (
                  <Image source={{ uri: product.image }} style={{ width: 58, height: 62, borderRadius: 10, backgroundColor: darkMode ? "#0f172a" : "#f1f5f9" }} resizeMode="cover" />
                ) : (
                  <View style={{ width: 58, height: 62, borderRadius: 10, justifyContent: "center", alignItems: "center", backgroundColor: darkMode ? "#0f172a" : "#f1f5f9" }}><MaterialCommunityIcons name="package-variant-closed" size={26} color={theme.subText} /></View>
                )}
                <View style={{ flex: 1, marginLeft: 11 }}>
                  <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontWeight: "800" }}>{product.itemName || "Unnamed product"}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
                    <Text style={{ marginRight: 7, color: theme.subText, fontSize: 11, textDecorationLine: "line-through" }}>₹{pricing.originalPrice.toFixed(2)}</Text>
                    <Text style={{ color: "#16a34a", fontSize: 14, fontWeight: "900" }}>₹{pricing.effectivePrice.toFixed(2)}</Text>
                    <View style={{ marginLeft: 7, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: darkMode ? "#064e3b" : "#dcfce7" }}>
                      <Text style={{ color: "#16a34a", fontSize: 9, fontWeight: "800" }}>{discountBadge}</Text>
                    </View>
                  </View>
                  <Text style={{ marginTop: 4, color: stock <= 0 ? "#dc2626" : theme.subText, fontSize: 10 }}>
                    {Number.isFinite(stock) ? (stock <= 0 ? "Out of stock" : `${stock} ${product.unitType || "Qty"} available`) : "Stock unavailable"}
                  </Text>
                  <TouchableOpacity onPress={() => removeProductDiscount(product)} style={{ alignSelf: "flex-start", marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: darkMode ? "#7f1d1d" : "#fecaca", backgroundColor: darkMode ? "#450a0a" : "#fef2f2" }}>
                    <Text style={{ color: darkMode ? "#fca5a5" : "#b91c1c", fontSize: 11, fontWeight: "800" }}>Remove Discount</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 9, marginTop: 15 }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800" }}>Saved Shop Promotions</Text>
            {promotionLoading && <ActivityIndicator size="small" color="#16a34a" />}
          </View>
          {!!promotionError && <Text style={{ padding: 11, marginBottom: 8, borderRadius: 10, color: "#b91c1c", backgroundColor: darkMode ? "#450a0a" : "#fef2f2", fontSize: 12 }}>{promotionError}</Text>}
          {!promotionLoading && !promotionError && shopPromotions.length === 0 && (
            <View style={{ padding: 18, marginBottom: 15, alignItems: "center", borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card }}>
              <MaterialCommunityIcons name="tag-off-outline" size={27} color={theme.subText} />
              <Text style={{ marginTop: 7, color: theme.subText, fontSize: 12 }}>No promotions created yet</Text>
            </View>
          )}
          {shopPromotions.map(offer => (
            <View key={offer.id} style={styles.card}>
              <View style={{ flexDirection: "row", width: "100%", alignItems: "center" }}>
                <View style={styles.leftSection}>
                  {offer.productImage ? (
                    <Image source={{ uri: offer.productImage }} style={styles.image} resizeMode="cover" />
                  ) : (
                    <View style={[styles.image, { backgroundColor: darkMode ? "#064e3b" : "#dcfce7", justifyContent: "center", alignItems: "center" }]}>
                      <MaterialCommunityIcons name="tag-heart-outline" size={26} color="#16a34a" />
                    </View>
                  )}
                </View>

                <View style={styles.details}>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                    {offer.offerName || "Untitled Promotion"}
                  </Text>
                  {offer.productName && (
                    <View style={[styles.brandTag, { backgroundColor: "#10b981" }]}>
                      <Text style={styles.brandText}>📦 {offer.productName}</Text>
                    </View>
                  )}
                  <Text numberOfLines={2} style={{ marginTop: 4, color: theme.subText, fontSize: 12, lineHeight: 16 }}>
                    {offer.description || "No description"}
                  </Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.editBtn} onPress={() => openPromotionForm(offer)}>
                  <MaterialCommunityIcons name="pencil" size={16} color="#fff" />
                  <Text style={styles.btnText}> Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.deleteBtn} onPress={() => removeOffer(offer)}>
                  <MaterialCommunityIcons name="delete" size={16} color="#fff" />
                  <Text style={styles.btnText}> Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* SELECT PROMOTION PRODUCT MODAL */}
      <Modal visible={promoProductModalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={[styles.modalBox, { backgroundColor: theme.card, maxHeight: "80%" }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>📦 Select Promotion Product</Text>
            
            <TouchableOpacity 
              onPress={() => { setSelectedPromoProduct(null); setPromoProductModalVisible(false); }}
              style={{ padding: 12, backgroundColor: darkMode ? "#1e293b" : "#f1f5f9", borderRadius: 10, marginBottom: 8 }}
            >
              <Text style={{ color: theme.text, fontWeight: "700" }}>❌ None (General Shop Promotion)</Text>
            </TouchableOpacity>

            <ScrollView style={{ maxHeight: 300 }}>
              {items.map(prod => {
                const isChosen = selectedPromoProduct?.id === prod.id;
                return (
                  <TouchableOpacity
                    key={prod.id}
                    onPress={() => { setSelectedPromoProduct(prod); setPromoProductModalVisible(false); }}
                    style={{ flexDirection: "row", alignItems: "center", padding: 10, backgroundColor: isChosen ? (darkMode ? "#1e3a8a" : "#eff6ff") : (darkMode ? "#1e293b" : "#f8fafc"), borderRadius: 10, marginBottom: 6, borderWidth: 1, borderColor: isChosen ? "#3b82f6" : theme.border }}
                  >
                    {prod.image ? (
                      <Image source={{ uri: prod.image }} style={{ width: 40, height: 40, borderRadius: 8, marginRight: 10 }} />
                    ) : (
                      <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: "#ccc", justifyContent: "center", alignItems: "center", marginRight: 10 }}><Text>📦</Text></View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: "bold", fontSize: 13 }} numberOfLines={1}>{prod.itemName}</Text>
                      <Text style={{ color: theme.subText, fontSize: 11 }}>₹{prod.salesPrice || 0} • {prod.brand || "No Brand"}</Text>
                    </View>
                    {isChosen && <Text style={{ fontSize: 16 }}>✅</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={[styles.cancelBtn, { marginTop: 12 }]} onPress={() => setPromoProductModalVisible(false)}>
              <Text style={styles.btnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 2. CATEGORIES LIST VIEW */}
      {activeTab === "categories" && !selectedCategory && (
        <ScrollView contentContainerStyle={{ paddingBottom: isLandscape ? 120 : 135 }}>
          <View style={isLandscape ? styles.tabletGridContainer : null}>
            {categoriesLoading && <ActivityIndicator size="small" color="#16a34a" style={{ marginVertical: 20 }} />}
            {!!categoriesError && <Text style={{ padding: 12, color: "#b91c1c", backgroundColor: darkMode ? "#450a0a" : "#fef2f2", borderRadius: 10 }}>{categoriesError}</Text>}
            {!categoriesLoading && !categoriesError && categoriesList.length === 0 && <Text style={{ padding: 18, color: theme.subText, textAlign: "center" }}>No categories found.</Text>}
            {!categoriesError && categoriesList.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.subCard, isLandscape && styles.tabletHalfCard, { backgroundColor: theme.card }]}
                onPress={() => { setSelectedCategory(cat); setSelectedSubcategory(null); setSearchText(""); setCategoriesError(""); }}
              >
                <Text style={[styles.menuTitle, { color: theme.text }]}>📂 {getCategoryLabel(cat)}</Text>
                <Text style={{ color: theme.subText, fontSize: 12, marginTop: 4 }}>
                  Products count: {items.filter(item => itemMatchesCategory(item, cat)).length}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {activeTab === "categories" && selectedCategory && !selectedSubcategory && (
        <ScrollView contentContainerStyle={{ paddingBottom: isLandscape ? 120 : 135 }}>
          <View style={isLandscape ? styles.tabletGridContainer : null}>
            {subcategoriesLoading && <ActivityIndicator size="small" color="#16a34a" style={{ marginVertical: 20 }} />}
            {!!categoriesError && <Text style={{ padding: 12, color: "#b91c1c", backgroundColor: darkMode ? "#450a0a" : "#fef2f2", borderRadius: 10 }}>{categoriesError}</Text>}
            {!subcategoriesLoading && !categoriesError && subcategories.length === 0 && <View style={[styles.subCard, { backgroundColor: theme.card }]}><Text style={{ color: theme.text, fontWeight: "700" }}>No subcategories found</Text><Text style={{ marginTop: 4, color: theme.subText, fontSize: 12 }}>There are no subcategories under {getCategoryLabel(selectedCategory)}.</Text></View>}
            {!categoriesError && subcategories.map(subcategory => (
              <TouchableOpacity
                key={subcategory.id}
                style={[styles.subCard, isLandscape && styles.tabletHalfCard, { backgroundColor: theme.card }]}
                onPress={() => { setSelectedSubcategory(subcategory); setSearchText(""); }}
              >
                <Text style={[styles.menuTitle, { color: theme.text }]}>📂 {getSubcategoryLabel(subcategory)}</Text>
                <Text style={{ color: theme.subText, fontSize: 12, marginTop: 4 }}>
                  Products count: {items.filter(item => itemMatchesCategory(item, selectedCategory) && itemMatchesSubcategory(item, subcategory)).length}
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
        selectedSubcategory ||
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
            keyExtractor={(item, index) => item.id || index.toString()}
            numColumns={isLandscape ? 2 : 1}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 2, paddingBottom: isLandscape ? 180 : 135 }}
            ListEmptyComponent={<Text style={{ padding: 20, color: theme.subText, textAlign: "center" }}>{selectedSubcategory ? "No products found in this subcategory." : "No products found."}</Text>}
                    renderItem={({ item, index }) => {
              const itemPricing = getEffectiveProductPrice(item);
              const shownPrice = itemPricing.valid ? itemPricing.effectivePrice : Number(item.salesPrice) || 0;
              const planLimit = userPlan === "Pro" ? -1 : userPlan === "Premium" ? 200 : 10;
              
              // Dynamic locking logic based on Plan & User-Selected Allowed Products
              const isLocked = planLimit !== -1 && items.length > planLimit && (
                selectedAllowedIds.length > 0 
                  ? !selectedAllowedIds.includes(item.id) 
                  : index >= planLimit
              );

              return (
                <View
                  style={[
                    styles.card,
                    isLandscape && styles.tabletGridCard,
                    { backgroundColor: theme.card },
                    item.quantity <= 5 && { borderColor: "red", borderWidth: 1 },
                    isLocked && { opacity: 0.55 }
                  ]}
                >
                  {/* Plan Expired / Limit Reached Overlay Banner */}
                  {isLocked && (
                    <View style={styles.lockedOverlay}>
                      <TouchableOpacity 
                        style={styles.upgradeNoticeBox}
                        onPress={() => navigation.navigate("Subscription")}
                      >
                        <Text style={styles.lockedText}>🔒 Plan Limit / Expiry Reached</Text>
                        <Text style={styles.upgradeNoticeText}>Upgrade plan or select this in your active limit</Text>
                      </TouchableOpacity>
                    </View>
                  )}

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
                      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                        <View style={styles.brandTag}>
                          <Text style={styles.brandText}>{item.brand || "No Brand"}</Text>
                        </View>
                        {item.size ? (
                          <View style={[styles.brandTag, { backgroundColor: darkMode ? "#064e3b" : "#ecfdf3" }]}>
                            <Text style={[styles.brandText, { color: "#16a34a" }]}>
                              {["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Free Size"].includes(item.unitType) ? `Size: ${item.size}` : `${item.size}${item.unitType && item.unitType !== "Qty" ? ` ${item.unitType}` : ""}`}
                            </Text>
                          </View>
                        ) : null}
                        {item.isOnlineSaleEnabled === false && (
                          <View style={[styles.brandTag, { backgroundColor: darkMode ? "#450a0a" : "#fee2e2" }]}>
                            <Text style={[styles.brandText, { color: "#dc2626", fontWeight: "700" }]}>
                              🌐 Online: OFF
                            </Text>
                          </View>
                        )}
                      </View>
                      {itemPricing.valid && itemPricing.hasDiscount ? (
                        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
                          <Text style={{ color: theme.subText, fontSize: 11, textDecorationLine: "line-through", marginRight: 6 }}>₹ {itemPricing.originalPrice.toFixed(2)}</Text>
                          <Text style={[styles.price, { color: "#16a34a", marginTop: 0 }]}>₹ {shownPrice.toFixed(2)}</Text>
                          <View style={{ marginLeft: 6, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: darkMode ? "#064e3b" : "#dcfce7" }}>
                            <Text style={{ color: "#16a34a", fontSize: 9, fontWeight: "800" }}>{itemPricing.discountType === "percent" ? `${itemPricing.discountValue}% OFF` : `₹${itemPricing.discountAmount.toFixed(2)} OFF`}</Text>
                          </View>
                        </View>
                      ) : <Text style={[styles.price, { color: theme.text }]}>₹ {shownPrice}</Text>}
                      {item.quantity <= 5 && item.quantity > 0 && (
                        <Text style={{ color: "orange", fontWeight: "bold", marginTop: 4, fontSize: 11 }}>
                          ⚠ Low Stock
                        </Text>
                      )}
                      {item.quantity === 0 && (
                        <Text style={{ color: "red", fontWeight: "bold", marginTop: 4, fontSize: 11 }}>
                          ‼ Out Of Stock
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
                        if (!isLocked) {
                          setSelectedBarcode(item.barcode);
                          setSelectedBarcodeItem(item);
                          setBarcodeModalVisible(true);
                        }
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
                    {activeTab === "restock" ? (
                      <>
                        <TouchableOpacity
                          style={[styles.editBtn, { backgroundColor: "#10b981" }, isLocked && { backgroundColor: "#94a3b8" }]}
                          disabled={isLocked}
                          onPress={() => openRestockModal(item)}
                        >
                          <MaterialCommunityIcons name="plus-box" size={16} color="#fff" />
                          <Text style={styles.btnText}> Restock</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={[styles.editBtn, { backgroundColor: "#ef4444" }, (isLocked || (item.quantity || 0) <= 0) && { backgroundColor: "#94a3b8" }]} 
                          disabled={isLocked || (item.quantity || 0) <= 0}
                          onPress={() => openExpireModal(item)}
                        >
                          <MaterialCommunityIcons name="calendar-remove" size={15} color="#fff" />
                          <Text style={styles.btnText}> Expire</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        {activeTab === "lowStock" ? (
                          <TouchableOpacity
                            style={[styles.editBtn, { backgroundColor: "#10b981" }, isLocked && { backgroundColor: "#94a3b8" }]}
                            disabled={isLocked}
                            onPress={() => openRestockModal(item)}
                          >
                            <MaterialCommunityIcons name="plus-box" size={16} color="#fff" />
                            <Text style={styles.btnText}> Restock</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity 
                            style={[styles.editBtn, isLocked && { backgroundColor: "#94a3b8" }]} 
                            disabled={isLocked}
                            onPress={() => openEdit(item)}
                          >
                            <MaterialCommunityIcons name="pencil" size={16} color="#fff" />
                            <Text style={styles.btnText}> Edit</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity 
                          style={[styles.editBtn, { backgroundColor: "#ef4444" }, (isLocked || (item.quantity || 0) <= 0) && { backgroundColor: "#94a3b8" }]} 
                          disabled={isLocked || (item.quantity || 0) <= 0}
                          onPress={() => openExpireModal(item)}
                        >
                          <MaterialCommunityIcons name="calendar-remove" size={15} color="#fff" />
                          <Text style={styles.btnText}> Expire</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    <TouchableOpacity 
                      style={[styles.deleteBtn, isLocked && { backgroundColor: "#94a3b8" }]} 
                      disabled={isLocked}
                      onPress={() => deleteItem(item.id)}
                    >
                      <MaterialCommunityIcons name="delete" size={16} color="#fff" />
                      <Text style={styles.btnText}> Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        </>
      )}

      {/* PLAN PRODUCTS SELECTION MODAL (Dynamic for Basic (10) & Premium (200)) */}
      <Modal visible={selectionModalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={[styles.modalBox, { backgroundColor: theme.card, maxHeight: "80%" }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              📌 Choose Active Products for {userPlan} Plan
            </Text>
            <Text style={{ color: theme.subText, fontSize: 12, marginBottom: 10 }}>
              Selected: {tempSelectedIds.length} / {userPlan === "Basic" ? 10 : 200}
            </Text>

            <ScrollView style={{ maxHeight: 300, marginBottom: 12 }}>
              {items.map((prod) => {
                const isSelected = tempSelectedIds.includes(prod.id);
                const maxAllowed = userPlan === "Basic" ? 10 : 200;
                return (
                  <TouchableOpacity
                    key={prod.id}
                    onPress={() => {
                      if (isSelected) {
                        setTempSelectedIds(tempSelectedIds.filter(id => id !== prod.id));
                      } else {
                        if (tempSelectedIds.length >= maxAllowed) {
                          Alert.alert("Limit Reached", `You can only select up to ${maxAllowed} products for the ${userPlan} plan.`);
                          return;
                        }
                        setTempSelectedIds([...tempSelectedIds, prod.id]);
                      }
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 10,
                      backgroundColor: isSelected ? (darkMode ? "#1e3a8a" : "#eff6ff") : (darkMode ? "#1e293b" : "#f8fafc"),
                      borderRadius: 10,
                      marginBottom: 6,
                      borderWidth: 1,
                      borderColor: isSelected ? "#3b82f6" : theme.border
                    }}
                  >
                    <Text style={{ fontSize: 16, marginRight: 10 }}>{isSelected ? "✅" : "⬜"}</Text>
                    <Text style={{ color: theme.text, fontSize: 14, flex: 1 }} numberOfLines={1}>
                      {prod.itemName || "No Name"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={{ flexDirection: "row" }}>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: "#10b981" }]}
                onPress={saveSelectedProducts}
              >
                <Text style={styles.btnText}>Save Selection</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelectionModalVisible(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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

      {/* EXPIRED MODAL */}
      <Modal visible={expireModalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={[styles.modalBox, { backgroundColor: theme.card }]}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <MaterialCommunityIcons name="calendar-remove" size={22} color="#ef4444" style={{ marginRight: 8 }} />
              <Text style={[styles.modalTitle, { color: theme.text, marginBottom: 0 }]} numberOfLines={1}>
                Mark Expired: {expireItem?.itemName || "Item"}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: darkMode ? "#0f172a" : "#f8fafc",
                marginBottom: 12,
              }}
            >
              <Image
                source={{ uri: expireItem?.image || "https://via.placeholder.com/150" }}
                style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: "#e2e8f0" }}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: theme.text }} numberOfLines={1}>
                  {expireItem?.itemName}
                </Text>
                <Text style={{ fontSize: 12, color: theme.subText }}>
                  Current In-Stock:{" "}
                  <Text style={{ fontWeight: "bold", color: "#10b981" }}>
                    {expireItem?.quantity || 0} {expireItem?.unitType || "Qty"}
                  </Text>
                </Text>
                <Text style={{ fontSize: 12, color: theme.subText }}>
                  Purchase Cost:{" "}
                  <Text style={{ fontWeight: "bold", color: "#ef4444" }}>
                    ₹ {Number(expireItem?.purchasePrice || 0).toFixed(2)} / unit
                  </Text>
                </Text>
              </View>
            </View>

            <Text style={{ fontSize: 12, fontWeight: "700", color: theme.subText, marginBottom: 4 }}>
              Quantity to Mark as Expired *
            </Text>
            <TextInput
              placeholder="Quantity"
              placeholderTextColor="#888"
              value={expireQty}
              onChangeText={setExpireQty}
              keyboardType="numeric"
              style={[styles.input, { color: theme.text }]}
            />

            {/* Live Financial Loss Calculation Card */}
            <View
              style={{
                padding: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: darkMode ? "#7f1d1d" : "#fca5a5",
                backgroundColor: darkMode ? "#450a0a" : "#fee2e2",
                marginBottom: 10,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#ef4444" }}>Total Loss:</Text>
                <Text style={{ fontSize: 16, fontWeight: "900", color: "#ef4444" }}>
                  ₹ {calculateExpiredLoss(expireItem?.purchasePrice, expireQty).toFixed(2)}
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: darkMode ? "#fca5a5" : "#b91c1c", marginTop: 2 }}>
                Formula: ₹{Number(expireItem?.purchasePrice || 0).toFixed(2)} × {Number(expireQty) || 0} = ₹{calculateExpiredLoss(expireItem?.purchasePrice, expireQty).toFixed(2)}
              </Text>
              <Text style={{ fontSize: 11, color: darkMode ? "#cbd5e1" : "#475569", marginTop: 2 }}>
                Remaining Stock: {Math.max(0, (Number(expireItem?.quantity) || 0) - (Number(expireQty) || 0))} {expireItem?.unitType || "Qty"}
              </Text>
            </View>

            <Text style={{ fontSize: 12, fontWeight: "700", color: theme.subText, marginBottom: 4 }}>
              Expiration Date (Optional)
            </Text>
            <TextInput
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#888"
              value={expireDate}
              onChangeText={setExpireDate}
              style={[styles.input, { color: theme.text }]}
            />

            <Text style={{ fontSize: 12, fontWeight: "700", color: theme.subText, marginBottom: 4 }}>
              Reason for Expiration (Optional)
            </Text>
            <TextInput
              placeholder="e.g. Past shelf life / damaged"
              placeholderTextColor="#888"
              value={expireReason}
              onChangeText={setExpireReason}
              style={[styles.input, { color: theme.text }]}
            />

            <View style={{ flexDirection: "row", marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: "#ef4444" }]}
                disabled={isSubmittingExpire}
                onPress={handleConfirmExpire}
              >
                {isSubmittingExpire ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Confirm Expired</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                disabled={isSubmittingExpire}
                onPress={() => setExpireModalVisible(false)}
              >
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
            <Text style={[styles.modalTitle, { color: theme.text }]}>Barcode Label</Text>
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
                {selectedBarcodeItem && (
                  <Text style={{ color: "#111", fontSize: 16, fontWeight: "800", marginBottom: 4, textAlign: "center" }}>
                    {selectedBarcodeItem.itemName || "Product"}
                  </Text>
                )}
                {selectedBarcodeItem && (
                  <Text style={{ color: "#059669", fontSize: 15, fontWeight: "700", marginBottom: 8 }}>
                    ₹{Number(selectedBarcodeItem.salesPrice || selectedBarcodeItem.price || 0).toFixed(2)}
                  </Text>
                )}
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
                onPress={async () => {
                  try {
                    await bluetoothPrinter.printBarcodeLabel({
                      itemName: selectedBarcodeItem?.itemName || "Product",
                      price: Number(selectedBarcodeItem?.salesPrice || selectedBarcodeItem?.price || 0),
                      barcode: selectedBarcode,
                      shopName: shopName || "MY SHOP",
                    });
                    Alert.alert("Success ✅", "Barcode label printed successfully!");
                  } catch (err) {
                    Alert.alert("Print Error ❌", "Printer connect aayirukka nu check pannunga: " + err.message);
                  }
                }}
              >
                <Text style={[styles.btnText, { fontWeight: "bold", textAlign: "center" }]}>
                  🖨️ Print Label
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
          <View style={[styles.modalBox, { backgroundColor: theme.card, maxHeight: "92%" }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
              onPress={promptPickProductImage}
              disabled={isRemovingBackground}
              style={{ alignSelf: "center", marginBottom: 12, alignItems: "center" }}
            >
              <View style={{ position: "relative" }}>
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

                {isRemovingBackground && (
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: "rgba(0, 0, 0, 0.7)",
                      borderRadius: 14,
                      justifyContent: "center",
                      alignItems: "center",
                      padding: 4
                    }}
                  >
                    <ActivityIndicator size="small" color="#22c55e" />
                    <Text
                      style={{
                        color: "#ffffff",
                        fontSize: 9,
                        fontWeight: "700",
                        marginTop: 4,
                        textAlign: "center"
                      }}
                    >
                      {bgRemovalStatus || "Enhancing…"}
                    </Text>
                  </View>
                )}
              </View>

              {editImage && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 6 }}>
                  {studioImage ? (
                    <TouchableOpacity
                      onPress={() => setEditImage(studioImage)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: editImage === studioImage ? "#16a34a" : (darkMode ? "#1e293b" : "#e2e8f0"),
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 8,
                      }}
                    >
                      <Icon name="camera-iris" size={11} color={editImage === studioImage ? "#fff" : (darkMode ? "#94a3b8" : "#475569")} style={{ marginRight: 3 }} />
                      <Text style={{ fontSize: 10, fontWeight: "700", color: editImage === studioImage ? "#fff" : (darkMode ? "#94a3b8" : "#475569") }}>Studio Photo</Text>
                    </TouchableOpacity>
                  ) : (editImage.includes("bg_studio") && (
                    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: darkMode ? "#064e3b" : "#dcfce7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                      <Icon name="camera-iris" size={11} color="#16a34a" style={{ marginRight: 3 }} />
                      <Text style={{ fontSize: 10, color: "#16a34a", fontWeight: "700" }}>Studio Photo</Text>
                    </View>
                  ))}

                  {transparentImage ? (
                    <TouchableOpacity
                      onPress={() => setEditImage(transparentImage)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: editImage === transparentImage ? "#16a34a" : (darkMode ? "#1e293b" : "#e2e8f0"),
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 8,
                      }}
                    >
                      <Icon name="checkerboard" size={11} color={editImage === transparentImage ? "#fff" : (darkMode ? "#94a3b8" : "#475569")} style={{ marginRight: 3 }} />
                      <Text style={{ fontSize: 10, fontWeight: "700", color: editImage === transparentImage ? "#fff" : (darkMode ? "#94a3b8" : "#475569") }}>Cutout</Text>
                    </TouchableOpacity>
                  ) : (editImage.includes("bg_removed") && (
                    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: darkMode ? "#064e3b" : "#dcfce7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                      <Icon name="check-decagram" size={11} color="#16a34a" style={{ marginRight: 3 }} />
                      <Text style={{ fontSize: 10, color: "#16a34a", fontWeight: "700" }}>Transparent</Text>
                    </View>
                  ))}

                  {originalImage && originalImage !== editImage && !isRemovingBackground && (
                    <TouchableOpacity
                      onPress={() => setEditImage(originalImage)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: darkMode ? "#1e293b" : "#e2e8f0",
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 8,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "600", color: darkMode ? "#94a3b8" : "#475569" }}>Original</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </TouchableOpacity>

            {/* MAIN CATEGORY */}
            <View style={{ marginBottom: 12, zIndex: 3000 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: theme.text, marginBottom: 6 }}>
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
                style={{
                  minHeight: 50,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: mainCategoryOpen ? "#16a34a" : (darkMode ? "#334155" : "#d1d5db"),
                  backgroundColor: darkMode ? "#0f172a" : "#ffffff",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  shadowColor: "#0f172a",
                  shadowOpacity: 0.05,
                  shadowRadius: 5,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 2
                }}
              >
                <Text style={{ color: editMainCategory ? (darkMode ? "#f8fafc" : "#111827") : "#6b7280", fontSize: 15, fontWeight: editMainCategory ? "600" : "400" }}>
                  {mainCategories.find(category => category.id === editMainCategory)?.name || mainCategories.find(category => category.id === editMainCategory)?.categoryName || "Select main category"}
                </Text>
                <Icon name={mainCategoryOpen ? "chevron-up" : "chevron-down"} size={22} color="#64748b" />
              </TouchableOpacity>
              {mainCategoryOpen && (
                <View style={{ marginTop: 8, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: darkMode ? "#334155" : "#e5e7eb", backgroundColor: darkMode ? "#0f172a" : "#ffffff", shadowColor: "#0f172a", shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 }}>
                  <View style={{ minHeight: 44, paddingHorizontal: 10, borderRadius: 10, backgroundColor: darkMode ? "#1e293b" : "#f3f4f6", flexDirection: "row", alignItems: "center" }}>
                    <Icon name="magnify" size={20} color="#64748b" />
                    <TextInput value={mainCategorySearch} onChangeText={setMainCategorySearch} placeholder="Search categories" placeholderTextColor="#9ca3af" returnKeyType="search" style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 8, color: theme.text, fontSize: 14 }} />
                  </View>
                  {categoriesLoading ? <ActivityIndicator color="#16a34a" style={{ padding: 16 }} /> : (
                    <ScrollView style={{ maxHeight: Math.min(height * 0.3, 230), marginTop: 6 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                      {mainCategories.filter(category => String(category.name || category.categoryName || category.id || "").toLowerCase().includes(mainCategorySearch.trim().toLowerCase())).map(category => {
                        const label = String(category.name || category.categoryName || category.id || "Unnamed category");
                        const isSelected = category.id === editMainCategory;
                        return (
                          <TouchableOpacity key={category.id} activeOpacity={0.7} onPress={() => {
                            setEditMainCategory(category.id);
                            setEditSubcategory("");
                            setSubcategorySearch("");
                            setMainCategorySearch("");
                            setMainCategoryOpen(false);
                            Keyboard.dismiss();
                          }} style={{ minHeight: 46, paddingHorizontal: 10, borderRadius: 9, backgroundColor: isSelected ? (darkMode ? "#064e3b" : "#ecfdf3") : "transparent", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <Text style={{ color: isSelected ? "#15803d" : theme.text, fontSize: 14, fontWeight: isSelected ? "700" : "500" }}>{label}</Text>
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
              <Text style={{ fontSize: 12, fontWeight: "700", color: theme.text, marginBottom: 6 }}>
                Subcategory *
              </Text>

              <TouchableOpacity activeOpacity={0.8} disabled={!editMainCategory} onPress={() => {
                setSubcategoryOpen(current => !current);
                setMainCategoryOpen(false);
                setSubcategorySearch("");
                setSubcategoryErrorEdit("");
                Keyboard.dismiss();
              }} style={{ minHeight: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: subcategoryOpen ? "#16a34a" : (darkMode ? "#334155" : "#d1d5db"), backgroundColor: editMainCategory ? (darkMode ? "#0f172a" : "#ffffff") : (darkMode ? "#1e293b" : "#f3f4f6"), flexDirection: "row", alignItems: "center", justifyContent: "space-between", shadowColor: "#0f172a", shadowOpacity: editMainCategory ? 0.05 : 0, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: editMainCategory ? 2 : 0 }}>
                <Text style={{ color: editSubcategory ? (darkMode ? "#f8fafc" : "#111827") : "#6b7280", fontSize: 15, fontWeight: editSubcategory ? "600" : "400" }}>
                  {sharedSubcategories.find(subcategory => subcategory.id === editSubcategory)?.name || sharedSubcategories.find(subcategory => subcategory.id === editSubcategory)?.categoryName || (editMainCategory ? "Select subcategory" : "Select main category first")}
                </Text>
                <Icon name={subcategoryOpen ? "chevron-up" : "chevron-down"} size={22} color="#64748b" />
              </TouchableOpacity>
              {subcategoryOpen && editMainCategory && (
                <View style={{ marginTop: 8, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: darkMode ? "#334155" : "#e5e7eb", backgroundColor: darkMode ? "#0f172a" : "#ffffff", shadowColor: "#0f172a", shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 }}>
                  <View style={{ minHeight: 44, paddingHorizontal: 10, borderRadius: 10, backgroundColor: darkMode ? "#1e293b" : "#f3f4f6", flexDirection: "row", alignItems: "center" }}>
                    <Icon name="magnify" size={20} color="#64748b" />
                    <TextInput value={subcategorySearch} onChangeText={setSubcategorySearch} placeholder="Search or add a subcategory" placeholderTextColor="#9ca3af" returnKeyType="search" style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 8, color: theme.text, fontSize: 14 }} />
                  </View>
                  {subcategoriesLoadingEdit ? <ActivityIndicator color="#16a34a" style={{ padding: 16 }} /> : (
                    <ScrollView style={{ maxHeight: Math.min(height * 0.3, 230), marginTop: 6 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                      {sharedSubcategories.filter(subcategory => String(subcategory.name || subcategory.categoryName || subcategory.id || "").toLowerCase().includes(subcategorySearch.trim().toLowerCase())).map(subcategory => {
                        const label = String(subcategory.name || subcategory.categoryName || subcategory.id || "Unnamed subcategory");
                        const isSelected = subcategory.id === editSubcategory;
                        return (
                          <TouchableOpacity key={subcategory.id} activeOpacity={0.7} onPress={() => {
                            setEditSubcategory(subcategory.id);
                            setSubcategorySearch("");
                            setSubcategoryOpen(false);
                            Keyboard.dismiss();
                          }} style={{ minHeight: 46, paddingHorizontal: 10, borderRadius: 9, backgroundColor: isSelected ? (darkMode ? "#064e3b" : "#ecfdf3") : "transparent", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <Text style={{ color: isSelected ? "#15803d" : theme.text, fontSize: 14, fontWeight: isSelected ? "700" : "500" }}>{label}</Text>
                            {isSelected && <Icon name="check-circle" size={20} color="#16a34a" />}
                          </TouchableOpacity>
                        );
                      })}
                      {!sharedSubcategories.length && <Text style={{ padding: 12, color: "#6b7280", fontSize: 13 }}>No subcategories yet.</Text>}
                      {!!subcategorySearch.trim() && !sharedSubcategories.some(subcategory => String(subcategory.name || subcategory.categoryName || "").trim().replace(/\s+/g, " ").toLocaleLowerCase() === subcategorySearch.trim().replace(/\s+/g, " ").toLocaleLowerCase()) && (
                        <TouchableOpacity activeOpacity={0.7} disabled={savingSubcategory} onPress={addSubcategoryFromSearch} style={{ minHeight: 48, marginTop: 5, paddingHorizontal: 10, borderRadius: 9, backgroundColor: darkMode ? "#064e3b" : "#ecfdf3", flexDirection: "row", alignItems: "center" }}>
                          {savingSubcategory ? <ActivityIndicator size="small" color="#16a34a" /> : <Icon name="plus-circle-outline" size={20} color="#16a34a" />}
                          <Text numberOfLines={2} style={{ flex: 1, marginLeft: 8, color: "#16a34a", fontSize: 14, fontWeight: "700" }}>
                            {savingSubcategory ? "Adding subcategory…" : "Add \"" + subcategorySearch.trim() + "\""}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </ScrollView>
                  )}
                  {!!subcategoryErrorEdit && <Text style={{ marginTop: 7, paddingHorizontal: 4, color: "#dc2626", fontSize: 12 }}>{subcategoryErrorEdit}</Text>}
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
                        setEditUnitType(cat.units[0]);
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
                  const isUnitActive = editUnitType === u;
                  return (
                    <TouchableOpacity
                      key={u}
                      activeOpacity={0.7}
                      onPress={() => setEditUnitType(u)}
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
              const measurementConfig = getMeasurementConfig(selectedUnitCategory, editUnitType);
              return (
                <View style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: theme.text }}>
                      {measurementConfig.label}
                    </Text>
                    {editUnitType ? (
                      <View style={{ backgroundColor: darkMode ? "#064e3b" : "#ecfdf3", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: "#16a34a" }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: "#16a34a" }}>
                          Unit: {editUnitType}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <TextInput
                    value={editSize}
                    onChangeText={setEditSize}
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

            <FloatingLabelInput label="Product Name" value={editName} onChangeText={setEditName} theme={theme} />
            <FloatingLabelInput label="Brand" value={editBrand} onChangeText={setEditBrand} theme={theme} />
            <FloatingLabelInput label="Purchase Price (₹)" value={editPurchasePrice} onChangeText={setEditPurchasePrice} theme={theme} keyboardType="decimal-pad" />
            <FloatingLabelInput label="Sales Price (₹)" value={editSalesPrice} onChangeText={setEditSalesPrice} theme={theme} keyboardType="decimal-pad" />


            <FloatingLabelInput label="Quantity" value={editQty} onChangeText={setEditQty} theme={theme} keyboardType="decimal-pad" />

            <View style={{ marginBottom: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: darkMode ? "#0f172a" : "#f8fafc" }}>
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: "800", marginBottom: 8 }}>Discount</Text>
              <View style={{ flexDirection: "row", marginBottom: 9 }}>
                {[{ type: "percent", label: "%" }, { type: "fixed", label: "₹" }].map(option => {
                  const selected = editDiscountType === option.type;
                  return (
                    <TouchableOpacity key={option.type} onPress={() => setEditDiscountType(option.type)} style={{ minWidth: 54, marginRight: 8, paddingVertical: 7, borderRadius: 9, alignItems: "center", borderWidth: 1, borderColor: selected ? "#16a34a" : theme.border, backgroundColor: selected ? (darkMode ? "#064e3b" : "#ecfdf5") : theme.card }}>
                      <Text style={{ color: selected ? "#16a34a" : theme.text, fontSize: 14, fontWeight: "800" }}>{option.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <FloatingLabelInput label={editDiscountType === "percent" ? "Discount Percentage" : "Discount Amount (₹)"} value={editDiscountValue} onChangeText={setEditDiscountValue} theme={theme} keyboardType="decimal-pad" />
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 1 }}>
                <Text style={{ color: theme.subText, fontSize: 12 }}>Original sales price</Text>
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}>₹{Number.isFinite(editOriginalPrice) ? editOriginalPrice.toFixed(2) : "0.00"}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                <Text style={{ color: "#16a34a", fontSize: 13, fontWeight: "800" }}>Offer price</Text>
                <Text style={{ color: "#16a34a", fontSize: 13, fontWeight: "800" }}>₹{editOfferPrice !== null ? editOfferPrice.toFixed(2) : "—"}</Text>
              </View>
              {editDiscountValue.trim() !== "" && (!Number.isFinite(editDiscountNumber) || editDiscountNumber < 0 || (editDiscountType === "percent" && editDiscountNumber > 100) || (editDiscountType === "fixed" && editDiscountNumber > editOriginalPrice)) && <Text style={{ marginTop: 6, color: "#dc2626", fontSize: 11 }}>{editDiscountType === "percent" ? "Discount must be from 0% to 100%." : "Discount cannot exceed the sales price."}</Text>}
            </View>

            {/* 🏷️ HSN CODE SECTION */}
            <View style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: theme.text }}>HSN Code</Text>
                  <Text style={{ fontSize: 11, color: "#94a3b8", marginLeft: 6 }}>(GST Classification)</Text>
                </View>
                {hsnLookupLoading && (
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <ActivityIndicator size="small" color="#16a34a" style={{ marginRight: 4 }} />
                    <Text style={{ fontSize: 11, color: "#16a34a", fontWeight: "600" }}>Resolving…</Text>
                  </View>
                )}
              </View>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: hsnValidationMessage ? "#ef4444" : theme.border,
                  backgroundColor: darkMode ? "#0f172a" : "#f8fafc",
                  paddingHorizontal: 12,
                  minHeight: 48,
                }}
              >
                <Icon name="barcode-scan" size={20} color="#16a34a" style={{ marginRight: 8 }} />
                <TextInput
                  value={editHsnCode}
                  onChangeText={handleEditHsnTextChange}
                  placeholder="Enter or search HSN code"
                  placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
                  keyboardType="number-pad"
                  maxLength={8}
                  style={{
                    flex: 1,
                    fontSize: 14,
                    fontWeight: "700",
                    color: theme.text,
                    paddingVertical: 8,
                  }}
                />

                {editHsnCode.length > 0 && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={handleClearEditHsn}
                    style={{ padding: 4, marginRight: 4 }}
                  >
                    <Icon name="close-circle" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handleOpenEditHsnSearch}
                  style={{
                    backgroundColor: "#16a34a",
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

              {!!hsnValidationMessage && (
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, paddingHorizontal: 2 }}>
                  <Icon name="alert-circle-outline" size={14} color="#ef4444" style={{ marginRight: 4 }} />
                  <Text style={{ color: "#ef4444", fontSize: 11, fontWeight: "600" }}>{hsnValidationMessage}</Text>
                </View>
              )}
            </View>

            {/* 📝 DESCRIPTION (OPTIONAL) SECTION */}
            <View style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: theme.text }}>Description (Optional)</Text>
                {isDescriptionManuallyEdited && (
                  <Text style={{ fontSize: 10, color: "#16a34a", fontWeight: "700" }}>Custom description preserved</Text>
                )}
              </View>

              <TextInput
                value={editDescription}
                onChangeText={(val) => {
                  setEditDescription(val);
                  setIsDescriptionManuallyEdited(true);
                }}
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
                    borderColor: theme.border,
                  },
                ]}
              />
            </View>

            {/* 🌐 ONLINE SALE SETTING (Feature: Product-wise Online Sale ON/OFF) */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: darkMode ? "#0f172a" : "#f8fafc",
                marginBottom: 16,
              }}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <Icon
                    name="store-outline"
                    size={20}
                    color={editIsOnlineSaleEnabled ? "#6366f1" : "#94a3b8"}
                  />
                  <Text style={{ fontSize: 14, fontWeight: "700", color: theme.text }}>
                    Sell this product online?
                  </Text>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 8,
                      backgroundColor: editIsOnlineSaleEnabled ? "#e0e7ff" : "#f1f5f9",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "800",
                        color: editIsOnlineSaleEnabled ? "#4338ca" : "#64748b",
                      }}
                    >
                      {editIsOnlineSaleEnabled ? "ON" : "OFF"}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 11.5, color: "#64748b", lineHeight: 15 }}>
                  {editIsOnlineSaleEnabled
                    ? "Product is visible in the online shopping catalog for customer orders."
                    : "Product is hidden from online shopping. It remains available for in-store sales."}
                </Text>
              </View>

              <View style={{ alignItems: "center", justifyContent: "center", minWidth: 48 }}>
                {savingOnlineSaleToggle ? (
                  <ActivityIndicator size="small" color="#6366f1" />
                ) : (
                  <Switch
                    value={editIsOnlineSaleEnabled}
                    onValueChange={handleToggleOnlineSale}
                    thumbColor="#ffffff"
                    trackColor={{ false: "#cbd5e1", true: "#6366f1" }}
                    disabled={savingOnlineSaleToggle}
                  />
                )}
              </View>
            </View>

            <View style={{ flexDirection: "row", marginTop: 10 }}>
              <TouchableOpacity style={styles.saveBtn} onPress={saveEdit}>
                <Text style={styles.btnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 🔍 HSN CODE SEARCH MODAL FOR INVENTORY */}
      <Modal
        visible={hsnSearchModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setHsnSearchModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: darkMode ? "#0f172a" : "#f8fafc" }}>
          <StatusBar barStyle={darkMode ? "light-content" : "dark-content"} />

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
              <Icon name="magnify" size={20} color="#16a34a" style={{ marginRight: 8 }} />
              <TextInput
                value={hsnSearchQuery}
                onChangeText={(text) => {
                  setHsnSearchQuery(text);
                  executeEditHsnSearch(text);
                }}
                placeholder="Search by HSN code, product, category, keywords..."
                placeholderTextColor={darkMode ? "#94a3b8" : "#64748b"}
                returnKeyType="search"
                style={{ flex: 1, fontSize: 14, color: theme.text, padding: 0 }}
              />
              {hsnSearchQuery.length > 0 && (
                <TouchableOpacity activeOpacity={0.7} onPress={() => { setHsnSearchQuery(""); executeEditHsnSearch(""); }}>
                  <Icon name="close-circle" size={18} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {hsnSearchLoading ? (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
              <ActivityIndicator size="large" color="#16a34a" />
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
                  onPress={() => handleSelectEditHsnResult(item)}
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
                      <View style={{ backgroundColor: "#ecfdf5", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                        <Text style={{ fontSize: 14, fontWeight: "900", color: "#16a34a", letterSpacing: 0.5 }}>
                          HSN {item.hsnCode}
                        </Text>
                      </View>
                      {item.gstRate && (
                        <View style={{ backgroundColor: "#dcfce7", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontSize: 11, fontWeight: "800", color: "#15803d" }}>GST {item.gstRate}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 11, color: "#16a34a", fontWeight: "700" }}>Select →</Text>
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
                    style={{ marginTop: 20, backgroundColor: "#16a34a", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Enter Code Manually</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          )}
        </SafeAreaView>
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
                    setWebImageGridModal(false);
                    handleAutoProcessImage(item);
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
  bestSellerText: { color: "#7e9486", fontSize: 11, fontWeight: "bold" },
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
    position: "relative",
    overflow: "hidden"
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
  lockedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    zIndex: 10,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  lockedText: {
    color: '#facc15',
    fontWeight: 'bold',
    fontSize: 13,
    textAlign: 'center',
  },
  upgradeNoticeBox: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f59e0b',
    alignItems: 'center',
  },
  upgradeNoticeText: {
    color: '#ffffff',
    fontSize: 11,
    marginTop: 2,
    textDecorationLine: 'underline',
    fontWeight: '600',
  },

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