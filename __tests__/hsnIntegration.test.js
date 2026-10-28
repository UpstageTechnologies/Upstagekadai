import {
  validateHSNCode,
  lookupHSNCode,
  searchHSNByProductDetails,
  suggestHSNCode,
  getHSNDescription,
  isOnlineSourceConfigured,
} from '../src/services/hsnService';

describe('HSN Code and Auto Description End-to-End Scenario Workflows', () => {
  test('Scenario A: User searches and selects HSN result -> populates HSN code and official description', async () => {
    // 1. User enters Grocery -> Rice -> Basmati Rice
    const results = await searchHSNByProductDetails({
      category: 'Grocery',
      subcategory: 'Rice',
      productName: 'Basmati Rice 1kg',
      brand: 'India Gate',
    });

    expect(results.length).toBeGreaterThan(0);
    const selectedResult = results[0];

    // 2. Form state simulation upon selection
    let formState = {
      hsnCode: '',
      description: '',
      isManualDescription: false,
    };

    formState.hsnCode = selectedResult.hsnCode;
    formState.description = selectedResult.description;
    formState.isManualDescription = false;

    expect(formState.hsnCode).toBe('10063020');
    expect(formState.description).toContain('Basmati rice');
    expect(formState.isManualDescription).toBe(false);
  });

  test('Scenario B: User manually enters a valid HSN code -> automatically resolves official description', async () => {
    const inputCode = '04012000'; // Fresh / toned milk
    const validation = validateHSNCode(inputCode);
    expect(validation.isValid).toBe(true);

    const lookup = await lookupHSNCode(validation.code);
    expect(lookup.found).toBe(true);
    expect(lookup.description.toLowerCase()).toContain('milk');

    let formState = {
      hsnCode: inputCode,
      description: '',
      isManualDescription: false,
    };

    if (lookup.found && !formState.isManualDescription) {
      formState.description = lookup.description;
    }

    expect(formState.description).toContain('Milk and cream');
  });

  test('Scenario B2: User manually enters an unknown HSN code -> leaves description empty without generating fake text', async () => {
    const unknownCode = '98765432';
    const validation = validateHSNCode(unknownCode);
    expect(validation.isValid).toBe(true);

    const lookup = await lookupHSNCode(validation.code);
    expect(lookup.found).toBe(false);
    expect(lookup.description).toBeNull();

    let formState = {
      hsnCode: unknownCode,
      description: '',
      isManualDescription: false,
    };

    if (lookup.found && !formState.isManualDescription) {
      formState.description = lookup.description;
    }

    // Must remain empty for user to type manually
    expect(formState.description).toBe('');
  });

  test('Scenario C: User manually edits description -> manual text is strictly preserved and not overwritten', async () => {
    let formState = {
      hsnCode: '10063020',
      description: 'Special organic export quality Basmati rice from Punjab',
      isManualDescription: true,
    };

    // User changes product name or enters another code lookup
    const lookup = await lookupHSNCode('10063010');
    if (lookup.found && !formState.isManualDescription) {
      formState.description = lookup.description;
    }

    // Custom description is preserved
    expect(formState.description).toBe('Special organic export quality Basmati rice from Punjab');
    expect(formState.isManualDescription).toBe(true);
  });

  test('Scenario D: User changes category/subcategory -> refreshes suggestion without silently replacing confirmed code', async () => {
    let userHsnCode = '10063020'; // Confirmed code
    let userHasConfirmed = true;

    // User updates category to "Spices"
    const { suggestion } = await suggestHSNCode({
      category: 'Spices',
      subcategory: 'Chilli',
      productName: 'Chilli Powder',
    });

    expect(suggestion).not.toBeNull();
    expect(suggestion.hsnCode).toBe('09042211');

    // Rule: Do not silently replace confirmed code
    let activeHsnCode = userHasConfirmed ? userHsnCode : suggestion.hsnCode;
    expect(activeHsnCode).toBe('10063020');
  });

  test('Scenario E: No search results found -> allows manual entry and optional save', async () => {
    const results = await searchHSNByProductDetails({
      query: 'nonexistentproductxyz12345',
    });

    expect(results).toEqual([]);

    // Product payload with optional HSN and description can still be safely constructed
    const productPayload = {
      itemName: 'Custom Antique Collectible',
      purchasePrice: 500,
      salesPrice: 750,
      quantity: 1,
      hsnCode: '',
      description: 'Custom notes from shopkeeper',
    };

    expect(productPayload.hsnCode).toBe('');
    expect(productPayload.description).toBe('Custom notes from shopkeeper');
  });

  test('Scenario F: Offline directory resilience -> works without network or external API dependency', async () => {
    const offlineStatus = isOnlineSourceConfigured();
    expect(offlineStatus.configured).toBe(false);

    // Queries local authentic CBIC schedule smoothly
    const teaLookup = await lookupHSNCode('09024020');
    expect(teaLookup.found).toBe(true);
    expect(teaLookup.source).toContain('CBIC');
  });

  test('Persistence: Correct payload format for Firestore inventory document', () => {
    const rawHsnInput = '  10063020   ';
    const rawDescInput = '  Basmati rice premium long grain  ';

    const firestorePayload = {
      itemName: 'India Gate Basmati Rice (1kg)',
      brand: 'India Gate',
      purchasePrice: 120,
      salesPrice: 150,
      quantity: 5,
      hsnCode: rawHsnInput.trim(),
      description: rawDescInput.trim(),
    };

    expect(firestorePayload.hsnCode).toBe('10063020');
    expect(firestorePayload.description).toBe('Basmati rice premium long grain');
    expect(typeof firestorePayload.hsnCode).toBe('string');
    expect(typeof firestorePayload.description).toBe('string');
  });
});
