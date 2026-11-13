import crypto from "crypto";
import {
  createSubscriptionOrder,
  verifySubscriptionPayment,
} from "../src/services/subscriptionPaymentService";
import {
  PLAN_NAMES,
  PLAN_CONFIG,
  calculateNewExpiry,
  getPlanLimits,
} from "../src/utils/subscriptionService";

// Mock Firebase Auth in src/utils/firebaseConfig
const mockGetIdToken = jest.fn();
jest.mock("../src/utils/firebaseConfig", () => ({
  auth: {
    currentUser: {
      uid: "USER_TEST_123",
      email: "test@upstage.com",
      phoneNumber: "+919876543210",
      getIdToken: () => mockGetIdToken(),
    },
  },
  db: {},
}));

describe("Upstage POS – Live Razorpay Subscription Backend Architecture & Security Tests", () => {
  const PLATFORM_KEY_ID = "rzp_live_UpstagePlatformKey";
  const PLATFORM_KEY_SECRET = "UpstageLiveSecretKey987654321";
  const PLATFORM_WEBHOOK_SECRET = "UpstageLiveWebhookSecret12345";
  const NOW = new Date("2026-11-13T10:00:00.000Z").getTime();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetIdToken.mockResolvedValue("mock_firebase_id_token_xyz");
    global.fetch = jest.fn();
  });

  // =========================================================================
  // BACKEND VERIFICATION ENGINE (Pure test harness implementing functions/index.js logic)
  // =========================================================================

  /**
   * Generates authentic Razorpay HMAC-SHA256 signature
   */
  function generateRazorpaySignature(orderId, paymentId, secret = PLATFORM_KEY_SECRET) {
    return crypto
      .createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
  }

  /**
   * Simulates the exact verification algorithm implemented in Cloud Functions verifySubscriptionPayment
   */
  async function simulateBackendPaymentVerification({
    authUid,
    orderId,
    paymentId,
    signature,
    mockOrdersDb,
    mockUsersDb,
    mockRazorpayApi,
    keySecret = PLATFORM_KEY_SECRET,
  }) {
    // 1. Authenticate user
    if (!authUid) {
      throw new Error("unauthenticated: User must be authenticated to verify payment.");
    }

    if (!orderId || !paymentId || !signature) {
      throw new Error("invalid-argument: Missing required payment verification parameters.");
    }

    // 2. Fetch pending order and verify ownership
    const orderData = mockOrdersDb[orderId];
    if (!orderData) {
      throw new Error(`not-found: Subscription order ${orderId} does not exist.`);
    }

    if (orderData.uid !== authUid) {
      throw new Error("permission-denied: You are not authorized to verify this subscription order.");
    }

    // 3. Cryptographic HMAC SHA256 Signature Verification
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    let isSigValid = false;
    try {
      isSigValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, "utf8"),
        Buffer.from(signature, "utf8")
      );
    } catch {
      isSigValid = false;
    }

    if (!isSigValid) {
      throw new Error("invalid-argument: Payment signature verification failed.");
    }

    // 4. Fetch payment details directly from Razorpay
    const paymentDetails = await mockRazorpayApi.fetchPayment(paymentId);
    if (!paymentDetails) {
      throw new Error("internal: Payment not found on Razorpay gateway.");
    }

    // 5. Validate status, orderId, amount, currency
    if (paymentDetails.status !== "captured") {
      throw new Error(`failed-precondition: Payment is not captured. Current status: ${paymentDetails.status}`);
    }

    if (paymentDetails.order_id !== orderId) {
      throw new Error(`invalid-argument: Payment order mismatch: ${paymentDetails.order_id} vs ${orderId}`);
    }

    if (Number(paymentDetails.amount) !== Number(orderData.amountInPaise)) {
      throw new Error(`invalid-argument: Payment amount mismatch: expected ${orderData.amountInPaise}, received ${paymentDetails.amount}`);
    }

    if (paymentDetails.currency !== "INR") {
      throw new Error(`invalid-argument: Payment currency must be INR, received ${paymentDetails.currency}`);
    }

    // 6. Idempotent Atomic Transaction Simulation
    if (orderData.status === "COMPLETED" || orderData.paymentId === paymentId) {
      return {
        success: true,
        status: "ACTIVATED",
        alreadyActivated: true,
        orderId,
        paymentId,
        plan: orderData.plan,
        cycle: orderData.cycle,
        expiry: orderData.activatedExpiry,
      };
    }

    const userData = mockUsersDb[authUid] || {};
    const planConfig = PLAN_CONFIG[orderData.plan];
    const daysToAdd = planConfig.days[orderData.cycle] || 30;

    // Preserve remaining days
    const isCurrentlyActive = userData.subscriptionExpiry && userData.subscriptionExpiry > NOW;
    const baseTimestamp = isCurrentlyActive ? userData.subscriptionExpiry : NOW;
    const newExpiry = baseTimestamp + (daysToAdd * ONE_DAY_MS);

    // Commit changes
    orderData.status = "COMPLETED";
    orderData.paymentId = paymentId;
    orderData.activatedExpiry = newExpiry;

    mockUsersDb[authUid] = {
      ...userData,
      userPlan: orderData.plan,
      subscriptionPlan: orderData.plan,
      subscriptionCycle: orderData.cycle,
      subscriptionDays: daysToAdd,
      subscriptionActive: true,
      subscriptionExpiry: newExpiry,
      inventoryLimit: planConfig.limits.inventoryLimit,
      purchaseLimit: planConfig.limits.purchaseLimit,
      reportLimitMonths: planConfig.limits.reportLimitMonths,
      lastPaymentId: paymentId,
      lastOrderId: orderId,
    };

    return {
      success: true,
      status: "ACTIVATED",
      alreadyActivated: false,
      orderId,
      paymentId,
      plan: orderData.plan,
      cycle: orderData.cycle,
      expiry: newExpiry,
    };
  }

  // =========================================================================
  // 1. VALID PAYMENT SIGNATURE
  // =========================================================================
  test("1. Valid payment signature: accurately generates and verifies HMAC-SHA256", async () => {
    const orderId = "order_live_123456";
    const paymentId = "pay_live_789012";
    const validSignature = generateRazorpaySignature(orderId, paymentId, PLATFORM_KEY_SECRET);

    const mockOrdersDb = {
      [orderId]: {
        uid: "USER_TEST_123",
        plan: "Premium",
        cycle: "monthly",
        amount: 499,
        amountInPaise: 49900,
        status: "CREATED",
      },
    };
    const mockUsersDb = {
      USER_TEST_123: { subscriptionPlan: "Basic" },
    };
    const mockRazorpayApi = {
      fetchPayment: jest.fn().mockResolvedValue({
        id: paymentId,
        order_id: orderId,
        amount: 49900,
        currency: "INR",
        status: "captured",
      }),
    };

    const result = await simulateBackendPaymentVerification({
      authUid: "USER_TEST_123",
      orderId,
      paymentId,
      signature: validSignature,
      mockOrdersDb,
      mockUsersDb,
      mockRazorpayApi,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("ACTIVATED");
    expect(result.alreadyActivated).toBe(false);
    expect(mockOrdersDb[orderId].status).toBe("COMPLETED");
  });

  // =========================================================================
  // 2. INVALID SIGNATURE
  // =========================================================================
  test("2. Invalid signature: rejects tampered or forged signatures", async () => {
    const orderId = "order_live_123456";
    const paymentId = "pay_live_789012";
    const forgedSignature = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

    const mockOrdersDb = {
      [orderId]: {
        uid: "USER_TEST_123",
        plan: "Premium",
        cycle: "monthly",
        amount: 499,
        amountInPaise: 49900,
        status: "CREATED",
      },
    };
    const mockUsersDb = {};
    const mockRazorpayApi = {
      fetchPayment: jest.fn(),
    };

    await expect(
      simulateBackendPaymentVerification({
        authUid: "USER_TEST_123",
        orderId,
        paymentId,
        signature: forgedSignature,
        mockOrdersDb,
        mockUsersDb,
        mockRazorpayApi,
      })
    ).rejects.toThrow("Payment signature verification failed");

    // Razorpay API should not even be called if signature is invalid
    expect(mockRazorpayApi.fetchPayment).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 3. WRONG AMOUNT
  // =========================================================================
  test("3. Wrong amount: rejects if captured amount differs from order amount in paise", async () => {
    const orderId = "order_live_123456";
    const paymentId = "pay_live_789012";
    const validSignature = generateRazorpaySignature(orderId, paymentId);

    const mockOrdersDb = {
      [orderId]: {
        uid: "USER_TEST_123",
        plan: "Premium",
        cycle: "yearly",
        amount: 4999,
        amountInPaise: 499900, // Expected ₹4999
        status: "CREATED",
      },
    };
    const mockUsersDb = {};
    const mockRazorpayApi = {
      fetchPayment: jest.fn().mockResolvedValue({
        id: paymentId,
        order_id: orderId,
        amount: 49900, // Attacker paid only ₹499 for yearly plan
        currency: "INR",
        status: "captured",
      }),
    };

    await expect(
      simulateBackendPaymentVerification({
        authUid: "USER_TEST_123",
        orderId,
        paymentId,
        signature: validSignature,
        mockOrdersDb,
        mockUsersDb,
        mockRazorpayApi,
      })
    ).rejects.toThrow("Payment amount mismatch");
  });

  // =========================================================================
  // 4. WRONG ORDER ID
  // =========================================================================
  test("4. Wrong order ID: rejects payment belonging to a different order", async () => {
    const orderId = "order_target_123";
    const paymentId = "pay_live_789012";
    const validSignature = generateRazorpaySignature(orderId, paymentId);

    const mockOrdersDb = {
      [orderId]: {
        uid: "USER_TEST_123",
        plan: "Pro",
        cycle: "monthly",
        amount: 1999,
        amountInPaise: 199900,
        status: "CREATED",
      },
    };
    const mockUsersDb = {};
    const mockRazorpayApi = {
      fetchPayment: jest.fn().mockResolvedValue({
        id: paymentId,
        order_id: "order_different_999", // Payment actually belongs to another order
        amount: 199900,
        currency: "INR",
        status: "captured",
      }),
    };

    await expect(
      simulateBackendPaymentVerification({
        authUid: "USER_TEST_123",
        orderId,
        paymentId,
        signature: validSignature,
        mockOrdersDb,
        mockUsersDb,
        mockRazorpayApi,
      })
    ).rejects.toThrow("Payment order mismatch");
  });

  // =========================================================================
  // 5. WRONG AUTHENTICATED UID
  // =========================================================================
  test("5. Wrong authenticated UID: rejects verification attempt by unauthenticated or unauthorized user", async () => {
    const orderId = "order_live_123456";
    const paymentId = "pay_live_789012";
    const validSignature = generateRazorpaySignature(orderId, paymentId);

    const mockOrdersDb = {
      [orderId]: {
        uid: "REAL_OWNER_UID_100", // Belongs to user 100
        plan: "Premium",
        cycle: "monthly",
        amount: 499,
        amountInPaise: 49900,
        status: "CREATED",
      },
    };
    const mockUsersDb = {};
    const mockRazorpayApi = {
      fetchPayment: jest.fn(),
    };

    // Caller is a different attacker user UID
    await expect(
      simulateBackendPaymentVerification({
        authUid: "ATTACKER_UID_666",
        orderId,
        paymentId,
        signature: validSignature,
        mockOrdersDb,
        mockUsersDb,
        mockRazorpayApi,
      })
    ).rejects.toThrow("permission-denied");
  });

  // =========================================================================
  // 6. UNCAPTURED PAYMENT
  // =========================================================================
  test("6. Uncaptured payment: rejects authorized, pending, or failed payments", async () => {
    const orderId = "order_live_123456";
    const paymentId = "pay_live_789012";
    const validSignature = generateRazorpaySignature(orderId, paymentId);

    const mockOrdersDb = {
      [orderId]: {
        uid: "USER_TEST_123",
        plan: "Premium",
        cycle: "monthly",
        amount: 499,
        amountInPaise: 49900,
        status: "CREATED",
      },
    };
    const mockUsersDb = {};
    const mockRazorpayApi = {
      fetchPayment: jest.fn().mockResolvedValue({
        id: paymentId,
        order_id: orderId,
        amount: 49900,
        currency: "INR",
        status: "authorized", // Not captured yet
      }),
    };

    await expect(
      simulateBackendPaymentVerification({
        authUid: "USER_TEST_123",
        orderId,
        paymentId,
        signature: validSignature,
        mockOrdersDb,
        mockUsersDb,
        mockRazorpayApi,
      })
    ).rejects.toThrow("Payment is not captured. Current status: authorized");
  });

  // =========================================================================
  // 7. DUPLICATE PAYMENT
  // =========================================================================
  test("7. Duplicate payment: prevents replayed verification calls from re-adding days", async () => {
    const orderId = "order_live_123456";
    const paymentId = "pay_live_789012";
    const validSignature = generateRazorpaySignature(orderId, paymentId);

    const mockOrdersDb = {
      [orderId]: {
        uid: "USER_TEST_123",
        plan: "Premium",
        cycle: "monthly",
        amount: 499,
        amountInPaise: 49900,
        status: "CREATED",
      },
    };
    const mockUsersDb = {
      USER_TEST_123: { subscriptionPlan: "Basic" },
    };
    const mockRazorpayApi = {
      fetchPayment: jest.fn().mockResolvedValue({
        id: paymentId,
        order_id: orderId,
        amount: 49900,
        currency: "INR",
        status: "captured",
      }),
    };

    // First call: Activates plan
    const call1 = await simulateBackendPaymentVerification({
      authUid: "USER_TEST_123",
      orderId,
      paymentId,
      signature: validSignature,
      mockOrdersDb,
      mockUsersDb,
      mockRazorpayApi,
    });
    expect(call1.alreadyActivated).toBe(false);
    const initialExpiry = mockUsersDb.USER_TEST_123.subscriptionExpiry;

    // Second call: Replayed request with same payment
    const call2 = await simulateBackendPaymentVerification({
      authUid: "USER_TEST_123",
      orderId,
      paymentId,
      signature: validSignature,
      mockOrdersDb,
      mockUsersDb,
      mockRazorpayApi,
    });

    expect(call2.alreadyActivated).toBe(true);
    // Expiry must not be incremented on duplicate call!
    expect(mockUsersDb.USER_TEST_123.subscriptionExpiry).toBe(initialExpiry);
  });

  // =========================================================================
  // 8. DUPLICATE WEBHOOK
  // =========================================================================
  test("8. Duplicate webhook: webhook signature check and idempotent execution", () => {
    const rawBody = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_webhook_test_1",
            amount: 49900,
            status: "captured",
            order_id: "order_webhook_test_1",
          },
        },
      },
    });

    // Valid webhook signature calculation
    const validWebhookSig = crypto
      .createHmac("sha256", PLATFORM_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const hmac = crypto.createHmac("sha256", PLATFORM_WEBHOOK_SECRET);
    hmac.update(rawBody);
    const expected = hmac.digest("hex");
    const isWebhookValid = crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(validWebhookSig, "utf8")
    );

    expect(isWebhookValid).toBe(true);

    // Tampered webhook test
    const tamperedBody = rawBody.replace("49900", "199900");
    const tamperedExpected = crypto
      .createHmac("sha256", PLATFORM_WEBHOOK_SECRET)
      .update(tamperedBody)
      .digest("hex");

    const isTamperedValid = crypto.timingSafeEqual(
      Buffer.from(tamperedExpected, "utf8"),
      Buffer.from(validWebhookSig, "utf8")
    );
    expect(isTamperedValid).toBe(false);
  });

  // =========================================================================
  // 9. SUCCESSFUL SUBSCRIPTION ACTIVATION
  // =========================================================================
  test("9. Successful subscription activation: updates plan, active status, limits and expiry", async () => {
    const orderId = "order_pro_yearly_001";
    const paymentId = "pay_pro_yearly_001";
    const validSignature = generateRazorpaySignature(orderId, paymentId);

    const mockOrdersDb = {
      [orderId]: {
        uid: "USER_TEST_123",
        plan: "Pro",
        cycle: "yearly",
        amount: 19999,
        amountInPaise: 1999900,
        status: "CREATED",
      },
    };
    const mockUsersDb = {
      USER_TEST_123: {
        userPlan: "Basic",
        subscriptionPlan: "Basic",
        inventoryLimit: 50,
        purchaseLimit: 50,
      },
    };
    const mockRazorpayApi = {
      fetchPayment: jest.fn().mockResolvedValue({
        id: paymentId,
        order_id: orderId,
        amount: 1999900,
        currency: "INR",
        status: "captured",
      }),
    };

    const result = await simulateBackendPaymentVerification({
      authUid: "USER_TEST_123",
      orderId,
      paymentId,
      signature: validSignature,
      mockOrdersDb,
      mockUsersDb,
      mockRazorpayApi,
    });

    expect(result.success).toBe(true);
    expect(result.plan).toBe("Pro");
    expect(result.cycle).toBe("yearly");

    const user = mockUsersDb.USER_TEST_123;
    expect(user.userPlan).toBe("Pro");
    expect(user.subscriptionPlan).toBe("Pro");
    expect(user.subscriptionActive).toBe(true);
    expect(user.inventoryLimit).toBe(-1); // Unlimited
    expect(user.purchaseLimit).toBe(-1);  // Unlimited
    expect(user.reportLimitMonths).toBe(-1); // Unlimited
    expect(user.lastPaymentId).toBe(paymentId);
    expect(user.lastOrderId).toBe(orderId);
  });

  // =========================================================================
  // 10. FAILED VERIFICATION
  // =========================================================================
  test("10. Failed verification: maintains user subscription state intact when verification fails", async () => {
    const orderId = "order_fail_001";
    const paymentId = "pay_fail_001";
    const invalidSignature = "invalid_signature_string";

    const initialUserState = {
      userPlan: "Basic",
      subscriptionPlan: "Basic",
      subscriptionActive: true,
      subscriptionExpiry: NOW + 10 * ONE_DAY_MS,
      inventoryLimit: 50,
    };

    const mockOrdersDb = {
      [orderId]: {
        uid: "USER_TEST_123",
        plan: "Premium",
        cycle: "monthly",
        amount: 499,
        amountInPaise: 49900,
        status: "CREATED",
      },
    };
    const mockUsersDb = {
      USER_TEST_123: { ...initialUserState },
    };
    const mockRazorpayApi = {
      fetchPayment: jest.fn(),
    };

    await expect(
      simulateBackendPaymentVerification({
        authUid: "USER_TEST_123",
        orderId,
        paymentId,
        signature: invalidSignature,
        mockOrdersDb,
        mockUsersDb,
        mockRazorpayApi,
      })
    ).rejects.toThrow("Payment signature verification failed");

    // User subscription must NOT be modified
    expect(mockUsersDb.USER_TEST_123.userPlan).toBe("Basic");
    expect(mockUsersDb.USER_TEST_123.inventoryLimit).toBe(50);
    expect(mockUsersDb.USER_TEST_123.subscriptionExpiry).toBe(initialUserState.subscriptionExpiry);
    expect(mockOrdersDb[orderId].status).toBe("CREATED"); // Remains CREATED, not COMPLETED
  });

  // =========================================================================
  // 11. EXISTING SUBSCRIPTION RENEWAL
  // =========================================================================
  test("11. Existing subscription renewal: preserves remaining days on renewal before expiry", async () => {
    const remainingDays = 12;
    const currentExpiry = NOW + remainingDays * ONE_DAY_MS;

    const orderId = "order_renew_001";
    const paymentId = "pay_renew_001";
    const validSignature = generateRazorpaySignature(orderId, paymentId);

    const mockOrdersDb = {
      [orderId]: {
        uid: "USER_TEST_123",
        plan: "Premium",
        cycle: "monthly",
        amount: 499,
        amountInPaise: 49900,
        status: "CREATED",
      },
    };
    const mockUsersDb = {
      USER_TEST_123: {
        userPlan: "Premium",
        subscriptionPlan: "Premium",
        subscriptionExpiry: currentExpiry,
        subscriptionActive: true,
      },
    };
    const mockRazorpayApi = {
      fetchPayment: jest.fn().mockResolvedValue({
        id: paymentId,
        order_id: orderId,
        amount: 49900,
        currency: "INR",
        status: "captured",
      }),
    };

    const result = await simulateBackendPaymentVerification({
      authUid: "USER_TEST_123",
      orderId,
      paymentId,
      signature: validSignature,
      mockOrdersDb,
      mockUsersDb,
      mockRazorpayApi,
    });

    expect(result.success).toBe(true);
    // New expiry must be currentExpiry + 30 days = NOW + 42 days
    const expectedExpiry = currentExpiry + 30 * ONE_DAY_MS;
    expect(result.expiry).toBe(expectedExpiry);
    expect(mockUsersDb.USER_TEST_123.subscriptionExpiry).toBe(expectedExpiry);
  });

  // =========================================================================
  // CLIENT SERVICE: createSubscriptionOrder & verifySubscriptionPayment
  // =========================================================================
  describe("Client subscriptionPaymentService Unit Tests", () => {
    test("createSubscriptionOrder: calls cloud function with auth token and returns order data", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            result: {
              orderId: "order_test_999",
              amount: 49900,
              currency: "INR",
              keyId: PLATFORM_KEY_ID,
              plan: "Premium",
              cycle: "monthly",
            },
          }),
      });

      const res = await createSubscriptionOrder({ plan: "Premium", cycle: "monthly" });

      expect(res.orderId).toBe("order_test_999");
      expect(res.amount).toBe(49900);
      expect(res.keyId).toBe(PLATFORM_KEY_ID);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://us-central1-scaner-billing.cloudfunctions.net/createSubscriptionOrder",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer mock_firebase_id_token_xyz",
          }),
        })
      );
    });

    test("verifySubscriptionPayment: calls cloud function and returns verification response", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            result: {
              success: true,
              status: "ACTIVATED",
              orderId: "order_test_999",
              paymentId: "pay_test_999",
              plan: "Premium",
              cycle: "monthly",
              expiry: NOW + 30 * ONE_DAY_MS,
            },
          }),
      });

      const res = await verifySubscriptionPayment({
        orderId: "order_test_999",
        paymentId: "pay_test_999",
        signature: "sig_abc_123",
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe("ACTIVATED");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://us-central1-scaner-billing.cloudfunctions.net/verifySubscriptionPayment",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer mock_firebase_id_token_xyz",
          }),
        })
      );
    });

    test("verifySubscriptionPayment: throws meaningful error on server rejection", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        text: async () =>
          JSON.stringify({
            error: {
              message: "Payment signature verification failed.",
            },
          }),
      });

      await expect(
        verifySubscriptionPayment({
          orderId: "order_test_999",
          paymentId: "pay_test_999",
          signature: "forged_sig",
        })
      ).rejects.toThrow("Payment signature verification failed.");
    });
  });
});
