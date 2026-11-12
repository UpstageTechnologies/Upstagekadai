import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebaseConfig";

/**
 * Normalizes shop type string for comparison.
 */
export const normalizeShopType = (type) => {
  if (!type || typeof type !== "string") return "";
  return type.trim().toLowerCase();
};

/**
 * Returns true if the given shop type represents a restaurant.
 */
export const isRestaurantShop = (type) => {
  return normalizeShopType(type) === "restaurant";
};

/**
 * Reads cached shop type from AsyncStorage for instant loading without UI flash.
 */
export const getCachedShopType = async (uid) => {
  if (!uid) return "";
  try {
    return (await AsyncStorage.getItem(`shop_type_${uid}`)) || "";
  } catch {
    return "";
  }
};

/**
 * Persists shop type to AsyncStorage.
 */
export const setCachedShopType = async (uid, type) => {
  if (!uid) return;
  try {
    if (type) {
      await AsyncStorage.setItem(`shop_type_${uid}`, String(type).trim());
    } else {
      await AsyncStorage.removeItem(`shop_type_${uid}`);
    }
  } catch (e) {
    console.log("Error caching shop type:", e);
  }
};

/**
 * Fetches shop type from Firestore user document with offline cache fallback.
 */
export const fetchAndCacheShopType = async (uid) => {
  if (!uid) return { shopType: "", isRestaurant: false };

  const cached = await getCachedShopType(uid);
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      const serverType = data?.shopType || data?.businessType || "";
      if (serverType) {
        await setCachedShopType(uid, serverType);
      }
      const effectiveType = serverType || cached;
      return {
        shopType: effectiveType,
        isRestaurant: isRestaurantShop(effectiveType),
      };
    }
    return {
      shopType: cached,
      isRestaurant: isRestaurantShop(cached),
    };
  } catch (err) {
    console.log("fetchAndCacheShopType offline fallback:", err);
    return {
      shopType: cached,
      isRestaurant: isRestaurantShop(cached),
    };
  }
};
