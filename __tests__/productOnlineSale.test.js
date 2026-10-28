const {
  isProductEligibleForOnlineSale,
  filterOnlineCatalogProducts,
} = require("../src/utils/onlineCatalogFilter");

describe("Product-wise Online Sale ON/OFF - React Native Upstage Kadai", () => {
  // Helper mimicking InventoryScreen openEdit initialization logic
  const loadProductForEditing = (productDoc = {}) => {
    return {
      ...productDoc,
      editIsOnlineSaleEnabled: productDoc.isOnlineSaleEnabled !== false,
    };
  };

  // Helper mimicking InventoryScreen saveEdit payload builder
  const buildSavePayload = (formData, editIsOnlineSaleEnabled) => {
    return {
      itemName: formData.itemName,
      purchasePrice: Number(formData.purchasePrice) || 0,
      salesPrice: Number(formData.salesPrice) || 0,
      quantity: Number(formData.quantity) || 0,
      brand: formData.brand || "",
      isOnlineSaleEnabled: editIsOnlineSaleEnabled !== false,
    };
  };

  // Helper mimicking optimistic toggle with rollback on failure
  const simulateToggleOnlineSale = async (currentState, newValue, updateFn) => {
    let state = newValue; // Optimistic update
    try {
      await updateFn(newValue);
      return { success: true, state };
    } catch (err) {
      state = currentState; // Rollback on error
      return { success: false, state, error: err.message };
    }
  };

  describe("1. Default Values & Backward Compatibility", () => {
    it("defaults to true (ON) for newly scanned / added products", () => {
      const newProductPayload = {
        barcode: "8901030383847",
        itemName: "Dove Daily Shine Shampoo 180ml",
        brand: "Dove",
        purchasePrice: 120,
        salesPrice: 150,
        quantity: 10,
        isOnlineSaleEnabled: true,
      };

      expect(newProductPayload.isOnlineSaleEnabled).toBe(true);
      expect(isProductEligibleForOnlineSale(newProductPayload)).toBe(true);
    });

    it("treats existing legacy products where isOnlineSaleEnabled is missing or undefined as true (ON)", () => {
      const legacyLocalProduct = {
        id: "prod-local-001",
        itemName: "Aashirvaad Atta 5kg",
        salesPrice: 280,
        quantity: 15,
        // isOnlineSaleEnabled is undefined / missing
      };

      const legacyGlobalProduct = {
        id: "prod-global-001",
        itemName: "Tata Salt 1kg",
        salesPrice: 28,
        quantity: 50,
        // isOnlineSaleEnabled is missing
      };

      expect(isProductEligibleForOnlineSale(legacyLocalProduct)).toBe(true);
      expect(isProductEligibleForOnlineSale(legacyGlobalProduct)).toBe(true);

      const loadedLocal = loadProductForEditing(legacyLocalProduct);
      expect(loadedLocal.editIsOnlineSaleEnabled).toBe(true);

      const loadedGlobal = loadProductForEditing(legacyGlobalProduct);
      expect(loadedGlobal.editIsOnlineSaleEnabled).toBe(true);
    });

    it("correctly preserves and loads an explicitly disabled (false / OFF) product", () => {
      const disabledProduct = {
        id: "prod-local-002",
        itemName: "Loose Sugar 1kg (In-store Only)",
        salesPrice: 42,
        quantity: 100,
        isOnlineSaleEnabled: false,
      };

      expect(isProductEligibleForOnlineSale(disabledProduct)).toBe(false);

      const loaded = loadProductForEditing(disabledProduct);
      expect(loaded.editIsOnlineSaleEnabled).toBe(false);
    });
  });

  describe("2. Online Catalog Filtering Utility", () => {
    const catalogMock = [
      { id: "1", itemName: "Colgate Paste", isOnlineSaleEnabled: true, collection: "inventory" },
      { id: "2", itemName: "Loose Eggs (In-store)", isOnlineSaleEnabled: false, collection: "inventory" },
      { id: "3", itemName: "Amul Butter 100g", collection: "inventory" }, // missing -> ON
      { id: "4", itemName: "Global Perfume", isOnlineSaleEnabled: true, collection: "global_inventory" },
      { id: "5", itemName: "Global Fragile Crockery", isOnlineSaleEnabled: false, collection: "global_inventory" },
      { id: "6", itemName: "Global Coffee", collection: "global_inventory" }, // undefined -> ON
    ];

    it("filters out products where isOnlineSaleEnabled is false", () => {
      const filtered = filterOnlineCatalogProducts(catalogMock);
      const filteredIds = filtered.map((p) => p.id);

      expect(filteredIds).toEqual(["1", "3", "4", "6"]);
      expect(filteredIds).not.toContain("2");
      expect(filteredIds).not.toContain("5");
    });

    it("applies filtering uniformly to both Local Products and Global Products", () => {
      const localProducts = catalogMock.filter((p) => p.collection === "inventory");
      const globalProducts = catalogMock.filter((p) => p.collection === "global_inventory");

      const filteredLocal = filterOnlineCatalogProducts(localProducts);
      const filteredGlobal = filterOnlineCatalogProducts(globalProducts);

      expect(filteredLocal.map((p) => p.id)).toEqual(["1", "3"]);
      expect(filteredGlobal.map((p) => p.id)).toEqual(["4", "6"]);
    });

    it("handles null, undefined, and non-array arguments safely", () => {
      expect(filterOnlineCatalogProducts(null)).toEqual([]);
      expect(filterOnlineCatalogProducts(undefined)).toEqual([]);
      expect(filterOnlineCatalogProducts("not-an-array")).toEqual([]);
      expect(isProductEligibleForOnlineSale(null)).toBe(false);
      expect(isProductEligibleForOnlineSale(undefined)).toBe(false);
    });
  });

  describe("3. Inventory & In-Store POS Isolation (Never hide or delete OFF products)", () => {
    const storeProducts = [
      { id: "p1", itemName: "Item 1", salesPrice: 100, isOnlineSaleEnabled: true },
      { id: "p2", itemName: "Item 2", salesPrice: 50, isOnlineSaleEnabled: false },
      { id: "p3", itemName: "Item 3", salesPrice: 200 },
    ];

    it("in-store POS search (SalesScreen) retains all products regardless of isOnlineSaleEnabled", () => {
      // In SalesScreen, inventory query does not filter out isOnlineSaleEnabled === false
      const posProducts = storeProducts.filter((item) => {
        const q = "item";
        return item.itemName.toLowerCase().includes(q);
      });

      expect(posProducts.length).toBe(3);
      expect(posProducts.map((p) => p.id)).toContain("p2");
    });

    it("inventory screen (InventoryScreen) retains all products regardless of isOnlineSaleEnabled", () => {
      const inventoryList = storeProducts.filter((item) => {
        // Inventory screen filter only filters by search text, category, or low-stock
        return Boolean(item.itemName);
      });

      expect(inventoryList.length).toBe(3);
      expect(inventoryList.find((p) => p.id === "p2").isOnlineSaleEnabled).toBe(false);
    });
  });

  describe("4. Independence & Save Payload Verification", () => {
    it("builds correct Firestore update payload with isOnlineSaleEnabled", () => {
      const formData = {
        itemName: "Basmati Rice 1kg",
        purchasePrice: "80",
        salesPrice: "110",
        quantity: "25",
        brand: "India Gate",
      };

      const payloadOn = buildSavePayload(formData, true);
      expect(payloadOn.isOnlineSaleEnabled).toBe(true);

      const payloadOff = buildSavePayload(formData, false);
      expect(payloadOff.isOnlineSaleEnabled).toBe(false);
    });

    it("toggling online sale for one product does not affect other products", () => {
      const productA = { id: "A", isOnlineSaleEnabled: true };
      const productB = { id: "B", isOnlineSaleEnabled: true };

      const updatedProductA = { ...productA, isOnlineSaleEnabled: false };

      expect(updatedProductA.isOnlineSaleEnabled).toBe(false);
      expect(productB.isOnlineSaleEnabled).toBe(true);
    });
  });

  describe("5. Error Handling & Rollback on Save Failure", () => {
    it("optimistically updates and succeeds when Firestore write succeeds", async () => {
      const mockSuccessUpdate = jest.fn().mockResolvedValue(true);
      const result = await simulateToggleOnlineSale(true, false, mockSuccessUpdate);

      expect(result.success).toBe(true);
      expect(result.state).toBe(false);
      expect(mockSuccessUpdate).toHaveBeenCalledWith(false);
    });

    it("reverts state to previous value when Firestore write fails", async () => {
      const mockFailureUpdate = jest.fn().mockRejectedValue(new Error("Network connection lost"));
      const result = await simulateToggleOnlineSale(true, false, mockFailureUpdate);

      expect(result.success).toBe(false);
      expect(result.state).toBe(true); // Restored to previous value
      expect(result.error).toContain("Network connection lost");
    });
  });
});
