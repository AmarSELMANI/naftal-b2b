import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import naftalLogo from './assets/naf.png';

export default function Wait() {
  const navigation = useNavigation();
  const route = useRoute();
  const { username, isApproved } = route.params;

  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const showNotification = (message) => {
    console.log("🔔 Notification:", message);
  };

  const fadeInOut = () => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 2000, useNativeDriver: true })
    ]).start(() => {
      setStep((prev) => prev + 1);
    });
  };

  useEffect(() => {
    if (step === 0) fadeInOut();
    else if (step === 1) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 2000, useNativeDriver: true }).start(() => {
        setTimeout(() => {
          if (isApproved) {
            showNotification("Your request is approved!");
            setStep(2);
          } else {
            showNotification("Your request is denied!");
            setStep(4);
          }
        }, 3000);
      });
    } else if (step === 2) {
      fadeInOut();
    } else if (step === 3) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 2000, useNativeDriver: true }).start();
    } else if (step === 4) {
      fadeInOut();
    } else if (step === 5) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 2000, useNativeDriver: true }).start();
    }
  }, [step]);

  const renderContent = () => {
    switch (step) {
      case 0:
        return "Thank you for your submission!";
      case 1:
        return "Your request is being reviewed by our team. We will notify you about the decision.";
      case 2:
        return "Your request is approved";
      case 3:
        return `Welcome ${username}`;
      case 4:
        return "Your request has been denied";
      case 5:
        return "Send another request";
      default:
        return "";
    }
  };

  const handleContinue = () => {
    if (isApproved) {
      navigation.replace('Drawer');
      ('Drawer')
    } else {
      navigation.replace('Register');
      ('Register')
    }
  };

  return (
    <SafeAreaView style={styles.container}>
  <Image source={naftalLogo} style={styles.logo} resizeMode="contain" />

  <Animated.View style={[styles.centeredTextWrapper, { opacity: fadeAnim }]}>
    <Text style={styles.text}>{renderContent()}</Text>

    {(step === 3 || step === 5) && (
      <TouchableOpacity onPress={handleContinue}>
        <Text style={styles.buttonText}>
          {step === 3 ? 'Continue' : 'Send another request'}
        </Text>
      </TouchableOpacity>
    )}
  </Animated.View>
</SafeAreaView>
  );
}

const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#FFD600',
      paddingHorizontal: 20,
      alignItems: 'center',
    },
    logo: {
      width: 120,
      height: 120,
      marginTop: 20,
    },
    centeredTextWrapper: {
      position: 'absolute',
      top: '50%',
      left: 0,
      right: 0,
      transform: [{ translateY: -50 }], // Center vertically
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    text: {
      fontSize: 20,
      textAlign: 'center',
      marginBottom: 20,
      color: '#003C74',
    },
    buttonText: {
      fontSize: 18,
      color: '#334B7C',
      textDecorationLine: 'underline',
    },
  });
