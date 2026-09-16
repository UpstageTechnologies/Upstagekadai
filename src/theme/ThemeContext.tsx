import React, {
  createContext,
  useState,
  useContext,
} from "react";

import {
  DarkTheme,
  LightTheme,
} from "./colors";

export const ThemeContext =
  createContext<any>(null);

export const ThemeProvider = ({
  children,
}: any) => {

  const [darkMode, setDarkMode] =
    useState(false);

  const theme =
    darkMode
      ? DarkTheme
      : LightTheme;

  const toggleTheme = () => {

    setDarkMode(!darkMode);

  };

  return (

    <ThemeContext.Provider
      value={{
        darkMode,
        toggleTheme,
        theme,
      }}
    >

      {children}

    </ThemeContext.Provider>
  );
};



// ✅ ADD THIS
export const useTheme = () => {

  return useContext(
    ThemeContext
  );

};