import { NativeModules, Platform } from "react-native";
import RNFS from "react-native-fs";

const getBackgroundRemover = () => NativeModules.BackgroundRemover;

/**
 * Checks if on-device background removal is supported on the current device.
 * - Android: API 24+ (Android 7.0+)
 * - iOS: iOS 17.0+ (Vision framework foreground instance segmentation)
 */
export async function isBackgroundRemovalAvailable() {
  const BackgroundRemover = getBackgroundRemover();
  if (!BackgroundRemover || !BackgroundRemover.isSupported) {
    return false;
  }
  try {
    return await BackgroundRemover.isSupported();
  } catch (err) {
    console.warn("[BackgroundRemover] isSupported check failed:", err);
    return false;
  }
}

/**
 * Checks whether the on-device ML model is ready on the device.
 * On Android, checks if Google Play Services has the Subject Segmentation module.
 * On iOS, returns true if iOS 17+.
 */
export async function checkSegmentationModel() {
  const BackgroundRemover = getBackgroundRemover();
  if (!BackgroundRemover || !BackgroundRemover.checkModelStatus) {
    return { available: false, error: "Native module not found" };
  }
  try {
    return await BackgroundRemover.checkModelStatus();
  } catch (err) {
    return { available: false, error: err?.message || String(err) };
  }
}

/**
 * Initiates model download if not already installed.
 */
export async function downloadSegmentationModel() {
  const BackgroundRemover = getBackgroundRemover();
  if (!BackgroundRemover || !BackgroundRemover.downloadModel) {
    return { installed: false, error: "Native module not found" };
  }
  try {
    return await BackgroundRemover.downloadModel();
  } catch (err) {
    return { installed: false, error: err?.message || String(err) };
  }
}

/**
 * Removes background and produces professional e-commerce product photography.
 * - Detects foreground product using on-device ML segmentation.
 * - Centers the product on a square canvas with consistent padding.
 * - Places it on clean neutral studio background (default white #FFFFFF) or preserves transparent PNG.
 *
 * @param {string} inputUri - Local file path, file://, content://, or http(s) URL.
 * @param {Object} options - { backgroundMode: 'studio' | 'transparent', backgroundColor: '#FFFFFF', padding: 0.10, outputSize: 1024 }
 * @returns {Promise<{ uri: string, studioUri: string, transparentUri: string, width: number, height: number, format: 'jpg' | 'png', studioEnhanced: boolean }>}
 */
export async function removeProductBackground(inputUri, options = {}) {
  if (!inputUri || typeof inputUri !== "string" || !inputUri.trim()) {
    throw new Error("Invalid image URI provided for background removal.");
  }

  const BackgroundRemover = getBackgroundRemover();
  if (!BackgroundRemover || typeof BackgroundRemover.removeBackground !== "function") {
    throw new Error(
      `Background remover native module is not available on ${Platform.OS}.`
    );
  }

  let localFilePath = inputUri.trim();

  // If the image is a remote web URL (e.g. from Google or Wikimedia web search),
  // download it to a temporary local cache file first
  if (localFilePath.startsWith("http://") || localFilePath.startsWith("https://")) {
    const tempDownloadPath = `${RNFS.CachesDirectoryPath}/temp_web_${Date.now()}_${Math.floor(Math.random() * 10000)}.jpg`;
    try {
      const downloadResult = await RNFS.downloadFile({
        fromUrl: localFilePath,
        toFile: tempDownloadPath,
        background: false,
      }).promise;

      if (downloadResult.statusCode < 200 || downloadResult.statusCode >= 300) {
        throw new Error(`Failed to download remote image (HTTP ${downloadResult.statusCode})`);
      }
      localFilePath = `file://${tempDownloadPath}`;
    } catch (downloadErr) {
      throw new Error(`Failed to download web image for processing: ${downloadErr.message}`);
    }
  }

  // Call the native background removal module (with options if supported)
  let result;
  if (typeof BackgroundRemover.removeBackgroundWithOptions === "function") {
    result = await BackgroundRemover.removeBackgroundWithOptions(localFilePath, options);
  } else {
    result = await BackgroundRemover.removeBackground(localFilePath);
  }

  // Clean up downloaded temporary web image if applicable
  if (localFilePath.includes("temp_web_")) {
    try {
      const cleanPath = localFilePath.replace("file://", "");
      if (await RNFS.exists(cleanPath)) {
        await RNFS.unlink(cleanPath);
      }
    } catch (_) {}
  }

  return result;
}

/**
 * Cleans up temporary segmented images older than 1 hour.
 */
export async function cleanupOldSegmentedImages() {
  const BackgroundRemover = getBackgroundRemover();
  if (BackgroundRemover && BackgroundRemover.cleanupTempFiles) {
    try {
      return await BackgroundRemover.cleanupTempFiles();
    } catch (err) {
      console.warn("[BackgroundRemover] Cleanup failed:", err);
      return 0;
    }
  }
  return 0;
}
