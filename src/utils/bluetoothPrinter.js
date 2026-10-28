import { NativeModules, NativeEventEmitter, Platform, PermissionsAndroid, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const PRINTER_STORAGE_KEY = "connected_printer_device";

let _cachedEmitter = null;

function getPrinterModule() {
  return NativeModules.BluetoothPrinterModule || null;
}

function getPrinterEmitter() {
  const mod = getPrinterModule();
  if (!mod) return null;
  if (!_cachedEmitter) {
    _cachedEmitter = new NativeEventEmitter(mod);
  }
  return _cachedEmitter;
}

/**
 * Request runtime Bluetooth permissions on Android.
 * Covers Android 12+ (BLUETOOTH_SCAN, BLUETOOTH_CONNECT) and Android <=11 (ACCESS_FINE_LOCATION).
 */
export async function requestBluetoothPermissions() {
  if (Platform.OS !== "android") return true;

  try {
    if (Platform.Version >= 31) {
      const res = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      const scanOk = res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
      const connectOk = res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;

      return scanOk && connectOk;
    } else {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: "Bluetooth Location Permission",
          message: "UpstageKadai needs location permission to discover nearby Bluetooth thermal printers.",
          buttonPositive: "OK",
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
  } catch (err) {
    console.warn("[BluetoothPrinter] Permission error:", err);
    return false;
  }
}

/**
 * Check if Bluetooth is enabled on device.
 */
export async function isBluetoothEnabled() {
  const mod = getPrinterModule();
  if (!mod) return false;
  try {
    return await mod.isBluetoothEnabled();
  } catch (e) {
    return false;
  }
}

/**
 * Open Phone System Bluetooth Settings.
 */
export async function openBluetoothSettings() {
  if (Platform.OS === "android") {
    try {
      await Linking.sendIntent("android.settings.BLUETOOTH_SETTINGS");
    } catch (_) {
      Linking.openSettings();
    }
  } else {
    Linking.openURL("App-Prefs:Bluetooth");
  }
}

/**
 * Get list of paired / bonded Bluetooth devices.
 */
export async function getPairedDevices() {
  const mod = getPrinterModule();
  if (!mod) return [];
  const permOk = await requestBluetoothPermissions();
  if (!permOk) {
    throw new Error("Bluetooth permissions are required to view printers.");
  }
  return await mod.getPairedDevices();
}

/**
 * Discover printers: retrieves paired devices immediately, then scans for nearby devices.
 * Calls onDeviceFound callback for every discovered device.
 */
export async function scanPrinters(onDeviceFound = null) {
  const mod = getPrinterModule();
  if (!mod) {
    throw new Error("Bluetooth printer native module not available.");
  }

  const permOk = await requestBluetoothPermissions();
  if (!permOk) {
    throw new Error("Bluetooth permission not granted. Please enable Bluetooth permission in Settings.");
  }

  const enabled = await isBluetoothEnabled();
  if (!enabled) {
    throw new Error("BLUETOOTH_DISABLED");
  }

  let sub = null;
  const emitter = getPrinterEmitter();
  if (onDeviceFound && emitter) {
    sub = emitter.addListener("onPrinterDiscovered", onDeviceFound);
  }

  try {
    const devices = await mod.startDiscovery();
    return devices || [];
  } finally {
    // Keep subscription for a few seconds if live scanning, then clean up
    if (sub) {
      setTimeout(() => {
        try { sub.remove(); } catch (_) {}
      }, 12000);
    }
  }
}

/**
 * Stop active Bluetooth discovery.
 */
export async function stopDiscovery() {
  const mod = getPrinterModule();
  if (mod) {
    try {
      await mod.stopDiscovery();
    } catch (_) {}
  }
}

/**
 * Connect to a thermal printer by MAC address.
 */
export async function connectPrinter(macAddress, deviceName = "Thermal Printer") {
  const mod = getPrinterModule();
  if (!mod) {
    throw new Error("Native Bluetooth printer module not available.");
  }
  if (!macAddress || macAddress === "00:00:00:00:00:00") {
    throw new Error("Invalid printer MAC address.");
  }

  const permOk = await requestBluetoothPermissions();
  if (!permOk) {
    throw new Error("Bluetooth permission required to connect.");
  }

  const result = await mod.connect(macAddress);

  const printerInfo = {
    deviceName: result.deviceName || deviceName,
    macAddress: macAddress,
    device_name: result.deviceName || deviceName,
    inner_mac_address: macAddress,
    connectedAt: Date.now(),
  };

  await AsyncStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify(printerInfo));
  return printerInfo;
}

/**
 * Disconnect current printer.
 */
export async function disconnectPrinter() {
  const mod = getPrinterModule();
  if (mod) {
    try {
      await mod.disconnect();
    } catch (_) {}
  }
  await AsyncStorage.removeItem(PRINTER_STORAGE_KEY);
}

/**
 * Check if printer is actively connected.
 */
export async function isPrinterConnected() {
  const mod = getPrinterModule();
  if (!mod) return false;
  try {
    return await mod.isConnected();
  } catch (_) {
    return false;
  }
}

/**
 * Get saved printer from AsyncStorage and verify connection (auto-reconnect if needed).
 */
export async function getSavedPrinter(autoReconnect = true) {
  try {
    const raw = await AsyncStorage.getItem(PRINTER_STORAGE_KEY);
    if (!raw) return null;
    const printer = JSON.parse(raw);
    if (!printer?.macAddress && !printer?.inner_mac_address) return null;

    const mac = printer.macAddress || printer.inner_mac_address;
    const connected = await isPrinterConnected();

    if (!connected && autoReconnect) {
      try {
        await connectPrinter(mac, printer.deviceName || printer.device_name);
      } catch (_) {
        // Reconnect attempt failed silently
      }
    }
    return printer;
  } catch (e) {
    return null;
  }
}

/**
 * Print structured receipt with robust fallback and parameter normalization.
 */
export async function printReceipt(receiptData = {}) {
  const mod = getPrinterModule();
  if (!mod) {
    throw new Error("Native Bluetooth printer module not available.");
  }

  const connected = await isPrinterConnected();
  if (!connected) {
    // Attempt auto-reconnect to saved printer
    const saved = await getSavedPrinter(true);
    if (!saved) {
      throw new Error("No thermal printer connected. Please connect in Settings > Printer Settings.");
    }
  }

  const payload = { ...receiptData };
  if (payload.qrData && !payload.qrCodeData) {
    payload.qrCodeData = payload.qrData;
  }

  return await mod.printFormattedReceipt(payload);
}

/**
 * Print barcode label for a product (supports single or multiple copies).
 */
export async function printBarcodeLabel(labelData = {}) {
  const mod = getPrinterModule();
  if (!mod) {
    throw new Error("Native Bluetooth printer module not available.");
  }

  const connected = await isPrinterConnected();
  if (!connected) {
    const saved = await getSavedPrinter(true);
    if (!saved) {
      throw new Error("No thermal printer connected. Please connect in Settings > Printer Settings.");
    }
  }

  return await mod.printBarcodeLabel(labelData);
}

/**
 * Print a batch of barcode labels for multiple products.
 */
export async function printBatchLabels(items = [], onProgress = null) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("No items provided for batch label printing.");
  }

  const results = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      await printBarcodeLabel(item);
      results.push({ item, success: true });
      if (onProgress) {
        onProgress(i + 1, items.length, item);
      }
    } catch (err) {
      results.push({ item, success: false, error: err.message });
      throw err; // Stop on disconnect or error
    }
  }
  return results;
}

/**
 * Print a test receipt.
 */
export async function printTestReceipt(options = {}) {
  const mod = getPrinterModule();
  if (!mod) {
    throw new Error("Native Bluetooth printer module not available.");
  }
  return await mod.printTestReceipt(options);
}

/**
 * Print a test barcode label.
 */
export async function printTestLabel(options = {}) {
  const mod = getPrinterModule();
  if (!mod) {
    throw new Error("Native Bluetooth printer module not available.");
  }
  return await mod.printTestLabel(options);
}

export default {
  requestBluetoothPermissions,
  isBluetoothEnabled,
  openBluetoothSettings,
  getPairedDevices,
  scanPrinters,
  stopDiscovery,
  connectPrinter,
  disconnectPrinter,
  isPrinterConnected,
  getSavedPrinter,
  printReceipt,
  printBarcodeLabel,
  printBatchLabels,
  printTestReceipt,
  printTestLabel,
};
