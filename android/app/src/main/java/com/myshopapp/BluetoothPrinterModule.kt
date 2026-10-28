package com.myshopapp

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Build
import android.util.Base64
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.OutputStream
import java.nio.charset.Charset
import java.util.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

class BluetoothPrinterModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private val bluetoothAdapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
    private var activeSocket: BluetoothSocket? = null
    private var activeOutputStream: OutputStream? = null
    private var connectedDeviceName: String? = null
    private var connectedDeviceMac: String? = null

    private val executor = Executors.newSingleThreadExecutor()
    private val discoveredDevices = ConcurrentHashMap<String, WritableMap>()
    private var isReceiverRegistered = false

    companion object {
        const val NAME = "BluetoothPrinterModule"
        private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    }

    override fun getName(): String = NAME

    private val discoveryReceiver = object : BroadcastReceiver() {
        @SuppressLint("MissingPermission")
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                BluetoothDevice.ACTION_FOUND -> {
                    val device: BluetoothDevice? =
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                        } else {
                            @Suppress("DEPRECATION")
                            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                        }

                    device?.let { dev ->
                        val name = try {
                            dev.name ?: "Bluetooth Device"
                        } catch (e: Exception) {
                            "Bluetooth Device"
                        }
                        val address = dev.address ?: return
                        val bonded = try {
                            dev.bondState == BluetoothDevice.BOND_BONDED
                        } catch (e: Exception) {
                            false
                        }

                        val map = Arguments.createMap().apply {
                            putString("deviceName", name)
                            putString("macAddress", address)
                            putString("device_name", name)
                            putString("inner_mac_address", address)
                            putBoolean("bonded", bonded)
                        }
                        discoveredDevices[address] = map

                        // Emit live discovery event to React Native
                        try {
                            reactContext
                                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                                .emit("onPrinterDiscovered", map)
                        } catch (_: Exception) {}
                    }
                }
                BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
                    try {
                        reactContext
                            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                            .emit("onPrinterDiscoveryFinished", null)
                    } catch (_: Exception) {}
                }
            }
        }
    }

    private fun hasBluetoothPermission(forScan: Boolean = false): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val perm = if (forScan) Manifest.permission.BLUETOOTH_SCAN else Manifest.permission.BLUETOOTH_CONNECT
            return ContextCompat.checkSelfPermission(reactContext, perm) == PackageManager.PERMISSION_GRANTED
        }
        return ContextCompat.checkSelfPermission(
            reactContext,
            Manifest.permission.BLUETOOTH
        ) == PackageManager.PERMISSION_GRANTED
    }

    @ReactMethod
    fun isBluetoothEnabled(promise: Promise) {
        try {
            val enabled = bluetoothAdapter?.isEnabled == true
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun getPairedDevices(promise: Promise) {
        if (!hasBluetoothPermission(forScan = false)) {
            promise.reject("PERMISSION_DENIED", "Bluetooth permission not granted.")
            return
        }

        try {
            val adapter = bluetoothAdapter
            if (adapter == null || !adapter.isEnabled) {
                promise.reject("BLUETOOTH_DISABLED", "Bluetooth is disabled or not available.")
                return
            }

            @SuppressLint("MissingPermission")
            val bondedDevices = adapter.bondedDevices
            val result = Arguments.createArray()

            bondedDevices?.forEach { device ->
                val name = device.name ?: "Paired Printer"
                val address = device.address ?: ""
                val map = Arguments.createMap().apply {
                    putString("deviceName", name)
                    putString("macAddress", address)
                    putString("device_name", name)
                    putString("inner_mac_address", address)
                    putBoolean("bonded", true)
                }
                result.pushMap(map)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message ?: "Failed to get paired devices")
        }
    }

    @ReactMethod
    fun startDiscovery(promise: Promise) {
        if (!hasBluetoothPermission(forScan = true)) {
            promise.reject("PERMISSION_DENIED", "Bluetooth permission not granted.")
            return
        }

        try {
            val adapter = bluetoothAdapter
            if (adapter == null || !adapter.isEnabled) {
                promise.reject("BLUETOOTH_DISABLED", "Bluetooth is turned off.")
                return
            }

            discoveredDevices.clear()

            // Pre-fill with paired devices so user sees them immediately
            @SuppressLint("MissingPermission")
            adapter.bondedDevices?.forEach { dev ->
                val name = dev.name ?: "Paired Printer"
                val address = dev.address ?: ""
                val map = Arguments.createMap().apply {
                    putString("deviceName", name)
                    putString("macAddress", address)
                    putString("device_name", name)
                    putString("inner_mac_address", address)
                    putBoolean("bonded", true)
                }
                discoveredDevices[address] = map
            }

            if (!isReceiverRegistered) {
                val filter = IntentFilter().apply {
                    addAction(BluetoothDevice.ACTION_FOUND)
                    addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
                }
                reactContext.registerReceiver(discoveryReceiver, filter)
                isReceiverRegistered = true
            }

            @SuppressLint("MissingPermission")
            if (adapter.isDiscovering) {
                adapter.cancelDiscovery()
            }

            @SuppressLint("MissingPermission")
            val started = adapter.startDiscovery()
            if (started) {
                val initialList = Arguments.createArray()
                discoveredDevices.values.forEach { initialList.pushMap(it) }
                promise.resolve(initialList)
            } else {
                // If discovery couldn't start, return paired devices
                val initialList = Arguments.createArray()
                discoveredDevices.values.forEach { initialList.pushMap(it) }
                promise.resolve(initialList)
            }
        } catch (e: Exception) {
            promise.reject("DISCOVERY_ERROR", e.message ?: "Error starting discovery")
        }
    }

    @ReactMethod
    fun stopDiscovery(promise: Promise) {
        try {
            @SuppressLint("MissingPermission")
            if (bluetoothAdapter?.isDiscovering == true) {
                bluetoothAdapter.cancelDiscovery()
            }
            if (isReceiverRegistered) {
                try {
                    reactContext.unregisterReceiver(discoveryReceiver)
                } catch (_: Exception) {}
                isReceiverRegistered = false
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun connect(macAddress: String, promise: Promise) {
        if (!hasBluetoothPermission()) {
            promise.reject("PERMISSION_DENIED", "Bluetooth permission not granted.")
            return
        }

        executor.execute {
            try {
                val adapter = bluetoothAdapter
                if (adapter == null || !adapter.isEnabled) {
                    promise.reject("BLUETOOTH_DISABLED", "Bluetooth is turned off.")
                    return@execute
                }

                @SuppressLint("MissingPermission")
                if (adapter.isDiscovering) {
                    adapter.cancelDiscovery()
                }

                // If already connected to this device, verify connection
                if (activeSocket?.isConnected == true && connectedDeviceMac == macAddress) {
                    val res = Arguments.createMap().apply {
                        putBoolean("success", true)
                        putString("deviceName", connectedDeviceName ?: "Printer")
                        putString("macAddress", macAddress)
                        putString("device_name", connectedDeviceName ?: "Printer")
                        putString("inner_mac_address", macAddress)
                    }
                    promise.resolve(res)
                    return@execute
                }

                closeActiveSocket()

                val device = adapter.getRemoteDevice(macAddress)
                @SuppressLint("MissingPermission")
                val devName = try { device.name ?: "Thermal Printer" } catch (_: Exception) { "Thermal Printer" }

                // Attempt standard SPP RFCOMM connection
                var socket: BluetoothSocket? = null
                try {
                    @SuppressLint("MissingPermission")
                    socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
                    socket.connect()
                } catch (e1: IOException) {
                    // Fallback to reflection method (needed on some POS printers)
                    try {
                        val m = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
                        socket = m.invoke(device, 1) as BluetoothSocket
                        socket.connect()
                    } catch (e2: Exception) {
                        try { socket?.close() } catch (_: Exception) {}
                        promise.reject("CONNECT_FAILED", "Could not connect to printer ($devName). Please ensure printer is ON and paired: ${e1.message}")
                        return@execute
                    }
                }

                activeSocket = socket
                activeOutputStream = socket?.outputStream
                connectedDeviceName = devName
                connectedDeviceMac = macAddress

                val res = Arguments.createMap().apply {
                    putBoolean("success", true)
                    putString("deviceName", devName)
                    putString("macAddress", macAddress)
                    putString("device_name", devName)
                    putString("inner_mac_address", macAddress)
                }
                promise.resolve(res)
            } catch (e: Exception) {
                closeActiveSocket()
                promise.reject("CONNECT_ERROR", e.message ?: "Failed to connect to printer")
            }
        }
    }

    @ReactMethod
    fun disconnect(promise: Promise) {
        executor.execute {
            closeActiveSocket()
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun isConnected(promise: Promise) {
        val connected = activeSocket?.isConnected == true && activeOutputStream != null
        promise.resolve(connected)
    }

    private fun closeActiveSocket() {
        try { activeOutputStream?.close() } catch (_: Exception) {}
        try { activeSocket?.close() } catch (_: Exception) {}
        activeOutputStream = null
        activeSocket = null
        connectedDeviceName = null
        connectedDeviceMac = null
    }

    @ReactMethod
    fun printRaw(base64Data: String, promise: Promise) {
        executor.execute {
            try {
                val out = activeOutputStream
                if (out == null || activeSocket?.isConnected != true) {
                    promise.reject("NOT_CONNECTED", "Printer is not connected. Please connect a printer first.")
                    return@execute
                }

                val bytes = Base64.decode(base64Data, Base64.DEFAULT)
                out.write(bytes)
                out.flush()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("PRINT_ERROR", e.message ?: "Failed to send raw print data")
            }
        }
    }

    @ReactMethod
    fun printFormattedReceipt(options: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                val out = activeOutputStream
                if (out == null || activeSocket?.isConnected != true) {
                    promise.reject("NOT_CONNECTED", "Printer is not connected. Please connect in Settings.")
                    return@execute
                }

                val paperSize = if (options.hasKey("paperSize")) options.getString("paperSize") ?: "58mm" else "58mm"
                val lineWidth = if (paperSize == "80mm") 48 else 32
                val copies = if (options.hasKey("copies")) {
                    try {
                        val c = options.getInt("copies")
                        if (c in 1..10) c else 1
                    } catch (_: Exception) { 1 }
                } else 1

                for (copyIdx in 1..copies) {
                    val baos = ByteArrayOutputStream()

                    // 1. Initialize printer
                    baos.write(byteArrayOf(0x1B, 0x40)) // ESC @ (Reset)

                    // Optional Copy indicator if multiple copies
                    if (copies > 1) {
                        baos.write(byteArrayOf(0x1B, 0x61, 0x01)) // Center
                        baos.write(encodeText("--- COPY $copyIdx OF $copies ---\n"))
                    }

                    // 2. Logo image (if base64 provided)
                    if (options.hasKey("logoBase64")) {
                        val logoBase64 = options.getString("logoBase64")
                        if (!logoBase64.isNullOrEmpty()) {
                            try {
                                val cleanBase64 = logoBase64.substringAfter("base64,")
                                val imageBytes = Base64.decode(cleanBase64, Base64.DEFAULT)
                                val bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
                                if (bitmap != null) {
                                    val rasterBytes = convertBitmapToEscPosRaster(bitmap, if (paperSize == "80mm") 384 else 256)
                                    baos.write(byteArrayOf(0x1B, 0x61, 0x01)) // Center align
                                    baos.write(rasterBytes)
                                    baos.write(byteArrayOf(0x0A))
                                }
                            } catch (_: Exception) {}
                        }
                    }

                    // 3. Shop Name (Center, Bold, Double Size)
                    val shopName = options.getString("shopName") ?: "UPSTAGE KADAI"
                    baos.write(byteArrayOf(0x1B, 0x61, 0x01)) // Center
                    baos.write(byteArrayOf(0x1B, 0x45, 0x01)) // Bold ON
                    baos.write(byteArrayOf(0x1D, 0x21, 0x11)) // Double width & height
                    baos.write(encodeText("$shopName\n"))
                    baos.write(byteArrayOf(0x1D, 0x21, 0x00)) // Normal size
                    baos.write(byteArrayOf(0x1B, 0x45, 0x00)) // Bold OFF

                    // 4. Shop Address & Phone
                    if (options.hasKey("address") && !options.getString("address").isNullOrEmpty()) {
                        val address = options.getString("address") ?: ""
                        baos.write(encodeText("$address\n"))
                    }
                    if (options.hasKey("phone") && !options.getString("phone").isNullOrEmpty()) {
                        val phone = options.getString("phone") ?: ""
                        baos.write(encodeText("Phone: $phone\n"))
                    }
                    if (options.hasKey("gstNumber") && !options.getString("gstNumber").isNullOrEmpty()) {
                        val gst = options.getString("gstNumber") ?: ""
                        baos.write(encodeText("GSTIN: $gst\n"))
                    }
                    if (options.hasKey("header") && !options.getString("header").isNullOrEmpty()) {
                        val header = options.getString("header") ?: ""
                        baos.write(encodeText("$header\n"))
                    }

                    // Divider line
                    val divider = "-".repeat(lineWidth) + "\n"
                    baos.write(encodeText(divider))

                    // 5. Bill Details (Bill No, Date, Time, Payment Mode)
                    baos.write(byteArrayOf(0x1B, 0x61, 0x00)) // Align left
                    val billNo = options.getString("billNo") ?: "INV-${System.currentTimeMillis() % 100000}"
                    val billDate = options.getString("date") ?: ""
                    val paymentMode = options.getString("paymentMode") ?: "CASH"

                    baos.write(encodeText(formatTwoColumn("Bill No: $billNo", paymentMode, lineWidth) + "\n"))
                    if (billDate.isNotEmpty()) {
                        baos.write(encodeText("Date: $billDate\n"))
                    }
                    baos.write(encodeText(divider))

                    // 6. Table Header
                    if (paperSize == "80mm") {
                        val tableHeader = formatTwoColumn("ITEM / QTY", "AMOUNT (INR)", lineWidth)
                        baos.write(byteArrayOf(0x1B, 0x45, 0x01)) // Bold
                        baos.write(encodeText("$tableHeader\n"))
                        baos.write(byteArrayOf(0x1B, 0x45, 0x00))
                    } else {
                        val tableHeader = formatTwoColumn("ITEM", "AMOUNT", lineWidth)
                        baos.write(byteArrayOf(0x1B, 0x45, 0x01))
                        baos.write(encodeText("$tableHeader\n"))
                        baos.write(byteArrayOf(0x1B, 0x45, 0x00))
                    }
                    baos.write(encodeText(divider))

                    // 7. Items
                    if (options.hasKey("items")) {
                        val items = options.getArray("items")
                        if (items != null) {
                            for (i in 0 until items.size()) {
                                val item = items.getMap(i) ?: continue
                                val name = item.getString("name") ?: item.getString("itemName") ?: "Product"
                                val qty = if (item.hasKey("qty")) item.getDouble("qty") else 1.0
                                val price = if (item.hasKey("price")) item.getDouble("price") else if (item.hasKey("salesPrice")) item.getDouble("salesPrice") else 0.0
                                val itemTotal = if (item.hasKey("total")) item.getDouble("total") else (qty * price)

                                val qtyRateStr = "  ${formatQty(qty)} x Rs.${String.format(Locale.US, "%.2f", price)}"
                                val amountStr = "Rs." + String.format(Locale.US, "%.2f", itemTotal)

                                baos.write(encodeText("$name\n"))
                                baos.write(encodeText(formatTwoColumn(qtyRateStr, amountStr, lineWidth) + "\n"))
                            }
                        }
                    }
                    baos.write(encodeText(divider))

                    // 8. Totals & Tax
                    val subtotal = if (options.hasKey("subtotal")) options.getDouble("subtotal") else 0.0
                    val tax = if (options.hasKey("tax")) options.getDouble("tax") else 0.0
                    val total = if (options.hasKey("total")) options.getDouble("total") else 0.0

                    if (tax > 0) {
                        baos.write(encodeText(formatTwoColumn("Subtotal:", "Rs." + String.format(Locale.US, "%.2f", subtotal), lineWidth) + "\n"))
                        baos.write(encodeText(formatTwoColumn("Tax / GST:", "Rs." + String.format(Locale.US, "%.2f", tax), lineWidth) + "\n"))
                        baos.write(encodeText(divider))
                    }

                    // Grand Total (Large & Bold)
                    baos.write(byteArrayOf(0x1B, 0x45, 0x01)) // Bold ON
                    baos.write(byteArrayOf(0x1D, 0x21, 0x01)) // Double height
                    val totalStr = formatTwoColumn("TOTAL:", "Rs." + String.format(Locale.US, "%.2f", total), lineWidth)
                    baos.write(encodeText("$totalStr\n"))
                    baos.write(byteArrayOf(0x1D, 0x21, 0x00)) // Normal
                    baos.write(byteArrayOf(0x1B, 0x45, 0x00)) // Bold OFF
                    baos.write(encodeText(divider))

                    // 9. QR Code (support both qrCodeData and qrData)
                    val qrData = if (options.hasKey("qrCodeData")) {
                        options.getString("qrCodeData")
                    } else if (options.hasKey("qrData")) {
                        options.getString("qrData")
                    } else null

                    if (!qrData.isNullOrEmpty()) {
                        val qrBytes = generateQrCodeEscPos(qrData)
                        baos.write(byteArrayOf(0x1B, 0x61, 0x01)) // Center
                        baos.write(qrBytes)
                        baos.write(byteArrayOf(0x0A))
                    }

                    // 10. Barcode (if enabled)
                    if (options.hasKey("barcode")) {
                        val barcode = options.getString("barcode")
                        if (!barcode.isNullOrEmpty()) {
                            val barcodeBytes = generateBarcodeEscPos(barcode)
                            baos.write(byteArrayOf(0x1B, 0x61, 0x01)) // Center
                            baos.write(barcodeBytes)
                            baos.write(byteArrayOf(0x0A))
                        }
                    }

                    // 11. Footer Message (Center)
                    val footer = options.getString("footer") ?: "Thank You! Visit Again"
                    baos.write(byteArrayOf(0x1B, 0x61, 0x01)) // Center
                    baos.write(encodeText("$footer\n"))

                    // 12. Feed and Cut
                    val feedLines = if (options.hasKey("feedLines")) options.getInt("feedLines") else 3
                    baos.write(byteArrayOf(0x1B, 0x64, feedLines.toByte())) // ESC d n

                    val autoCut = if (options.hasKey("autoCut")) options.getBoolean("autoCut") else true
                    if (autoCut) {
                        baos.write(byteArrayOf(0x1D, 0x56, 0x41, 0x00)) // GS V A 0 (Feed and cut)
                    }

                    val finalBytes = baos.toByteArray()
                    out.write(finalBytes)
                    out.flush()

                    if (copies > 1 && copyIdx < copies) {
                        try { Thread.sleep(250) } catch (_: Exception) {}
                    }
                }

                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("PRINT_FAILED", e.message ?: "Failed to print receipt")
            }
        }
    }

    @ReactMethod
    fun printBarcodeLabel(options: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                val out = activeOutputStream
                if (out == null || activeSocket?.isConnected != true) {
                    promise.reject("NOT_CONNECTED", "Printer is not connected.")
                    return@execute
                }

                val shopName = if (options.hasKey("shopName")) options.getString("shopName") else null
                val itemName = options.getString("itemName") ?: "Product"
                val barcode = options.getString("barcode") ?: "00000000"
                val price = if (options.hasKey("price")) options.getDouble("price") else 0.0
                val paperSize = if (options.hasKey("paperSize")) options.getString("paperSize") ?: "58mm" else "58mm"
                val feedLines = if (options.hasKey("feedLines")) options.getInt("feedLines") else 3
                val copies = if (options.hasKey("copies")) {
                    try {
                        val c = options.getInt("copies")
                        if (c in 1..100) c else 1
                    } catch (_: Exception) { 1 }
                } else 1

                val baos = ByteArrayOutputStream()

                // ESC @ Reset
                baos.write(byteArrayOf(0x1B, 0x40))

                // Align Center
                baos.write(byteArrayOf(0x1B, 0x61, 0x01))

                // Optional Shop Name (Header)
                if (!shopName.isNullOrEmpty()) {
                    baos.write(byteArrayOf(0x1B, 0x45, 0x01)) // Bold
                    baos.write(encodeText("$shopName\n"))
                    baos.write(byteArrayOf(0x1B, 0x45, 0x00))
                }

                // Product Name (Bold)
                baos.write(byteArrayOf(0x1B, 0x45, 0x01))
                baos.write(encodeText("$itemName\n"))
                baos.write(byteArrayOf(0x1B, 0x45, 0x00))

                // 1D Barcode (Code128 with auto-scaling)
                val barcodeBytes = generateBarcodeEscPos(barcode)
                baos.write(barcodeBytes)
                baos.write(byteArrayOf(0x0A))

                // Price (Large / Bold)
                if (price > 0) {
                    baos.write(byteArrayOf(0x1B, 0x45, 0x01))
                    baos.write(byteArrayOf(0x1D, 0x21, 0x01)) // Double height
                    baos.write(encodeText("MRP: Rs." + String.format(Locale.US, "%.2f", price) + "\n"))
                    baos.write(byteArrayOf(0x1D, 0x21, 0x00))
                    baos.write(byteArrayOf(0x1B, 0x45, 0x00))
                }

                // Optional Footer / Note on label
                if (options.hasKey("footer") && !options.getString("footer").isNullOrEmpty()) {
                    baos.write(encodeText(options.getString("footer") + "\n"))
                }

                // Feed to next label mark (Feed n lines + Form Feed 0x0C)
                baos.write(byteArrayOf(0x1B, 0x64, feedLines.toByte()))
                baos.write(byteArrayOf(0x0C)) // Form feed (Label gap/mark)

                val labelBytes = baos.toByteArray()

                for (c in 1..copies) {
                    out.write(labelBytes)
                    out.flush()
                    if (copies > 1 && c < copies) {
                        try { Thread.sleep(200) } catch (_: Exception) {}
                    }
                }

                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("LABEL_PRINT_FAILED", e.message ?: "Failed to print label")
            }
        }
    }

    @ReactMethod
    fun printTestReceipt(options: ReadableMap?, promise: Promise) {
        val testOptions = Arguments.createMap().apply {
            putString("paperSize", options?.getString("paperSize") ?: "58mm")
            putString("shopName", options?.getString("shopName") ?: "UPSTAGE KADAI")
            putString("address", options?.getString("address") ?: "Main Road, Tamil Nadu, India")
            putString("phone", options?.getString("phone") ?: "9442461428")
            putString("gstNumber", options?.getString("gstNumber") ?: "33AAAAA0000A1Z5")
            putString("header", "--- TEST RECEIPT ---")
            putString("billNo", "TEST-001")
            putString("date", Date().toString().substring(0, 19))
            putString("paymentMode", "CASH")

            val items = Arguments.createArray()
            items.pushMap(Arguments.createMap().apply {
                putString("name", "Test Item 1 (500g)")
                putDouble("qty", 2.0)
                putDouble("price", 50.0)
                putDouble("total", 100.0)
            })
            items.pushMap(Arguments.createMap().apply {
                putString("name", "Sample Grocery Packet")
                putDouble("qty", 1.0)
                putDouble("price", 150.0)
                putDouble("total", 150.0)
            })
            putArray("items", items)

            putDouble("subtotal", 250.0)
            putDouble("tax", 0.0)
            putDouble("total", 250.0)
            putString("footer", "Printer Connected Successfully!\nReady for Billing.")
            putString("qrCodeData", "UPSTAGEKADAI-TEST-OK")
            putString("barcode", "890123456789")
            putInt("feedLines", 3)
            putBoolean("autoCut", true)
        }
        printFormattedReceipt(testOptions, promise)
    }

    @ReactMethod
    fun printTestLabel(options: ReadableMap?, promise: Promise) {
        val labelOptions = Arguments.createMap().apply {
            putString("itemName", "Parle-G Biscuit 250g")
            putString("barcode", options?.getString("barcode") ?: "8901030383457")
            putDouble("price", 30.0)
            putString("paperSize", options?.getString("paperSize") ?: "58mm")
        }
        printBarcodeLabel(labelOptions, promise)
    }

    // Helper: Format two columns for receipts (Left, Right)
    private fun formatTwoColumn(left: String, right: String, totalWidth: Int): String {
        val availableLeft = totalWidth - right.length - 1
        val cleanLeft = if (left.length > availableLeft && availableLeft > 3) {
            left.substring(0, availableLeft)
        } else {
            left
        }
        val spaces = totalWidth - cleanLeft.length - right.length
        return if (spaces > 0) {
            cleanLeft + " ".repeat(spaces) + right
        } else {
            "$cleanLeft $right"
        }
    }

    private fun formatQty(qty: Double): String {
        return if (qty % 1.0 == 0.0) {
            qty.toInt().toString()
        } else {
            String.format(Locale.US, "%.2f", qty)
        }
    }

    private fun encodeText(text: String): ByteArray {
        return text.toByteArray(Charset.forName("UTF-8"))
    }

    // ESC/POS Code128 generator
    private fun generateBarcodeEscPos(code: String): ByteArray {
        val baos = ByteArrayOutputStream()
        val cleanCode = code.trim().replace("{", "").replace("}", "")
        if (cleanCode.isEmpty()) return baos.toByteArray()

        // Height 60 dots
        baos.write(byteArrayOf(0x1D, 0x68, 60.toByte()))

        // Width: 2 for standard/short codes (<=13 chars), 1 for longer codes so it never overflows 58mm/80mm
        val moduleWidth: Byte = if (cleanCode.length > 13) 1 else 2
        baos.write(byteArrayOf(0x1D, 0x77, moduleWidth))

        // HRI characters below barcode: GS H 2
        baos.write(byteArrayOf(0x1D, 0x48, 2))
        // Font 0
        baos.write(byteArrayOf(0x1D, 0x66, 0))

        // Code128 Format B: GS k 73 len {B data
        val dataBytes = cleanCode.toByteArray(Charset.forName("US-ASCII"))
        val length = dataBytes.size + 2 // include {B
        baos.write(byteArrayOf(0x1D, 0x6B, 73, length.toByte(), 0x7B, 0x42))
        baos.write(dataBytes)
        return baos.toByteArray()
    }

    // ESC/POS QR Code generator
    private fun generateQrCodeEscPos(data: String): ByteArray {
        val baos = ByteArrayOutputStream()
        val dataBytes = data.toByteArray(Charset.forName("UTF-8"))
        val len = dataBytes.size + 3

        val pL = (len and 0xFF).toByte()
        val pH = ((len shr 8) and 0xFF).toByte()

        // 1. Set model (Model 2)
        baos.write(byteArrayOf(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00))
        // 2. Set module size (5)
        baos.write(byteArrayOf(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x05))
        // 3. Set error correction level M
        baos.write(byteArrayOf(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31))
        // 4. Store data
        baos.write(byteArrayOf(0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30))
        baos.write(dataBytes)
        // 5. Print QR
        baos.write(byteArrayOf(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30))

        return baos.toByteArray()
    }

    // Convert bitmap image to ESC/POS raster bit image (GS v 0)
    private fun convertBitmapToEscPosRaster(src: Bitmap, maxWidth: Int): ByteArray {
        val width = if (src.width > maxWidth) maxWidth else src.width
        val height = ((src.height.toFloat() / src.width.toFloat()) * width).toInt()
        val scaled = Bitmap.createScaledBitmap(src, width, height, true)

        val widthBytes = (width + 7) / 8
        val xL = (widthBytes and 0xFF).toByte()
        val xH = ((widthBytes shr 8) and 0xFF).toByte()
        val yL = (height and 0xFF).toByte()
        val yH = ((height shr 8) and 0xFF).toByte()

        val baos = ByteArrayOutputStream()
        baos.write(byteArrayOf(0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH))

        for (y in 0 until height) {
            for (x in 0 until widthBytes) {
                var slice: Byte = 0
                for (b in 0 until 8) {
                    val px = x * 8 + b
                    if (px < width) {
                        val pixel = scaled.getPixel(px, y)
                        val r = Color.red(pixel)
                        val g = Color.green(pixel)
                        val bl = Color.blue(pixel)
                        val lum = (r * 0.299 + g * 0.587 + bl * 0.114).toInt()
                        if (lum < 160) {
                            slice = (slice.toInt() or (1 shl (7 - b))).toByte()
                        }
                    }
                }
                baos.write(slice.toInt())
            }
        }
        return baos.toByteArray()
    }
}
