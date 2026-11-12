/**
 * UpstageKadai / Upstage POS Centralized Subscription Service
 * 
 * Central source of truth for:
 * - Subscription Plans (BASIC, PREMIUM, PRO)
 * - Durations & Date Calculations
 * - Expiry Detection
 * - Feature Locks & Limits (Inventory, Purchases, Journal Reports, Shop UID)
 * - Safe Upgrades & Renewals
 */

export const PLAN_NAMES = {
  BASIC: "Basic",
  PREMIUM: "Premium",
  PRO: "Pro",
};

export const BILLING_CYCLES = {
  MONTHLY: "monthly",
  YEARLY: "yearly",
};

export const PLAN_CONFIG = {
  [PLAN_NAMES.BASIC]: {
    name: "Basic",
    color: "#6366f1",
    prices: {
      yearly: 0,
    },
    days: {
      yearly: 365,
    },
    limits: {
      inventoryLimit: 10,
      purchaseLimit: 10,
      reportLimitMonths: 1,
    },
    features: [
      "Unlimited Barcode Scans",
      "Max 10 Purchases Only",
      "Inventory Limit: Max 10 Items",
      "Journal Reports: Last 1 Month Only",
    ],
  },
  [PLAN_NAMES.PREMIUM]: {
    name: "Premium",
    color: "#10b981",
    prices: {
      monthly: 499,
      yearly: 4999,
    },
    days: {
      monthly: 30,
      yearly: 365,
    },
    limits: {
      inventoryLimit: 200,
      purchaseLimit: 200,
      reportLimitMonths: 3,
    },
    features: [
      "Unlimited Barcode Scans",
      "Max 200 Purchases Only",
      "Inventory Limit: Max 200 Items",
      "Journal Reports: Last 3 Months",
    ],
  },
  [PLAN_NAMES.PRO]: {
    name: "Pro",
    color: "#f59e0b",
    prices: {
      monthly: 1999,
      yearly: 19999,
    },
    days: {
      monthly: 30,
      yearly: 365,
    },
    limits: {
      inventoryLimit: -1, // Unlimited
      purchaseLimit: -1,  // Unlimited
      reportLimitMonths: -1, // Unlimited
    },
    features: [
      "Unlimited Barcode Scans",
      "Unlimited Purchases",
      "Unlimited Inventory Storage",
      "Unlimited Journal Reports (All Time)",
    ],
  },
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Normalizes plan name string to standard casing ("Basic" | "Premium" | "Pro").
 */
export const normalizePlanName = (rawPlan) => {
  if (!rawPlan || typeof rawPlan !== "string") return PLAN_NAMES.BASIC;
  const lower = rawPlan.trim().toLowerCase();
  if (lower.includes("pro")) return PLAN_NAMES.PRO;
  if (lower.includes("premium")) return PLAN_NAMES.PREMIUM;
  return PLAN_NAMES.BASIC;
};

/**
 * Calculates remaining days from now until expiry timestamp.
 * Avoids off-by-one errors by ceiling millisecond differences to full days.
 * Returns 0 if expired or invalid.
 */
export const calculateRemainingDays = (expiryTimestamp, currentTimestamp = Date.now()) => {
  if (!expiryTimestamp || typeof expiryTimestamp !== "number" || isNaN(expiryTimestamp)) {
    return 0;
  }
  const diffMs = expiryTimestamp - currentTimestamp;
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / ONE_DAY_MS);
};

/**
 * Checks whether subscription is expired.
 */
export const isSubscriptionExpired = (expiryTimestamp, currentTimestamp = Date.now()) => {
  if (!expiryTimestamp || typeof expiryTimestamp !== "number" || isNaN(expiryTimestamp)) {
    return true; // No valid expiry means expired / unactivated
  }
  return currentTimestamp >= expiryTimestamp;
};

/**
 * Calculates new expiry timestamp for a plan renewal or upgrade.
 * If current subscription is active and has remaining time, the new duration
 * is added on top of the existing expiry (preserving paid days).
 * If already expired, starts from currentTimestamp.
 */
export const calculateNewExpiry = (planDays, currentExpiry = null, currentTimestamp = Date.now()) => {
  const durationMs = (Number(planDays) || 30) * ONE_DAY_MS;
  const isCurrentlyActive = currentExpiry && typeof currentExpiry === "number" && currentExpiry > currentTimestamp;
  const baseTimestamp = isCurrentlyActive ? currentExpiry : currentTimestamp;
  return baseTimestamp + durationMs;
};

/**
 * Formats an expiry timestamp to Indian English locale format (e.g. "10 Nov 2026").
 */
export const formatExpiryDate = (expiryTimestamp) => {
  if (!expiryTimestamp || typeof expiryTimestamp !== "number" || isNaN(expiryTimestamp)) {
    return "N/A";
  }
  try {
    const date = new Date(expiryTimestamp);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "N/A";
  }
};

/**
 * Returns limits for a plan.
 */
export const getPlanLimits = (planName) => {
  const norm = normalizePlanName(planName);
  return PLAN_CONFIG[norm]?.limits || PLAN_CONFIG[PLAN_NAMES.BASIC].limits;
};

/**
 * Feature Lock: Can user add an inventory item?
 * When subscription is expired, adding new items is locked.
 * Basic: up to 10 items.
 * Premium: up to 200 items.
 * Pro: unlimited (-1).
 */
export const canAddInventoryItem = (currentCount, planName, isExpired = false) => {
  if (isExpired) return false;
  const limits = getPlanLimits(planName);
  if (limits.inventoryLimit === -1) return true;
  return Number(currentCount || 0) < limits.inventoryLimit;
};

/**
 * Feature Lock: Can user access a journal entry / report from a given date?
 * Pro: Unlimited history.
 * Basic & Premium: Up to 1 month back from today.
 * Expired: Locked.
 */
export const canAccessReportForDate = (dateOrTimestamp, planName, isExpired = false, currentTimestamp = Date.now()) => {
  if (isExpired) return false;
  const norm = normalizePlanName(planName);
  if (norm === PLAN_NAMES.PRO) return true;

  // For Basic and Premium, maximum allowed is 30 days (1 month)
  const oneMonthAgo = currentTimestamp - (30 * ONE_DAY_MS);
  const targetTime = dateOrTimestamp instanceof Date
    ? dateOrTimestamp.getTime()
    : typeof dateOrTimestamp === "number"
    ? dateOrTimestamp
    : new Date(dateOrTimestamp).getTime();

  if (isNaN(targetTime)) return true;
  return targetTime >= oneMonthAgo;
};

/**
 * Feature Lock: Shop UID Access.
 * Accessible when subscription is active and not expired.
 */
export const canAccessShopUID = (subscriptionActive, isExpired = false) => {
  return Boolean(subscriptionActive) && !isExpired;
};

/**
 * Returns an authoritative timestamp that guards against device clock rollback attacks.
 * If a user changes their device clock to a past date earlier than their last recorded
 * activity, transaction, or update in Firestore, the function uses the maximum known
 * server-persisted timestamp instead.
 */
export const getAuthoritativeTimestamp = (userData = {}, currentTimestamp = Date.now()) => {
  const lastRecordedTime = Math.max(
    Number(userData?.lastPaymentDate) || 0,
    Number(userData?.lastUpdated) || 0,
    Number(userData?.updatedAt) || 0
  );
  return Math.max(currentTimestamp, lastRecordedTime);
};

/**
 * Full Subscription Status Resolver for a User.
 * Accepts user document data from Firestore or local session.
 */
export const resolveUserSubscription = (userData = {}, currentTimestamp = Date.now()) => {
  const authoritativeTime = getAuthoritativeTimestamp(userData, currentTimestamp);
  const rawPlan = userData?.userPlan || userData?.subscriptionPlan || userData?.plan || PLAN_NAMES.BASIC;
  const plan = normalizePlanName(rawPlan);
  const expiryTimestamp = userData?.subscriptionExpiry ? Number(userData.subscriptionExpiry) : null;
  const cycle = userData?.subscriptionCycle || (expiryTimestamp && (expiryTimestamp - authoritativeTime > 45 * ONE_DAY_MS) ? BILLING_CYCLES.YEARLY : BILLING_CYCLES.MONTHLY);

  const isExpired = isSubscriptionExpired(expiryTimestamp, authoritativeTime);
  const remainingDays = calculateRemainingDays(expiryTimestamp, authoritativeTime);
  const limits = getPlanLimits(plan);
  const isActive = Boolean(userData?.subscriptionActive !== false) && !isExpired;

  return {
    plan,
    cycle,
    status: isExpired ? "expired" : "active",
    isActive,
    isExpired,
    expiryTimestamp,
    formattedExpiry: formatExpiryDate(expiryTimestamp),
    remainingDays,
    limits,
    customShopUid: userData?.customShopUid || null,
  };
};
