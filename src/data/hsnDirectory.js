/**
 * Authentic CBIC (Central Board of Indirect Taxes & Customs) GST HSN Reference Directory
 * Covers major retail, FMCG, grocery, textiles, footwear, electronics, hardware,
 * cosmetics, pharmaceuticals, stationery and household product classifications in India.
 */

export const HSN_DIRECTORY = [
  // ==========================================
  // CHAPTER 10: CEREALS & GRAINS (RICE, WHEAT)
  // ==========================================
  {
    hsnCode: "10063020",
    description: "Basmati rice (Semi-milled or wholly milled rice, whether or not polished or glazed)",
    category: "Grocery / Cereals",
    chapter: "10",
    gstRate: "5%",
    keywords: ["rice", "basmati", "basmathi", "paddy", "cereal", "grain", "arisi", "chawal", "daawat", "india gate", "kohinoor", "biryani rice"],
    type: "goods"
  },
  {
    hsnCode: "10063010",
    description: "Rice, parboiled (Semi-milled or wholly milled rice, whether or not polished or glazed)",
    category: "Grocery / Cereals",
    chapter: "10",
    gstRate: "5%",
    keywords: ["rice", "parboiled", "ponni", "sona masoori", "boiled rice", "puzhungal arisi", "pulungal arisi", "white rice", "idli rice", "raw rice", "pacharisi"],
    type: "goods"
  },
  {
    hsnCode: "10061000",
    description: "Rice in the husk (paddy or rough)",
    category: "Grocery / Cereals",
    chapter: "10",
    gstRate: "0%",
    keywords: ["paddy", "rough rice", "husk rice", "nellu", "dhan"],
    type: "goods"
  },
  {
    hsnCode: "10064000",
    description: "Broken rice",
    category: "Grocery / Cereals",
    chapter: "10",
    gstRate: "5%",
    keywords: ["broken rice", "kuruva", "noyyi", "thari rice"],
    type: "goods"
  },
  {
    hsnCode: "10019910",
    description: "Wheat of other than seed quality",
    category: "Grocery / Cereals",
    chapter: "10",
    gstRate: "0%",
    keywords: ["wheat", "godhumai", "gehun", "sharbati wheat", "whole wheat", "cereal grain"],
    type: "goods"
  },
  {
    hsnCode: "10059000",
    description: "Maize (corn), other than seed",
    category: "Grocery / Cereals",
    chapter: "10",
    gstRate: "0%",
    keywords: ["maize", "corn", "makka cholam", "makki", "sweet corn", "corn grain"],
    type: "goods"
  },
  {
    hsnCode: "10082900",
    description: "Millet (Bajra, Ragi, Foxtail, Kodo, Little, Barnyard)",
    category: "Grocery / Millets",
    chapter: "10",
    gstRate: "0%",
    keywords: ["millet", "ragi", "bajra", "kezhvaragu", "thinai", "samai", "kuthiraivali", "varagu", "siruthaniyangal"],
    type: "goods"
  },

  // ==========================================
  // CHAPTER 11: MILLING PRODUCTS, FLOUR, ATTA, SOOJI
  // ==========================================
  {
    hsnCode: "11010000",
    description: "Wheat flour or meslin flour (Atta, Maida)",
    category: "Grocery / Flours",
    chapter: "11",
    gstRate: "5%",
    keywords: ["wheat flour", "atta", "godhumai maavu", "aashirvaad", "pillsbury", "chakki atta", "whole wheat flour", "flour"],
    type: "goods"
  },
  {
    hsnCode: "11031110",
    description: "Groats and meal of wheat (Sooji, Rava, Semolina)",
    category: "Grocery / Flours",
    chapter: "11",
    gstRate: "5%",
    keywords: ["sooji", "suji", "rava", "ravai", "semolina", "upma rava", "bombay rava", "roasted rava"],
    type: "goods"
  },
  {
    hsnCode: "11029000",
    description: "Cereal flours other than wheat or meslin (Rice flour, Corn flour, Besan / Gram flour)",
    category: "Grocery / Flours",
    chapter: "11",
    gstRate: "5%",
    keywords: ["rice flour", "besan", "gram flour", "kadalai maavu", "corn flour", "makki atta", "ragi flour", "puttu podi", "idiyappam flour"],
    type: "goods"
  },

  // ==========================================
  // CHAPTER 07: PULSES, DALS, VEGETABLES
  // ==========================================
  {
    hsnCode: "07136000",
    description: "Pigeon peas (Cajanus cajan) / Toor Dal (Arhar Dal)",
    category: "Grocery / Pulses & Dals",
    chapter: "07",
    gstRate: "5%",
    keywords: ["toor dal", "tuvar dal", "arhar dal", "thuvaram paruppu", "pigeon peas", "split pulse", "sambar dal"],
    type: "goods"
  },
  {
    hsnCode: "07133100",
    description: "Beans of the species Vigna mungo / Urad Dal (Black matpe)",
    category: "Grocery / Pulses & Dals",
    chapter: "07",
    gstRate: "5%",
    keywords: ["urad dal", "ulunthu", "ulutham paruppu", "black gram", "split urad", "white urad", "idli dal", "vigna mungo"],
    type: "goods"
  },
  {
    hsnCode: "07133200",
    description: "Small red (Adzuki) beans and Moong Dal (Green gram)",
    category: "Grocery / Pulses & Dals",
    chapter: "07",
    gstRate: "5%",
    keywords: ["moong dal", "mung dal", "green gram", "paasi paruppu", "split moong", "yellow moong", "whole moong", "payatham paruppu"],
    type: "goods"
  },
  {
    hsnCode: "07132000",
    description: "Chickpeas (garbanzos) / Chana Dal & Bengal Gram / Kabuli Chana",
    category: "Grocery / Pulses & Dals",
    chapter: "07",
    gstRate: "5%",
    keywords: ["chana dal", "chickpeas", "kadalai paruppu", "bengal gram", "kabuli chana", "white chana", "black chana", "kondakadalai", "sundal"],
    type: "goods"
  },
  {
    hsnCode: "07134000",
    description: "Lentils / Masoor Dal",
    category: "Grocery / Pulses & Dals",
    chapter: "07",
    gstRate: "5%",
    keywords: ["masoor dal", "red lentil", "mysore paruppu", "lentils", "split masoor"],
    type: "goods"
  },
  {
    hsnCode: "07019000",
    description: "Potatoes, fresh or chilled (other than seed)",
    category: "Vegetables / Fresh",
    chapter: "07",
    gstRate: "0%",
    keywords: ["potato", "potatoes", "urulaikizhangu", "aloo", "fresh vegetable"],
    type: "goods"
  },
  {
    hsnCode: "07020000",
    description: "Tomatoes, fresh or chilled",
    category: "Vegetables / Fresh",
    chapter: "07",
    gstRate: "0%",
    keywords: ["tomato", "tomatoes", "thakkali", "tamatar", "country tomato", "hybrid tomato"],
    type: "goods"
  },
  {
    hsnCode: "07031010",
    description: "Onions, fresh or chilled",
    category: "Vegetables / Fresh",
    chapter: "07",
    gstRate: "0%",
    keywords: ["onion", "onions", "vengayam", "pyaz", "shallots", "sambar onion", "bellary onion", "red onion"],
    type: "goods"
  },
  {
    hsnCode: "07032000",
    description: "Garlic, fresh or chilled",
    category: "Vegetables / Fresh",
    chapter: "07",
    gstRate: "0%",
    keywords: ["garlic", "poondu", "lahsun", "lasun", "fresh garlic", "whole garlic"],
    type: "goods"
  },

  // ==========================================
  // CHAPTER 09: TEA, COFFEE & SPICES
  // ==========================================
  {
    hsnCode: "09024020",
    description: "Black tea, leaf in packings not exceeding 25 g to 1 kg (CTC Tea / Dust Tea)",
    category: "Beverages / Tea",
    chapter: "09",
    gstRate: "5%",
    keywords: ["tea", "black tea", "ctc tea", "dust tea", "leaf tea", "tea powder", "chai", "3 roses", "taj mahal", "red label", "tata tea", "chakra gold", "kannan devan"],
    type: "goods"
  },
  {
    hsnCode: "09021020",
    description: "Green tea (not fermented) in immediate packings of a content not exceeding 3 kg",
    category: "Beverages / Tea",
    chapter: "09",
    gstRate: "5%",
    keywords: ["green tea", "herbal tea", "lipton green tea", "tetley", "organic green tea", "matcha"],
    type: "goods"
  },
  {
    hsnCode: "09012110",
    description: "Coffee, roasted, not decaffeinated (Filter Coffee powder / Coffee beans)",
    category: "Beverages / Coffee",
    chapter: "09",
    gstRate: "5%",
    keywords: ["coffee", "filter coffee", "roasted coffee", "coffee powder", "chicory coffee", "narasus", "cothas", "bru filter coffee"],
    type: "goods"
  },
  {
    hsnCode: "21011110",
    description: "Instant coffee, flavoured or unflavoured (Extracts, essences and concentrates)",
    category: "Beverages / Coffee",
    chapter: "21",
    gstRate: "18%",
    keywords: ["instant coffee", "nescafe", "bru instant", "continental coffee", "coffee powder", "davidoff", "sunrise"],
    type: "goods"
  },
  {
    hsnCode: "09103020",
    description: "Turmeric (Curcuma) powder",
    category: "Spices / Masalas",
    chapter: "09",
    gstRate: "5%",
    keywords: ["turmeric", "turmeric powder", "manjal", "manjal thool", "haldi", "haldi powder", "curcuma", "spice"],
    type: "goods"
  },
  {
    hsnCode: "09042211",
    description: "Chilli powder (Red chilli powder)",
    category: "Spices / Masalas",
    chapter: "09",
    gstRate: "5%",
    keywords: ["chilli powder", "red chilli", "milagai thool", "mirchi powder", "kashmiri chilli", "spicy chilli powder", "aachi", "sakthi", "everest"],
    type: "goods"
  },
  {
    hsnCode: "09092200",
    description: "Coriander seeds crushed or ground (Coriander / Dhania powder)",
    category: "Spices / Masalas",
    chapter: "09",
    gstRate: "5%",
    keywords: ["coriander powder", "dhania powder", "malli thool", "dhaniya", "ground coriander"],
    type: "goods"
  },
  {
    hsnCode: "09093119",
    description: "Cumin seeds, other than seed quality (Jeera)",
    category: "Spices / Masalas",
    chapter: "09",
    gstRate: "5%",
    keywords: ["cumin", "cumin seeds", "jeera", "seeragam", "zeera", "jeerakam", "whole cumin"],
    type: "goods"
  },
  {
    hsnCode: "09083110",
    description: "Cardamom (large or small), not crushed or ground (Elaichi)",
    category: "Spices / Masalas",
    chapter: "09",
    gstRate: "5%",
    keywords: ["cardamom", "green cardamom", "elaichi", "elakkai", "elachi", "spice pod"],
    type: "goods"
  },
  {
    hsnCode: "09041110",
    description: "Pepper, black, neither crushed nor ground (Kali Mirch)",
    category: "Spices / Masalas",
    chapter: "09",
    gstRate: "5%",
    keywords: ["pepper", "black pepper", "milagu", "kali mirch", "peppercorns", "whole black pepper"],
    type: "goods"
  },
  {
    hsnCode: "09071000",
    description: "Cloves (whole fruit, cloves and stems)",
    category: "Spices / Masalas",
    chapter: "09",
    gstRate: "5%",
    keywords: ["cloves", "laung", "kirambu", "lavangam", "whole cloves", "spice"],
    type: "goods"
  },
  {
    hsnCode: "09061110",
    description: "Cinnamon (Dalchini), neither crushed nor ground",
    category: "Spices / Masalas",
    chapter: "09",
    gstRate: "5%",
    keywords: ["cinnamon", "dalchini", "pattai", "cinnamon bark", "cinnamon stick"],
    type: "goods"
  },
  {
    hsnCode: "09109100",
    description: "Mixtures of spices (Garam Masala, Curry Powder, Sambar Powder, Rasam Powder)",
    category: "Spices / Masalas",
    chapter: "09",
    gstRate: "5%",
    keywords: ["garam masala", "curry powder", "sambar powder", "rasam powder", "kulambu podi", "biryani masala", "chicken masala", "mutton masala", "meat masala", "fish curry masala"],
    type: "goods"
  },
  {
    hsnCode: "12075010",
    description: "Mustard seeds (Rai, Kadugu)",
    category: "Spices / Seeds",
    chapter: "12",
    gstRate: "5%",
    keywords: ["mustard", "mustard seeds", "kadugu", "rai", "sarson", "black mustard", "small mustard"],
    type: "goods"
  },
  {
    hsnCode: "09109912",
    description: "Fenugreek seeds (Methi seeds, Vendhayam)",
    category: "Spices / Seeds",
    chapter: "09",
    gstRate: "5%",
    keywords: ["fenugreek", "methi", "vendhayam", "methi seeds", "fenugreek seeds"],
    type: "goods"
  },
  {
    hsnCode: "13019013",
    description: "Asafoetida / Hing (Perungayam)",
    category: "Spices / Seasoning",
    chapter: "13",
    gstRate: "5%",
    keywords: ["asafoetida", "hing", "perungayam", "compounded asafoetida", "lg hing", "ramdev hing"],
    type: "goods"
  },

  // ==========================================
  // CHAPTER 15: EDIBLE OILS & GHEE
  // ==========================================
  {
    hsnCode: "15121910",
    description: "Sunflower seed oil, edible grade (Refined sunflower oil)",
    category: "Grocery / Edible Oils",
    chapter: "15",
    gstRate: "5%",
    keywords: ["sunflower oil", "refined oil", "cooking oil", "sunrich", "fortune sunflower", "gold winner", "saffola", "gemini", "sunland"],
    type: "goods"
  },
  {
    hsnCode: "15089010",
    description: "Groundnut oil, edible grade (Peanut oil / Kadalai ennai)",
    category: "Grocery / Edible Oils",
    chapter: "15",
    gstRate: "5%",
    keywords: ["groundnut oil", "peanut oil", "kadalai ennai", "cold pressed groundnut oil", "marachekku ennai", "singhoda oil"],
    type: "goods"
  },
  {
    hsnCode: "15131900",
    description: "Coconut oil and its fractions, edible grade",
    category: "Grocery / Edible Oils",
    chapter: "15",
    gstRate: "5%",
    keywords: ["coconut oil", "thengai ennai", "nariyal tel", "edible coconut oil", "parachute edible", "vvd coconut oil"],
    type: "goods"
  },
  {
    hsnCode: "15155091",
    description: "Sesame oil, edible grade (Gingelly oil / Nallennai)",
    category: "Grocery / Edible Oils",
    chapter: "15",
    gstRate: "5%",
    keywords: ["sesame oil", "gingelly oil", "nallennai", "til oil", "idhayam sesame oil", "cold pressed sesame"],
    type: "goods"
  },
  {
    hsnCode: "15141910",
    description: "Mustard oil, edible grade (Sarson ka tel)",
    category: "Grocery / Edible Oils",
    chapter: "15",
    gstRate: "5%",
    keywords: ["mustard oil", "sarson tel", "kachi ghani", "kadugu ennai", "fortune mustard oil"],
    type: "goods"
  },
  {
    hsnCode: "15119010",
    description: "Palm oil, refined, edible grade (Palmolein)",
    category: "Grocery / Edible Oils",
    chapter: "15",
    gstRate: "5%",
    keywords: ["palm oil", "palmolein", "cooking oil", "refined palm oil", "ruchigold"],
    type: "goods"
  },
  {
    hsnCode: "04059020",
    description: "Ghee (Pure Desi Butter Oil / Clarified Butter)",
    category: "Dairy / Ghee",
    chapter: "04",
    gstRate: "12%",
    keywords: ["ghee", "cow ghee", "desi ghee", "nei", "amul ghee", "aavin ghee", "nandini ghee", "grb ghee", "rkg ghee", "clarified butter"],
    type: "goods"
  },

  // ==========================================
  // CHAPTER 04: DAIRY PRODUCTS
  // ==========================================
  {
    hsnCode: "04012000",
    description: "Milk and cream, fresh, not concentrated (Pasteurized toned / full cream milk)",
    category: "Dairy / Milk",
    chapter: "04",
    gstRate: "5%",
    keywords: ["milk", "fresh milk", "cow milk", "packet milk", "toned milk", "paal", "doodh", "amul milk", "aavin milk", "nandini milk", "mother dairy"],
    type: "goods"
  },
  {
    hsnCode: "04031000",
    description: "Yogurt, Curd (Dahi), Buttermilk",
    category: "Dairy / Curd",
    chapter: "04",
    gstRate: "5%",
    keywords: ["curd", "dahi", "thayir", "yogurt", "buttermilk", "mor", "chaas", "lassi", "cup curd", "amul dahi", "milky mist curd"],
    type: "goods"
  },
  {
    hsnCode: "04051000",
    description: "Butter (Table butter, Salted or Unsalted butter)",
    category: "Dairy / Butter",
    chapter: "04",
    gstRate: "12%",
    keywords: ["butter", "vennai", "makhan", "table butter", "salted butter", "amul butter", "white butter"],
    type: "goods"
  },
  {
    hsnCode: "04061000",
    description: "Fresh cheese (including whey cheese), unripened or uncured; Paneer",
    category: "Dairy / Paneer & Cheese",
    chapter: "04",
    gstRate: "5%",
    keywords: ["paneer", "cottage cheese", "cheese", "milky mist paneer", "amul paneer", "fresh paneer", "cheese cubes", "cheese slice"],
    type: "goods"
  },

  // ==========================================
  // CHAPTER 17 & 25: SUGAR & SALT
  // ==========================================
  {
    hsnCode: "17019990",
    description: "Cane or beet sugar, chemically pure sucrose in solid form (White refined crystal sugar)",
    category: "Grocery / Sweeteners",
    chapter: "17",
    gstRate: "5%",
    keywords: ["sugar", "white sugar", "sakkarai", "cheeni", "crystal sugar", "refined sugar", "sweetener"],
    type: "goods"
  },
  {
    hsnCode: "17011490",
    description: "Cane sugar, other (Jaggery, Gur, Nattu Sakkarai, Brown Sugar)",
    category: "Grocery / Sweeteners",
    chapter: "17",
    gstRate: "5%",
    keywords: ["jaggery", "gur", "vellam", "nattu sakkarai", "country sugar", "palm jaggery", "karupatti", "brown sugar"],
    type: "goods"
  },
  {
    hsnCode: "25010010",
    description: "Common salt (including iodised salt)",
    category: "Grocery / Salt",
    chapter: "25",
    gstRate: "0%",
    keywords: ["salt", "iodised salt", "uppu", "namak", "table salt", "tata salt", "rock salt", "crystal salt", "kal uppu", "powder salt"],
    type: "goods"
  },

  // ==========================================
  // CHAPTER 19: BISCUITS, BAKERY, NOODLES, PASTA
  // ==========================================
  {
    hsnCode: "19053100",
    description: "Sweet biscuits (Cookies, Marie, Cream biscuits, Glucose biscuits)",
    category: "Bakery / Biscuits",
    chapter: "19",
    gstRate: "18%",
    keywords: ["biscuit", "biscuits", "cookies", "marie", "parle-g", "bourbon", "good day", "britannia", "dark fantasy", "oreo", "cream biscuit", "monaco", "50-50"],
    type: "goods"
  },
  {
    hsnCode: "19059020",
    description: "Bakers' wares - Rusks, toasted bread and similar toasted products",
    category: "Bakery / Rusk",
    chapter: "19",
    gstRate: "18%",
    keywords: ["rusk", "toast", "tea rusk", "cake rusk", "britannia rusk", "crispy rusk"],
    type: "goods"
  },
  {
    hsnCode: "19059010",
    description: "Pastries and cakes (Bread, Plum cake, Sponge cake, Buns)",
    category: "Bakery / Cakes & Bread",
    chapter: "19",
    gstRate: "5%",
    keywords: ["bread", "cake", "bun", "white bread", "wheat bread", "pav", "sweet bun", "cupcake", "plum cake", "modern bread"],
    type: "goods"
  },
  {
    hsnCode: "19023000",
    description: "Other pasta (Instant noodles, Maggi, Hakka noodles, Vermicelli / Semiya)",
    category: "Packaged Foods / Noodles",
    chapter: "19",
    gstRate: "18%",
    keywords: ["noodles", "instant noodles", "maggi", "yippee", "top ramen", "hakka noodles", "vermicelli", "semiya", "pasta", "macaroni", "spaghetti"],
    type: "goods"
  },
  {
    hsnCode: "18063200",
    description: "Chocolate and other food preparations containing cocoa (Chocolate bars, candies)",
    category: "Confectionery / Chocolates",
    chapter: "18",
    gstRate: "18%",
    keywords: ["chocolate", "cadbury", "dairy milk", "5 star", "fivestar", "kitkat", "munch", "snickers", "milkybar", "cocoa", "choco bar"],
    type: "goods"
  },
  {
    hsnCode: "21069099",
    description: "Namkeen, mixtures, bhujia, chivda, savory snacks",
    category: "Packaged Foods / Snacks",
    chapter: "21",
    gstRate: "12%",
    keywords: ["namkeen", "mixture", "bhujia", "sev", "chips", "kurkure", "lays", "bingo", "murukku", "haldirams", "balaji", "savory snack"],
    type: "goods"
  },

  // ==========================================
  // CHAPTER 22: BEVERAGES & WATER
  // ==========================================
  {
    hsnCode: "22011010",
    description: "Mineral waters, natural or artificial, not containing added sugar or flavoured",
    category: "Beverages / Water",
    chapter: "22",
    gstRate: "18%",
    keywords: ["water", "mineral water", "drinking water", "packaged water", "bisleri", "aquafina", "kinley", "water bottle", "gallon can"],
    type: "goods"
  },
  {
    hsnCode: "22021010",
    description: "Aerated waters containing added sugar or other sweetening matter or flavoured (Soft drinks)",
    category: "Beverages / Soft Drinks",
    chapter: "22",
    gstRate: "28%",
    keywords: ["soft drink", "aerated water", "soda", "coca cola", "pepsi", "thums up", "sprite", "fanta", "mirinda", "7up", "maaza", "frooti", "carbonated drink"],
    type: "goods"
  },

  // ==========================================
  // CHAPTER 33 & 34: PERSONAL CARE, SOAPS, COSMETICS, CLEANING
  // ==========================================
  {
    hsnCode: "34011110",
    description: "Medicated toilet soaps in cake, slab or moulded form",
    category: "Personal Care / Soaps",
    chapter: "34",
    gstRate: "18%",
    keywords: ["medicated soap", "dettol soap", "lifebuoy", "savlon soap", "cinthol", "neem soap", "antiseptic soap"],
    type: "goods"
  },
  {
    hsnCode: "34011190",
    description: "Toilet soaps, other (Bathing bar, beauty soap in bars or cakes)",
    category: "Personal Care / Soaps",
    chapter: "34",
    gstRate: "18%",
    keywords: ["soap", "bathing soap", "toilet soap", "dove", "lux", "pears", "hamam", "mysore sandal", "medimix", "fiama", "rexona", "liril"],
    type: "goods"
  },
  {
    hsnCode: "34013011",
    description: "Organic surface-active products for washing skin, liquid (Liquid handwash / Body wash)",
    category: "Personal Care / Soaps",
    chapter: "34",
    gstRate: "18%",
    keywords: ["handwash", "liquid handwash", "body wash", "shower gel", "dettol handwash", "lifebuoy handwash", "palmolive"],
    type: "goods"
  },
  {
    hsnCode: "33061020",
    description: "Dentifrices in toothpaste form",
    category: "Personal Care / Dental",
    chapter: "33",
    gstRate: "18%",
    keywords: ["toothpaste", "colgate", "close up", "pepsodent", "sensodyne", "dabur red", "patanjali dant kanti", "meswak", "oral care"],
    type: "goods"
  },
  {
    hsnCode: "96032100",
    description: "Toothbrushes, including dental-plate brushes",
    category: "Personal Care / Dental",
    chapter: "96",
    gstRate: "18%",
    keywords: ["toothbrush", "colgate toothbrush", "oral-b", "brush", "soft toothbrush", "zig zag"],
    type: "goods"
  },
  {
    hsnCode: "33051010",
    description: "Shampoos (Hair washing preparations, whether or not containing soap)",
    category: "Personal Care / Hair Care",
    chapter: "33",
    gstRate: "18%",
    keywords: ["shampoo", "head and shoulders", "clinic plus", "pantene", "sunsilk", "dove shampoo", "tresemme", "hair wash", "anti dandruff"],
    type: "goods"
  },
  {
    hsnCode: "33059011",
    description: "Hair oil, perfumed or non-perfumed",
    category: "Personal Care / Hair Care",
    chapter: "33",
    gstRate: "18%",
    keywords: ["hair oil", "coconut hair oil", "parachute", "vatika", "almond hair oil", "bajaj almond", "navratna oil", "amla hair oil", "dabur amla"],
    type: "goods"
  },
  {
    hsnCode: "33049910",
    description: "Face creams, cold creams, moisturizers, vanishing creams",
    category: "Personal Care / Skin Care",
    chapter: "33",
    gstRate: "18%",
    keywords: ["face cream", "moisturizer", "skin cream", "fair & lovely", "glow & lovely", "nivea", "ponds", "vaseline lotion", "body lotion", "cold cream", "sunscreen"],
    type: "goods"
  },
  {
    hsnCode: "33072000",
    description: "Personal deodorants and antiperspirants",
    category: "Personal Care / Fragrance",
    chapter: "33",
    gstRate: "18%",
    keywords: ["deodorant", "deo", "body spray", "axe", "fog", "fogg", "nivea deo", "wild stone", "engage", "perfume", "scent"],
    type: "goods"
  },
  {
    hsnCode: "34029011",
    description: "Washing powders / Laundry detergent powders",
    category: "Home Care / Laundry",
    chapter: "34",
    gstRate: "18%",
    keywords: ["washing powder", "detergent powder", "surf excel", "tide", "ariel", "rin", "ghadi", "wheel", "detergent", "laundry powder"],
    type: "goods"
  },
  {
    hsnCode: "34011942",
    description: "Laundry soap cakes, bars or blocks (Detergent bar)",
    category: "Home Care / Laundry",
    chapter: "34",
    gstRate: "18%",
    keywords: ["detergent bar", "washing soap", "rin soap", "surf excel bar", "wheel bar", "tide bar", "laundry bar"],
    type: "goods"
  },
  {
    hsnCode: "34022020",
    description: "Dishwashing preparations, liquids and bars (Vim bar, Pril)",
    category: "Home Care / Dishwashing",
    chapter: "34",
    gstRate: "18%",
    keywords: ["dishwash bar", "dishwash liquid", "vim bar", "vim gel", "pril", "exo bar", "utensil cleaner", "dish soap"],
    type: "goods"
  },
  {
    hsnCode: "38089400",
    description: "Disinfectants, surface and toilet cleaners (Lizol, Harpic, Colin)",
    category: "Home Care / Cleaning",
    chapter: "38",
    gstRate: "18%",
    keywords: ["floor cleaner", "toilet cleaner", "disinfectant", "harpic", "lizol", "colin", "phenyl", "bleach", "bathroom cleaner"],
    type: "goods"
  },
  {
    hsnCode: "38089191",
    description: "Mosquito repellents, coils, mats, liquid vaporizers (All Out, Good Knight)",
    category: "Home Care / Pest Control",
    chapter: "38",
    gstRate: "18%",
    keywords: ["mosquito repellent", "mosquito coil", "liquid vaporizer", "all out", "good knight", "hit spray", "repellent machine", "refill"],
    type: "goods"
  },
  {
    hsnCode: "33074100",
    description: "Agarbatti and other odoriferous preparations which operate by burning (Incense sticks)",
    category: "Pooja / Household",
    chapter: "33",
    gstRate: "5%",
    keywords: ["agarbatti", "incense stick", "dhoop", "pooja sticks", "cycle agarbatti", "mangaldeep", "sambrani"],
    type: "goods"
  },
  {
    hsnCode: "36050010",
    description: "Matches / Safety matchboxes",
    category: "Household / General",
    chapter: "36",
    gstRate: "12%",
    keywords: ["matches", "matchbox", "theepetti", "matchsticks", "safety matches", "wax matches"],
    type: "goods"
  },

  // ==========================================
  // CHAPTER 48 & 96: STATIONERY, PAPER, PENS
  // ==========================================
  {
    hsnCode: "48202000",
    description: "Exercise books, notebooks, registers, note pads",
    category: "Stationery / Paper",
    chapter: "48",
    gstRate: "12%",
    keywords: ["notebook", "exercise book", "register", "long book", "rough notebook", "classmate", "single line notebook", "spiral notepad", "drawing book"],
    type: "goods"
  },
  {
    hsnCode: "48025610",
    description: "A4 Photocopy Paper, typing and printing paper",
    category: "Stationery / Paper",
    chapter: "48",
    gstRate: "12%",
    keywords: ["a4 paper", "photocopy paper", "printing paper", "copier paper", "jk copier", "tnpl a4", "xerox paper"],
    type: "goods"
  },
  {
    hsnCode: "96081019",
    description: "Ballpoint pens, gel pens and roller pens with replaceable refill",
    category: "Stationery / Writing",
    chapter: "96",
    gstRate: "18%",
    keywords: ["pen", "ball pen", "gel pen", "reynolds", "cello", "camlin", "parker", "pentonic", "rollerball pen", "dot pen"],
    type: "goods"
  },
  {
    hsnCode: "96091000",
    description: "Pencils and crayons, with leads encased in a rigid sheath",
    category: "Stationery / Writing",
    chapter: "96",
    gstRate: "12%",
    keywords: ["pencil", "apsara pencil", "natraj pencil", "lead pencil", "crayons", "color pencils", "sketch pens", "eraser", "sharpener"],
    type: "goods"
  },

  // ==========================================
  // CHAPTER 61 & 62: APPAREL, CLOTHING & TEXTILES
  // ==========================================
  {
    hsnCode: "61091000",
    description: "T-shirts, singlets and other vests, knitted or crocheted, of cotton",
    category: "Garments / Casual Wear",
    chapter: "61",
    gstRate: "5%",
    keywords: ["t-shirt", "tshirt", "tee", "polo", "round neck t-shirt", "cotton t-shirt", "vest", "singlet", "banian", "mens t-shirt"],
    type: "goods"
  },
  {
    hsnCode: "62052000",
    description: "Men's or boys' shirts, of cotton (Woven formal or casual shirts)",
    category: "Garments / Formal & Casual",
    chapter: "62",
    gstRate: "5%",
    keywords: ["shirt", "cotton shirt", "formal shirt", "casual shirt", "full sleeve shirt", "half sleeve shirt", "mens shirt"],
    type: "goods"
  },
  {
    hsnCode: "62034200",
    description: "Men's or boys' trousers, bib and brace overalls, breeches and shorts, of cotton (Jeans / Pants)",
    category: "Garments / Bottom Wear",
    chapter: "62",
    gstRate: "5%",
    keywords: ["jeans", "trousers", "pants", "chinos", "cotton pants", "shorts", "cargos", "denim"],
    type: "goods"
  },
  {
    hsnCode: "62114210",
    description: "Sarees, of cotton or silk or synthetic filaments",
    category: "Garments / Traditional Wear",
    chapter: "62",
    gstRate: "5%",
    keywords: ["saree", "sari", "silk saree", "cotton saree", "pattu pudavai", "fancy saree", "printed saree"],
    type: "goods"
  },
  {
    hsnCode: "62044220",
    description: "Women's dresses, kurtas, salwar kameez suits, skirts",
    category: "Garments / Women's Wear",
    chapter: "62",
    gstRate: "5%",
    keywords: ["kurta", "kurti", "salwar", "churidar", "dress", "gown", "maxi dress", "leggings", "plazo"],
    type: "goods"
  },
  {
    hsnCode: "61071100",
    description: "Men's or boys' underpants, briefs and boxer shorts, of cotton",
    category: "Garments / Innerwear",
    chapter: "61",
    gstRate: "5%",
    keywords: ["briefs", "underwear", "boxer", "underpants", "jockey", "rupa", "lux cozi", "innerwear"],
    type: "goods"
  },
  {
    hsnCode: "61159500",
    description: "Socks and other hosiery, of cotton, knitted or crocheted",
    category: "Garments / Accessories",
    chapter: "61",
    gstRate: "5%",
    keywords: ["socks", "cotton socks", "ankle socks", "school socks", "sports socks"],
    type: "goods"
  },

  // ==========================================
  // CHAPTER 64: FOOTWEAR
  // ==========================================
  {
    hsnCode: "64022000",
    description: "Footwear with upper straps or thongs assembled to sole by plugs (Hawai Chappals, Flip-flops, Rubber Slippers)",
    category: "Footwear / Slippers",
    chapter: "64",
    gstRate: "5%",
    keywords: ["chappal", "slippers", "flip flops", "hawai chappal", "bata chappal", "rubber slippers", "slides", "sandals"],
    type: "goods"
  },
  {
    hsnCode: "64041100",
    description: "Sports footwear; tennis shoes, basketball shoes, gym shoes, training shoes",
    category: "Footwear / Shoes",
    chapter: "64",
    gstRate: "12%",
    keywords: ["shoes", "sports shoes", "running shoes", "sneakers", "canvas shoes", "puma", "adidas", "nike", "campus", "sparx"],
    type: "goods"
  },
  {
    hsnCode: "64039190",
    description: "Footwear with outer soles of rubber/plastics and uppers of leather (Leather Formal Shoes)",
    category: "Footwear / Formal Shoes",
    chapter: "64",
    gstRate: "18%",
    keywords: ["formal shoes", "leather shoes", "office shoes", "boots", "loafers", "bata shoes"],
    type: "goods"
  },

  // ==========================================
  // CHAPTER 85: ELECTRONICS & ACCESSORIES
  // ==========================================
  {
    hsnCode: "85171300",
    description: "Smartphones and cellular telephone sets",
    category: "Electronics / Mobiles",
    chapter: "85",
    gstRate: "18%",
    keywords: ["smartphone", "mobile phone", "android phone", "iphone", "samsung", "redmi", "realme", "vivo", "oppo", "oneplus"],
    type: "goods"
  },
  {
    hsnCode: "85044030",
    description: "Battery chargers, mobile phone adapters and power supplies",
    category: "Electronics / Accessories",
    chapter: "85",
    gstRate: "18%",
    keywords: ["charger", "mobile charger", "adapter", "fast charger", "type c charger", "power adapter", "brick"],
    type: "goods"
  },
  {
    hsnCode: "85444299",
    description: "USB data cables, charging cables, electrical cables fitted with connectors",
    category: "Electronics / Accessories",
    chapter: "85",
    gstRate: "18%",
    keywords: ["cable", "usb cable", "type c cable", "lightning cable", "data cable", "charging cable", "cord"],
    type: "goods"
  },
  {
    hsnCode: "85183000",
    description: "Headphones and earphones, combined or not with a microphone (Bluetooth earbuds, neckband, wired headset)",
    category: "Electronics / Audio",
    chapter: "85",
    gstRate: "18%",
    keywords: ["earphones", "headphones", "earbuds", "airpods", "tws", "bluetooth neckband", "headset", "boat", "noise", "realme buds"],
    type: "goods"
  },
  {
    hsnCode: "85395000",
    description: "Light-emitting diode (LED) lamps and light bulbs",
    category: "Electrical / Lighting",
    chapter: "85",
    gstRate: "12%",
    keywords: ["led bulb", "bulb", "tube light", "led light", "philips bulb", "wipro led", "havells", "9w bulb", "12w led"],
    type: "goods"
  },
  {
    hsnCode: "85061000",
    description: "Primary cells and primary batteries (Manganese dioxide AA, AAA alkaline batteries)",
    category: "Electrical / Batteries",
    chapter: "85",
    gstRate: "18%",
    keywords: ["battery", "batteries", "aa battery", "aaa battery", "duracell", "everyeady", "pencil cell", "dry cell"],
    type: "goods"
  },

  // ==========================================
  // CHAPTER 73 & 83: HARDWARE & UTENSILS
  // ==========================================
  {
    hsnCode: "73239390",
    description: "Table, kitchen or other household articles and parts thereof, of stainless steel (Utensils, plates, tumblers)",
    category: "Household / Utensils",
    chapter: "73",
    gstRate: "12%",
    keywords: ["utensil", "stainless steel", "steel plate", "steel tumbler", "vessel", "patra", "spoon", "fork", "cookware", "kadai", "steel box"],
    type: "goods"
  },
  {
    hsnCode: "73181500",
    description: "Screws and bolts, whether or not with their nuts or washers, of iron or steel",
    category: "Hardware / Fasteners",
    chapter: "73",
    gstRate: "18%",
    keywords: ["screw", "screws", "bolt", "nuts", "hardware", "fastener", "iron screw", "threaded bolt"],
    type: "goods"
  },
  {
    hsnCode: "83011000",
    description: "Padlocks, cylinder padlocks and keys of base metal (Godrej locks)",
    category: "Hardware / Locks",
    chapter: "83",
    gstRate: "18%",
    keywords: ["padlock", "lock", "pootu", "tala", "key", "godrej padlock", "door lock", "brass padlock"],
    type: "goods"
  },

  // ==========================================
  // CHAPTER 30: MEDICINES & HEALTHCARE
  // ==========================================
  {
    hsnCode: "30049099",
    description: "Medicaments consisting of mixed or unmixed products for therapeutic uses (General tablets, pain relief, syrups)",
    category: "Pharmacy / Medicine",
    chapter: "30",
    gstRate: "12%",
    keywords: ["medicine", "tablet", "syrup", "paracetamol", "crocin", "dolo", "pain relief", "antacid", "cough syrup", "pills"],
    type: "goods"
  },
  {
    hsnCode: "30051090",
    description: "Adhesive dressings and other articles having an adhesive layer (Band-aid, surgical tape)",
    category: "Pharmacy / First Aid",
    chapter: "30",
    gstRate: "12%",
    keywords: ["band-aid", "bandage", "plaster", "adhesive tape", "first aid", "dressing"],
    type: "goods"
  }
];
