/**
 * Online Catalog Filtering Utility
 *
 * Rules:
 * 1. Products where isOnlineSaleEnabled === false are filtered out from online shopping.
 * 2. Products where isOnlineSaleEnabled is true, undefined, or missing default to eligible for online shopping (true).
 * 3. Works consistently for both Local Products (inventory) and Global Products (global_inventory).
 */

export const isProductEligibleForOnlineSale = (product) => {
  if (!product) return false;
  // Missing or undefined defaults to true (ON)
  return product.isOnlineSaleEnabled !== false;
};

export const filterOnlineCatalogProducts = (products = []) => {
  if (!Array.isArray(products)) return [];
  return products.filter(isProductEligibleForOnlineSale);
};
