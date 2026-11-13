import { NativeModules, DeviceEventEmitter, Platform } from "react-native";
import { db } from "../utils/firebaseConfig";
import { collection, onSnapshot } from "firebase/firestore";

const { UpiNotificationListener } = NativeModules;

class UpiAutoDetectService {
  constructor() {
    this.currentExpectedAmount = null;
    this.onPaymentCallback = null;
    this.listenerSubscription = null;
    this.firestoreUnsub = null;
    this.isListening = false;
    this.processedRefs = new Set();
  }

  init() {
    if (this.listenerSubscription) return;

    if (Platform.OS === "android") {
      this.listenerSubscription = DeviceEventEmitter.addListener(
        "onUpiPaymentAutoDetected",
        (event) => this.handleIncomingPayment(event)
      );
    }
  }

  async isAccessGranted() {
    if (Platform.OS !== "android" || !UpiNotificationListener) return false;
    try {
      return await UpiNotificationListener.isNotificationAccessGranted();
    } catch (e) {
      return false;
    }
  }

  async openAccessSettings() {
    if (Platform.OS !== "android" || !UpiNotificationListener) return;
    try {
      await UpiNotificationListener.openNotificationAccessSettings();
    } catch (e) {
      console.warn("Could not open notification settings:", e);
    }
  }

  startListening(expectedAmount, sellerUid, onDetected) {
    this.init();
    this.currentExpectedAmount = Number(expectedAmount);
    this.onPaymentCallback = onDetected;
    this.isListening = true;

    // Real-time Firestore cloud listener on incoming payments
    if (sellerUid) {
      this.stopFirestoreListener();
      try {
        const colRef = collection(db, "users", sellerUid, "upi_incoming_payments");
        this.firestoreUnsub = onSnapshot(colRef, (snap) => {
          snap.docChanges().forEach((change) => {
            if (change.type === "added") {
              const data = change.doc.data();
              if (data && data.amount) {
                this.handleIncomingPayment({
                  amount: Number(data.amount),
                  provider: data.provider || "Cloud Webhook",
                  reference: data.transactionReference || data.reference || change.doc.id,
                  sender: data.sender || "Customer",
                });
              }
            }
          });
        });
      } catch (e) {
        console.warn("[UpiAutoDetect] Firestore UPI listener error:", e);
      }
    }
  }

  stopListening() {
    this.currentExpectedAmount = null;
    this.onPaymentCallback = null;
    this.isListening = false;
    this.stopFirestoreListener();
  }

  stopFirestoreListener() {
    if (this.firestoreUnsub) {
      this.firestoreUnsub();
      this.firestoreUnsub = null;
    }
  }

  handleIncomingPayment(event) {
    if (!this.isListening || !this.currentExpectedAmount || !this.onPaymentCallback) {
      return;
    }

    const detectedAmount = Number(event.amount);
    const expected = Number(this.currentExpectedAmount);

    // Exact or 0.50 rupee tolerance matching (handling minor currency rounding)
    const difference = Math.abs(detectedAmount - expected);
    if (difference <= 0.5) {
      const ref = event.reference || `UPI-AUTO-${Date.now()}`;
      if (this.processedRefs.has(ref)) {
        return;
      }
      this.processedRefs.add(ref);

      const payload = {
        paymentProvider: "DIRECT_UPI",
        detectedBy: event.provider || "Automatic UPI Notification",
        transactionReference: ref,
        amount: detectedAmount,
        sender: event.sender || "Customer",
        paidAt: new Date().toISOString(),
      };

      const cb = this.onPaymentCallback;
      this.stopListening();
      cb(payload);
    }
  }

  simulateTestPayment(amount, provider = "Google Pay") {
    if (UpiNotificationListener?.simulatePayment) {
      UpiNotificationListener.simulatePayment(Number(amount), provider);
    } else {
      this.handleIncomingPayment({
        amount: Number(amount),
        provider: `${provider} (Simulated)`,
        reference: "SIM-" + Date.now().toString().slice(-8),
        sender: "Customer App",
      });
    }
  }
}

export default new UpiAutoDetectService();
