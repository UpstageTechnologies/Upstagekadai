import {
  getMessaging,
  getToken,
  onTokenRefresh,
} from "@react-native-firebase/messaging";

import { PermissionsAndroid, Platform } from "react-native";

import {
  doc,
  updateDoc,
} from "firebase/firestore";

import { db } from "./firebaseConfig";

let unsubscribeTokenRefresh = null;
let registeredUid = null;

/**
 * Android Notification Permission
 */
async function requestNotificationPermission() {
  try {
    if (
      Platform.OS === "android" &&
      Platform.Version >= 33
    ) {
      console.log(
        "🔔 Android 13+ - requesting POST_NOTIFICATIONS..."
      );

      const result =
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );

      console.log(
        "🔔 POST_NOTIFICATIONS RESULT:",
        result
      );

      if (
        result === PermissionsAndroid.RESULTS.GRANTED
      ) {
        console.log(
          "✅ NOTIFICATION PERMISSION GRANTED"
        );

        return true;
      }

      console.log(
        "❌ NOTIFICATION PERMISSION DENIED"
      );

      return false;
    }

    console.log(
      "✅ Android < 13 - permission not required"
    );

    return true;
  } catch (error) {
    console.log(
      "❌ NOTIFICATION PERMISSION ERROR:",
      error?.code,
      error?.message,
      error
    );

    return false;
  }
}

/**
 * Save Seller FCM Token
 */
export async function saveSellerFCMToken(uid) {
  if (!uid) {
    console.log(
      "❌ FCM: SELLER UID MISSING"
    );

    return null;  
  }

  console.log("=================================");
  console.log(
    "🔔 STARTING SELLER FCM SETUP"
  );
  console.log(
    "👤 SELLER UID:",
    uid
  );
  console.log("=================================");

  try {
    // --------------------------------
    // STEP 1 — Permission
    // --------------------------------

    const permissionGranted =
      await requestNotificationPermission();

    if (!permissionGranted) {
      console.log(
        "⚠️ NOTIFICATION PERMISSION WAS NOT GRANTED"
      );

      return null;
    }

    // --------------------------------
    // STEP 2 — Get Messaging Instance
    // --------------------------------

    console.log(
      "📡 GETTING FIREBASE MESSAGING INSTANCE..."
    );

    const messagingInstance =
      getMessaging();

    console.log(
      "✅ FIREBASE MESSAGING INSTANCE CREATED"
    );

    // --------------------------------
    // STEP 3 — Get FCM Token
    // --------------------------------

    console.log(
      "🔑 GETTING FCM TOKEN..."
    );

    const token =
      await getToken(messagingInstance);

    console.log(
      "🔑 TOKEN RESULT:",
      token
    );

    if (!token) {
      console.log(
        "❌ FCM TOKEN WAS NOT RECEIVED"
      );

      return null;
    }

    console.log(
      "✅ FCM TOKEN RECEIVED SUCCESSFULLY"
    );

    // --------------------------------
    // STEP 4 — Save Token
    // --------------------------------

    console.log(
      "💾 SAVING TOKEN TO users/" + uid
    );

    const sellerRef =
      doc(db, "users", uid);

    await updateDoc(
      sellerRef,
      {
        fcmToken: token,
      }
    );

    console.log(
      "✅ FCM TOKEN SAVED SUCCESSFULLY"
    );

    // --------------------------------
    // STEP 5 — Token Refresh
    // --------------------------------

    registerSellerTokenRefresh(
      messagingInstance,
      uid
    );

    return token;

  } catch (error) {
    console.log(
      "=============================="
    );

    console.log(
      "❌ FCM TOKEN SETUP FAILED"
    );

    console.log(
      "ERROR CODE:",
      error?.code
    );

    console.log(
      "ERROR MESSAGE:",
      error?.message
    );

    console.log(
      "FULL ERROR:",
      error
    );

    console.log(
      "=============================="
    );

    return null;
  }
}

/**
 * FCM Token Refresh Listener
 */
function registerSellerTokenRefresh(
  messagingInstance,
  uid
) {
  // Prevent duplicate listener
  if (
    registeredUid === uid &&
    unsubscribeTokenRefresh
  ) {
    console.log(
      "ℹ️ FCM TOKEN REFRESH LISTENER ALREADY REGISTERED"
    );

    return;
  }

  // Remove old listener
  if (unsubscribeTokenRefresh) {
    unsubscribeTokenRefresh();

    unsubscribeTokenRefresh = null;
  }

  registeredUid = uid;

  unsubscribeTokenRefresh =
    onTokenRefresh(
      messagingInstance,
      async newToken => {
        try {
          console.log(
            "🔄 FCM TOKEN REFRESHED:",
            newToken
          );

          const sellerRef =
            doc(db, "users", uid);

          await updateDoc(
            sellerRef,
            {
              fcmToken: newToken,
            }
          );

          console.log(
            "✅ REFRESHED FCM TOKEN SAVED"
          );

        } catch (error) {
          console.log(
            "❌ REFRESH TOKEN SAVE ERROR:",
            error
          );
        }
      }
    );

  console.log(
    "✅ FCM TOKEN REFRESH LISTENER REGISTERED"
  );
}

/**
 * Remove FCM Token Refresh Listener
 */
export function removeSellerFCMTokenListener() {
  if (unsubscribeTokenRefresh) {
    unsubscribeTokenRefresh();

    unsubscribeTokenRefresh = null;
  }

  registeredUid = null;

  console.log(
    "🧹 FCM TOKEN REFRESH LISTENER REMOVED"
  );
}