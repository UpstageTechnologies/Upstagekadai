import {
  validateHSNCode,
  lookupHSNCode,
  getHSNDescription,
  searchHSNByProductDetails,
  suggestHSNCode,
  isOnlineSourceConfigured,
  configureOnlineSource,
} from '../src/services/hsnService';

describe('HSN Code and Classification Service Tests', () => {
  describe('1. HSN Code Validation', () => {
    test('Validates standard Indian 4, 6, and 8 digit numeric HSN codes', () => {
      expect(validateHSNCode('1006').isValid).toBe(true);
      expect(validateHSNCode('100630').isValid).toBe(true);
      expect(validateHSNCode('10063020').isValid).toBe(true);
      expect(validateHSNCode('85171300').isValid).toBe(true);
      expect(validateHSNCode('10').isValid).toBe(true); // 2-digit chapter
    });

    test('Preserves leading zeros correctly without truncation', () => {
      const milkHsn = validateHSNCode('04012000');
      expect(milkHsn.isValid).toBe(true);
      expect(milkHsn.code).toBe('04012000');
      expect(milkHsn.code.startsWith('0')).toBe(true);

      const teaHsn = validateHSNCode('09024020');
      expect(teaHsn.isValid).toBe(true);
      expect(teaHsn.code).toBe('09024020');

      const potatoHsn = validateHSNCode('07019000');
      expect(potatoHsn.isValid).toBe(true);
      expect(potatoHsn.code).toBe('07019000');
    });

    test('Trims surrounding whitespace cleanly', () => {
      const result = validateHSNCode('  10063020   ');
      expect(result.isValid).toBe(true);
      expect(result.code).toBe('10063020');
    });

    test('Rejects non-numeric characters', () => {
      const alpha = validateHSNCode('1006A');
      expect(alpha.isValid).toBe(false);
      expect(alpha.error).toContain('numeric digits');

      const withDash = validateHSNCode('1006-3020');
      expect(withDash.isValid).toBe(false);
    });

    test('Rejects invalid digit lengths (e.g. 1, 3, 5, 7, 9+ digits)', () => {
      expect(validateHSNCode('1').isValid).toBe(false);
      expect(validateHSNCode('123').isValid).toBe(false);
      expect(validateHSNCode('12345').isValid).toBe(false);
      expect(validateHSNCode('1234567').isValid).toBe(false);
      expect(validateHSNCode('123456789').isValid).toBe(false);
    });

    test('Handles empty and null inputs safely', () => {
      expect(validateHSNCode('').isValid).toBe(false);
      expect(validateHSNCode(null).isValid).toBe(false);
      expect(validateHSNCode(undefined).isValid).toBe(false);
      expect(validateHSNCode('   ').isValid).toBe(false);
    });
  });

  describe('2. HSN Lookup & Description Resolution', () => {
    test('Resolves official description for known HSN codes', async () => {
      const result = await lookupHSNCode('10063020');
      expect(result.found).toBe(true);
      expect(result.hsnCode).toBe('10063020');
      expect(result.description).toContain('Basmati rice');
      expect(result.gstRate).toBe('5%');
      expect(result.source).toContain('CBIC');
    });

    test('Resolves official description preserving leading zero', async () => {
      const result = await lookupHSNCode('04012000');
      expect(result.found).toBe(true);
      expect(result.description.toLowerCase()).toContain('milk');
      expect(result.chapter).toBe('04');
    });

    test('Does NOT invent descriptions for unknown HSN codes', async () => {
      const result = await lookupHSNCode('99999999');
      expect(result.found).toBe(false);
      expect(result.description).toBeNull();
    });

    test('getHSNDescription helper returns empty string when code is unknown', async () => {
      const desc = await getHSNDescription('99999999');
      expect(desc).toBe('');
    });
  });

  describe('3. HSN Search by Product Details', () => {
    test('Finds relevant HSN classification for Grocery -> Rice -> Basmati Rice', async () => {
      const results = await searchHSNByProductDetails({
        category: 'Grocery',
        subcategory: 'Rice',
        productName: 'Daawat Basmati Rice',
        brand: 'Daawat',
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].hsnCode).toBe('10063020');
      expect(results[0].description).toContain('Basmati rice');
      expect(results[0].gstRate).toBe('5%');
    });

    test('Finds relevant HSN classification for Tea', async () => {
      const results = await searchHSNByProductDetails({
        category: 'Beverages',
        subcategory: 'Tea',
        productName: '3 Roses Natural Care Tea',
        brand: 'Brooke Bond',
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].hsnCode).toBe('09024020');
      expect(results[0].description.toLowerCase()).toContain('tea');
    });

    test('Finds relevant HSN classification for T-Shirts', async () => {
      const results = await searchHSNByProductDetails({
        category: 'Clothing',
        subcategory: 'T-Shirts',
        productName: 'Cotton Round Neck T-Shirt',
        brand: 'Polo',
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].hsnCode).toBe('61091000');
      expect(results[0].description).toContain('T-shirts');
    });

    test('Searches by direct numeric query', async () => {
      const results = await searchHSNByProductDetails({
        query: '1006',
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.hsnCode.startsWith('1006'))).toBe(true);
    });

    test('Does NOT prioritize brand name over actual product type', async () => {
      // If brand is "Apple", but product is "Apples Fresh Fruit", should classify under fruit (0808), not electronics
      const fruitResults = await searchHSNByProductDetails({
        category: 'Vegetables & Fruits',
        subcategory: 'Fruits',
        productName: 'Fresh Shimla Apple Fruit',
        brand: 'Fresh Farms',
      });
      expect(fruitResults.length).toBeGreaterThan(0);

      // And smartphone should classify under 8517
      const phoneResults = await searchHSNByProductDetails({
        category: 'Electronics',
        subcategory: 'Mobile',
        productName: 'Smartphone 128GB',
        brand: 'Apple',
      });
      expect(phoneResults.length).toBeGreaterThan(0);
      expect(phoneResults[0].hsnCode).toBe('85171300');
    });
  });

  describe('4. Contextual HSN Suggestion & Ambiguity Detection', () => {
    test('Suggests HSN code when clear match is available', async () => {
      const { suggestion, isAmbiguous } = await suggestHSNCode({
        category: 'Grocery',
        subcategory: 'Flour',
        productName: 'Aashirvaad Sharbati Atta Wheat Flour',
      });

      expect(suggestion).not.toBeNull();
      expect(suggestion.hsnCode).toBe('11010000');
    });

    test('Flags ambiguity when multiple classifications have similar scores', async () => {
      // "Rice" without specifying Basmati or Parboiled could match multiple
      const { candidates, isAmbiguous } = await suggestHSNCode({
        category: 'Grocery',
        subcategory: 'Rice',
        productName: 'Rice',
      });

      expect(candidates.length).toBeGreaterThan(1);
      expect(isAmbiguous).toBe(true);
    });

    test('Returns null suggestion gracefully when input is empty', async () => {
      const { suggestion, candidates } = await suggestHSNCode({});
      expect(suggestion).toBeNull();
      expect(candidates).toEqual([]);
    });
  });

  describe('5. External Source Configuration & Graceful Fallback', () => {
    test('Reports offline verified directory mode by default', () => {
      const status = isOnlineSourceConfigured();
      expect(status.configured).toBe(false);
      expect(status.statusText).toContain('verified offline CBIC');
    });

    test('Allows runtime configuration of external provider without leaking secrets', () => {
      configureOnlineSource({ apiUrl: 'https://api.example.com/hsn', apiKey: 'test_token' });
      const status = isOnlineSourceConfigured();
      expect(status.configured).toBe(true);
      expect(status.endpoint).toBe('https://api.example.com/hsn');

      // Reset
      configureOnlineSource({ apiUrl: null, apiKey: null });
      expect(isOnlineSourceConfigured().configured).toBe(false);
    });
  });
});
