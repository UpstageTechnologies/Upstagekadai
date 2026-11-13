package com.myshopapp

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.util.regex.Pattern

class UpiNotificationService : NotificationListenerService() {

    companion object {
        private const val TAG = "UpiNotificationService"
        var instance: UpiNotificationService? = null

        // Supported Payment & Banking Package Signatures
        val PAYMENT_PACKAGES = setOf(
            "com.google.android.apps.nbu.paisa.user",      // Google Pay
            "com.google.android.apps.nbu.paisa.merchant",  // Google Pay for Business
            "com.phonepe.app",                             // PhonePe
            "com.phonepe.app.business",                    // PhonePe Business
            "net.one97.paytm",                             // Paytm
            "com.paytm.business",                          // Paytm for Business
            "in.org.npci.upiapp",                          // BHIM
            "com.bharatpe",                                // BharatPe
            "com.whatsapp",                                // WhatsApp Pay
            "com.csam.icici.bank.imobile",                 // ICICI iMobile
            "com.snapwork.hdfc",                           // HDFC Bank
            "com.sbi.lotusintouch",                        // SBI YONO
            "com.axis.mobile",                             // Axis Mobile
            "com.google.android.apps.messaging",           // Google Messages (SMS)
            "com.samsung.android.messaging"                // Samsung Messages (SMS)
        )

        // Keywords indicating money credited / received
        val CREDIT_KEYWORDS = listOf(
            "received", "credited", "paid you", "payment received",
            "accepted payment", "credit of", "deposit", "recieved"
        )
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        instance = this
        Log.d(TAG, "UpiNotificationService connected and listening for payments.")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        instance = null
        Log.d(TAG, "UpiNotificationService disconnected.")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        val packageName = sbn.packageName ?: ""
        val extras = sbn.notification?.extras ?: return

        val title = extras.getCharSequence("android.title")?.toString() ?: ""
        val text = extras.getCharSequence("android.text")?.toString() ?: ""
        val bigText = extras.getCharSequence("android.bigText")?.toString() ?: ""

        val combinedContent = "$title $text $bigText"
        val lowerContent = combinedContent.lowercase()

        // Fast check: Is it from a known payment / SMS / banking app, or does it mention UPI / payment keywords?
        val isPaymentApp = PAYMENT_PACKAGES.contains(packageName) ||
                packageName.contains("sms") ||
                packageName.contains("mms") ||
                packageName.contains("message") ||
                packageName.contains("bank") ||
                packageName.contains("upi") ||
                packageName.contains("pay")

        if (!isPaymentApp && !lowerContent.contains("upi")) {
            return
        }

        // Check for credit keywords
        val hasCreditKeyword = CREDIT_KEYWORDS.any { lowerContent.contains(it) }
        if (!hasCreditKeyword) {
            return
        }

        // Extract amount
        val parsedAmount = extractAmount(combinedContent)
        if (parsedAmount == null || parsedAmount <= 0.0) {
            return
        }

        // Identify provider name for user display
        val providerName = when {
            packageName.contains("google") || packageName.contains("paisa") -> "Google Pay"
            packageName.contains("phonepe") -> "PhonePe"
            packageName.contains("paytm") -> "Paytm"
            packageName.contains("npci") || packageName.contains("bhim") -> "BHIM"
            packageName.contains("bharatpe") -> "BharatPe"
            packageName.contains("messaging") || packageName.contains("sms") -> "Bank SMS"
            packageName.contains("icici") -> "ICICI Bank"
            packageName.contains("hdfc") -> "HDFC Bank"
            packageName.contains("sbi") -> "SBI"
            packageName.contains("axis") -> "Axis Bank"
            else -> "UPI Payment"
        }

        // Extract reference/UTR/RRN if present (numbers 8-16 digits)
        val refPattern = Pattern.compile("(?:ref|rrn|utr|txn|upi(?:\\s+ref)?)\\s*[:#-]?\\s*([0-9]{8,16})", Pattern.CASE_INSENSITIVE)
        val refMatcher = refPattern.matcher(combinedContent)
        val ref = if (refMatcher.find()) refMatcher.group(1) else "UPI-${System.currentTimeMillis().toString().takeLast(8)}"

        Log.i(TAG, "Verified incoming payment detected: Amount: ₹$parsedAmount from $providerName (Ref: $ref)")

        // Notify React Native module
        UpiNotificationListenerModule.notifyPaymentReceived(
            amount = parsedAmount,
            provider = providerName,
            reference = ref ?: "",
            sender = title,
            rawText = combinedContent
        )
    }

    private fun extractAmount(text: String): Double? {
        val patterns = listOf(
            Pattern.compile("(?:₹|rs\\.?|inr)\\s*([0-9]+(?:,[0-9]+)*(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("([0-9]+(?:,[0-9]+)*(?:\\.[0-9]{1,2})?)\\s*(?:₹|rs\\.?|inr)", Pattern.CASE_INSENSITIVE)
        )

        for (pattern in patterns) {
            val matcher = pattern.matcher(text)
            if (matcher.find()) {
                val clean = matcher.group(1)?.replace(",", "")?.trim()
                val parsed = clean?.toDoubleOrNull()
                if (parsed != null && parsed > 0.0) {
                    return parsed
                }
            }
        }

        return null
    }
}
