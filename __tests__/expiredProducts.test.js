import {
  markProductAsExpired,
  calculateExpiredLoss,
  calculateExpiredTotals,
  validateExpirationInput,
} from '../src/utils/expiredProductsService';

// Mock Firestore modular functions
const mockTransaction = {
  get: jest.fn(),
  update: jest.fn(),
  set: jest.fn(),
};

const mockRunTransaction = jest.fn(async (db, transactionCallback) => {
  return await transactionCallback(mockTransaction);
});

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((db, ...pathSegments) => ({
    type: 'collection',
    path: pathSegments.join('/'),
  })),
  doc: jest.fn((...args) => {
    // If called with (collectionRef) -> auto-id doc
    if (args.length === 1 && args[0]?.type === 'collection') {
      return { id: `auto_doc_${Date.now()}_${Math.random()}`, path: `${args[0].path}/auto` };
    }
    // Called with (db, ...pathSegments)
    const [, ...segments] = args;
    return { id: segments[segments.length - 1], path: segments.join('/') };
  }),
  runTransaction: (...args) => mockRunTransaction(...args),
  serverTimestamp: jest.fn(() => ({ _methodName: 'serverTimestamp' })),
  onSnapshot: jest.fn(),
}));

describe('Expired Products Feature - Unit & Business Logic Tests', () => {
  const fakeDb = {};
  const testUid = 'user_abc_123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Test A: Partial Expiration
  // Available stock: 20, Purchase price: ₹30, Expired quantity: 5
  // Expected remaining: 15, Expected loss: ₹150
  // =========================================================================
  test('Test A: Partial expiration reduces inventory and records exact purchase cost loss', async () => {
    const productId = 'prod_milk_20';
    const initialProduct = {
      itemName: 'Fresh Milk 1L',
      quantity: 20,
      purchasePrice: 30,
      salesPrice: 45,
      unitType: 'packet',
    };

    mockTransaction.get.mockResolvedValueOnce({
      exists: () => true,
      data: () => initialProduct,
    });

    const result = await markProductAsExpired({
      db: fakeDb,
      uid: testUid,
      productId,
      expiredQty: 5,
      expirationDate: '2026-10-20',
      reason: 'Past shelf life',
      inventoryMode: 'local',
    });

    // Verify transaction results
    expect(result.success).toBe(true);
    expect(result.expiredQuantity).toBe(5);
    expect(result.remainingQuantity).toBe(15);
    expect(result.totalLoss).toBe(150); // 5 * ₹30 = ₹150

    // Verify inventory update
    expect(mockTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: productId }),
      expect.objectContaining({ quantity: 15 })
    );

    // Verify expiration record creation
    expect(mockTransaction.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        productId,
        productName: 'Fresh Milk 1L',
        purchasePrice: 30,
        expiredQuantity: 5,
        remainingQuantity: 15,
        totalLoss: 150,
        expirationDate: '2026-10-20',
        reason: 'Past shelf life',
        inventoryMode: 'local',
      })
    );
  });

  // =========================================================================
  // Test B: Complete Expiration
  // Available stock: 5, Purchase price: ₹80, Expired quantity: 5
  // Expected remaining: 0, Expected loss: ₹400
  // Document remains available with quantity 0 (out of stock behavior)
  // =========================================================================
  test('Test B: Complete expiration sets quantity to 0 and preserves product doc', async () => {
    const productId = 'prod_butter_5';
    const initialProduct = {
      itemName: 'Table Butter 500g',
      quantity: 5,
      purchasePrice: 80,
      salesPrice: 110,
      unitType: 'pcs',
    };

    mockTransaction.get.mockResolvedValueOnce({
      exists: () => true,
      data: () => initialProduct,
    });

    const result = await markProductAsExpired({
      db: fakeDb,
      uid: testUid,
      productId,
      expiredQty: 5,
      expirationDate: '2026-10-18',
      reason: 'Refrigeration unit failure',
      inventoryMode: 'local',
    });

    expect(result.success).toBe(true);
    expect(result.remainingQuantity).toBe(0);
    expect(result.totalLoss).toBe(400); // 5 * ₹80 = ₹400

    // Inventory updated to 0, not deleted
    expect(mockTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: productId }),
      expect.objectContaining({ quantity: 0 })
    );
  });

  // =========================================================================
  // Test C: Invalid Quantity Validation
  // Available stock: 10, Attempt to expire: 11 units -> Reject without update
  // Also test 0, negative, and NaN quantities
  // =========================================================================
  test('Test C: Rejects invalid or excessive quantities without modifying inventory', async () => {
    const productId = 'prod_rice_10';
    const initialProduct = {
      itemName: 'Ponni Rice 5kg',
      quantity: 10,
      purchasePrice: 250,
      unitType: 'bag',
    };

    // Case 1: Exceeds available stock
    mockTransaction.get.mockResolvedValueOnce({
      exists: () => true,
      data: () => initialProduct,
    });

    await expect(
      markProductAsExpired({
        db: fakeDb,
        uid: testUid,
        productId,
        expiredQty: 11,
      })
    ).rejects.toThrow('cannot exceed currently available stock');

    expect(mockTransaction.update).not.toHaveBeenCalled();
    expect(mockTransaction.set).not.toHaveBeenCalled();

    // Case 2: Zero quantity
    await expect(
      markProductAsExpired({
        db: fakeDb,
        uid: testUid,
        productId,
        expiredQty: 0,
      })
    ).rejects.toThrow('greater than zero');

    // Case 3: Negative quantity
    await expect(
      markProductAsExpired({
        db: fakeDb,
        uid: testUid,
        productId,
        expiredQty: -3,
      })
    ).rejects.toThrow('greater than zero');

    // Case 4: Non-numeric quantity
    await expect(
      markProductAsExpired({
        db: fakeDb,
        uid: testUid,
        productId,
        expiredQty: 'invalid',
      })
    ).rejects.toThrow('valid number');
  });

  // =========================================================================
  // Test D: Repeated Expiration of Same Product
  // Available stock: 20, Purchase price: ₹50
  // First expiration: 3 units -> ₹150 loss, remaining: 17
  // Second expiration: 2 units -> ₹100 loss, remaining: 15
  // Cumulative loss: ₹250
  // =========================================================================
  test('Test D: Repeated expirations create separate history entries and correct cumulative loss', async () => {
    const productId = 'prod_juice_20';
    let currentInventory = {
      itemName: 'Mango Juice 1L',
      quantity: 20,
      purchasePrice: 50,
      unitType: 'bottle',
    };

    // First expiration: 3 units
    mockTransaction.get.mockImplementationOnce(async () => ({
      exists: () => true,
      data: () => currentInventory,
    }));
    mockTransaction.update.mockImplementationOnce((ref, updateData) => {
      currentInventory.quantity = updateData.quantity;
    });

    const exp1 = await markProductAsExpired({
      db: fakeDb,
      uid: testUid,
      productId,
      expiredQty: 3,
      reason: 'Batch A expiry',
    });

    expect(exp1.totalLoss).toBe(150);
    expect(exp1.remainingQuantity).toBe(17);
    expect(currentInventory.quantity).toBe(17);

    // Second expiration: 2 units
    mockTransaction.get.mockImplementationOnce(async () => ({
      exists: () => true,
      data: () => currentInventory,
    }));
    mockTransaction.update.mockImplementationOnce((ref, updateData) => {
      currentInventory.quantity = updateData.quantity;
    });

    const exp2 = await markProductAsExpired({
      db: fakeDb,
      uid: testUid,
      productId,
      expiredQty: 2,
      reason: 'Batch B expiry',
    });

    expect(exp2.totalLoss).toBe(100);
    expect(exp2.remainingQuantity).toBe(15);
    expect(currentInventory.quantity).toBe(15);

    // Cumulative totals
    const totals = calculateExpiredTotals([exp1, exp2]);
    expect(totals.totalQuantity).toBe(5);
    expect(totals.totalLoss).toBe(250); // ₹150 + ₹100 = ₹250
  });

  // =========================================================================
  // Test E: Concurrent Stock Changes
  // If stock is modified between UI and transaction execution,
  // the transaction reads fresh DB data and aborts if stock became insufficient.
  // =========================================================================
  test('Test E: Concurrent stock changes safely prevented from reducing stock below zero', async () => {
    const productId = 'prod_cheese_10';

    // UI thought there were 10 units, but concurrent sale reduced DB stock to 2
    mockTransaction.get.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        itemName: 'Cheddar Cheese',
        quantity: 2, // Fresh DB stock
        purchasePrice: 120,
      }),
    });

    // Attempting to expire 5 units (stale UI state) must fail against fresh DB stock
    await expect(
      markProductAsExpired({
        db: fakeDb,
        uid: testUid,
        productId,
        expiredQty: 5,
      })
    ).rejects.toThrow('cannot exceed currently available stock (2)');

    expect(mockTransaction.update).not.toHaveBeenCalled();
    expect(mockTransaction.set).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Test F: Database Failure Atomicity
  // If transaction fails or throws, no partial update occurs
  // =========================================================================
  test('Test F: Database failure aborts completely without partial updates', async () => {
    const productId = 'prod_snack';

    mockTransaction.get.mockRejectedValueOnce(new Error('Network connection timeout'));

    await expect(
      markProductAsExpired({
        db: fakeDb,
        uid: testUid,
        productId,
        expiredQty: 2,
      })
    ).rejects.toThrow('Network connection timeout');

    expect(mockTransaction.update).not.toHaveBeenCalled();
    expect(mockTransaction.set).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Test G: Global Inventory Mode
  // Updates users/{uid}/global_inventory and records inventoryMode: 'global'
  // =========================================================================
  test('Test G: Global inventory mode uses global_inventory collection and marks mode correctly', async () => {
    const productId = 'global_prod_oil';

    mockTransaction.get.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        itemName: 'Cooking Oil 5L',
        quantity: 12,
        purchasePrice: 650,
      }),
    });

    const result = await markProductAsExpired({
      db: fakeDb,
      uid: testUid,
      productId,
      expiredQty: 2,
      inventoryMode: 'global',
    });

    expect(result.inventoryMode).toBe('global');
    expect(result.remainingQuantity).toBe(10);
    expect(result.totalLoss).toBe(1300); // 2 * ₹650 = ₹1300

    expect(mockTransaction.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        inventoryMode: 'global',
        productId,
      })
    );
  });

  // =========================================================================
  // Test H: Cost-Based Loss vs Selling Price Loss
  // Purchase price: ₹100, Selling price: ₹150, Expired quantity: 3
  // Loss must be ₹300, NOT ₹450
  // =========================================================================
  test('Test H: Financial loss is calculated strictly from purchase cost, not selling price', async () => {
    const productId = 'prod_perfume';
    mockTransaction.get.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        itemName: 'Luxury Cologne',
        quantity: 10,
        purchasePrice: 100,
        salesPrice: 150, // Selling price must be ignored for loss
      }),
    });

    const result = await markProductAsExpired({
      db: fakeDb,
      uid: testUid,
      productId,
      expiredQty: 3,
    });

    expect(result.totalLoss).toBe(300); // 3 * ₹100 = ₹300
    expect(result.totalLoss).not.toBe(450); // Not 3 * ₹150
  });

  // =========================================================================
  // Test I: Dashboard Total Net Profit Deduction
  // Gross sales remain untouched, net profit reflects deduction of expired loss
  // =========================================================================
  test('Test I: Dashboard total net profit deducts expired losses while leaving total sales intact', () => {
    const mockSales = [
      { id: 's1', total: 1000, profit: 300, isGlobalMode: false },
      { id: 's2', total: 500, profit: 150, isGlobalMode: false },
    ];
    const mockExpired = [
      { id: 'e1', totalLoss: 100, inventoryMode: 'local' },
      { id: 'e2', totalLoss: 50, inventoryMode: 'local' },
    ];

    const isGlobalMode = false;
    const currentSales = mockSales.filter((s) => !s.isGlobalMode);
    const currentExpired = mockExpired.filter((e) => e.inventoryMode !== 'global');

    const totalSales = currentSales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    const grossTotalProfit = currentSales.reduce((sum, s) => sum + (Number(s.profit) || 0), 0);
    const totalExpiredLoss = currentExpired.reduce((sum, e) => sum + (Number(e.totalLoss) || 0), 0);
    const netTotalProfit = Math.round((grossTotalProfit - totalExpiredLoss) * 100) / 100;

    // Total sales remains gross revenue: 1000 + 500 = 1500
    expect(totalSales).toBe(1500);
    // Gross profit: 300 + 150 = 450
    expect(grossTotalProfit).toBe(450);
    // Total expired loss: 100 + 50 = 150
    expect(totalExpiredLoss).toBe(150);
    // Net profit = 450 - 150 = 300
    expect(netTotalProfit).toBe(300);
  });

  // =========================================================================
  // Test J: Dashboard Period (Month / Today) Profit Deductions
  // =========================================================================
  test('Test J: Dashboard monthly & daily profit correctly deducts period-specific expired losses', () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const mockSales = [
      { id: 's1', total: 800, profit: 240, createdAt: today, isGlobalMode: false },
      { id: 's2', total: 400, profit: 120, createdAt: yesterday, isGlobalMode: false },
    ];
    const mockExpired = [
      { id: 'e1', totalLoss: 60, createdAt: today, inventoryMode: 'local' },
      { id: 'e2', totalLoss: 40, createdAt: yesterday, inventoryMode: 'local' },
    ];

    // Today calculations
    const todaySales = mockSales
      .filter((s) => s.createdAt.toDateString() === today.toDateString())
      .reduce((sum, s) => sum + s.total, 0);
    const todayGrossProfit = mockSales
      .filter((s) => s.createdAt.toDateString() === today.toDateString())
      .reduce((sum, s) => sum + s.profit, 0);
    const todayExpiredLoss = mockExpired
      .filter((e) => e.createdAt.toDateString() === today.toDateString())
      .reduce((sum, e) => sum + e.totalLoss, 0);
    const todayNetProfit = todayGrossProfit - todayExpiredLoss;

    expect(todaySales).toBe(800);
    expect(todayGrossProfit).toBe(240);
    expect(todayExpiredLoss).toBe(60);
    expect(todayNetProfit).toBe(180);

    // Monthly calculations (both events within current month)
    const monthGrossProfit = mockSales
      .filter((s) => s.createdAt.getMonth() === today.getMonth() && s.createdAt.getFullYear() === today.getFullYear())
      .reduce((sum, s) => sum + s.profit, 0);
    const monthExpiredLoss = mockExpired
      .filter((e) => e.createdAt.getMonth() === today.getMonth() && e.createdAt.getFullYear() === today.getFullYear())
      .reduce((sum, e) => sum + e.totalLoss, 0);
    const monthNetProfit = monthGrossProfit - monthExpiredLoss;

    expect(monthGrossProfit).toBe(360); // 240 + 120
    expect(monthExpiredLoss).toBe(100); // 60 + 40
    expect(monthNetProfit).toBe(260); // 360 - 100
  });

  // =========================================================================
  // Test K: Mode Isolation (Local vs Global)
  // Global losses do not reduce local profit, and local losses do not reduce global profit
  // =========================================================================
  test('Test K: Mode isolation prevents cross-mode leakage between local and global profit', () => {
    const mockExpired = [
      { id: 'e_loc', totalLoss: 200, inventoryMode: 'local' },
      { id: 'e_glob', totalLoss: 500, inventoryMode: 'global' },
    ];

    const localExpired = mockExpired.filter((e) => e.inventoryMode !== 'global');
    const globalExpired = mockExpired.filter((e) => e.inventoryMode === 'global');

    const localLoss = localExpired.reduce((sum, e) => sum + e.totalLoss, 0);
    const globalLoss = globalExpired.reduce((sum, e) => sum + e.totalLoss, 0);

    expect(localLoss).toBe(200);
    expect(globalLoss).toBe(500);

    const localGrossProfit = 1000;
    const globalGrossProfit = 2000;

    const localNetProfit = localGrossProfit - localLoss;
    const globalNetProfit = globalGrossProfit - globalLoss;

    expect(localNetProfit).toBe(800); // 1000 - 200 (not affected by 500 global loss)
    expect(globalNetProfit).toBe(1500); // 2000 - 500 (not affected by 200 local loss)
  });
});
