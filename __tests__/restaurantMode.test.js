import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("firebase/firestore", () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
}));

jest.mock("../src/utils/firebaseConfig", () => ({
  db: {},
}));

import {
  normalizeShopType,
  isRestaurantShop,
  getCachedShopType,
  setCachedShopType,
} from "../src/utils/restaurantMode";

describe("Restaurant Mode Detection & Isolation Tests", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  describe("normalizeShopType", () => {
    it("should correctly normalize restaurant strings", () => {
      expect(normalizeShopType("Restaurant")).toBe("restaurant");
      expect(normalizeShopType("restaurant")).toBe("restaurant");
      expect(normalizeShopType("  RESTAURANT  ")).toBe("restaurant");
      expect(normalizeShopType("Restaurant\n")).toBe("restaurant");
    });

    it("should correctly normalize retail shop types without corrupting them", () => {
      expect(normalizeShopType("Store")).toBe("store");
      expect(normalizeShopType("Super Market")).toBe("super market");
      expect(normalizeShopType("Factory")).toBe("factory");
      expect(normalizeShopType("Medical")).toBe("medical");
      expect(normalizeShopType("Other")).toBe("other");
    });

    it("should handle null, undefined, or empty values safely", () => {
      expect(normalizeShopType(null)).toBe("");
      expect(normalizeShopType(undefined)).toBe("");
      expect(normalizeShopType("")).toBe("");
      expect(normalizeShopType({})).toBe("");
    });
  });

  describe("isRestaurantShop", () => {
    it("should return true ONLY for restaurant shop types", () => {
      expect(isRestaurantShop("Restaurant")).toBe(true);
      expect(isRestaurantShop("restaurant")).toBe(true);
      expect(isRestaurantShop(" RESTAURANT ")).toBe(true);
    });

    it("should return false for all retail and non-restaurant shop types (Strict Isolation)", () => {
      expect(isRestaurantShop("Store")).toBe(false);
      expect(isRestaurantShop("Super Market")).toBe(false);
      expect(isRestaurantShop("Factory")).toBe(false);
      expect(isRestaurantShop("Medical")).toBe(false);
      expect(isRestaurantShop("Other")).toBe(false);
      expect(isRestaurantShop("General")).toBe(false);
    });

    it("should return false for existing users with no shopType or invalid data", () => {
      expect(isRestaurantShop(null)).toBe(false);
      expect(isRestaurantShop(undefined)).toBe(false);
      expect(isRestaurantShop("")).toBe(false);
      expect(isRestaurantShop(123)).toBe(false);
      expect(isRestaurantShop({})).toBe(false);
    });
  });

  describe("AsyncStorage Caching", () => {
    it("should save and retrieve cached shop type for user", async () => {
      await setCachedShopType("uid_rest_123", "Restaurant");
      const cached = await getCachedShopType("uid_rest_123");
      expect(cached).toBe("Restaurant");
      expect(isRestaurantShop(cached)).toBe(true);
    });

    it("should preserve retail shop type in cache and isolate from restaurant", async () => {
      await setCachedShopType("uid_store_456", "Store");
      const cached = await getCachedShopType("uid_store_456");
      expect(cached).toBe("Store");
      expect(isRestaurantShop(cached)).toBe(false);
    });

    it("should return empty string when cache is empty", async () => {
      const cached = await getCachedShopType("unknown_uid");
      expect(cached).toBe("");
    });
  });
});
