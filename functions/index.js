const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");

const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

// ======================================================
// CREATE SELLER WITH CUSTOM UID
// ======================================================

exports.registerSeller = onCall(async (request) => {
  try {
    const {
      email,
      password,
      shopName,
      shopType,
      ownerName,
      phone,
      address,
      shopLat,
      shopLon,
      deliveryScope,
      customShopUid,
    } = request.data;

    // Validate required fields
    if (
      !email ||
      !password ||
      !shopName ||
      !shopType ||
      !ownerName ||
      !phone ||
      !address
    ) {
      throw new HttpsError(
          "invalid-argument",
          "All required fields must be provided.",
      );
    }

    // ==================================================
    // Generate next custom UID
    //
    // 1000 -> upstageuser1001
    // 1001 -> upstageuser1002
    // 1002 -> upstageuser1003
    // ==================================================

    const counterRef = db
        .collection("counters")
        .doc("users");

    const customUid = await db.runTransaction(
        async (transaction) => {
          const counterSnapshot =
          await transaction.get(counterRef);

          let lastNumber = 1000;

          if (counterSnapshot.exists) {
            const data = counterSnapshot.data();

            lastNumber =
            Number(data.lastNumber) || 1000;
          }

          const nextNumber = lastNumber + 1;

          const newUid =
          `upstageuser${nextNumber}`;

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
        },
    );

    console.log(
        "Generated custom UID:",
        customUid,
    );

    // ==================================================
    // Create Firebase Authentication User
    // ==================================================

    const userRecord =
      await admin.auth().createUser({
        uid: customUid,
        email: email.trim(),
        password: password,
      });

    console.log(
        "Firebase Auth user created:",
        userRecord.uid,
    );

    // ==================================================
    // Trial - 30 days
    // ==================================================

    const now = Date.now();

    const trialExpiry =
      now + 30 * 24 * 60 * 60 * 1000;

    // ==================================================
    // Create Firestore User
    //
    // users/upstageuser1001
    // ==================================================

    await db
        .collection("users")
        .doc(customUid)
        .set({
          shopName,
          shopType,
          ownerName,
          phone,
          email: email.trim(),

          role: "seller",

          address: {
            fullAddress: address,
            lat: Number(shopLat),
            lon: Number(shopLon),
          },

          deliveryScope,

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
        "Firestore user created:",
        `users/${customUid}`,
    );

    // ==================================================
    // Return to React Native
    // ==================================================

    return {
      success: true,
      uid: customUid,
      message: "Account created successfully.",
    };
  } catch (error) {
    console.error("registerSeller error:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    if (error.code === "auth/email-already-exists") {
      throw new HttpsError(
          "already-exists",
          "This email is already registered. Please use another email.",
      );
    }

    if (error.code === "auth/invalid-password") {
      throw new HttpsError(
          "invalid-argument",
          "Password must be at least 6 characters.",
      );
    }

    if (error.code === "auth/invalid-email") {
      throw new HttpsError(
          "invalid-argument",
          "Invalid email address.",
      );
    }

    if (error.code === "auth/uid-already-exists") {
      throw new HttpsError(
          "already-exists",
          "Generated User ID already exists. Please try again.",
      );
    }

    throw new HttpsError(
        "internal",
        error.message || "Failed to create seller account.",
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
      console.log("❌ Seller not found:", sellerUid);
      return;
    }

    const sellerData = sellerDoc.data();
    const fcmToken = sellerData.fcmToken;

    if (!fcmToken) {
      console.log("❌ Seller FCM token not found:", sellerUid);
      return;
    }

    const title = "🛒 New Online Order!";

    const body = `Order from ${
      orderData.customerName || "Customer"
    } worth ₹${
      orderData.totalAmount || orderData.total || 0
    }`;

    const message = {
      token: fcmToken,

      notification: {
        title: title,
        body: body,
      },

      data: {
        orderId: String(
            orderData.orderId || orderId,
        ),
        status: String(
            orderData.status || "Pending Verification",
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

exports.sendLocalOrderNotification = onDocumentCreated(
    "users/{sellerUid}/local_orders/{orderId}",
    notifySeller,
);

// ======================================================
// GLOBAL ORDER NOTIFICATION
// ======================================================

exports.sendGlobalOrderNotification = onDocumentCreated(
    "users/{sellerUid}/global_orders/{orderId}",
    notifySeller,
);

