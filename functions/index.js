
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");

const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

const makeLocationId = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

exports.addLocation = onCall(async (request) => {
  const { type, name, countryCode, state, district, city } =
    request.data || {};
  const recordTypes = {
    Country: "country",
    State: "state",
    District: "district",
    City: "city",
    Area: "area",
  };
  const collectionNames = {
    State: "states",
    District: "districts",
    City: "cities",
    Area: "areas",
  };
  const cleanName = String(name || "").trim();
  const locationId = makeLocationId(cleanName);

  if (!recordTypes[type]) {
    throw new HttpsError("invalid-argument", "Unsupported location type.");
  }
  if (!cleanName || cleanName.length > 100 || !locationId) {
    throw new HttpsError("invalid-argument", "Enter a valid location name.");
  }

  const path = ["location_master"];
  const parentPaths = [];
  const locationData = {
    name: cleanName,
    type: recordTypes[type],
    isActive: true,
  };

  if (type === "Country") {
    locationData.code = locationId.toUpperCase();
  } else {
    const cleanCountryCode = String(countryCode || "").trim();
    if (!cleanCountryCode) {
      throw new HttpsError("invalid-argument", "Select a country first.");
    }
    path.push(cleanCountryCode);
    parentPaths.push([...path]);
    locationData.country = cleanCountryCode;

    if (type !== "State") {
      const stateName = String(state || "").trim();
      const stateId = makeLocationId(stateName);
      if (!stateId) {
        throw new HttpsError("invalid-argument", "Select a state first.");
      }
      path.push("states", stateId);
      parentPaths.push([...path]);
      locationData.state = stateName;
    }

    if (["City", "Area"].includes(type)) {
      const districtName = String(district || "").trim();
      const districtId = makeLocationId(districtName);
      if (!districtId) {
        throw new HttpsError("invalid-argument", "Select a district first.");
      }
      path.push("districts", districtId);
      parentPaths.push([...path]);
      locationData.district = districtName;
    }

    if (type === "Area") {
      const cityName = String(city || "").trim();
      const cityId = makeLocationId(cityName);
      if (!cityId) {
        throw new HttpsError("invalid-argument", "Select a city first.");
      }
      path.push("cities", cityId);
      parentPaths.push([...path]);
      locationData.city = cityName;
    }
  }

  for (const parentPath of parentPaths) {
    const parentSnapshot = await db.doc(parentPath.join("/")).get();
    if (!parentSnapshot.exists) {
      throw new HttpsError("failed-precondition", "A selected parent location does not exist.");
    }
  }

  path.push(...(collectionNames[type] ? [collectionNames[type]] : []), locationId);
  try {
    await db.doc(path.join("/")).create(locationData);
  } catch (error) {
    if (error.code === 6 || error.code === "already-exists") {
      throw new HttpsError("already-exists", "This location already exists.");
    }
    throw error;
  }

  return { id: locationId, name: cleanName };
});

// ======================================================
// CREATE SELLER
// ======================================================

exports.registerSeller = onCall(async (request) => {
  console.log("🔥🔥🔥 registerSeller CALLED 🔥🔥🔥");

  let customUid = null;

  try {
    const data = request.data || {};

    const {
      email,
      password,
      shopName,
      shopType,
      ownerName,
      phone,
      country,
      countryCode,
      state,
      district,
      city,
      area,
      address,
      shopLat,
      shopLon,
      deliveryScope,
      customShopUid,
    } = data;

    console.log("📦 REGISTER REQUEST:", {
      email,
      shopName,
      shopType,
      ownerName,
      phone,
      country,
      countryCode,
      state,
      district,
      city,
      area,
      deliveryScope,
      customShopUid,
      hasPassword: !!password,
    });

    // ==================================================
    // VALIDATION
    // ==================================================

    if (
      !email ||
      !password ||
      !shopName ||
      !shopType ||
      !ownerName ||
      !phone ||
      !country ||
      !state ||
      !district ||
      !city ||
      !area
    ) {
      console.error("❌ Missing required registration fields");

      throw new HttpsError(
        "invalid-argument",
        "All required fields must be provided."
      );
    }

    if (String(password).length < 6) {
      throw new HttpsError(
        "invalid-argument",
        "Password must be at least 6 characters."
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // ==================================================
    // GENERATE CUSTOM UID
    // ==================================================

    console.log("🔥 Starting UID transaction...");

    const counterRef = db
      .collection("counters")
      .doc("users");

    customUid = await db.runTransaction(async (transaction) => {
      const counterSnapshot = await transaction.get(counterRef);

      let lastNumber = 1000;

      if (counterSnapshot.exists) {
        const counterData = counterSnapshot.data();

        lastNumber =
          Number(counterData.lastNumber) || 1000;
      }

      const nextNumber = lastNumber + 1;

      const newUid = `upstageuser${nextNumber}`;

      transaction.set(
        counterRef,
        {
          lastNumber: nextNumber,
        },
        {
          merge: true,
        }
      );

      return newUid;
    });

    console.log("✅ Generated custom UID:", customUid);

    // ==================================================
    // CREATE FIREBASE AUTH USER
    // ==================================================

    console.log("🔥 Creating Firebase Auth user...");

    let userRecord;

    try {
      userRecord = await admin.auth().createUser({
        uid: customUid,
        email: cleanEmail,
        password: password,
      });

      console.log(
        "✅ Firebase Auth user created:",
        userRecord.uid
      );
    } catch (authError) {
      console.error("❌ AUTH CREATE ERROR:", authError);

      if (authError.code === "auth/email-already-exists") {
        throw new HttpsError(
          "already-exists",
          "This email is already registered. Please use another email."
        );
      }

      if (authError.code === "auth/uid-already-exists") {
        throw new HttpsError(
          "already-exists",
          "Generated User ID already exists. Please try again."
        );
      }

      if (authError.code === "auth/invalid-password") {
        throw new HttpsError(
          "invalid-argument",
          "Password must be at least 6 characters."
        );
      }

      if (authError.code === "auth/invalid-email") {
        throw new HttpsError(
          "invalid-argument",
          "Invalid email address."
        );
      }

      throw new HttpsError(
        "internal",
        `Auth error: ${authError.message}`
      );
    }

    // ==================================================
    // 30 DAY FREE TRIAL
    // ==================================================

    const now = Date.now();

    const trialExpiry =
      now + 30 * 24 * 60 * 60 * 1000;

    // ==================================================
    // CREATE FIRESTORE USER
    // ==================================================

    console.log(
      "🔥 Creating Firestore user document..."
    );

    try {
      await db
        .collection("users")
        .doc(customUid)
        .set({
          shopName: String(shopName).trim(),
          shopType: String(shopType).trim(),
          ownerName: String(ownerName).trim(),
          phone: String(phone).trim(),
          email: cleanEmail,

          role: "seller",

          address: {
            fullAddress:
              address ||
              [
                area,
                city,
                district,
                state,
                country,
              ]
                .filter(Boolean)
                .join(", "),

            country: country || "",
            countryCode: countryCode || "",
            state: state || "",
            district: district || "",
            city: city || "",
            area: area || "",

            lat: shopLat ?? null,
            lon: shopLon ?? null,
          },

          deliveryScope: deliveryScope || "Local",

          customShopUid:
            customShopUid?.trim() || "",

          trialStart: now,

          subscriptionPlan: "Free Trial",

          subscriptionActive: true,

          subscriptionExpiry: trialExpiry,

          createdAt:
            new Date().toISOString(),

          authUid: customUid,
        });

      console.log(
        "✅ Firestore user created:",
        `users/${customUid}`
      );
    } catch (firestoreError) {
      console.error(
        "❌ FIRESTORE ERROR:",
        firestoreError
      );

      // ==================================================
      // ROLLBACK AUTH USER
      // ==================================================

      try {
        await admin.auth().deleteUser(customUid);

        console.log(
          "🧹 Auth rollback successful:",
          customUid
        );
      } catch (rollbackError) {
        console.error(
          "❌ Auth rollback failed:",
          rollbackError
        );
      }

      throw new HttpsError(
        "internal",
        `Firestore error: ${firestoreError.message}`
      );
    }

    // ==================================================
    // SUCCESS
    // ==================================================

    console.log(
      "REGISTER SELLER SUCCESS",
      customUid
    );

    return {
      success: true,
      uid: customUid,
      message: "Account created successfully.",
    };

  } catch (error) {
    console.error(
      "❌ REGISTER SELLER FINAL ERROR:",
      {
        code: error?.code,
        message: error?.message,
        stack: error?.stack,
      }
    );

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      error?.message ||
      "Failed to create seller account."
    );
  }
});

// ======================================================
// SEND ORDER NOTIFICATION
// ======================================================

// eslint-disable-next-line valid-jsdoc
/**
 * Sends an order notification to the seller.
 */
async function notifySeller(event) {
  const snapshot = event.data;

  if (!snapshot) {
    console.log("❌ No order snapshot found");
    return;
  }

  const sellerUid = event.params.sellerUid;
  const orderId = event.params.orderId;
  const orderData = snapshot.data();

  try {
    const sellerDoc = await db
      .collection("users")
      .doc(sellerUid)
      .get();

    if (!sellerDoc.exists) {
      console.log(
        "❌ Seller not found:",
        sellerUid
      );
      return;
    }

    const sellerData = sellerDoc.data();
    const fcmToken = sellerData.fcmToken;

    if (!fcmToken) {
      console.log(
        "❌ Seller FCM token not found:",
        sellerUid
      );
      return;
    }

    const title = "🛒 New Online Order!";

    const body = `Order from ${orderData.customerName || "Customer"
      } worth ₹${orderData.totalAmount ||
      orderData.total ||
      0
      }`;

    const message = {
      token: fcmToken,

      notification: {
        title,
        body,
      },

      data: {
        orderId: String(
          orderData.orderId || orderId
        ),

        status: String(
          orderData.status ||
          "Pending Verification"
        ),

        screen: "Orders",
      },

      android: {
        priority: "high",

        notification: {
          channelId: "orders_channel",
          sound: "default",
        },
      },
    };

    await admin.messaging().send(message);

    console.log(
      "✅ Order notification sent successfully:",
      sellerUid,
      orderId
    );

  } catch (error) {
    console.error(
      "❌ Error sending order notification:",
      error
    );
  }
}

// ======================================================
// LOCAL ORDER NOTIFICATION
// ======================================================

exports.sendLocalOrderNotification =
  onDocumentCreated(
    "users/{sellerUid}/local_orders/{orderId}",
    notifySeller
  );

// ======================================================
// GLOBAL ORDER NOTIFICATION
// ======================================================

exports.sendGlobalOrderNotification =
  onDocumentCreated(
    "users/{sellerUid}/global_orders/{orderId}",
    notifySeller
  );