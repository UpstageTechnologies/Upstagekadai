
const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {defineSecret} = require("firebase-functions/params");

const admin = require("firebase-admin");
const crypto = require("crypto");
const Razorpay = require("razorpay");

admin.initializeApp();

const db = admin.firestore();

// Upstage Platform Subscription Razorpay Secrets (Stored in Secret Manager)
const razorpayKeyIdSecret = defineSecret("RAZORPAY_KEY_ID");
const razorpayKeySecretSecret = defineSecret("RAZORPAY_KEY_SECRET");
const razorpayWebhookSecretParam = defineSecret("RAZORPAY_WEBHOOK_SECRET");

/**
 * Reads platform Razorpay credentials from Secret Manager or environment.
 * @return {{keyId: string, keySecret: string, webhookSecret: string}}
 */
function getPlatformRazorpayConfig() {
  let keyId = "";
  let keySecret = "";
  let webhookSecret = "";

  try {
    keyId = typeof razorpayKeyIdSecret.value === "function" ? razorpayKeyIdSecret.value() : "";
  } catch (e) {
    // Secret not available in environment
  }
  try {
    keySecret = typeof razorpayKeySecretSecret.value === "function" ? razorpayKeySecretSecret.value() : "";
  } catch (e) {
    // Secret not available in environment
  }
  try {
    webhookSecret = typeof razorpayWebhookSecretParam.value === "function" ? razorpayWebhookSecretParam.value() : "";
  } catch (e) {
    // Secret not available in environment
  }

  keyId = (keyId || process.env.RAZORPAY_KEY_ID || "").trim();
  keySecret = (keySecret || process.env.RAZORPAY_KEY_SECRET || "").trim();
  webhookSecret = (webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();

  return {keyId, keySecret, webhookSecret};
}

const SUBSCRIPTION_PLANS = {
  Premium: {
    name: "Premium",
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
  },
  Pro: {
    name: "Pro",
    prices: {
      monthly: 1999,
      yearly: 19999,
    },
    days: {
      monthly: 30,
      yearly: 365,
    },
    limits: {
      inventoryLimit: -1,
      purchaseLimit: -1,
      reportLimitMonths: -1,
    },
  },
};

const makeLocationId = (value) =>
  String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

exports.addLocation = onCall(async (request) => {
  const {type, name, countryCode, state, district, city} =
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

  return {id: locationId, name: cleanName};
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
          "All required fields must be provided.",
      );
    }

    if (String(password).length < 6) {
      throw new HttpsError(
          "invalid-argument",
          "Password must be at least 6 characters.",
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
          },
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
          userRecord.uid,
      );
    } catch (authError) {
      console.error("❌ AUTH CREATE ERROR:", authError);

      if (authError.code === "auth/email-already-exists") {
        throw new HttpsError(
            "already-exists",
            "This email is already registered. Please use another email.",
        );
      }

      if (authError.code === "auth/uid-already-exists") {
        throw new HttpsError(
            "already-exists",
            "Generated User ID already exists. Please try again.",
        );
      }

      if (authError.code === "auth/invalid-password") {
        throw new HttpsError(
            "invalid-argument",
            "Password must be at least 6 characters.",
        );
      }

      if (authError.code === "auth/invalid-email") {
        throw new HttpsError(
            "invalid-argument",
            "Invalid email address.",
        );
      }

      throw new HttpsError(
          "internal",
          `Auth error: ${authError.message}`,
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
        "🔥 Creating Firestore user document...",
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
          `users/${customUid}`,
      );
    } catch (firestoreError) {
      console.error(
          "❌ FIRESTORE ERROR:",
          firestoreError,
      );

      // ==================================================
      // ROLLBACK AUTH USER
      // ==================================================

      try {
        await admin.auth().deleteUser(customUid);

        console.log(
            "🧹 Auth rollback successful:",
            customUid,
        );
      } catch (rollbackError) {
        console.error(
            "❌ Auth rollback failed:",
            rollbackError,
        );
      }

      throw new HttpsError(
          "internal",
          `Firestore error: ${firestoreError.message}`,
      );
    }

    // ==================================================
    // SUCCESS
    // ==================================================

    console.log(
        "REGISTER SELLER SUCCESS",
        customUid,
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
        },
    );

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
        "internal",
        error?.message ||
      "Failed to create seller account.",
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
          sellerUid,
      );
      return;
    }

    const sellerData = sellerDoc.data();
    const fcmToken = sellerData.fcmToken;

    if (!fcmToken) {
      console.log(
          "❌ Seller FCM token not found:",
          sellerUid,
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
            orderData.orderId || orderId,
        ),

        status: String(
            orderData.status ||
          "Pending Verification",
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
        orderId,
    );
  } catch (error) {
    console.error(
        "❌ Error sending order notification:",
        error,
    );
  }
}

// ======================================================
// LOCAL ORDER NOTIFICATION
// ======================================================

exports.sendLocalOrderNotification =
  onDocumentCreated(
      "users/{sellerUid}/local_orders/{orderId}",
      notifySeller,
  );

// ======================================================
// GLOBAL ORDER NOTIFICATION
// ======================================================

exports.sendGlobalOrderNotification =
  onDocumentCreated(
      "users/{sellerUid}/global_orders/{orderId}",
      notifySeller,
  );

/**
 * Verifies Razorpay HMAC-SHA256 signature against the raw payload.
 * @param {string} rawBody Raw string payload
 * @param {string} signature Header signature
 * @param {string} secret Razorpay webhook secret or secret key
 * @return {boolean}
 */
function verifyRazorpaySignature(rawBody, signature, secret) {
  if (!signature || !secret || !rawBody) return false;
  try {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(rawBody);
    const expected = hmac.digest("hex");
    return crypto.timingSafeEqual(
        Buffer.from(expected, "utf8"),
        Buffer.from(signature, "utf8"),
    );
  } catch (err) {
    console.error("[verifyRazorpaySignature] Error:", err.message);
    return false;
  }
}

/**
 * Creates a unique Razorpay Dynamic UPI QR Code for the POS checkout session.
 */
exports.createUpiPaymentQr = onCall(async (request) => {
  try {
    const data = request.data || {};
    const sellerUid = data.sellerUid || request.auth?.uid;
    const amount = Number(data.amount);
    const billNo = String(data.billNo || "").trim();
    const shopName = String(data.shopName || "POS Shop").trim();

    if (!sellerUid) {
      throw new HttpsError("unauthenticated", "Seller UID is required.");
    }
    if (!amount || isNaN(amount) || amount <= 0) {
      throw new HttpsError("invalid-argument", "Valid payment amount is required.");
    }

    // Read seller credentials securely from Firestore
    const sellerDoc = await db.collection("users").doc(sellerUid).get();
    if (!sellerDoc.exists) {
      throw new HttpsError("not-found", "Seller account not found.");
    }

    const sellerData = sellerDoc.data() || {};
    const keyId = (sellerData.razorpayKeyId || process.env.RAZORPAY_KEY_ID || "").trim();
    const keySecret = (sellerData.razorpaySecret || process.env.RAZORPAY_KEY_SECRET || "").trim();

    if (!keyId || !keySecret) {
      throw new HttpsError(
          "failed-precondition",
          "Razorpay Key ID and Secret are not configured. Please add them in Settings > Payment.",
      );
    }

    const sessionId = `pay_sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const amountInPaise = Math.round(amount * 100);
    const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const rzpPayload = {
      type: "upi_qr",
      name: shopName.substring(0, 30),
      usage: "single_use",
      fixed_amount: true,
      payment_amount: amountInPaise,
      description: `Bill ${billNo || sessionId}`.substring(0, 30),
      close_by: Math.floor(Date.now() / 1000) + 900, // 15 mins expiry
      notes: {
        sellerUid: sellerUid,
        sessionId: sessionId,
        billNo: billNo,
        amount: String(amount),
      },
    };

    console.log(`[createUpiPaymentQr] Generating Razorpay QR for seller ${sellerUid}, amount ₹${amount}...`);

    const rzpRes = await fetch("https://api.razorpay.com/v1/payments/qr_codes", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(rzpPayload),
    });

    const rzpJson = await rzpRes.json();

    if (!rzpRes.ok) {
      console.error("[createUpiPaymentQr] Razorpay API Error:", rzpJson);
      const desc = rzpJson.error?.description || rzpJson.error?.message || "Razorpay API error";
      if (
        desc.toLowerCase().includes("qr code") ||
        desc.toLowerCase().includes("not enabled") ||
        rzpJson.error?.code === "BAD_REQUEST_ERROR"
      ) {
        throw new HttpsError(
            "failed-precondition",
            `Razorpay Dynamic QR Code is not enabled on your Razorpay account (${desc}). Please activate QR Codes in Razorpay Dashboard > Payment Products > QR Codes.`,
        );
      }
      throw new HttpsError("internal", `Razorpay Dynamic QR creation failed: ${desc}`);
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const sessionData = {
      sessionId,
      sellerUid,
      billNo: billNo || "",
      qrCodeId: rzpJson.id,
      qrImageUrl: rzpJson.image_url,
      amount: amount,
      amountInPaise: amountInPaise,
      currency: "INR",
      status: "WAITING_FOR_PAYMENT",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: expiresAt,
      paymentId: null,
      transactionReference: null,
      verifiedAt: null,
      provider: "RAZORPAY",
    };

    await db
        .collection("users")
        .doc(sellerUid)
        .collection("payment_sessions")
        .doc(sessionId)
        .set(sessionData);

    console.log(`[createUpiPaymentQr] Created session ${sessionId} with QR ${rzpJson.id}`);

    return {
      success: true,
      sessionId,
      qrCodeId: rzpJson.id,
      qrImageUrl: rzpJson.image_url,
      amount,
      currency: "INR",
      status: "WAITING_FOR_PAYMENT",
      expiresAt: expiresAt.toISOString(),
    };
  } catch (err) {
    console.error("[createUpiPaymentQr] Error:", err);
    if (err instanceof HttpsError) {
      throw err;
    }
    throw new HttpsError("internal", err.message || "Failed to generate UPI payment QR.");
  }
});

/**
 * Cancels a waiting payment session and closes the Razorpay QR.
 */
exports.cancelUpiPaymentSession = onCall(async (request) => {
  try {
    const {sellerUid, sessionId} = request.data || {};
    if (!sellerUid || !sessionId) {
      throw new HttpsError("invalid-argument", "Missing sellerUid or sessionId.");
    }

    const sessionRef = db
        .collection("users")
        .doc(sellerUid)
        .collection("payment_sessions")
        .doc(sessionId);

    const snap = await sessionRef.get();
    if (!snap.exists) return {success: true};

    const data = snap.data();
    if (data.status === "WAITING_FOR_PAYMENT" || data.status === "CREATED") {
      await sessionRef.update({
        status: "CANCELLED",
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (data.qrCodeId) {
        try {
          const sellerDoc = await db.collection("users").doc(sellerUid).get();
          const sellerData = sellerDoc.data() || {};
          const keyId = (sellerData.razorpayKeyId || process.env.RAZORPAY_KEY_ID || "").trim();
          const keySecret = (sellerData.razorpaySecret || process.env.RAZORPAY_KEY_SECRET || "").trim();
          if (keyId && keySecret) {
            const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
            await fetch(`https://api.razorpay.com/v1/payments/qr_codes/${data.qrCodeId}/close`, {
              method: "POST",
              headers: {"Authorization": `Basic ${authHeader}`},
            });
          }
        } catch (closeErr) {
          console.warn("[cancelUpiPaymentSession] Could not close QR:", closeErr.message);
        }
      }
    }
    return {success: true};
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError("internal", err.message || "Failed to cancel session.");
  }
});

/**
 * Checks/Reconciles UPI Payment Status directly against Razorpay API.
 * Provides resilient fallback if webhooks are delayed.
 */
exports.checkUpiPaymentStatus = onCall(async (request) => {
  try {
    const {sellerUid, sessionId} = request.data || {};
    if (!sellerUid || !sessionId) {
      throw new HttpsError("invalid-argument", "Missing sellerUid or sessionId.");
    }

    const sessionRef = db
        .collection("users")
        .doc(sellerUid)
        .collection("payment_sessions")
        .doc(sessionId);

    const snap = await sessionRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Payment session not found.");
    }

    const sessionData = snap.data();
    if (sessionData.status === "SUCCESS") {
      return {
        success: true,
        status: "SUCCESS",
        paymentId: sessionData.paymentId,
        transactionReference: sessionData.transactionReference,
        amount: sessionData.amount,
      };
    }

    // Check expiration
    if (sessionData.expiresAt && sessionData.expiresAt.toDate() < new Date()) {
      await sessionRef.update({status: "EXPIRED"});
      return {success: true, status: "EXPIRED"};
    }

    // Query Razorpay Payments for this QR Code
    if (sessionData.qrCodeId) {
      const sellerDoc = await db.collection("users").doc(sellerUid).get();
      const sellerData = sellerDoc.data() || {};
      const keyId = (sellerData.razorpayKeyId || process.env.RAZORPAY_KEY_ID || "").trim();
      const keySecret = (sellerData.razorpaySecret || process.env.RAZORPAY_KEY_SECRET || "").trim();

      if (keyId && keySecret) {
        const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
        const listRes = await fetch(
            `https://api.razorpay.com/v1/payments/qr_codes/${sessionData.qrCodeId}/payments`,
            {
              headers: {Authorization: `Basic ${authHeader}`},
            },
        );

        if (listRes.ok) {
          const listJson = await listRes.json();
          const items = listJson.items || [];
          const capturedPayment = items.find((p) => p.status === "captured");

          if (capturedPayment) {
            const acquirer = capturedPayment.acquirer_data || {};
            const ref = acquirer.rrn || acquirer.upi_transaction_id || capturedPayment.id;

            await db.runTransaction(async (transaction) => {
              const currentSnap = await transaction.get(sessionRef);
              if (!currentSnap.exists) return;
              if (currentSnap.data().status === "SUCCESS") return;

              transaction.update(sessionRef, {
                status: "SUCCESS",
                paymentId: capturedPayment.id,
                transactionReference: ref,
                paymentMethod: "UPI",
                vpa: capturedPayment.vpa || null,
                verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                source: "reconciled_via_api",
              });
            });

            return {
              success: true,
              status: "SUCCESS",
              paymentId: capturedPayment.id,
              transactionReference: ref,
              amount: sessionData.amount,
            };
          }
        }
      }
    }

    return {
      success: true,
      status: sessionData.status,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError("internal", err.message || "Failed to check payment status.");
  }
});

/**
 * Official Razorpay Webhook Endpoint.
 * Receives `qr_code.credited` and `payment.captured` events,
 * validates cryptographic HMAC-SHA256 signature, ensures idempotency,
 * and updates Firestore in a database transaction.
 */
exports.razorpayWebhook = onRequest(
    {
      region: "us-central1",
      invoker: "public",
      cors: true,
      secrets: [razorpayKeyIdSecret, razorpayKeySecretSecret, razorpayWebhookSecretParam],
    },
    async (req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, X-Razorpay-Signature");
      if (req.method === "OPTIONS") {
        return res.status(204).send("");
      }

      if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
      }

      const signature = req.headers["x-razorpay-signature"];
      const rawBody = req.rawBody || JSON.stringify(req.body);

      let eventPayload = req.body;
      if (typeof eventPayload === "string") {
        try {
          eventPayload = JSON.parse(eventPayload);
        } catch {
          return res.status(400).send("Invalid JSON payload");
        }
      }

      const eventName = eventPayload?.event;
      console.log(`[razorpayWebhook] Received event: ${eventName}, event_id: ${eventPayload?.event_id}`);

      // Extract payment/QR details
      const qrEntity = eventPayload?.payload?.qr_code?.entity;
      const paymentEntity = eventPayload?.payload?.payment?.entity;

      const notes = qrEntity?.notes || paymentEntity?.notes || {};
      const sellerUid = notes.sellerUid;
      const sessionId = notes.sessionId;
      const qrCodeId = qrEntity?.id || paymentEntity?.qr_code_id;
      const paymentId = paymentEntity?.id;

      if (!qrCodeId && !paymentId) {
        console.log("[razorpayWebhook] Event missing payment or qr_code entity, acknowledging.");
        return res.status(200).json({received: true});
      }

      // 1. Signature Verification
      let signatureVerified = false;

      // Check seller's custom webhook secret or secret key from Firestore
      if (sellerUid) {
        try {
          const sellerDoc = await db.collection("users").doc(sellerUid).get();
          if (sellerDoc.exists) {
            const sData = sellerDoc.data() || {};
            const webhookSecret = (sData.razorpayWebhookSecret || sData.razorpaySecret || "").trim();
            if (webhookSecret && verifyRazorpaySignature(rawBody, signature, webhookSecret)) {
              signatureVerified = true;
            }
          }
        } catch (e) {
          console.warn("[razorpayWebhook] Error checking seller webhook secret:", e.message);
        }
      }

      // Check platform-level webhook secret if not verified yet
      if (!signatureVerified) {
        const platformConfig = getPlatformRazorpayConfig();
        const platformWebhookSecret = platformConfig.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET;
        if (platformWebhookSecret && verifyRazorpaySignature(rawBody, signature, platformWebhookSecret.trim())) {
          signatureVerified = true;
        }
      }

      // If in production without valid signature, reject
      if (!signatureVerified) {
        console.warn(`[razorpayWebhook] ❌ Signature verification failed for event: ${eventName}`);
        const platformConfig = getPlatformRazorpayConfig();
        if (!platformConfig.webhookSecret && !process.env.RAZORPAY_WEBHOOK_SECRET && !sellerUid) {
          return res.status(400).send("Webhook secret not configured and sellerUid not found.");
        }
        return res.status(400).send("Invalid Razorpay webhook signature.");
      }

      console.log(`[razorpayWebhook] ✅ Signature verified successfully for event: ${eventName}`);

      // Only handle payment completion events
      if (eventName !== "qr_code.credited" && eventName !== "payment.captured") {
        return res.status(200).json({received: true, ignored: eventName});
      }

      const paymentStatus = paymentEntity?.status;
      if (paymentStatus !== "captured") {
        console.log(`[razorpayWebhook] Payment status is '${paymentStatus}' (not captured), skipping.`);
        return res.status(200).json({received: true, status: paymentStatus});
      }

      const amountPaidPaise = Number(paymentEntity?.amount || 0);
      const acquirer = paymentEntity?.acquirer_data || {};
      const transactionRef = acquirer.rrn || acquirer.upi_transaction_id || acquirer.bank_transaction_id || paymentId;
      const vpa = paymentEntity?.vpa || null;

      // ----------------------------------------------------
      // APP SUBSCRIPTION WEBHOOK PROCESSING
      // ----------------------------------------------------
      const subOrderId = notes.subscriptionOrderId || paymentEntity?.order_id;
      const isAppSubscription =
    notes.type === "app_subscription" ||
    Boolean(notes.subscriptionOrderId) ||
    (subOrderId && subOrderId.startsWith("order_"));

      if (isAppSubscription && subOrderId) {
        try {
          const subOrderDoc = await db.collection("subscription_orders").doc(subOrderId).get();
          if (subOrderDoc.exists) {
            console.log(`[razorpayWebhook] 🚀 Processing app subscription payment for order: ${subOrderId}`);
            const activationResult = await activateSubscriptionInTransaction({
              orderId: subOrderId,
              paymentId: paymentId,
              signature: signature || null,
              rawPaymentData: paymentEntity,
              source: "webhook",
            });
            console.log(`[razorpayWebhook] ✅ App subscription activated for order: ${subOrderId}`);
            return res.status(200).json({
              received: true,
              status: "SUCCESS",
              type: "app_subscription",
              plan: activationResult.plan,
            });
          }
        } catch (subErr) {
          console.error("[razorpayWebhook] App subscription transaction error:", subErr);
          return res.status(500).json({error: "Failed to process subscription webhook"});
        }
      }

      // Locate payment session document
      let sessionRef = null;
      if (sellerUid && sessionId) {
        sessionRef = db
            .collection("users")
            .doc(sellerUid)
            .collection("payment_sessions")
            .doc(sessionId);
      } else if (qrCodeId) {
        const qSnap = await db
            .collectionGroup("payment_sessions")
            .where("qrCodeId", "==", qrCodeId)
            .limit(1)
            .get();
        if (!qSnap.empty) {
          sessionRef = qSnap.docs[0].ref;
        }
      }

      if (!sessionRef) {
        console.warn(`[razorpayWebhook] ⚠️ No matching payment session found for QR: ${qrCodeId}, session: ${sessionId}`);
        return res.status(200).json({received: true, warning: "session_not_found"});
      }

      // Atomic transaction
      try {
        await db.runTransaction(async (transaction) => {
          const snap = await transaction.get(sessionRef);
          if (!snap.exists) {
            console.warn("[razorpayWebhook] Session doc does not exist inside transaction.");
            return;
          }

          const sessionData = snap.data();

          // Idempotency: Already marked SUCCESS
          if (sessionData.status === "SUCCESS") {
            console.log(`[razorpayWebhook] Session ${sessionData.sessionId} is already SUCCESS. Skipping.`);
            return;
          }

          // Check amount
          if (sessionData.amountInPaise && amountPaidPaise < sessionData.amountInPaise) {
            console.error(`[razorpayWebhook] Amount mismatch! Expected ${sessionData.amountInPaise}, received ${amountPaidPaise}`);
            transaction.update(sessionRef, {
              status: "FAILED",
              failureReason: `Amount mismatch: expected ₹${sessionData.amount}, received ₹${amountPaidPaise / 100}`,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return;
          }

          transaction.update(sessionRef, {
            status: "SUCCESS",
            paymentId: paymentId,
            transactionReference: transactionRef,
            paymentMethod: "UPI",
            vpa: vpa,
            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            razorpayEventId: eventPayload.event_id || null,
            rawPaymentData: {
              id: paymentEntity?.id,
              amount: paymentEntity?.amount,
              currency: paymentEntity?.currency,
              method: paymentEntity?.method,
              bank: paymentEntity?.bank || null,
              wallet: paymentEntity?.wallet || null,
              vpa: paymentEntity?.vpa || null,
              email: paymentEntity?.email || null,
              contact: paymentEntity?.contact || null,
              rrn: acquirer.rrn || null,
              upiTransactionId: acquirer.upi_transaction_id || null,
            },
          });

          console.log(`[razorpayWebhook] 🎉 Session ${sessionData.sessionId} marked SUCCESS! Payment: ${paymentId}`);
        });

        return res.status(200).json({received: true, status: "SUCCESS"});
      } catch (txErr) {
        console.error("[razorpayWebhook] Transaction error:", txErr);
        return res.status(500).json({error: "Failed to process webhook"});
      }
    });

// ======================================================
// APP SUBSCRIPTION PAYMENT ARCHITECTURE (RAZORPAY LIVE)
// ======================================================

/**
 * Atomically activates a subscription in Firestore within a database transaction.
 * Idempotent: safe against duplicate callbacks or concurrent webhook + client calls.
 */
async function activateSubscriptionInTransaction({
  orderId,
  paymentId,
  signature,
  rawPaymentData,
  source = "backend",
}) {
  return await db.runTransaction(async (transaction) => {
    const orderRef = db.collection("subscription_orders").doc(orderId);
    const orderDoc = await transaction.get(orderRef);
    if (!orderDoc.exists) {
      throw new Error(`Order ${orderId} does not exist in subscription_orders.`);
    }

    const orderData = orderDoc.data();
    const uid = orderData.uid;
    const plan = orderData.plan;
    const cycle = orderData.cycle || "monthly";

    const planConfig = SUBSCRIPTION_PLANS[plan];
    if (!planConfig) {
      throw new Error(`Invalid plan '${plan}' in order ${orderId}`);
    }

    const userRef = db.collection("users").doc(uid);
    const historyRef = userRef.collection("subscription_history").doc(paymentId);

    // Idempotency: Check if order is already completed
    if (orderData.status === "COMPLETED" || orderData.status === "ACTIVATED") {
      console.log(`[activateSubscription] Order ${orderId} already completed with payment ${orderData.paymentId}`);
      return {
        success: true,
        alreadyActivated: true,
        uid,
        plan,
        cycle,
        expiry: orderData.activatedExpiry || null,
      };
    }

    // Idempotency: Check if this payment ID was already processed
    const historyDoc = await transaction.get(historyRef);
    if (historyDoc.exists) {
      console.log(`[activateSubscription] Payment ${paymentId} already processed for user ${uid}.`);
      return {
        success: true,
        alreadyActivated: true,
        uid,
        plan,
        cycle,
        expiry: historyDoc.data()?.expiryMs || null,
      };
    }

    const userDoc = await transaction.get(userRef);
    const userData = userDoc.exists ? userDoc.data() : {};

    const daysToAdd = planConfig.days[cycle] || 30;
    const durationMs = daysToAdd * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    let baseMs = nowMs;

    // Preserve remaining days if user currently has an active subscription of this plan
    if (userData.subscriptionExpiry && typeof userData.subscriptionExpiry === "number") {
      if (userData.subscriptionExpiry > nowMs) {
        baseMs = userData.subscriptionExpiry;
      }
    } else if (userData.subscriptionExpiresAt) {
      const expMs = userData.subscriptionExpiresAt.toMillis ?
        userData.subscriptionExpiresAt.toMillis() :
        new Date(userData.subscriptionExpiresAt).getTime();
      if (expMs > nowMs) {
        baseMs = expMs;
      }
    }

    const newExpiryMs = baseMs + durationMs;

    let assignedUid = userData.customShopUid || uid;
    if (!assignedUid) {
      assignedUid = `UID-${Math.floor(100000 + Math.random() * 900000)}`;
    }

    // 1. Update user subscription state
    transaction.update(userRef, {
      userPlan: planConfig.name,
      subscriptionPlan: planConfig.name,
      subscriptionCycle: cycle,
      subscriptionDays: daysToAdd,
      subscriptionActive: true,
      subscriptionExpiry: newExpiryMs,
      subscriptionExpiresAt: admin.firestore.Timestamp.fromMillis(newExpiryMs),
      customShopUid: assignedUid,
      inventoryLimit: planConfig.limits.inventoryLimit,
      purchaseLimit: planConfig.limits.purchaseLimit,
      reportLimitMonths: planConfig.limits.reportLimitMonths,
      razorpayPaymentId: paymentId,
      lastPaymentId: paymentId,
      lastOrderId: orderId,
      lastPaymentDate: nowMs,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 2. Mark subscription order as COMPLETED
    transaction.update(orderRef, {
      status: "COMPLETED",
      paymentId: paymentId,
      signature: signature || null,
      activatedAt: admin.firestore.FieldValue.serverTimestamp(),
      activatedExpiry: newExpiryMs,
      activatedExpiresAt: admin.firestore.Timestamp.fromMillis(newExpiryMs),
      source: source || "direct_verification",
      rawPaymentData: rawPaymentData || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 3. Record in subscription history
    transaction.set(historyRef, {
      paymentId,
      orderId,
      plan: planConfig.name,
      cycle,
      amount: orderData.amount,
      amountInPaise: orderData.amountInPaise,
      currency: "INR",
      activatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(newExpiryMs),
      expiryMs: newExpiryMs,
      source: source || "direct_verification",
    });

    return {
      success: true,
      alreadyActivated: false,
      uid,
      plan: planConfig.name,
      cycle,
      expiry: newExpiryMs,
    };
  });
}

/**
 * Server-side Razorpay Order Creation for App Subscriptions.
 * Authenticates user, validates plan & cycle, calculates amount server-side,
 * creates Razorpay Order, and stores pending order in Firestore.
 */
exports.createSubscriptionOrder = onCall(
    {
      region: "us-central1",
      invoker: "public",
      secrets: [razorpayKeyIdSecret, razorpayKeySecretSecret],
    },
    async (request) => {
      const authUid = request.auth?.uid;
      if (!authUid) {
        throw new HttpsError("unauthenticated", "User must be authenticated to create a subscription order.");
      }

      const data = request.data || {};
      const plan = String(data.plan || "").trim();
      const cycle = String(data.cycle || "monthly").trim().toLowerCase();

      const planConfig = SUBSCRIPTION_PLANS[plan];
      if (!planConfig) {
        throw new HttpsError("invalid-argument", `Invalid subscription plan: '${plan}'. Must be 'Premium' or 'Pro'.`);
      }

      const price = planConfig.prices[cycle];
      if (!price) {
        throw new HttpsError("invalid-argument", `Invalid billing cycle: '${cycle}'. Must be 'monthly' or 'yearly'.`);
      }

      const amountInPaise = Math.round(price * 100);
      const {keyId, keySecret} = getPlatformRazorpayConfig();

      if (!keyId || !keySecret) {
        throw new HttpsError(
            "failed-precondition",
            "Platform Razorpay credentials are not configured in Secret Manager (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).",
        );
      }

      try {
        const razorpay = new Razorpay({
          key_id: keyId,
          key_secret: keySecret,
        });

        const receipt = `sub_${authUid.substring(0, 8)}_${Date.now()}`;
        const rzpOrder = await razorpay.orders.create({
          amount: amountInPaise,
          currency: "INR",
          receipt: receipt.substring(0, 40),
          notes: {
            uid: authUid,
            plan: plan,
            cycle: cycle,
            type: "app_subscription",
          },
        });

        const orderRef = db.collection("subscription_orders").doc(rzpOrder.id);
        await orderRef.set({
          orderId: rzpOrder.id,
          uid: authUid,
          plan: plan,
          cycle: cycle,
          amount: price,
          amountInPaise: amountInPaise,
          currency: "INR",
          status: "CREATED",
          receipt: receipt,
          notes: {
            uid: authUid,
            plan: plan,
            cycle: cycle,
            type: "app_subscription",
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[createSubscriptionOrder] Created order ${rzpOrder.id} for user ${authUid}, plan ${plan} (${cycle})`);

        return {
          orderId: rzpOrder.id,
          amount: amountInPaise,
          currency: "INR",
          keyId: keyId,
          plan: plan,
          cycle: cycle,
        };
      } catch (err) {
        console.error("[createSubscriptionOrder] Error creating order:", err);
        if (err instanceof HttpsError) throw err;
        throw new HttpsError("internal", err.message || "Failed to create subscription order.");
      }
    },
);

/**
 * Server-side Razorpay Payment Verification for App Subscriptions.
 * Validates HMAC SHA256 signature, validates ownership, checks payment directly from Razorpay API,
 * ensures captured status and amount match, and executes atomic subscription activation.
 */
exports.verifySubscriptionPayment = onCall(
    {
      region: "us-central1",
      invoker: "public",
      secrets: [razorpayKeyIdSecret, razorpayKeySecretSecret],
    },
    async (request) => {
      const authUid = request.auth?.uid;
      if (!authUid) {
        throw new HttpsError("unauthenticated", "User must be authenticated to verify payment.");
      }

      const data = request.data || {};
      const orderId = String(data.orderId || data.razorpay_order_id || "").trim();
      const paymentId = String(data.paymentId || data.razorpay_payment_id || "").trim();
      const signature = String(data.signature || data.razorpay_signature || "").trim();

      if (!orderId || !paymentId || !signature) {
        throw new HttpsError(
            "invalid-argument",
            "Missing required payment verification parameters (orderId, paymentId, signature).",
        );
      }

      // 1. Verify order exists and ownership matches authenticated user
      const orderDoc = await db.collection("subscription_orders").doc(orderId).get();
      if (!orderDoc.exists) {
        throw new HttpsError("not-found", `Subscription order ${orderId} does not exist.`);
      }

      const orderData = orderDoc.data();
      if (orderData.uid !== authUid) {
        console.warn(`[verifySubscriptionPayment] Unauthorized order access: authUid ${authUid} vs order uid ${orderData.uid}`);
        throw new HttpsError("permission-denied", "You are not authorized to verify this subscription order.");
      }

      const {keyId, keySecret} = getPlatformRazorpayConfig();
      if (!keySecret) {
        throw new HttpsError("failed-precondition", "Platform Razorpay Key Secret is not configured.");
      }

      // 2. Cryptographic HMAC SHA256 Signature Verification
      const expectedSignature = crypto
          .createHmac("sha256", keySecret)
          .update(`${orderId}|${paymentId}`)
          .digest("hex");

      let isSigValid = false;
      try {
        isSigValid = crypto.timingSafeEqual(
            Buffer.from(expectedSignature, "utf8"),
            Buffer.from(signature, "utf8"),
        );
      } catch {
        isSigValid = false;
      }

      if (!isSigValid) {
        console.error(`[verifySubscriptionPayment] Invalid signature for order ${orderId}, payment ${paymentId}`);
        throw new HttpsError("invalid-argument", "Payment signature verification failed.");
      }

      // 3. Direct verification with Razorpay API
      let paymentDetails;
      try {
        const razorpay = new Razorpay({
          key_id: keyId,
          key_secret: keySecret,
        });
        paymentDetails = await razorpay.payments.fetch(paymentId);
      } catch (err) {
        console.error(`[verifySubscriptionPayment] Failed to fetch payment ${paymentId} from Razorpay:`, err.message);
        throw new HttpsError("internal", `Failed to fetch payment details from Razorpay: ${err.message}`);
      }

      // 4. Validate captured status, order association, amount, and currency
      if (!paymentDetails || paymentDetails.status !== "captured") {
        throw new HttpsError(
            "failed-precondition",
            `Payment is not captured. Current status: ${paymentDetails?.status || "unknown"}`,
        );
      }

      if (paymentDetails.order_id !== orderId) {
        throw new HttpsError(
            "invalid-argument",
            `Payment order mismatch: payment belongs to ${paymentDetails.order_id}, expected ${orderId}`,
        );
      }

      if (Number(paymentDetails.amount) !== Number(orderData.amountInPaise)) {
        throw new HttpsError(
            "invalid-argument",
            `Payment amount mismatch: expected ${orderData.amountInPaise} paise, received ${paymentDetails.amount} paise.`,
        );
      }

      if (paymentDetails.currency !== "INR") {
        throw new HttpsError("invalid-argument", `Payment currency must be INR, received ${paymentDetails.currency}`);
      }

      // 5. Atomic activation in Firestore
      const activationResult = await activateSubscriptionInTransaction({
        orderId,
        paymentId,
        signature,
        rawPaymentData: paymentDetails,
        source: "client_verification",
      });

      console.log(`[verifySubscriptionPayment] ✅ Successfully activated subscription for user ${authUid}, order ${orderId}`);

      return {
        success: true,
        status: "ACTIVATED",
        orderId,
        paymentId,
        plan: activationResult.plan,
        cycle: activationResult.cycle,
        expiry: activationResult.expiry,
        alreadyActivated: activationResult.alreadyActivated,
      };
    },
);

exports._internal = {
  activateSubscriptionInTransaction,
  SUBSCRIPTION_PLANS,
  getPlatformRazorpayConfig,
  verifyRazorpaySignature,
};
