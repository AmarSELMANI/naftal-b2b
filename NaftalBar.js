import React from 'react';
import { View, Image, StyleSheet, TouchableOpacity,Text } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native'; // Import hook

export default function NaftalNavbar() {
  const navigation = useNavigation(); // Use the navigation hook
  const handelAcount= () => {
  navigation.replace('LoginScreen');
  ('LoginScreen')
}
  return (
    <View style={styles.navbar}>
      {/* Left: Hamburger */}
      <TouchableOpacity
        style={styles.sideIcon}
        onPress={() => navigation.openDrawer()} // Use navigation to open the drawer
      >
        <FontAwesome5 name="bars" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Center: Logo */}
      <View style={styles.logoContainer}>
        <Image
          source={require('./assets/naf2.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      {/* Right: Account */}
      <TouchableOpacity style={styles.logoutButton} onPress={handelAcount}>
  <Text style={styles.logoutText}>Log out</Text>
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
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButton: {
    width: 60, // add this to balance the left side
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: '#fff',
    fontSize: 12, // reduced font size to fit in 60 width
    fontWeight: 'bold',
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