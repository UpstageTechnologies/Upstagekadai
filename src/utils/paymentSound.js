import { NativeModules, Platform } from "react-native";

const playedTransactions = new Set();

/**
 * Plays the professional payment success chime (PhonePe/Google Pay merchant style).
 * Ensures exactly one sound play per transaction ID to prevent duplicate audio.
 *
 * @param {string} transactionId - Unique ID (e.g. paymentId, sessionId, or billNo)
 * @returns {boolean} Whether the sound was played
 */
export function playPaymentSuccessSound(transactionId = null) {
  try {
    if (transactionId) {
      if (playedTransactions.has(transactionId)) {
        console.log(`[PaymentSound] Sound already played for transaction: ${transactionId}, skipping duplicate.`);
        return false;
      }
      playedTransactions.add(transactionId);
      // Keep memory bounded
      if (playedTransactions.size > 200) {
        const first = playedTransactions.values().next().value;
        playedTransactions.delete(first);
      }
    }

    const { ScanBeep } = NativeModules;
    if (ScanBeep && typeof ScanBeep.playPaymentSuccess === "function") {
      ScanBeep.playPaymentSuccess();
      return true;
    } else if (ScanBeep && typeof ScanBeep.beep === "function") {
      // Fallback to beep if success sound isn't available
      ScanBeep.beep();
      return true;
    } else {
      console.log("[PaymentSound] NativeModules.ScanBeep not available on this platform.");
      return false;
    }
  } catch (err) {
    console.warn("[PaymentSound] Failed to play payment success sound:", err);
    return false;
  }
}

/**
 * Resets the played status for a transaction (e.g. on new retry).
 * @param {string} transactionId
 */
export function resetPaymentSound(transactionId) {
  if (transactionId) {
    playedTransactions.delete(transactionId);
  }
}

export default {
  playPaymentSuccessSound,
  resetPaymentSound,
};
