import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from "react-native";

import LinearGradient from "react-native-linear-gradient";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

export default function TrialScreen({ navigation }) {

  return (
    <LinearGradient
      colors={["#0f172a", "#1e293b", "#312e81"]}
      style={styles.container}
    >

      <StatusBar
        backgroundColor="#0f172a"
        barStyle="light-content"
      />

      <View style={styles.topCircle} />
      <View style={styles.bottomCircle} />

      <Icon
        name="rocket-launch"
        size={90}
        color="#fff"
      />

      <Text style={styles.title}>
        Start Your Free Trial
      </Text>

      <Text style={styles.subtitle}>
        Enjoy full premium access for 30 days.
        Manage sales, inventory, analytics
        and everything without limits.
      </Text>

      <View style={styles.featuresBox}>

        <View style={styles.featureRow}>
          <Icon
            name="check-circle"
            size={22}
            color="#4ade80"
          />
          <Text style={styles.featureText}>
            Full Dashboard Access
          </Text>
        </View>

        <View style={styles.featureRow}>
          <Icon
            name="check-circle"
            size={22}
            color="#4ade80"
          />
          <Text style={styles.featureText}>
            Unlimited Scans
          </Text>
        </View>

        <View style={styles.featureRow}>
          <Icon
            name="check-circle"
            size={22}
            color="#4ade80"
          />
          <Text style={styles.featureText}>
            Profit Analytics
          </Text>
        </View>

      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={() =>
          navigation.replace("Login")
        }
      >
        <Text style={styles.buttonText}>
          Start 30 Days Free Trial
        </Text>
      </TouchableOpacity>

    </LinearGradient>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
    overflow: "hidden",
  },

  topCircle: {
    position: "absolute",
    top: -120,
    right: -80,
    width: 250,
    height: 250,
    borderRadius: 150,
    backgroundColor: "rgba(255,255,255,0.05)",
  },

  bottomCircle: {
    position: "absolute",
    bottom: -100,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 150,
    backgroundColor: "rgba(255,255,255,0.05)",
  },

  title: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "bold",
    marginTop: 30,
    textAlign: "center",
  },

  subtitle: {
    color: "#cbd5e1",
    textAlign: "center",
    fontSize: 16,
    marginTop: 20,
    lineHeight: 25,
  },

  featuresBox: {
    marginTop: 35,
    width: "100%",
  },

  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  featureText: {
    color: "#fff",
    marginLeft: 12,
    fontSize: 16,
  },

button: {
  marginTop: 45,
  backgroundColor: "#6366f1",
  width: "100%",
  paddingVertical: 18,
  borderRadius: 18,
  alignItems: "center",

  shadowColor: "#6366f1",
  shadowOpacity: 0.5,
  shadowRadius: 15,
  elevation: 10,
},

buttonText: {
  color: "#fff",
  fontWeight: "bold",
  fontSize: 17,
},

});