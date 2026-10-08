import Checkbox from "expo-checkbox";
import { StatusBar } from "expo-status-bar";
import AntDesign from "@expo/vector-icons/AntDesign";
import { useNavigation } from '@react-navigation/native'; // Import useNavigation
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

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const FORM_HEIGHT = SCREEN_HEIGHT * 0.8;
const RECTANGLE_HEIGHT = 15;
const RECTANGLE_MARGIN = 20; // Reduced margin for closer distance

export default function Register() {
  // Animation controls
  const progress = useRef(new Animated.Value(0)).current;
  const [showSecondText, setShowSecondText] = useState(false);
  const secondTextOpacity = useRef(new Animated.Value(0)).current;
  const [showThirdText, setShowThirdText] = useState(false);
  const thirdTextOpacity = useRef(new Animated.Value(0)).current;
  const rectangleOpacity = useRef(new Animated.Value(0)).current;
  const [isChecked, setIsChecked] = useState(false);
  const navigation = useNavigation(); // Get the navigation prop

  const [username,setUsername]=useState('');
  const [password, setPassword] = useState('');
    const handleLogin = () => {
      // You can add validation logic here
      navigation.navigate('LoginScreen');
    };
    const handleRequest = () => {
      navigation.replace('Wait', {
        username: 'JohnDoe',
        isApproved: true // or false
      });
      ('Wait'); // This should match your screen name in the navigator
    };

  // Drag controls
  const dragY = useRef(new Animated.Value(0)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(FORM_HEIGHT)).current;

  // Document picker function
  const selectDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "*/*",
      });
      if (res.type === "success") {
        console.log("Selected file:", res);
      } else {
        console.log("Document selection cancelled");
      }
    } catch (err) {
      console.error("Error picking document:", err);
    }
  };

  // Documents needed alert
  const showDocumentsNeededAlert = () => {
    Alert.alert(
      "Documents Needed",
      "The following documents are required:\n\n1. ID Card\n2. Proof of Address\n3. Business Registration\n4. Tax Identification Number (TIN)\n5. Bank Statement",
      [{ text: "OK" }]
    );
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const newY = Math.max(
          -FORM_HEIGHT + RECTANGLE_MARGIN,
          -gestureState.dy
        );
        dragY.setValue(newY);
        const progress = Math.min(1, -newY / (FORM_HEIGHT - RECTANGLE_MARGIN));
        formOpacity.setValue(progress);
        formTranslateY.setValue(FORM_HEIGHT + newY - RECTANGLE_MARGIN);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (
          gestureState.vy < -0.5 ||
          -gestureState.dy > (FORM_HEIGHT - RECTANGLE_MARGIN) / 2
        ) {
          Animated.parallel([
            Animated.spring(dragY, {
              toValue: -FORM_HEIGHT + RECTANGLE_MARGIN,
              useNativeDriver: true,
            }),
            Animated.spring(formOpacity, {
              toValue: 1,
              useNativeDriver: true,
            }),
            Animated.spring(formTranslateY, {
              toValue: RECTANGLE_MARGIN,
              useNativeDriver: true,
            }),
          ]).start();
        } else {
          Animated.parallel([
            Animated.spring(dragY, {
              toValue: 0,
              useNativeDriver: true,
            }),
            Animated.spring(formOpacity, {
              toValue: 0,
              useNativeDriver: true,
            }),
            Animated.spring(formTranslateY, {
              toValue: FORM_HEIGHT,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    })
  ).current;
useEffect(() => {
  let timer2, timer3, timer4;

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
          source={require("./assets/naf.png")}
          style={styles.img}
          resizeMode="contain"
        />

        {/* Centered Text Container */}
        <View style={styles.centerContainer}>
          <Animated.View style={[styles.textContainer, { opacity: progress }]}>
            <Text style={styles.text}>Welcome</Text>
          </Animated.View>

          {showSecondText && (
            <Animated.View
              style={[styles.textContainer, { opacity: secondTextOpacity }]}
            >
              <Text style={styles.secondText}>
                This is a private APP for enterprises and companies
              </Text>
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

        {/* Form Container */}
        <Animated.View
          style={[
            styles.formContainer,
            {
              opacity: formOpacity,
              transform: [{ translateY: formTranslateY }],
            },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <TextInput
              style={styles.textInput}
              placeholder="Name"
              placeholderTextColor="#888"
            />
            <TextInput
              style={styles.textInput}
              placeholder="Surname"
              placeholderTextColor="#888"
            />
            <TextInput
              style={styles.textInput}
              placeholder="Usename"
              value={username}
              onChangeText={setUsername}
              placeholderTextColor="#888"
            />
            <TextInput
              secureTextEntry
              style={styles.textInput}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              placeholderTextColor="#888"
            />
            <TextInput
              style={styles.textInput}
              placeholder="Email address"
              placeholderTextColor="#888"
            />
            <TextInput
              style={styles.textInput}
              placeholder="Phone number"
              placeholderTextColor="#888"
            />
            <TextInput
              style={styles.textInput}
              placeholder="Enterprise Name"
              placeholderTextColor="#888"
            />
            <TextInput
              style={styles.textInput}
              placeholder="Enterprise status"
              placeholderTextColor="#888"
            />
<View style={styles.uploadSection}>
              <TouchableOpacity style={styles.but} onPress={selectDocument}>
                <Text style={styles.txt}>Upload documents</Text>
                <AntDesign name="upcircleo" size={24} color="#888" />
              </TouchableOpacity>
              <TouchableOpacity onPress={showDocumentsNeededAlert}>
                <Text style={styles.txts}>Documents list</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.checkboxContainer}>
              <Checkbox
                value={isChecked}
                onValueChange={setIsChecked}
                color={isChecked ? "#003C74" : undefined}
                style={styles.checkbox}
              />
              <Text style={styles.label}>
                I agree to the <Text style={styles.link}>Terms</Text> and{" "}
                <Text style={styles.link}>Privacy Policy</Text>
              </Text>
            </View>
            <TouchableOpacity onPress={(handleLogin)}>
                <Text style={styles.txtt}>
                    You have an account ? Login
                </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reqButton}  onPress={handleRequest}>
              <Text style={styles.reqtxt}>Request to open an account</Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>

        {/* Draggable Rectangle */}
        {showThirdText && (
          <Animated.View
            style={[
              styles.rectangleContainer,
              {
                opacity: rectangleOpacity,
                transform: [{ translateY: dragY }],
              },
            ]}
            {...panResponder.panHandlers}
          >
            <View style={styles.rectangle} />
          </Animated.View>
        )}
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
  },
  formContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: FORM_HEIGHT,
    backgroundColor: "#001853",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: RECTANGLE_MARGIN + 10,
    zIndex: 10,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 60,
  },
  textInput: {
    borderColor: "#FFD600",
    borderBottomWidth: 2,
    fontFamily: "Roboto",
    fontSize: 18,
    color: "#FFD600",
    marginBottom: 15,
    paddingVertical: 8,
  },
  uploadSection: {
    alignItems: "center",
    marginVertical: 15,
  },
  but: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
    marginTop: 10,
  },
  txt: {
    fontFamily: "Roboto",
    fontSize: 22,
    color: "#FFD600",
    marginRight: 10,
  },
  txtt: {
    fontFamily: "Roboto",
    fontSize: 13,
    color: "#FFD600",
    marginRight: 10,
    marginLeft: 5,
  },
  txts: {
    fontFamily: "Roboto",
    fontSize: 18,
    color: "#FFD600",
    textAlign: "center",
    textDecorationLine: "underline",
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 20,
    marginBottom: 20,
    paddingHorizontal: 5,
  },
  checkbox: {
    marginRight: 10,
    marginTop: 3,
    borderColor: "#FFD600",
    width: 20,
    height: 20,
  },
  label: {
    flex: 1,
    fontFamily: "Roboto",
    fontSize: 16,
    color: "white",
    lineHeight: 20,
  },
  link: {
    color: "#FFD600",
    textDecorationLine: "underline",
  },
  reqButton: {
    backgroundColor: "#01247A",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
    marginBottom: 30,
  },
  reqtxt: {
    fontFamily: "Roboto",
    fontSize: 20,
fontWeight: "600",
    color: "#FFD600",
    textAlign: "center",
  },
  rectangleContainer: {
    position: "absolute",
    bottom: RECTANGLE_MARGIN,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
  rectangle: {
    width: 60,
    height: RECTANGLE_HEIGHT,
    backgroundColor: "#003C74",
    borderRadius: 8,
  },
});