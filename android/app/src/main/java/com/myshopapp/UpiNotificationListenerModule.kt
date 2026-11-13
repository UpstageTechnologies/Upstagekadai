package com.myshopapp

import android.content.Intent
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class UpiNotificationListenerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "UpiNotificationListener"
        private var instance: UpiNotificationListenerModule? = null

        fun notifyPaymentReceived(
            amount: Double,
            provider: String,
            reference: String,
            sender: String,
            rawText: String
        ) {
            instance?.sendEvent(amount, provider, reference, sender, rawText)
        }
    }

    init {
        instance = this
    }

    override fun getName(): String = MODULE_NAME

    private fun sendEvent(
        amount: Double,
        provider: String,
        reference: String,
        sender: String,
        rawText: String
    ) {
        if (!reactContext.hasActiveReactInstance()) return

        val params = Arguments.createMap().apply {
            putDouble("amount", amount)
            putString("provider", provider)
            putString("reference", reference)
            putString("sender", sender)
            putString("rawText", rawText)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }

        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onUpiPaymentAutoDetected", params)
    }

    @ReactMethod
    fun isNotificationAccessGranted(promise: Promise) {
        try {
            val enabledListeners = NotificationManagerCompat.getEnabledListenerPackages(reactContext)
            val isGranted = enabledListeners.contains(reactContext.packageName)
            promise.resolve(isGranted)
        } catch (e: Exception) {
            promise.reject("CHECK_ERROR", e.message)
        }
    }

    @ReactMethod
    fun openNotificationAccessSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OPEN_SETTINGS_ERROR", e.message)
        }
    }

    // Testing helper for simulating incoming payment in dev / test
    @ReactMethod
    fun simulatePayment(amount: Double, provider: String, promise: Promise) {
        sendEvent(
            amount = amount,
            provider = provider,
            reference = "SIM-" + System.currentTimeMillis().toString().takeLast(8),
            sender = "Customer App",
            rawText = "Received ₹$amount on $provider"
        )
        promise.resolve(true)
    }
}
