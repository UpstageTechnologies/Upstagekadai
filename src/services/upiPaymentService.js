import { db } from "../utils/firebaseConfig";
import { doc, onSnapshot } from "firebase/firestore";

const FUNCTIONS_BASE_URL = "https://us-central1-scaner-billing.cloudfunctions.net";

/**
 * Creates a unique Razorpay Dynamic UPI QR payment session via Firebase Cloud Functions.
 *
 * @param {Object} params
 * @param {string} params.sellerUid - Merchant UID
 * @param {number} params.amount - Total bill amount in INR
 * @param {string} [params.billNo] - Optional draft bill number
 * @param {string} [params.shopName] - Merchant business name
 * @returns {Promise<{ sessionId: string, qrCodeId: string, qrImageUrl: string, amount: number, status: string, expiresAt: string }>}
 */
export async function createUpiPaymentSession({ sellerUid, amount, billNo = "", shopName = "" }) {
  if (!sellerUid) throw new Error("Seller UID is required");
  if (!amount || amount <= 0) throw new Error("A positive amount is required");

  const response = await fetch(`${FUNCTIONS_BASE_URL}/createUpiPaymentQr`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        sellerUid,
        amount: Number(amount),
        billNo,
        shopName,
      },
    }),
  });

  const responseText = await response.text();
  let json;
  try {
    json = JSON.parse(responseText);
  } catch (parseErr) {
    throw new Error(`Server returned non-JSON response (${response.status}): ${responseText.substring(0, 100)}`);
  }

  if (!response.ok || json.error) {
    const errorDetails = json.error?.message || json.error?.description || "Failed to create UPI Payment QR";
    throw new Error(errorDetails);
  }

  // Firebase onCall returns data in json.result
  return json.result || json.data || json;
}

/**
 * Listens in real-time to the payment session document in Firestore.
 * Triggered automatically when Razorpay webhook updates payment status to SUCCESS.
 *
 * @param {string} sellerUid
 * @param {string} sessionId
 * @param {Function} onUpdate - callback(sessionData)
 * @param {Function} [onError] - callback(error)
 * @returns {Function} Unsubscribe listener function
 */
export function listenToPaymentSession(sellerUid, sessionId, onUpdate, onError) {
  if (!sellerUid || !sessionId) {
    console.warn("[upiPaymentService] Missing sellerUid or sessionId for listener");
    return () => {};
  }

  const sessionDocRef = doc(db, "users", sellerUid, "payment_sessions", sessionId);

  return onSnapshot(
    sessionDocRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        onUpdate({ id: docSnap.id, ...data });
      }
    },
    (error) => {
      console.error("[upiPaymentService] Snapshot listener error:", error);
      if (onError) onError(error);
    }
  );
}

/**
 * Cancels a waiting payment session and closes the Razorpay QR.
 *
 * @param {string} sellerUid
 * @param {string} sessionId
 * @returns {Promise<boolean>}
 */
export async function cancelUpiPaymentSession(sellerUid, sessionId) {
  if (!sellerUid || !sessionId) return false;

  try {
    const response = await fetch(`${FUNCTIONS_BASE_URL}/cancelUpiPaymentSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: { sellerUid, sessionId },
      }),
    });
    return response.ok;
  } catch (err) {
    console.warn("[upiPaymentService] cancel session network error:", err.message);
    return false;
  }
}

/**
 * Manually checks or reconciles the payment status directly against Razorpay API.
 * Provides a resilient safety net in case of network interruption or webhook delay.
 *
 * @param {string} sellerUid
 * @param {string} sessionId
 * @returns {Promise<{ status: string, paymentId?: string, transactionReference?: string }>}
 */
export async function checkUpiPaymentStatus(sellerUid, sessionId) {
  if (!sellerUid || !sessionId) throw new Error("Missing parameters");

  const response = await fetch(`${FUNCTIONS_BASE_URL}/checkUpiPaymentStatus`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: { sellerUid, sessionId },
    }),
  });

  const responseText = await response.text();
  const json = JSON.parse(responseText);

  if (!response.ok || json.error) {
    throw new Error(json.error?.message || "Failed to check status");
  }

  return json.result || json.data || json;
}

export default {
  createUpiPaymentSession,
  listenToPaymentSession,
  cancelUpiPaymentSession,
  checkUpiPaymentStatus,
};
