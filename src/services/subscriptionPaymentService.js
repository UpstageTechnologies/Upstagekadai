import { auth } from "../utils/firebaseConfig";

const FUNCTIONS_BASE_URL = "https://us-central1-scaner-billing.cloudfunctions.net";

/**
 * Retrieves the current Firebase Auth ID token for authenticating Cloud Function requests.
 * @returns {Promise<string>}
 */
async function getAuthToken() {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("No authenticated user found. Please sign in to continue.");
  }
  return await currentUser.getIdToken(true);
}

/**
 * Creates a server-side Razorpay Order for Premium or Pro subscription plans.
 *
 * @param {Object} params
 * @param {string} params.plan - "Premium" | "Pro"
 * @param {string} params.cycle - "monthly" | "yearly"
 * @returns {Promise<{ orderId: string, amount: number, currency: string, keyId: string, plan: string, cycle: string }>}
 */
export async function createSubscriptionOrder({ plan, cycle = "monthly" }) {
  if (!plan) throw new Error("Subscription plan is required.");
  
  const token = await getAuthToken();

  const response = await fetch(`${FUNCTIONS_BASE_URL}/createSubscriptionOrder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      data: {
        plan,
        cycle,
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
    const errorDetails = json.error?.message || json.error?.description || "Failed to create subscription order.";
    throw new Error(errorDetails);
  }

  return json.result || json.data || json;
}

/**
 * Submits payment details to Firebase Cloud Functions for backend cryptographic
 * HMAC-SHA256 signature verification, direct Razorpay API validation, and atomic activation.
 *
 * @param {Object} params
 * @param {string} params.orderId - Razorpay order ID (e.g. order_xxx)
 * @param {string} params.paymentId - Razorpay payment ID (e.g. pay_xxx)
 * @param {string} params.signature - HMAC SHA256 signature returned by Razorpay Checkout
 * @returns {Promise<{ success: boolean, status: string, orderId: string, paymentId: string, plan: string, cycle: string, expiry: number, alreadyActivated?: boolean }>}
 */
export async function verifySubscriptionPayment({ orderId, paymentId, signature }) {
  if (!orderId) throw new Error("Order ID is required for verification.");
  if (!paymentId) throw new Error("Payment ID is required for verification.");
  if (!signature) throw new Error("Payment signature is required for verification.");

  const token = await getAuthToken();

  const response = await fetch(`${FUNCTIONS_BASE_URL}/verifySubscriptionPayment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      data: {
        orderId,
        paymentId,
        signature,
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
    const errorDetails = json.error?.message || json.error?.description || "Payment verification failed.";
    throw new Error(errorDetails);
  }

  return json.result || json.data || json;
}
