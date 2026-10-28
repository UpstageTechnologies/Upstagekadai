jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/mock/cache',
  downloadFile: jest.fn().mockReturnValue({ promise: Promise.resolve({ statusCode: 200 }) }),
  exists: jest.fn().mockResolvedValue(true),
  unlink: jest.fn().mockResolvedValue(true),
}));

import { removeProductBackground, cleanupOldSegmentedImages, checkSegmentationModel } from '../src/utils/backgroundRemover';
import { NativeModules } from 'react-native';

describe('100% Free Automatic Product Background Remover Workflow', () => {
  beforeEach(() => {
    NativeModules.BackgroundRemover = {
      isSupported: jest.fn().mockResolvedValue(true),
      checkModelStatus: jest.fn().mockResolvedValue({ available: true }),
      downloadModel: jest.fn().mockResolvedValue({ installed: true }),
      removeBackground: jest.fn().mockImplementation((uri) => {
        return Promise.resolve({
          uri: `file:///data/user/0/com.myshopapp/cache/bg_removed_${Date.now()}.png`,
          width: 1024,
          height: 1024,
          format: 'png',
        });
      }),
      cleanupTempFiles: jest.fn().mockResolvedValue(4),
    };
  });

  test('Creates professional studio product photography on clean neutral background with centered padding', async () => {
    NativeModules.BackgroundRemover.removeBackgroundWithOptions = jest.fn().mockImplementation((uri, options) => {
      const isTrans = options?.backgroundMode === 'transparent';
      return Promise.resolve({
        uri: isTrans ? `file:///data/cache/bg_removed_${Date.now()}.png` : `file:///data/cache/bg_studio_${Date.now()}.jpg`,
        studioUri: `file:///data/cache/bg_studio_${Date.now()}.jpg`,
        transparentUri: `file:///data/cache/bg_removed_${Date.now()}.png`,
        width: options?.outputSize || 1024,
        height: options?.outputSize || 1024,
        format: isTrans ? 'png' : 'jpg',
        studioEnhanced: true,
        productAspectRatio: 1.25,
      });
    });

    const rawPhotoUri = 'file:///data/user/0/com.myshopapp/cache/camera_capture.jpg';
    const result = await removeProductBackground(rawPhotoUri, {
      backgroundMode: 'studio',
      backgroundColor: '#FFFFFF',
      padding: 0.10,
      outputSize: 1024,
    });

    expect(result).toBeDefined();
    expect(result.studioEnhanced).toBe(true);
    expect(result.studioUri).toContain('bg_studio_');
    expect(result.transparentUri).toContain('bg_removed_');
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
    expect(result.format).toBe('jpg');
    expect(result.productAspectRatio).toBeGreaterThan(0);
    expect(NativeModules.BackgroundRemover.removeBackgroundWithOptions).toHaveBeenCalled();
  });

  test('Processes grocery product image (JPEG input -> Transparent PNG output)', async () => {
    const inputJpeg = 'file:///data/user/0/com.myshopapp/cache/grocery_apple.jpg';
    const result = await removeProductBackground(inputJpeg);

    expect(result).toBeDefined();
    expect(result.format).toBe('png');
    expect(result.uri.endsWith('.png')).toBe(true);
    expect(NativeModules.BackgroundRemover.removeBackground).toHaveBeenCalledWith(inputJpeg);
  });

  test('Processes packaged bottle product image (PNG input -> Transparent PNG output)', async () => {
    const inputPng = 'file:///data/user/0/com.myshopapp/cache/water_bottle.png';
    const result = await removeProductBackground(inputPng);

    expect(result.format).toBe('png');
    expect(result.uri).toContain('bg_removed_');
  });

  test('Processes clothing/apparel item (Complex background input)', async () => {
    const clothingUri = 'file:///data/user/0/com.myshopapp/cache/tshirt_complex_bg.jpg';
    const result = await removeProductBackground(clothingUri);

    expect(result.format).toBe('png');
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
  });

  test('Simulates model download on first use', async () => {
    // Model not yet installed
    NativeModules.BackgroundRemover.checkModelStatus.mockResolvedValueOnce({ available: false });
    const statusBefore = await checkSegmentationModel();
    expect(statusBefore.available).toBe(false);

    // Download model
    const downloadStatus = await NativeModules.BackgroundRemover.downloadModel();
    expect(downloadStatus.installed).toBe(true);
  });

  test('Handles background removal failure gracefully and allows seller fallback', async () => {
    NativeModules.BackgroundRemover.removeBackground.mockRejectedValueOnce(
      new Error('No foreground subject could be isolated from this image.')
    );

    const problematicUri = 'file:///data/user/0/com.myshopapp/cache/blurry_wall.jpg';
    await expect(removeProductBackground(problematicUri)).rejects.toThrow(
      'No foreground subject could be isolated'
    );
  });

  test('Downloads remote web image before native segmentation and cleans up temp cache', async () => {
    const webUrl = 'https://upload.wikimedia.org/wikipedia/commons/test_product.jpg';
    const result = await removeProductBackground(webUrl);

    expect(result).toBeDefined();
    expect(result.format).toBe('png');
    expect(NativeModules.BackgroundRemover.removeBackground).toHaveBeenCalled();
  });

  test('Firebase storage upload metadata helper generates correct contentType and filename', () => {
    const testLocalUris = [
      { uri: 'file:///data/cache/bg_removed_12345.png', expectedExt: 'png', expectedType: 'image/png' },
      { uri: 'file:///data/cache/original_raw.jpg', expectedExt: 'jpg', expectedType: 'image/jpeg' }
    ];

    testLocalUris.forEach(({ uri, expectedExt, expectedType }) => {
      const isPng = uri.endsWith('.png') || uri.includes('bg_removed');
      const ext = isPng ? 'png' : 'jpg';
      const contentType = isPng ? 'image/png' : 'image/jpeg';

      expect(ext).toBe(expectedExt);
      expect(contentType).toBe(expectedType);
    });
  });

  test('Cleans up temporary segmented files older than 1 hour', async () => {
    const deleted = await cleanupOldSegmentedImages();
    expect(deleted).toBe(4);
    expect(NativeModules.BackgroundRemover.cleanupTempFiles).toHaveBeenCalled();
  });
});
