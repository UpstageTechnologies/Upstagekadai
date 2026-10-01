import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

export default function OfflineBanner() {
  const [isConnected, setIsConnected] = useState(true);
  const slideAnim = useRef(new Animated.Value(-60)).current;

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsConnected(online);

      Animated.timing(slideAnim, {
        toValue: online ? -60 : 0,
        duration: 350,
        useNativeDriver: true,
      }).start();
    });

    return () => unsubscribe();
  }, []);

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.content}>
        <Icon name="wifi-off" size={18} color="#fff" style={styles.icon} />
        <Text style={styles.text}>No Internet Connection • Offline Mode</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99999,
    backgroundColor: "#ef4444",
    paddingTop: Platform.OS === "android" ? 32 : 50,
    paddingBottom: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 12,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    marginRight: 8,
  },
  text: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});