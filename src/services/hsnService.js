import { HSN_DIRECTORY } from "../data/hsnDirectory";

/**
 * HSN Service Architecture
 * Manages Indian CBIC GST Tariff classifications, validation, keyword search,
 * automatic contextual suggestion, and official description resolution.
 */

// In-memory cache for recent lookups and API responses
const lookupCache = new Map();

// Configurable external API configuration (can be plugged into GST portal / Enterprise API)
let onlineConfig = {
  apiUrl: null,
  apiKey: null,
  timeoutMs: 4000,
};

/**
 * Configure an external HSN API provider.
 * Does not expose secrets in the frontend by default.
 */
export const configureOnlineSource = ({ apiUrl, apiKey, timeoutMs = 4000 } = {}) => {
  onlineConfig.apiUrl = apiUrl || null;
  onlineConfig.apiKey = apiKey || null;
  onlineConfig.timeoutMs = timeoutMs;
};

/**
 * Check whether an external live online HSN lookup provider is configured.
 */
export const isOnlineSourceConfigured = () => {
  return {
    configured: Boolean(onlineConfig.apiUrl),
    endpoint: onlineConfig.apiUrl || null,
    statusText: onlineConfig.apiUrl
      ? "Connected to configured external classification service"
      : "Operating in verified offline CBIC directory mode (No external API configured)",
  };
};

/**
 * Validate an HSN code according to Indian GST / CBIC standards.
 * - Trims unnecessary whitespace.
 * - Preserves leading zeros (e.g. "0401", "0701", "0902").
 * - Accepts standard 2, 4, 6, or 8 digit numeric codes.
 * - Does not silently alter or truncate input.
 * 
 * @param {string} rawCode
 * @returns {{ isValid: boolean, code: string, error: string | null, length: number }}
 */
export const validateHSNCode = (rawCode) => {
  if (rawCode === null || rawCode === undefined) {
    return { isValid: false, code: "", error: "HSN code is required", length: 0 };
  }

  const trimmed = String(rawCode).trim();
  if (trimmed === "") {
    return { isValid: false, code: "", error: "HSN code cannot be empty", length: 0 };
  }

  // Must be strictly digits
  if (!/^\d+$/.test(trimmed)) {
    return {
      isValid: false,
      code: trimmed,
      error: "HSN code must contain only numeric digits (0-9)",
      length: trimmed.length,
    };
  }

  const len = trimmed.length;
  // Indian GST rules:
  // 2 digits = Chapter level
  // 4 digits = Heading (B2B < 5Cr or standard retail)
  // 6 digits = Subheading (International / B2B > 5Cr)
  // 8 digits = Tariff item (Specific product level)
  if (len !== 2 && len !== 4 && len !== 6 && len !== 8) {
    return {
      isValid: false,
      code: trimmed,
      error: `HSN code should be 2, 4, 6, or 8 digits (current: ${len} digits)`,
      length: len,
    };
  }

  return {
    isValid: true,
    code: trimmed,
    error: null,
    length: len,
  };
};

/**
 * Look up verified classification details for an HSN code.
 * Preserves leading zeros and checks both exact matches and prefix headings.
 * 
 * @param {string} rawCode
 * @returns {Promise<{ found: boolean, hsnCode: string, description: string | null, category: string | null, gstRate: string | null, chapter: string | null, source: string | null }>}
 */
export const lookupHSNCode = async (rawCode) => {
  const validation = validateHSNCode(rawCode);
  if (!validation.isValid) {
    return {
      found: false,
      hsnCode: validation.code,
      description: null,
      category: null,
      gstRate: null,
      chapter: null,
      source: null,
    };
  }

  const code = validation.code;

  // 1. Check local memory cache
  if (lookupCache.has(code)) {
    return lookupCache.get(code);
  }

  // 2. Search local authentic CBIC Directory (exact match first)
  let match = HSN_DIRECTORY.find((item) => item.hsnCode === code);

  // If not exact match, search prefix (e.g. user entered 4-digit "1006", match first 1006 entry)
  if (!match) {
    match = HSN_DIRECTORY.find((item) => item.hsnCode.startsWith(code) || code.startsWith(item.hsnCode));
  }

  if (match) {
    const result = {
      found: true,
      hsnCode: code,
      description: match.description,
      category: match.category,
      gstRate: match.gstRate,
      chapter: match.chapter,
      source: "CBIC GST Tariff Schedule",
    };
    lookupCache.set(code, result);
    return result;
  }

  // 3. If an external online provider is configured, attempt query
  if (onlineConfig.apiUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), onlineConfig.timeoutMs);
      const url = `${onlineConfig.apiUrl}?hsn=${encodeURIComponent(code)}`;

      const headers = { Accept: "application/json" };
      if (onlineConfig.apiKey) {
        headers["Authorization"] = `Bearer ${onlineConfig.apiKey}`;
      }

      const response = await fetch(url, { method: "GET", headers, signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data && data.description) {
          const apiResult = {
            found: true,
            hsnCode: code,
            description: data.description,
            category: data.category || "General Classification",
            gstRate: data.gstRate || null,
            chapter: data.chapter || code.slice(0, 2),
            source: data.source || "External GST Service",
          };
          lookupCache.set(code, apiResult);
          return apiResult;
        }
      }
    } catch (err) {
      console.log("[HSNService] External API lookup failed, gracefully falling back:", err?.message);
    }
  }

  // Not found in verified sources - do not invent fake descriptions
  const notFoundResult = {
    found: false,
    hsnCode: code,
    description: null,
    category: null,
    gstRate: null,
    chapter: null,
    source: null,
  };
  return notFoundResult;
};

/**
 * Retrieve the official description for an HSN code.
 * 
 * @param {string} code
 * @returns {Promise<string>}
 */
export const getHSNDescription = async (code) => {
  const result = await lookupHSNCode(code);
  return result.found ? result.description : "";
};

/**
 * Tokenize and normalize input strings for keyword classification.
 */
const tokenize = (text) => {
  if (!text) return [];
  const lower = String(text).toLowerCase();
  const wordsWithSpaces = lower.replace(/[^\w\s]/g, " ").split(/\s+/);
  const wordsWithoutHyphens = lower.replace(/[-_]/g, "").replace(/[^\w\s]/g, " ").split(/\s+/);

  const tokens = new Set();
  wordsWithSpaces.forEach((w) => {
    if (w.length > 1) tokens.add(w);
  });
  wordsWithoutHyphens.forEach((w) => {
    if (w.length > 1) tokens.add(w);
  });
  return Array.from(tokens);
};

/**
 * Search HSN classifications based on query and/or product details.
 * Prioritizes product type, category, and subcategory over brand name.
 * 
 * @param {object} params
 * @param {string} [params.category]
 * @param {string} [params.subcategory]
 * @param {string} [params.brand]
 * @param {string} [params.productName]
 * @param {string} [params.query]
 * @param {number} [params.limit=25]
 * @returns {Promise<Array<{ hsnCode: string, description: string, category: string, chapter: string, gstRate: string, source: string, score: number }>>}
 */
export const searchHSNByProductDetails = async ({
  category = "",
  subcategory = "",
  brand = "",
  productName = "",
  query = "",
  limit = 25,
} = {}) => {
  const queryStr = (query || "").trim().toLowerCase();
  const prodNameLower = (productName || "").trim().toLowerCase();
  const subcatLower = (subcategory || "").trim().toLowerCase();
  const catLower = (category || "").trim().toLowerCase();

  // If query is directly numeric, perform HSN code search first
  const isNumericQuery = /^\d+$/.test(queryStr);

  const nameTokens = tokenize(productName);
  const subTokens = tokenize(subcategory);
  const catTokens = tokenize(category);
  const queryTokens = tokenize(queryStr);
  const brandTokens = tokenize(brand);

  const scoredResults = [];

  for (const item of HSN_DIRECTORY) {
    let score = 0;
    const itemCode = item.hsnCode;
    const itemDescLower = item.description.toLowerCase();
    const itemCatLower = item.category.toLowerCase();
    const itemKeywords = item.keywords || [];

    // 1. Direct code matching
    if (isNumericQuery) {
      if (itemCode === queryStr) score += 200;
      else if (itemCode.startsWith(queryStr)) score += 100;
      else if (itemCode.includes(queryStr)) score += 50;
    }

    // 2. Exact keyword / phrase matching against product name & subcategory
    for (const kw of itemKeywords) {
      if (kw.length > 2) {
        if (prodNameLower.includes(kw)) score += 45;
        if (subcatLower.includes(kw)) score += 35;
        if (queryStr && queryStr.includes(kw)) score += 40;
      }
    }

    // 3. Query tokens matching
    for (const q of queryTokens) {
      if (itemCode.includes(q)) score += 80;
      if (itemKeywords.includes(q)) score += 40;
      if (itemDescLower.includes(q)) score += 35;
      if (itemCatLower.includes(q)) score += 15;
    }

    // 3. Product Name tokens (Highest weight for product classification)
    for (const n of nameTokens) {
      if (itemKeywords.includes(n)) score += 30;
      if (itemDescLower.includes(n)) score += 25;
      if (itemCatLower.includes(n)) score += 10;
    }

    // 4. Subcategory tokens (Specific product grouping)
    for (const s of subTokens) {
      if (itemKeywords.includes(s)) score += 25;
      if (itemDescLower.includes(s)) score += 20;
      if (itemCatLower.includes(s)) score += 12;
    }

    // 5. Category tokens
    for (const c of catTokens) {
      if (itemCatLower.includes(c)) score += 10;
      if (itemKeywords.includes(c)) score += 8;
    }

    // 6. Brand name tokens (Low weight to prevent brand bias)
    for (const b of brandTokens) {
      if (itemKeywords.includes(b)) score += 5;
    }

    if (score > 0) {
      scoredResults.push({
        hsnCode: item.hsnCode,
        description: item.description,
        category: item.category,
        chapter: item.chapter,
        gstRate: item.gstRate,
        source: "CBIC GST Tariff Schedule",
        score,
      });
    }
  }

  // Sort by relevance score descending
  scoredResults.sort((a, b) => b.score - a.score);

  return scoredResults.slice(0, limit);
};

/**
 * Automatically suggest an HSN code based on product details.
 * Analyzes category, subcategory, product name, and type.
 * Detects ambiguity if multiple close matches are found.
 * 
 * @param {object} params
 * @param {string} params.category
 * @param {string} params.subcategory
 * @param {string} params.brand
 * @param {string} params.productName
 * @returns {Promise<{ suggestion: object | null, candidates: Array<object>, isAmbiguous: boolean }>}
 */
export const suggestHSNCode = async ({
  category = "",
  subcategory = "",
  brand = "",
  productName = "",
} = {}) => {
  // If no descriptive fields are provided, cannot suggest
  if (!category && !subcategory && !productName) {
    return { suggestion: null, candidates: [], isAmbiguous: false };
  }

  const results = await searchHSNByProductDetails({
    category,
    subcategory,
    brand,
    productName,
    limit: 5,
  });

  if (results.length === 0) {
    return { suggestion: null, candidates: [], isAmbiguous: false };
  }

  const topMatch = results[0];

  // If score is too low, don't blindly suggest
  if (topMatch.score < 20) {
    return { suggestion: null, candidates: results, isAmbiguous: true };
  }

  // Check ambiguity: if second candidate is close in score
  let isAmbiguous = false;
  if (results.length > 1) {
    const second = results[1];
    if (second.score >= topMatch.score * 0.85) {
      isAmbiguous = true;
    }
  }

  return {
    suggestion: topMatch,
    candidates: results,
    isAmbiguous,
  };
};

/**
 * Fast synchronous lookup of an HSN directory entry.
 * Checks exact match first, then prefix matching.
 *
 * @param {string} rawCode
 * @returns {object | null}
 */
export const getHSNEntry = (rawCode) => {
  if (rawCode === null || rawCode === undefined) return null;
  const clean = String(rawCode).trim();
  if (!clean) return null;

  // Exact match
  let match = HSN_DIRECTORY.find((item) => item.hsnCode === clean);
  if (!match) {
    // Prefix match
    match = HSN_DIRECTORY.find(
      (item) => item.hsnCode.startsWith(clean) || clean.startsWith(item.hsnCode)
    );
  }
  return match || null;
};

/**
 * Automatically derive structured category, subcategory, and metadata from an HSN code.
 *
 * @param {string} hsnCode
 * @returns {{ mainCategory: string, subcategory: string, fullCategory: string, keywords: Array<string>, description: string, gstRate: string }}
 */
export const deriveCategoryFromHSN = (hsnCode) => {
  const entry = getHSNEntry(hsnCode);
  if (!entry || !entry.category) {
    return {
      mainCategory: "General",
      subcategory: "",
      fullCategory: "General",
      keywords: [],
      description: "",
      gstRate: "",
    };
  }

  // e.g. "Garments / Innerwear" -> main: "Garments", sub: "Innerwear"
  // or "Footwear" -> main: "Footwear", sub: "Footwear"
  const parts = entry.category.split("/").map((p) => p.trim());
  const main = parts[0] || entry.category;
  const sub = parts[1] || main;

  return {
    mainCategory: main,
    subcategory: sub,
    fullCategory: entry.category,
    keywords: Array.isArray(entry.keywords) ? entry.keywords : [],
    description: entry.description || "",
    gstRate: entry.gstRate || "",
  };
};

// Known common retail search synonyms and phonetic misspellings
const COMMON_SYNONYMS = {
  underware: ["underwear", "innerwear", "underpants", "briefs", "boxer", "vest", "panties", "lingerie"],
  underwear: ["underware", "innerwear", "underpants", "briefs", "boxer", "vest", "panties", "lingerie"],
  innerware: ["innerwear", "underwear", "underpants", "briefs", "boxer", "vest"],
  innerwear: ["innerware", "underwear", "underpants", "briefs", "boxer", "vest"],
  boxer: ["boxers", "boxi", "briefs", "underwear", "underware"],
  boxi: ["boxer", "boxers", "briefs", "underwear"],
  briefs: ["brief", "underwear", "underware", "underpants"],
  footware: ["footwear", "shoes", "slippers", "sandals", "boots"],
  footwear: ["footware", "shoes", "slippers", "sandals", "boots"],
  nightware: ["nightwear", "nighty", "pajamas", "pyjamas", "night suit"],
  nightwear: ["nightware", "nighty", "pajamas", "pyjamas", "night suit"],
  sleepware: ["sleepwear", "nightwear", "pajamas"],
  sleepwear: ["sleepware", "nightwear", "pajamas"],
  jocky: ["jockey", "underwear", "innerwear"],
  jockey: ["jocky", "underwear", "innerwear"],
  pant: ["pants", "trouser", "trousers", "jeans"],
  pants: ["pant", "trouser", "trousers", "jeans"],
  tshirt: ["t-shirt", "tee", "tshirts"],
  tshirts: ["tshirt", "t-shirt", "tee"],
  shirt: ["shirts"],
  shirts: ["shirt"],
  sari: ["saree", "saris", "sarees"],
  saree: ["sari", "saris", "sarees"],
  kurti: ["kurta", "kurtis"],
  kurta: ["kurti", "kurtas"],
};

/**
 * Intelligent professional search matcher for inventory and purchase products.
 * Matches across:
 * - Product Name, Brand, Sub Name / Variant
 * - Category, Subcategory
 * - HSN Code, Description
 * - HSN Directory Category & Keywords
 * - Phonetic / Common Retail Misspellings (e.g. "underware" -> "underwear" / "innerwear")
 *
 * @param {object} product - Inventory or purchase product item
 * @param {string} searchQuery - Search query string entered by user
 * @returns {boolean} - Whether product matches the search query
 */
export const matchProductSearch = (product, searchQuery) => {
  if (!searchQuery || !searchQuery.trim()) return true;
  if (!product) return false;

  const rawQuery = String(searchQuery).toLowerCase().trim();
  if (!rawQuery) return true;

  // Build searchable text pool from product attributes
  const pool = [];

  const addText = (val) => {
    if (val === null || val === undefined) return;
    if (typeof val === "string") {
      const trimmed = val.toLowerCase().trim();
      if (trimmed) pool.push(trimmed);
    } else if (typeof val === "number") {
      pool.push(String(val));
    } else if (Array.isArray(val)) {
      val.forEach((item) => addText(item));
    } else if (typeof val === "object") {
      Object.values(val).forEach((v) => addText(v));
    }
  };

  addText(product.itemName);
  addText(product.name);
  addText(product.brand);
  addText(product.subName);
  addText(product.variant);
  addText(product.variants);
  addText(product.category);
  addText(product.categoryName);
  addText(product.subcategory);
  addText(product.subcategoryName);
  addText(product.subCategory);
  addText(product.size);
  addText(product.unitType);
  addText(product.barcode);
  addText(product.hsnCode);
  addText(product.description);
  addText(product.hsnCategory);
  addText(product.hsnKeywords);
  addText(product.supplierName);

  // Dynamic HSN Directory metadata expansion (enables matching even if category was stored as "General")
  const hsnCodeToCheck = product.hsnCode || "";
  if (hsnCodeToCheck) {
    const hsnEntry = getHSNEntry(hsnCodeToCheck);
    if (hsnEntry) {
      addText(hsnEntry.hsnCode);
      addText(hsnEntry.category);
      addText(hsnEntry.description);
      addText(hsnEntry.keywords);
    }
  }

  // Combined searchable string for fast direct substring matching
  const fullPoolString = pool.join(" ");

  // Direct full query match
  if (fullPoolString.includes(rawQuery)) return true;

  // Split query into tokens (e.g. "underware jocky" -> ["underware", "jocky"])
  const queryTokens = rawQuery.split(/[\s,._\-/]+/).filter((t) => t.length > 0);
  if (queryTokens.length === 0) return true;

  // Every token in query must find a match (either directly or via synonyms/keywords)
  return queryTokens.every((token) => {
    // 1. Direct token match in any pool entry
    if (fullPoolString.includes(token)) return true;

    // 2. Synonyms expansion (e.g. "underware" -> ["underwear", "innerwear", ...])
    const synonyms = COMMON_SYNONYMS[token] || [];
    for (const syn of synonyms) {
      if (fullPoolString.includes(syn)) return true;
    }

    // 3. Prefix matching for tokens with length >= 3
    if (token.length >= 3) {
      const tokenPrefix = token.slice(0, token.length - 1);
      for (const p of pool) {
        if (p.includes(tokenPrefix)) return true;
      }
    }

    return false;
  });
};

