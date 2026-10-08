// Back bar for pushed screens. Same as the original Naftalprev.js, kept here so
// the new screens import from one place; the account icon is now a real
// navigation target rather than a dead button.

import React from 'react';
import { View, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function Naftalprev() {
  const navigation = useNavigation();

  return (
    <View style={styles.navbar}>
      <TouchableOpacity style={styles.sideIcon} onPress={() => navigation.goBack()}>
        <FontAwesome5 name="arrow-left" size={24} color="#fff" />
      </TouchableOpacity>

      <View style={styles.logoContainer}>
        <Image
          source={require('../../assets/naf2.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <TouchableOpacity
        style={styles.sideIcon}
        onPress={() => navigation.navigate('Drawer', { screen: 'Home' })}
      >
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
  sideIcon: { width: 60, alignItems: 'center', justifyContent: 'center' },
  logoContainer: { flex: 1, alignItems: 'center' },
  logo: { width: 140, height: 50 },
});
