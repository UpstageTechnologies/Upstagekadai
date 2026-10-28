const FIXED_DISCOUNT_TYPES = new Set(["fixed", "₹", "amount", "fixed_amount"]);

/**
 * Returns the original price and validated effective price for an inventory item.
 * The effective price is always calculated from the original sale price, never
 * from a previously calculated offerPrice field.
 */
export const getEffectiveProductPrice = product => {
  const source = product || {};
  const originalPrice = Number(source.originalSalesPrice ?? source.salesPrice);
  const discountValue = source.discountValue == null || source.discountValue === ""
    ? 0
    : Number(source.discountValue);
  const rawDiscountType = String(source.discountType || "").trim().toLowerCase();
  const discountType = FIXED_DISCOUNT_TYPES.has(rawDiscountType)
    ? "fixed"
    : (["", "percent", "percentage", "%"].includes(rawDiscountType) ? "percent" : null);

  if (!Number.isFinite(originalPrice) || originalPrice < 0 || !Number.isFinite(discountValue) || discountValue < 0 || (discountValue > 0 && !discountType)) {
    return { valid: false, originalPrice: Number.isFinite(originalPrice) ? originalPrice : 0, discountValue, discountType, discountAmount: 0, effectivePrice: null, hasDiscount: false };
  }
  if ((discountType === "percent" && discountValue > 100) || (discountType === "fixed" && discountValue > originalPrice)) {
    return { valid: false, originalPrice, discountValue, discountType, discountAmount: 0, effectivePrice: null, hasDiscount: false };
  }

  const discountAmount = discountType === "percent" ? originalPrice * discountValue / 100 : discountValue;
  const effectivePrice = Number(Math.max(0, originalPrice - discountAmount).toFixed(2));
  return {
    valid: true,
    originalPrice,
    discountValue,
    discountType,
    discountAmount,
    effectivePrice,
    hasDiscount: discountValue > 0 && effectivePrice < originalPrice,
  };
};
