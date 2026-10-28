import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  onSnapshot
} from "firebase/firestore";

/**
 * Validates expiration input parameters.
 * Throws an Error with a descriptive user-facing message if validation fails.
 */
export function validateExpirationInput({ uid, productId, expiredQty, availableStock }) {
  if (!uid || typeof uid !== "string" || !uid.trim()) {
    throw new Error("User must be authenticated to process product expiration.");
  }

  if (!productId || typeof productId !== "string" || !productId.trim()) {
    throw new Error("Product ID is required.");
  }

  const qty = Number(expiredQty);
  if (!Number.isFinite(qty) || isNaN(qty)) {
    throw new Error("Expired quantity must be a valid number.");
  }

  if (qty <= 0) {
    throw new Error("Expired quantity must be greater than zero.");
  }

  if (availableStock !== undefined && availableStock !== null) {
    const stock = Number(availableStock) || 0;
    if (qty > stock) {
      throw new Error(`Expired quantity (${qty}) cannot exceed currently available stock (${stock}).`);
    }
  }

  return qty;
}

/**
 * Calculates financial loss based strictly on purchase cost price per unit.
 * Formula: Total Loss = Purchase Price Per Unit * Expired Quantity
 * Note: Never based on sales price or selling price.
 */
export function calculateExpiredLoss(purchasePrice, expiredQty) {
  const pPrice = Number(purchasePrice) >= 0 ? Number(purchasePrice) : 0;
  const qty = Number(expiredQty) > 0 ? Number(expiredQty) : 0;
  const loss = pPrice * qty;
  // Round to 2 decimal places to avoid floating point inaccuracies
  return Math.round(loss * 100) / 100;
}

/**
 * Calculates aggregate totals for a list of expiration transaction records.
 * Returns { totalQuantity, totalLoss }.
 */
export function calculateExpiredTotals(records = []) {
  if (!Array.isArray(records)) {
    return { totalQuantity: 0, totalLoss: 0 };
  }

  let totalQuantity = 0;
  let totalLoss = 0;

  for (const record of records) {
    if (!record) continue;
    const qty = Number(record.expiredQuantity) || 0;
    const loss = Number(record.totalLoss) || 0;
    totalQuantity += qty;
    totalLoss += loss;
  }

  return {
    totalQuantity: Math.round(totalQuantity * 100) / 100,
    totalLoss: Math.round(totalLoss * 100) / 100,
  };
}

/**
 * Atomically marks a product as expired using a Firestore transaction.
 * 
 * Guarantees:
 * 1. Checks that product exists.
 * 2. Reads fresh product quantity and purchase price directly from Firestore within the transaction.
 * 3. Validates that expiredQty <= currently available stock in database.
 * 4. Deducts expiredQty from product inventory: newQty = currentStock - expiredQty.
 * 5. If newQty === 0, preserves the product document with quantity 0 (consistent with out-of-stock behavior).
 * 6. Records an immutable expiration transaction in `users/{uid}/expired_products/{expirationId}`.
 * 7. Transaction atomicity guarantees no partial updates can occur.
 * 
 * @param {Object} params
 * @param {Object} params.db - Firestore db instance
 * @param {string} params.uid - Authenticated user UID
 * @param {string} params.productId - Product doc ID to mark as expired
 * @param {number|string} params.expiredQty - Quantity to expire
 * @param {string} [params.expirationDate] - Optional expiration date (e.g. YYYY-MM-DD)
 * @param {string} [params.reason] - Optional reason for expiration
 * @param {string} [params.inventoryMode] - "local" or "global"
 * @returns {Promise<Object>} The created expiration record
 */
export async function markProductAsExpired({
  db,
  uid,
  productId,
  expiredQty,
  expirationDate,
  reason,
  inventoryMode = "local",
}) {
  const qty = validateExpirationInput({ uid, productId, expiredQty });

  const inventoryCollection = inventoryMode === "global" ? "global_inventory" : "inventory";
  const productRef = doc(db, "users", uid, inventoryCollection, productId);
  const expiredColRef = collection(db, "users", uid, "expired_products");
  const expiredDocRef = doc(expiredColRef);

  return await runTransaction(db, async (transaction) => {
    // 1. Read fresh product data inside the atomic transaction
    const productSnap = await transaction.get(productRef);
    if (!productSnap.exists()) {
      throw new Error("Product does not exist in inventory.");
    }

    const productData = productSnap.data();
    const currentStock = Number(productData.quantity) || 0;
    const purchasePrice =
      Number(productData.purchasePrice) >= 0 ? Number(productData.purchasePrice) : 0;

    // 2. Validate stock availability at transaction time
    if (qty > currentStock) {
      throw new Error(
        `Expired quantity (${qty}) cannot exceed currently available stock (${currentStock}).`
      );
    }

    // 3. Compute remaining stock and total loss
    const remainingStock = Math.max(0, currentStock - qty);
    const totalLoss = calculateExpiredLoss(purchasePrice, qty);

    // 4. Atomically update product inventory quantity
    transaction.update(productRef, {
      quantity: remainingStock,
      updatedAt: serverTimestamp(),
    });

    // 5. Atomically insert dedicated expiration history transaction
    const expirationRecord = {
      productId,
      productName: productData.itemName || "Unnamed Product",
      productImage: productData.image || "",
      brand: productData.brand || "",
      barcode: productData.barcode || "",
      unitType: productData.unitType || "Qty",
      purchasePrice,
      expiredQuantity: qty,
      previousQuantity: currentStock,
      remainingQuantity: remainingStock,
      totalLoss,
      expirationDate: expirationDate ? String(expirationDate).trim() : null,
      reason: reason && String(reason).trim() ? String(reason).trim() : "Expired / Past Shelf Life",
      inventoryMode: inventoryMode === "global" ? "global" : "local",
      createdAt: serverTimestamp(),
    };

    transaction.set(expiredDocRef, expirationRecord);

    return {
      success: true,
      id: expiredDocRef.id,
      ...expirationRecord,
      createdAtDate: new Date(),
    };
  });
}

/**
 * Subscribes to real-time updates for expired products of a user.
 * Orders transactions by createdAt descending (newest first).
 * 
 * @param {Object} db - Firestore db instance
 * @param {string} uid - User UID
 * @param {Function} onData - Callback with array of expired records
 * @param {Function} [onError] - Optional error callback
 * @returns {Function} Unsubscribe function
 */
export function subscribeExpiredProducts(db, uid, onData, onError) {
  if (!db || !uid) return () => {};

  const colRef = collection(db, "users", uid, "expired_products");

  return onSnapshot(
    colRef,
    (snapshot) => {
      const records = snapshot.docs.map((d) => {
        const data = d.data();
        let parsedDate = new Date();
        if (data.createdAt?.seconds) {
          parsedDate = new Date(data.createdAt.seconds * 1000);
        } else if (data.createdAt?.toDate) {
          parsedDate = data.createdAt.toDate();
        } else if (data.createdAt) {
          parsedDate = new Date(data.createdAt);
        }

        return {
          id: d.id,
          ...data,
          parsedDate,
        };
      });

      // Sort by parsedDate descending (newest first)
      records.sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime());
      onData(records);
    },
    (err) => {
      console.warn("[ExpiredProductsService] Real-time subscription error:", err);
      if (onError) onError(err);
    }
  );
}
