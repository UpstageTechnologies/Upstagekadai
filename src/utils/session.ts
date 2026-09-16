import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSION_KEY = "USER_SESSION";

// ✅ SAVE LOGIN
export const saveSession = async (
  data : any
) => {

  try {

    await AsyncStorage.setItem(
      SESSION_KEY,
      JSON.stringify(data)
    );

  } catch (e) {

    console.log(
      "Save Session Error",
      e
    );
  }
};

// ✅ GET LOGIN
export const getSession = async () => {

  try {

    const data =
      await AsyncStorage.getItem(
        SESSION_KEY
      );

    return data
      ? JSON.parse(data)
      : null;

  } catch (e) {

    console.log(
      "Get Session Error",
      e
    );

    return null;
  }
};

// ✅ LOGOUT
export const clearSession = async () => {

  try {

    await AsyncStorage.removeItem(
      SESSION_KEY
    );

  } catch (e) {

    console.log(
      "Clear Session Error",
      e
    );
  }
};