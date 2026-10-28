jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/mock/cache',
  downloadFile: jest.fn().mockReturnValue({ promise: Promise.resolve({ statusCode: 200 }) }),
  exists: jest.fn().mockResolvedValue(true),
  unlink: jest.fn().mockResolvedValue(true),
}));

import {
  isBackgroundRemovalAvailable,
  removeProductBackground,
  checkSegmentationModel,
  cleanupOldSegmentedImages
} from '../src/utils/backgroundRemover';
import { NativeModules } from 'react-native';

describe('backgroundRemover utility', () => {
  beforeEach(() => {
    NativeModules.BackgroundRemover = {
      isSupported: jest.fn().mockResolvedValue(true),
      checkModelStatus: jest.fn().mockResolvedValue({ available: true }),
      downloadModel: jest.fn().mockResolvedValue({ installed: true }),
      removeBackground: jest.fn().mockResolvedValue({
        uri: 'file:///data/user/0/com.myshopapp/cache/bg_removed_12345.png',
        width: 800,
        height: 800,
        format: 'png'
      }),
      cleanupTempFiles: jest.fn().mockResolvedValue(3)
    };
  });

  test('checks whether background removal is supported', async () => {
    const supported = await isBackgroundRemovalAvailable();
    expect(supported).toBe(true);
    expect(NativeModules.BackgroundRemover.isSupported).toHaveBeenCalled();
  });

  test('throws error when image URI is invalid or empty', async () => {
    await expect(removeProductBackground('')).rejects.toThrow('Invalid image URI provided');
    await expect(removeProductBackground(null)).rejects.toThrow('Invalid image URI provided');
  });

  test('successfully removes background from a local image URI', async () => {
    const localUri = 'file:///data/user/0/com.myshopapp/cache/sample_product.jpg';
    const result = await removeProductBackground(localUri);
    expect(result).toBeDefined();
    expect(result.uri).toContain('bg_removed_');
    expect(result.format).toBe('png');
    expect(NativeModules.BackgroundRemover.removeBackground).toHaveBeenCalledWith(localUri);
  });

  test('calls removeBackgroundWithOptions when available with studio options', async () => {
    NativeModules.BackgroundRemover.removeBackgroundWithOptions = jest.fn().mockResolvedValue({
      uri: 'file:///data/user/0/com.myshopapp/cache/bg_studio_12345.jpg',
      studioUri: 'file:///data/user/0/com.myshopapp/cache/bg_studio_12345.jpg',
      transparentUri: 'file:///data/user/0/com.myshopapp/cache/bg_removed_12345.png',
      width: 1024,
      height: 1024,
      format: 'jpg',
      studioEnhanced: true
    });

    const localUri = 'file:///data/user/0/com.myshopapp/cache/sample_product.jpg';
    const options = { backgroundMode: 'studio', backgroundColor: '#FFFFFF', padding: 0.10, outputSize: 1024 };
    const result = await removeProductBackground(localUri, options);

    expect(result).toBeDefined();
    expect(result.studioEnhanced).toBe(true);
    expect(result.studioUri).toContain('bg_studio_');
    expect(result.transparentUri).toContain('bg_removed_');
    expect(NativeModules.BackgroundRemover.removeBackgroundWithOptions).toHaveBeenCalledWith(localUri, options);
  });

  test('checks segmentation model availability', async () => {
    const status = await checkSegmentationModel();
    expect(status.available).toBe(true);
    expect(NativeModules.BackgroundRemover.checkModelStatus).toHaveBeenCalled();
  });

  test('cleans up old temporary segmented images', async () => {
    const count = await cleanupOldSegmentedImages();
    expect(count).toBe(3);
    expect(NativeModules.BackgroundRemover.cleanupTempFiles).toHaveBeenCalled();
  });
});
