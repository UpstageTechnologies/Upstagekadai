import {
  PLAN_NAMES,
  BILLING_CYCLES,
  PLAN_CONFIG,
  normalizePlanName,
  calculateRemainingDays,
  isSubscriptionExpired,
  calculateNewExpiry,
  formatExpiryDate,
  getPlanLimits,
  canAddInventoryItem,
  canAccessReportForDate,
  canAccessShopUID,
  resolveUserSubscription,
} from "../src/utils/subscriptionService";

describe("Upstage POS – Complete Subscription System Audit & Unit Tests", () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const NOW = new Date("2026-11-11T12:00:00.000Z").getTime();

  describe("1. Plan Names & Normalization", () => {
    it("should correctly normalize valid and varied plan names", () => {
      expect(normalizePlanName("Basic")).toBe(PLAN_NAMES.BASIC);
      expect(normalizePlanName("BASIC")).toBe(PLAN_NAMES.BASIC);
      expect(normalizePlanName("basic ")).toBe(PLAN_NAMES.BASIC);
      expect(normalizePlanName("Premium")).toBe(PLAN_NAMES.PREMIUM);
      expect(normalizePlanName("PREMIUM")).toBe(PLAN_NAMES.PREMIUM);
      expect(normalizePlanName("premium_monthly")).toBe(PLAN_NAMES.PREMIUM);
      expect(normalizePlanName("Pro")).toBe(PLAN_NAMES.PRO);
      expect(normalizePlanName("PRO")).toBe(PLAN_NAMES.PRO);
      expect(normalizePlanName("pro_yearly")).toBe(PLAN_NAMES.PRO);
    });

    it("should safely default unknown or missing plan names to Basic", () => {
      expect(normalizePlanName(null)).toBe(PLAN_NAMES.BASIC);
      expect(normalizePlanName(undefined)).toBe(PLAN_NAMES.BASIC);
      expect(normalizePlanName("")).toBe(PLAN_NAMES.BASIC);
      expect(normalizePlanName("FreeTrial")).toBe(PLAN_NAMES.BASIC);
    });
  });

  describe("2. Plan Configuration & Limits", () => {
    it("should define Basic plan with 10 inventory items, 10 purchases, and 1 month reports", () => {
      const basic = PLAN_CONFIG[PLAN_NAMES.BASIC];
      expect(basic.name).toBe("Basic");
      expect(basic.limits.inventoryLimit).toBe(10);
      expect(basic.limits.purchaseLimit).toBe(10);
      expect(basic.limits.reportLimitMonths).toBe(1);
      expect(basic.days.yearly).toBe(365);
    });

    it("should define Premium plan with 200 inventory items, 200 purchases, and 3 months reports", () => {
      const premium = PLAN_CONFIG[PLAN_NAMES.PREMIUM];
      expect(premium.name).toBe("Premium");
      expect(premium.limits.inventoryLimit).toBe(200);
      expect(premium.limits.purchaseLimit).toBe(200);
      expect(premium.limits.reportLimitMonths).toBe(3);
      expect(premium.days.monthly).toBe(30);
      expect(premium.days.yearly).toBe(365);
      expect(premium.prices.monthly).toBe(499);
      expect(premium.prices.yearly).toBe(4999);
    });

    it("should define Pro plan with unlimited (-1) inventory, purchases, and journal reports", () => {
      const pro = PLAN_CONFIG[PLAN_NAMES.PRO];
      expect(pro.name).toBe("Pro");
      expect(pro.limits.inventoryLimit).toBe(-1);
      expect(pro.limits.purchaseLimit).toBe(-1);
      expect(pro.limits.reportLimitMonths).toBe(-1);
      expect(pro.days.monthly).toBe(30);
      expect(pro.days.yearly).toBe(365);
      expect(pro.prices.monthly).toBe(1999);
      expect(pro.prices.yearly).toBe(19999);
    });
  });

  describe("3. Subscription Duration & Date Calculations Audit", () => {
    it("Case: Subscription with 30 days remaining", () => {
      const expiry = NOW + (30 * ONE_DAY_MS);
      expect(calculateRemainingDays(expiry, NOW)).toBe(30);
      expect(isSubscriptionExpired(expiry, NOW)).toBe(false);
    });

    it("Case: Subscription with 7 days remaining", () => {
      const expiry = NOW + (7 * ONE_DAY_MS);
      expect(calculateRemainingDays(expiry, NOW)).toBe(7);
      expect(isSubscriptionExpired(expiry, NOW)).toBe(false);
    });

    it("Case: Subscription with 1 day remaining", () => {
      const expiry = NOW + (1 * ONE_DAY_MS);
      expect(calculateRemainingDays(expiry, NOW)).toBe(1);
      expect(isSubscriptionExpired(expiry, NOW)).toBe(false);
    });

    it("Case: Subscription expiring today (fraction of a day remaining)", () => {
      const expiry = NOW + (4 * 60 * 60 * 1000); // 4 hours left
      expect(calculateRemainingDays(expiry, NOW)).toBe(1); // rounded up to 1 day left
      expect(isSubscriptionExpired(expiry, NOW)).toBe(false);
    });

    it("Case: Subscription expired exactly at this moment", () => {
      expect(calculateRemainingDays(NOW, NOW)).toBe(0);
      expect(isSubscriptionExpired(NOW, NOW)).toBe(true);
    });

    it("Case: Subscription expired yesterday", () => {
      const expiry = NOW - ONE_DAY_MS;
      expect(calculateRemainingDays(expiry, NOW)).toBe(0);
      expect(isSubscriptionExpired(expiry, NOW)).toBe(true);
    });

    it("Case: Subscription expired 7 days ago", () => {
      const expiry = NOW - (7 * ONE_DAY_MS);
      expect(calculateRemainingDays(expiry, NOW)).toBe(0);
      expect(isSubscriptionExpired(expiry, NOW)).toBe(true);
    });

    it("Case: Subscription with invalid or missing expiry date", () => {
      expect(calculateRemainingDays(null, NOW)).toBe(0);
      expect(calculateRemainingDays(undefined, NOW)).toBe(0);
      expect(calculateRemainingDays(NaN, NOW)).toBe(0);
      expect(isSubscriptionExpired(null, NOW)).toBe(true);
      expect(isSubscriptionExpired(undefined, NOW)).toBe(true);
    });

    it("Case: Month-end and Year-end handling (Leap & Standard Years)", () => {
      const leapStart = new Date("2028-02-01T00:00:00Z").getTime();
      const newExpiry = calculateNewExpiry(30, null, leapStart);
      const remainingDays = calculateRemainingDays(newExpiry, leapStart);
      expect(remainingDays).toBe(30);

      const yearStart = new Date("2026-01-01T00:00:00Z").getTime();
      const yearExpiry = calculateNewExpiry(365, null, yearStart);
      expect(calculateRemainingDays(yearExpiry, yearStart)).toBe(365);
    });
  });

  describe("4. Safe Renewal & Upgrade Date Calculations", () => {
    it("should extend expiry from existing expiry when subscription is still active", () => {
      // User has 10 days left
      const currentExpiry = NOW + (10 * ONE_DAY_MS);
      // Renews 30 days plan
      const newExpiry = calculateNewExpiry(30, currentExpiry, NOW);
      // Total remaining days should be 10 + 30 = 40 days
      expect(calculateRemainingDays(newExpiry, NOW)).toBe(40);
      expect(newExpiry).toBe(currentExpiry + (30 * ONE_DAY_MS));
    });

    it("should start from current time when subscription is already expired", () => {
      // User expired 5 days ago
      const expiredExpiry = NOW - (5 * ONE_DAY_MS);
      // Renews 30 days plan
      const newExpiry = calculateNewExpiry(30, expiredExpiry, NOW);
      // New expiry should be NOW + 30 days
      expect(calculateRemainingDays(newExpiry, NOW)).toBe(30);
      expect(newExpiry).toBe(NOW + (30 * ONE_DAY_MS));
    });

    it("should correctly handle yearly renewals (365 days)", () => {
      const currentExpiry = NOW + (5 * ONE_DAY_MS);
      const newExpiry = calculateNewExpiry(365, currentExpiry, NOW);
      expect(calculateRemainingDays(newExpiry, NOW)).toBe(370);
    });
  });

  describe("5. Feature Locking Audit", () => {
    describe("Inventory Limits", () => {
      it("Basic plan: can add up to 10 items; 10th item and beyond blocked", () => {
        expect(canAddInventoryItem(0, PLAN_NAMES.BASIC, false)).toBe(true);
        expect(canAddInventoryItem(9, PLAN_NAMES.BASIC, false)).toBe(true);
        expect(canAddInventoryItem(10, PLAN_NAMES.BASIC, false)).toBe(false);
        expect(canAddInventoryItem(11, PLAN_NAMES.BASIC, false)).toBe(false);
      });

      it("Premium plan: can add up to 200 items; 200th item and beyond blocked", () => {
        expect(canAddInventoryItem(10, PLAN_NAMES.PREMIUM, false)).toBe(true);
        expect(canAddInventoryItem(199, PLAN_NAMES.PREMIUM, false)).toBe(true);
        expect(canAddInventoryItem(200, PLAN_NAMES.PREMIUM, false)).toBe(false);
        expect(canAddInventoryItem(250, PLAN_NAMES.PREMIUM, false)).toBe(false);
      });

      it("Pro plan: unlimited items allowed", () => {
        expect(canAddInventoryItem(10, PLAN_NAMES.PRO, false)).toBe(true);
        expect(canAddInventoryItem(200, PLAN_NAMES.PRO, false)).toBe(true);
        expect(canAddInventoryItem(5000, PLAN_NAMES.PRO, false)).toBe(true);
      });

      it("Expired plan: cannot add any inventory items regardless of plan", () => {
        expect(canAddInventoryItem(0, PLAN_NAMES.BASIC, true)).toBe(false);
        expect(canAddInventoryItem(50, PLAN_NAMES.PREMIUM, true)).toBe(false);
        expect(canAddInventoryItem(50, PLAN_NAMES.PRO, true)).toBe(false);
      });
    });

    describe("Journal Reports Date Limits", () => {
      it("Pro plan: unlimited historical reports accessible", () => {
        const threeYearsAgo = NOW - (3 * 365 * ONE_DAY_MS);
        expect(canAccessReportForDate(threeYearsAgo, PLAN_NAMES.PRO, false, NOW)).toBe(true);
      });

      it("Basic & Premium: reports within last 30 days allowed, older locked", () => {
        const tenDaysAgo = NOW - (10 * ONE_DAY_MS);
        const fortyDaysAgo = NOW - (40 * ONE_DAY_MS);

        expect(canAccessReportForDate(tenDaysAgo, PLAN_NAMES.BASIC, false, NOW)).toBe(true);
        expect(canAccessReportForDate(fortyDaysAgo, PLAN_NAMES.BASIC, false, NOW)).toBe(false);

        expect(canAccessReportForDate(tenDaysAgo, PLAN_NAMES.PREMIUM, false, NOW)).toBe(true);
        expect(canAccessReportForDate(fortyDaysAgo, PLAN_NAMES.PREMIUM, false, NOW)).toBe(false);
      });

      it("Expired plan: report access locked", () => {
        const yesterday = NOW - ONE_DAY_MS;
        expect(canAccessReportForDate(yesterday, PLAN_NAMES.BASIC, true, NOW)).toBe(false);
        expect(canAccessReportForDate(yesterday, PLAN_NAMES.PREMIUM, true, NOW)).toBe(false);
        expect(canAccessReportForDate(yesterday, PLAN_NAMES.PRO, true, NOW)).toBe(false);
      });
    });

    describe("Shop UID Access", () => {
      it("Active subscription: Shop UID is unlocked", () => {
        expect(canAccessShopUID(true, false)).toBe(true);
      });

      it("Expired subscription: Shop UID is locked", () => {
        expect(canAccessShopUID(true, true)).toBe(false);
        expect(canAccessShopUID(false, false)).toBe(false);
      });
    });
  });

  describe("6. Full Scenarios Testing (Scenarios A through K)", () => {
    it("SCENARIO A: Active BASIC subscription", () => {
      const userData = {
        userPlan: "Basic",
        subscriptionExpiry: NOW + (100 * ONE_DAY_MS),
        subscriptionActive: true,
      };
      const res = resolveUserSubscription(userData, NOW);
      expect(res.plan).toBe("Basic");
      expect(res.status).toBe("active");
      expect(res.isActive).toBe(true);
      expect(res.isExpired).toBe(false);
      expect(res.limits.inventoryLimit).toBe(10);
      expect(res.limits.purchaseLimit).toBe(10);
    });

    it("SCENARIO B: Active PREMIUM subscription", () => {
      const userData = {
        userPlan: "Premium",
        subscriptionExpiry: NOW + (20 * ONE_DAY_MS),
        subscriptionActive: true,
      };
      const res = resolveUserSubscription(userData, NOW);
      expect(res.plan).toBe("Premium");
      expect(res.status).toBe("active");
      expect(res.limits.inventoryLimit).toBe(200);
      expect(res.limits.purchaseLimit).toBe(200);
      // PRO unlimited features are not permitted
      expect(res.limits.inventoryLimit).not.toBe(-1);
    });

    it("SCENARIO C: Active PRO subscription", () => {
      const userData = {
        userPlan: "Pro",
        subscriptionExpiry: NOW + (150 * ONE_DAY_MS),
        subscriptionActive: true,
      };
      const res = resolveUserSubscription(userData, NOW);
      expect(res.plan).toBe("Pro");
      expect(res.status).toBe("active");
      expect(res.limits.inventoryLimit).toBe(-1);
      expect(res.limits.purchaseLimit).toBe(-1);
      expect(res.limits.reportLimitMonths).toBe(-1);
    });

    it("SCENARIO D: Expired BASIC subscription", () => {
      const userData = {
        userPlan: "Basic",
        subscriptionExpiry: NOW - (2 * ONE_DAY_MS),
        subscriptionActive: true,
      };
      const res = resolveUserSubscription(userData, NOW);
      expect(res.status).toBe("expired");
      expect(res.isActive).toBe(false);
      expect(res.isExpired).toBe(true);
      expect(res.remainingDays).toBe(0);
      expect(canAddInventoryItem(0, res.plan, res.isExpired)).toBe(false);
    });

    it("SCENARIO E: Expired PREMIUM subscription", () => {
      const userData = {
        userPlan: "Premium",
        subscriptionExpiry: NOW - (1 * ONE_DAY_MS),
        subscriptionActive: true,
      };
      const res = resolveUserSubscription(userData, NOW);
      expect(res.status).toBe("expired");
      expect(res.isActive).toBe(false);
      expect(canAddInventoryItem(50, res.plan, res.isExpired)).toBe(false);
    });

    it("SCENARIO F: Expired PRO subscription", () => {
      const userData = {
        userPlan: "Pro",
        subscriptionExpiry: NOW - (10 * ONE_DAY_MS),
        subscriptionActive: true,
      };
      const res = resolveUserSubscription(userData, NOW);
      expect(res.status).toBe("expired");
      expect(res.isActive).toBe(false);
      expect(canAddInventoryItem(0, res.plan, res.isExpired)).toBe(false);
    });

    it("SCENARIO G: Renew an expired subscription", () => {
      const expiredExpiry = NOW - (3 * ONE_DAY_MS);
      const renewedExpiry = calculateNewExpiry(30, expiredExpiry, NOW);
      const userData = {
        userPlan: "Premium",
        subscriptionExpiry: renewedExpiry,
        subscriptionActive: true,
      };
      const res = resolveUserSubscription(userData, NOW);
      expect(res.status).toBe("active");
      expect(res.remainingDays).toBe(30);
      expect(res.isActive).toBe(true);
    });

    it("SCENARIO H: Upgrade from BASIC to PREMIUM or PRO", () => {
      // Upgraded from Basic to Pro
      const upgradedExpiry = calculateNewExpiry(365, null, NOW);
      const userData = {
        userPlan: "Pro",
        subscriptionExpiry: upgradedExpiry,
        subscriptionActive: true,
      };
      const res = resolveUserSubscription(userData, NOW);
      expect(res.plan).toBe("Pro");
      expect(res.limits.inventoryLimit).toBe(-1);
      expect(res.remainingDays).toBe(365);
    });

    it("SCENARIO I & J: Persistence across logout/login and app restarts", () => {
      const rawFirestoreData = {
        userPlan: "Premium",
        subscriptionPlan: "Premium",
        subscriptionCycle: "monthly",
        subscriptionExpiry: NOW + (25 * ONE_DAY_MS),
        subscriptionActive: true,
        customShopUid: "UID-987654",
      };

      const resolved = resolveUserSubscription(rawFirestoreData, NOW);
      expect(resolved.plan).toBe("Premium");
      expect(resolved.remainingDays).toBe(25);
      expect(resolved.isActive).toBe(true);
      expect(resolved.customShopUid).toBe("UID-987654");
    });

    it("SCENARIO K: Anti-tampering check with future / past system clock comparisons", () => {
      const expiry = NOW + (5 * ONE_DAY_MS);
      // Normal time: active
      expect(isSubscriptionExpired(expiry, NOW)).toBe(false);
      
      // User moves clock 10 days ahead:
      const tamperedFuture = NOW + (10 * ONE_DAY_MS);
      expect(isSubscriptionExpired(expiry, tamperedFuture)).toBe(true);

      // User moves clock BACKWARDS by 1 year to trick system after expiry:
      const expiredUserData = {
        userPlan: "Premium",
        subscriptionExpiry: NOW, // expired today
        subscriptionActive: true,
        lastPaymentDate: NOW,    // recorded payment timestamp
        lastUpdated: NOW,
      };

      const tamperedPast = NOW - (365 * ONE_DAY_MS); // user set clock back 1 year
      const resolved = resolveUserSubscription(expiredUserData, tamperedPast);
      
      // System detects device clock is behind lastPaymentDate and uses authoritative server time
      expect(resolved.isExpired).toBe(true);
      expect(resolved.status).toBe("expired");
      expect(resolved.isActive).toBe(false);
      expect(resolved.remainingDays).toBe(0);
    });
  });

  describe("7. Date Formatting Utility", () => {
    it("should format valid timestamps properly", () => {
      const ts = new Date("2026-11-10T00:00:00Z").getTime();
      const formatted = formatExpiryDate(ts);
      expect(formatted).toBeTruthy();
      expect(formatted).not.toBe("N/A");
    });

    it("should return N/A for null, undefined, or NaN", () => {
      expect(formatExpiryDate(null)).toBe("N/A");
      expect(formatExpiryDate(undefined)).toBe("N/A");
      expect(formatExpiryDate(NaN)).toBe("N/A");
    });
  });
});
