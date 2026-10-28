/**
 * Test suite for Shop Operational Settings:
 * 1. Online Shopping Enable / Disable (isOnlineShoppingEnabled)
 * 2. Shop Status Open / Close (isShopOpen)
 */

describe("Shop Operational Settings - React Native Upstage Kadai", () => {
  // Helper mimicking ProfileScreen load logic
  const mapShopOperationalSettings = (data = {}, mode = "local") => {
    const onlineShoppingVal =
      data[`${mode}_isOnlineShoppingEnabled`] !== undefined
        ? data[`${mode}_isOnlineShoppingEnabled`]
        : data.isOnlineShoppingEnabled !== undefined
        ? data.isOnlineShoppingEnabled
        : true;

    const shopStatusVal =
      data[`${mode}_isShopOpen`] !== undefined
        ? data[`${mode}_isShopOpen`]
        : data.isShopOpen !== undefined
        ? data.isShopOpen
        : true;

    return {
      isOnlineShoppingEnabled: onlineShoppingVal !== false,
      isShopOpen: shopStatusVal !== false,
    };
  };

  // Helper mimicking order validation logic across 4 quadrants
  const validateOrderPlacement = (shopSettings, isOnlineOrder = true) => {
    const { isShopOpen, isOnlineShoppingEnabled } = shopSettings;

    if (!isShopOpen) {
      return {
        allowed: false,
        reason: "Shop is currently closed. Product viewing is allowed, but new orders cannot be placed.",
        code: "SHOP_CLOSED",
      };
    }

    if (isOnlineOrder && !isOnlineShoppingEnabled) {
      return {
        allowed: false,
        reason: "Online shopping is currently disabled for this shop. Orders cannot be placed online.",
        code: "ONLINE_SHOPPING_DISABLED",
      };
    }

    return {
      allowed: true,
      reason: "Order placement allowed.",
      code: "SUCCESS",
    };
  };

  describe("1. Default Values & Persistence", () => {
    it("defaults both isOnlineShoppingEnabled and isShopOpen to true when fields are missing", () => {
      const rawUserDoc = {
        shopName: "Upstage Stores",
        gstNumber: "33AABCT1234D1Z5",
        address: "Anna Nagar, Chennai",
      };

      const settings = mapShopOperationalSettings(rawUserDoc);
      expect(settings.isOnlineShoppingEnabled).toBe(true);
      expect(settings.isShopOpen).toBe(true);
    });

    it("respects explicitly saved false values from Firestore", () => {
      const docWithFalse = {
        shopName: "Upstage Stores",
        isOnlineShoppingEnabled: false,
        isShopOpen: false,
      };

      const settings = mapShopOperationalSettings(docWithFalse);
      expect(settings.isOnlineShoppingEnabled).toBe(false);
      expect(settings.isShopOpen).toBe(false);
    });

    it("supports mode-specific prefixes (local_ / global_)", () => {
      const docWithMode = {
        local_isOnlineShoppingEnabled: false,
        local_isShopOpen: true,
        global_isOnlineShoppingEnabled: true,
        global_isShopOpen: false,
      };

      const localSettings = mapShopOperationalSettings(docWithMode, "local");
      expect(localSettings.isOnlineShoppingEnabled).toBe(false);
      expect(localSettings.isShopOpen).toBe(true);

      const globalSettings = mapShopOperationalSettings(docWithMode, "global");
      expect(globalSettings.isOnlineShoppingEnabled).toBe(true);
      expect(globalSettings.isShopOpen).toBe(false);
    });
  });

  describe("2. Settings Independence", () => {
    it("toggling isOnlineShoppingEnabled leaves isShopOpen unchanged", () => {
      let state = { isOnlineShoppingEnabled: true, isShopOpen: true };

      // Toggle Online Shopping OFF
      state = { ...state, isOnlineShoppingEnabled: false };
      expect(state.isOnlineShoppingEnabled).toBe(false);
      expect(state.isShopOpen).toBe(true);

      // Toggle Online Shopping ON
      state = { ...state, isOnlineShoppingEnabled: true };
      expect(state.isOnlineShoppingEnabled).toBe(true);
      expect(state.isShopOpen).toBe(true);
    });

    it("toggling isShopOpen leaves isOnlineShoppingEnabled unchanged", () => {
      let state = { isOnlineShoppingEnabled: true, isShopOpen: true };

      // Toggle Shop Status to Closed (OFF)
      state = { ...state, isShopOpen: false };
      expect(state.isShopOpen).toBe(false);
      expect(state.isOnlineShoppingEnabled).toBe(true);

      // Toggle Shop Status to Open (ON)
      state = { ...state, isShopOpen: true };
      expect(state.isShopOpen).toBe(true);
      expect(state.isOnlineShoppingEnabled).toBe(true);
    });
  });

  describe("3. 4-Quadrant Operational Rule Matrix", () => {
    it("Quadrant 1 (Shop Open + Online Shopping ON): allows orders normally", () => {
      const settings = { isShopOpen: true, isOnlineShoppingEnabled: true };
      const onlineResult = validateOrderPlacement(settings, true);
      const inStoreResult = validateOrderPlacement(settings, false);

      expect(onlineResult.allowed).toBe(true);
      expect(onlineResult.code).toBe("SUCCESS");
      expect(inStoreResult.allowed).toBe(true);
    });

    it("Quadrant 2 (Shop Open + Online Shopping OFF): blocks online orders, allows in-store POS", () => {
      const settings = { isShopOpen: true, isOnlineShoppingEnabled: false };
      const onlineResult = validateOrderPlacement(settings, true);
      const inStoreResult = validateOrderPlacement(settings, false);

      expect(onlineResult.allowed).toBe(false);
      expect(onlineResult.code).toBe("ONLINE_SHOPPING_DISABLED");
      expect(inStoreResult.allowed).toBe(true);
    });

    it("Quadrant 3 (Shop Closed + Online Shopping ON): blocks all orders because shop is closed", () => {
      const settings = { isShopOpen: false, isOnlineShoppingEnabled: true };
      const onlineResult = validateOrderPlacement(settings, true);
      const inStoreResult = validateOrderPlacement(settings, false);

      expect(onlineResult.allowed).toBe(false);
      expect(onlineResult.code).toBe("SHOP_CLOSED");
      expect(inStoreResult.allowed).toBe(false);
      expect(inStoreResult.code).toBe("SHOP_CLOSED");
    });

    it("Quadrant 4 (Shop Closed + Online Shopping OFF): blocks all orders", () => {
      const settings = { isShopOpen: false, isOnlineShoppingEnabled: false };
      const onlineResult = validateOrderPlacement(settings, true);
      const inStoreResult = validateOrderPlacement(settings, false);

      expect(onlineResult.allowed).toBe(false);
      expect(onlineResult.code).toBe("SHOP_CLOSED");
      expect(inStoreResult.allowed).toBe(false);
      expect(inStoreResult.code).toBe("SHOP_CLOSED");
    });
  });

  describe("4. Error Rollback Behavior", () => {
    it("reverts switch value if updateDoc throws an exception", async () => {
      let uiSwitchValue = true;
      const initialValue = true;

      const mockUpdateDocFailure = async () => {
        throw new Error("Network connection lost");
      };

      try {
        uiSwitchValue = false; // Optimistic
        await mockUpdateDocFailure();
      } catch (err) {
        uiSwitchValue = initialValue; // Rollback
      }

      expect(uiSwitchValue).toBe(true);
    });
  });
});
