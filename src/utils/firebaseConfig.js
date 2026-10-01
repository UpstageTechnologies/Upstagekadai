import { initializeApp, getApps } from "firebase/app";
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth,
} from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCa0MF38J0Zyjjn26mhFEqifzHKOM2r3lI",
  authDomain: "scaner-billing.firebaseapp.com",
  projectId: "scaner-billing",
  messagingSenderId: "207862672282",
  appId: "1:207862672282:web:a1465f24b5c14e3a1ae823",
  // 💡 குறிப்பு: உங்கள் Bucket URL-ஐ இங்கு சேர்க்கலாம். 
  // சேர்க்கவில்லை என்றாலும் Project ID-ஐ வைத்து Firebase தானாகவே எடுத்துக்கொள்ளும்.
  storageBucket: "scaner-billing.firebasestorage.app",
};
export const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp(firebaseConfig);

let auth;

try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  auth = getAuth(app);
}

export { auth };

export const db = getFirestore(app);
export const storage = getStorage(app);