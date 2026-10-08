import React from 'react';
import { View, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native'; // Import hook

export default function Naftalprev() {
  const navigation = useNavigation(); // Use the navigation hook

  return (
    <View style={styles.navbar}>
      {/* Left: Go Back */}
      <TouchableOpacity
        style={styles.sideIcon}
        onPress={() => navigation.goBack()} // Navigate back to the previous screen
      >
        <FontAwesome5 name="arrow-left" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Center: Logo */}
      <View style={styles.logoContainer}>
        <Image
          source={require('./assets/naf2.png')} // Make sure the path is correct
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      {/* Right: Account */}
      <TouchableOpacity style={styles.sideIcon}>
        <FontAwesome5 name="user" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  navbar: {
    width: '100%',
    backgroundColor: '#001853',
    flexDirection: 'row',
    alignItems: 'center',
    height: 80,
  },
  sideIcon: {
    width: 60, // fixed width for even spacing
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    flex: 1,
    alignItems: 'center',
  },
  logo: {
    width: 140,
    height: 50,
  },
});
