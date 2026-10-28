module.exports = {
  dependencies: {
    'react-native-thermal-receipt-printer': {
      platforms: {
        ios: null, // Device-only binary libPrinterSDK.a is incompatible with iOS Simulator
      },
    },
  },
};
