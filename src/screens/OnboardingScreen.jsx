import React, { useRef, useState } from "react";
import { auth } from "../firebaseConfig";
import {
  View,
  Text,
  Image,
  Dimensions,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("window");

const slides = [
  {
    id: "1",
    image: require("../assets/onboard1.jpg"),
    title: "Manage Your Shop",
    subtitle:
      "Track inventory, sales and purchases easily.",
  },

  {
    id: "2",
    image: require("../assets/onboard2.jpg"),
    title: "Scan Products Fast",
    subtitle:
      "Barcode scanner makes billing super fast.",
  },

  {
    id: "3",
    image: require("../assets/onboard3.jpg"),
    title: "Grow Your Business",
    subtitle:
      "Get analytics and profit reports instantly.",
  },
];

export default function OnboardingScreen({ navigation }) {

  const [currentIndex, setCurrentIndex] =
    useState(0);

  const ref = useRef();

  const updateIndex = (e) => {

    const index = Math.round(
      e.nativeEvent.contentOffset.x / width
    );

    setCurrentIndex(index);
  };

  return (
    <View style={styles.container}>

      <StatusBar
        backgroundColor="#0f172a"
        barStyle="light-content"
      />

      <FlatList
        ref={ref}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={updateIndex}
        keyExtractor={(item) => item.id}
      renderItem={({ item }) => (

  <View style={styles.slide}>

    <Image
      source={item.image}
      style={styles.image}
      resizeMode="cover"
    />

  </View>

)}
      />

      {/* DOTS */}
      <View style={styles.dotContainer}>

        {slides.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              currentIndex === index &&
                styles.activeDot,
            ]}
          />
        ))}

      </View>

      {/* BUTTON */}
      <TouchableOpacity
        style={styles.button}
        onPress={async () => {

          if (currentIndex < slides.length - 1) {

            ref.current.scrollToIndex({
              index: currentIndex + 1,
            });

          } else {

await AsyncStorage.setItem(
  "seen_onboarding",
  "true"
);

if (auth.currentUser) {

  navigation.replace("Dashboard");

} else {

  navigation.replace("Login");
}
          }
        }}
      >

        <Text style={styles.buttonText}>
          {currentIndex === slides.length - 1
            ? "Get Started"
            : "Next"}
        </Text>

      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },

slide: {
  width,
  height: "100%",
},


image: {
  width: width,
  height: "98%",
},

title: {
  color: "#fff",
  fontSize: 32,
  fontWeight: "bold",
  marginTop: 10,
  textAlign: "center",
},

  subtitle: {
    color: "#cbd5e1",
    fontSize: 16,
    textAlign: "center",
    marginTop: 15,
    lineHeight: 24,
  },

  dotContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 25,
  },

  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#475569",
    marginHorizontal: 5,
  },

  activeDot: {
    backgroundColor: "#6366f1",
    width: 25,
  },

  button: {
    backgroundColor: "#6366f1",
    marginHorizontal: 25,
    marginBottom: 40,
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: "center",
  },

  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 17,
  },
});