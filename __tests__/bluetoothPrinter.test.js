jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules } from "react-native";

// Mock Native Module
NativeModules.BluetoothPrinterModule = {
  isBluetoothEnabled: jest.fn().mockResolvedValue(true),
  getPairedDevices: jest.fn().mockResolvedValue([]),
  startDiscovery: jest.fn().mockResolvedValue([]),
  stopDiscovery: jest.fn().mockResolvedValue(true),
  connect: jest.fn().mockResolvedValue({ deviceName: "Test Printer", macAddress: "11:22:33:44:55:66" }),
  disconnect: jest.fn().mockResolvedValue(true),
  isConnected: jest.fn().mockResolvedValue(true),
  printFormattedReceipt: jest.fn().mockResolvedValue(true),
  printBarcodeLabel: jest.fn().mockResolvedValue(true),
  printTestReceipt: jest.fn().mockResolvedValue(true),
  printTestLabel: jest.fn().mockResolvedValue(true),
};

import bluetoothPrinter, {
  isBluetoothEnabled,
  getPairedDevices,
  connectPrinter,
  disconnectPrinter,
  isPrinterConnected,
  getSavedPrinter,
  printReceipt,
  printBarcodeLabel,
  printTestReceipt,
  printTestLabel,
  PRINTER_STORAGE_KEY,
} from "../src/utils/bluetoothPrinter";

describe("Bluetooth Printer Utility & Native Integration Tests", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  test("isBluetoothEnabled returns boolean status from NativeModule", async () => {
    NativeModules.BluetoothPrinterModule.isBluetoothEnabled.mockResolvedValue(true);
    const enabled = await isBluetoothEnabled();
    expect(enabled).toBe(true);
    expect(NativeModules.BluetoothPrinterModule.isBluetoothEnabled).toHaveBeenCalled();
  });

  test("getPairedDevices queries native module", async () => {
    const mockDevices = [
      { deviceName: "RPP02N", macAddress: "66:22:33:44:55:66", bonded: true },
    ];
    NativeModules.BluetoothPrinterModule.getPairedDevices.mockResolvedValue(mockDevices);

    const result = await getPairedDevices();
    expect(result).toEqual(mockDevices);
    expect(NativeModules.BluetoothPrinterModule.getPairedDevices).toHaveBeenCalled();
  });

  test("connectPrinter connects and persists device info in AsyncStorage", async () => {
    NativeModules.BluetoothPrinterModule.connect.mockResolvedValue({
      deviceName: "Caysn P58",
      macAddress: "AA:BB:CC:DD:EE:FF",
    });

    const info = await connectPrinter("AA:BB:CC:DD:EE:FF", "Caysn P58");
    expect(info.macAddress).toBe("AA:BB:CC:DD:EE:FF");
    expect(info.deviceName).toBe("Caysn P58");

    const saved = await AsyncStorage.getItem(PRINTER_STORAGE_KEY);
    expect(saved).toBeTruthy();
    const parsed = JSON.parse(saved);
    expect(parsed.macAddress).toBe("AA:BB:CC:DD:EE:FF");
  });

  test("disconnectPrinter calls native module and removes storage entry", async () => {
    await AsyncStorage.setItem(
      PRINTER_STORAGE_KEY,
      JSON.stringify({ macAddress: "AA:BB:CC:DD:EE:FF", deviceName: "Test" })
    );

    NativeModules.BluetoothPrinterModule.disconnect.mockResolvedValue(true);

    await disconnectPrinter();
    expect(NativeModules.BluetoothPrinterModule.disconnect).toHaveBeenCalled();
    const stored = await AsyncStorage.getItem(PRINTER_STORAGE_KEY);
    expect(stored).toBeNull();
  });

  test("isPrinterConnected returns connection state", async () => {
    NativeModules.BluetoothPrinterModule.isConnected.mockResolvedValue(true);
    const connected = await isPrinterConnected();
    expect(connected).toBe(true);
  });

  test("getSavedPrinter retrieves stored printer", async () => {
    await AsyncStorage.setItem(
      PRINTER_STORAGE_KEY,
      JSON.stringify({ macAddress: "00:11:22:33:44:55", deviceName: "Thermal POS" })
    );
    NativeModules.BluetoothPrinterModule.isConnected.mockResolvedValue(true);

    const saved = await getSavedPrinter(false);
    expect(saved).toBeTruthy();
    expect(saved.macAddress).toBe("00:11:22:33:44:55");
  });

  test("printReceipt formats and delegates to native module", async () => {
    NativeModules.BluetoothPrinterModule.isConnected.mockResolvedValue(true);
    NativeModules.BluetoothPrinterModule.printFormattedReceipt.mockResolvedValue(true);

    const receiptData = {
      shopName: "Super Mart",
      billNo: "INV-101",
      date: "16/10/2026",
      items: [{ name: "Milk", qty: 2, price: 30, total: 60 }],
      total: 60,
    };

    const res = await printReceipt(receiptData);
    expect(res).toBe(true);
    expect(NativeModules.BluetoothPrinterModule.printFormattedReceipt).toHaveBeenCalledWith(receiptData);
  });

  test("printBarcodeLabel delegates to native module", async () => {
    NativeModules.BluetoothPrinterModule.isConnected.mockResolvedValue(true);
    NativeModules.BluetoothPrinterModule.printBarcodeLabel.mockResolvedValue(true);

    const labelData = {
      itemName: "Biscuit",
      price: 25,
      barcode: "8901234567890",
    };

    const res = await printBarcodeLabel(labelData);
    expect(res).toBe(true);
    expect(NativeModules.BluetoothPrinterModule.printBarcodeLabel).toHaveBeenCalledWith(labelData);
  });

  test("printTestReceipt and printTestLabel invoke native test methods", async () => {
    NativeModules.BluetoothPrinterModule.printTestReceipt.mockResolvedValue(true);
    NativeModules.BluetoothPrinterModule.printTestLabel.mockResolvedValue(true);

    await printTestReceipt({ shopName: "Test Shop" });
    expect(NativeModules.BluetoothPrinterModule.printTestReceipt).toHaveBeenCalledWith({ shopName: "Test Shop" });

    await printTestLabel({ itemName: "Test Item" });
    expect(NativeModules.BluetoothPrinterModule.printTestLabel).toHaveBeenCalledWith({ itemName: "Test Item" });
  });
});
