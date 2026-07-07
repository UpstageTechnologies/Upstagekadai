import { initializeApp } from "firebase/app";

import {
  initializeAuth,
  getReactNativePersistence,
  getAuth,
} from "firebase/auth";

import AsyncStorage from
"@react-native-async-storage/async-storage";

import {
  getFirestore,
} from "firebase/firestore";

import {
  getApps,
} from "firebase/app";

const firebaseConfig = {
  apiKey:
  "AIzaSyCa0MF38J0Zyjjn26mhFEqifzHKOM2r3lI",

  authDomain:
  "scaner-billing.firebaseapp.com",

  projectId:
  "scaner-billing",

  messagingSenderId:
  "207862672282",

  appId:
  "1:207862672282:web:a1465f24b5c14e3a1ae823",
};

// ✅ Initialize Firebase App
const app =
getApps().length === 0
? initializeApp(firebaseConfig)
: getApps()[0];

// ✅ Persistent Login Auth
let auth;

try {

  auth = initializeAuth(app,{
    persistence:
    getReactNativePersistence(
      AsyncStorage
    ),
  });

} catch (e) {

  auth = getAuth(app);
}

export { auth };

// ✅ Firestore
export const db =
getFirestore(app);