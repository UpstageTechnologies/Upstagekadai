import {
  calculateNewExpiry,
  getPlanLimits,
  isSubscriptionExpired,
  calculateRemainingDays,
  PLAN_NAMES,
} from "../src/utils/subscriptionService";

describe("Upstage POS – Subscription Screen Flow & Integration Tests", () => {
  const NOW = new Date("2026-11-11T14:00:00.000Z").getTime();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  describe("Subscription Flow Data Payloads", () => {
    it("should generate correct payload for Basic Plan switch", () => {
      const uid = "USER_TEST_123";
      const newExpiry = calculateNewExpiry(365, null, NOW);
      const limits = getPlanLimits(PLAN_NAMES.BASIC);

      const firestorePayload = {
        userPlan: "Basic",
        subscriptionPlan: "Basic",
        subscriptionCycle: "yearly",
        subscriptionDays: 365,
        subscriptionActive: true,
        subscriptionExpiry: newExpiry,
        customShopUid: uid,
        inventoryLimit: limits.inventoryLimit,
        purchaseLimit: limits.purchaseLimit,
        reportLimitMonths: limits.reportLimitMonths,
        lastUpdated: NOW,
      };

      expect(firestorePayload.userPlan).toBe("Basic");
      expect(firestorePayload.inventoryLimit).toBe(10);
      expect(firestorePayload.purchaseLimit).toBe(10);
      expect(firestorePayload.reportLimitMonths).toBe(1);
      expect(firestorePayload.subscriptionActive).toBe(true);
      expect(firestorePayload.subscriptionExpiry).toBe(NOW + 365 * ONE_DAY_MS);
    });

    it("should generate correct payload for Premium Monthly subscription", () => {
      const uid = "USER_TEST_PREM";
      const newExpiry = calculateNewExpiry(30, null, NOW);
      const limits = getPlanLimits(PLAN_NAMES.PREMIUM);

      const firestorePayload = {
        userPlan: "Premium",
        subscriptionPlan: "Premium",
        subscriptionCycle: "monthly",
        subscriptionDays: 30,
        subscriptionActive: true,
        subscriptionExpiry: newExpiry,
        customShopUid: uid,
        razorpayPaymentId: "pay_test_123456",
        inventoryLimit: limits.inventoryLimit,
        purchaseLimit: limits.purchaseLimit,
        reportLimitMonths: limits.reportLimitMonths,
        lastPaymentDate: NOW,
      };

      expect(firestorePayload.userPlan).toBe("Premium");
      expect(firestorePayload.inventoryLimit).toBe(200);
      expect(firestorePayload.purchaseLimit).toBe(200);
      expect(firestorePayload.reportLimitMonths).toBe(3);
      expect(firestorePayload.razorpayPaymentId).toBe("pay_test_123456");
      expect(firestorePayload.subscriptionExpiry).toBe(NOW + 30 * ONE_DAY_MS);
    });

    it("should generate correct payload for Pro Yearly subscription", () => {
      const uid = "USER_TEST_PRO";
      const newExpiry = calculateNewExpiry(365, null, NOW);
      const limits = getPlanLimits(PLAN_NAMES.PRO);

      const firestorePayload = {
        userPlan: "Pro",
        subscriptionPlan: "Pro",
        subscriptionCycle: "yearly",
        subscriptionDays: 365,
        subscriptionActive: true,
        subscriptionExpiry: newExpiry,
        customShopUid: uid,
        razorpayPaymentId: "pay_test_999999",
        inventoryLimit: limits.inventoryLimit,
        purchaseLimit: limits.purchaseLimit,
        reportLimitMonths: limits.reportLimitMonths,
        lastPaymentDate: NOW,
      };

      expect(firestorePayload.userPlan).toBe("Pro");
      expect(firestorePayload.inventoryLimit).toBe(-1); // Unlimited
      expect(firestorePayload.purchaseLimit).toBe(-1);  // Unlimited
      expect(firestorePayload.reportLimitMonths).toBe(-1); // Unlimited
      expect(firestorePayload.subscriptionExpiry).toBe(NOW + 365 * ONE_DAY_MS);
    });

    it("should correctly handle renewal when user has 5 active days remaining", () => {
      const currentExpiry = NOW + (5 * ONE_DAY_MS);
      const newExpiry = calculateNewExpiry(30, currentExpiry, NOW);

      // Remaining days must be 5 + 30 = 35 days
      expect(calculateRemainingDays(newExpiry, NOW)).toBe(35);
      expect(newExpiry).toBe(currentExpiry + (30 * ONE_DAY_MS));
    });

    it("should correctly handle renewal when user is already expired 2 days ago", () => {
      const currentExpiry = NOW - (2 * ONE_DAY_MS);
      const newExpiry = calculateNewExpiry(30, currentExpiry, NOW);

      // Remaining days must be 30 days from NOW
      expect(calculateRemainingDays(newExpiry, NOW)).toBe(30);
      expect(newExpiry).toBe(NOW + (30 * ONE_DAY_MS));
    });
  });

  describe("Razorpay Cancellation vs Error Discrimination", () => {
    it("should identify user cancellation error codes", () => {
      const errorObjCode0 = { code: 0, description: "Payment processing cancelled by user" };
      const errorObjString0 = { code: "0", description: "cancelled" };
      const errorObjMessage = { message: "User cancelled the payment" };

      const isCancelled = (err) =>
        err?.code === 0 ||
        err?.code === "0" ||
        (typeof err?.description === "string" && err.description.toLowerCase().includes("cancel")) ||
        (typeof err?.message === "string" && err.message.toLowerCase().includes("cancel"));

      expect(isCancelled(errorObjCode0)).toBe(true);
      expect(isCancelled(errorObjString0)).toBe(true);
      expect(isCancelled(errorObjMessage)).toBe(true);

      const realError = { code: 2, description: "Card declined by issuing bank" };
      expect(isCancelled(realError)).toBe(false);
    });
  });

  describe("Session Synchronization Payload", () => {
    it("should prepare updated session payload to unlock Dashboard on next boot", () => {
      const oldSession = {
        route: "Subscription",
        uid: "USER_123",
        shopType: "retail",
      };

      const newExpiry = NOW + (30 * ONE_DAY_MS);
      const updatedSession = {
        ...oldSession,
        route: "Dashboard",
        userPlan: "Premium",
        subscriptionPlan: "Premium",
        subscriptionActive: true,
        subscriptionExpiry: newExpiry,
      };

      expect(updatedSession.route).toBe("Dashboard");
      expect(updatedSession.subscriptionActive).toBe(true);
      expect(updatedSession.userPlan).toBe("Premium");
      expect(isSubscriptionExpired(updatedSession.subscriptionExpiry, NOW)).toBe(false);
    });
  });
});
