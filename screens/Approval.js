import Checkbox from "expo-checkbox";
import { StatusBar } from "expo-status-bar";
import AntDesign from "@expo/vector-icons/AntDesign";
import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Image,
  Animated,
  PanResponder,
  Dimensions,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";

export default function Register() {
  // Animation controls
  const rectangleOpacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const [showSecondText, setShowSecondText] = useState(false);
  const secondTextOpacity = useRef(new Animated.Value(0)).current;
  const [showThirdText, setShowThirdText] = useState(false);
  const thirdTextOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Initial animation sequence
    Animated.timing(progress, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: false,
    }).start();

    const timer1 = setTimeout(() => {
      Animated.timing(progress, {
        toValue: 0,
        duration: 2000,
        useNativeDriver: false,
      }).start();

      const timer2 = setTimeout(() => {
        setShowSecondText(true);
        Animated.timing(secondTextOpacity, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        }).start();

        const timer3 = setTimeout(() => {
          Animated.timing(secondTextOpacity, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: false,
          }).start();

          const timer4 = setTimeout(() => {
            setShowSecondText(false);
            setShowThirdText(true);
            Animated.timing(thirdTextOpacity, {
              toValue: 1,
              duration: 2000,
              useNativeDriver: false,
            }).start();
            Animated.timing(rectangleOpacity, {
              toValue: 1,
              duration: 2000,
              useNativeDriver: false,
            }).start();
          }, 2000);
        }, 2000);
      }, 2000);
    }, 2000);

    return () => {
      [timer1, timer2, timer3, timer4].forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <Image
          source={require("../assets/naf.png")}
          style={styles.img}
          resizeMode="contain"
        />

        {/* Centered Text Container */}
        <View style={styles.centerContainer}>
          <Animated.View style={[styles.textContainer, { opacity: progress }]}>
            <Text style={styles.secondText}>Your request is approved </Text>
          </Animated.View>

          {showSecondText && (
            <Animated.View
              style={[styles.textContainer, { opacity: secondTextOpacity }]}
            >
              <Text style={styles.secondTexts}>Welcome "username"</Text>
            </Animated.View>
          )}

          {showThirdText && (
            <Animated.View
              style={[styles.textContainer, { opacity: thirdTextOpacity }]}
            >
              <Text style={styles.secondText}>To continue scroll up</Text>
            </Animated.View>
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFD600",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  img: {
    position: "absolute",
    top: 20,
    width: 140,
    height: 200,
    alignSelf: "center",
  },
  textContainer: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  text: {
    fontFamily: "Roboto",
    fontSize: 65,
    fontWeight: "bold",
    color: "#003C74",
    textAlign: "center",
  },
  secondText: {
    textAlign: "center",
    fontFamily: "Roboto",
    fontSize: 32,
    fontWeight: "600",
    color: "#003C74",
    paddingHorizontal: 30,
  },  secondTexts: {
    textAlign: "center",
    fontFamily: "Roboto",
    fontSize: 32,
    fontWeight: "600",
    color: "#003C74",
  },
});