import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import NaftalNavbar from '../NaftalBar';
import { SafeAreaView } from 'react-native-safe-area-context';

const { height } = Dimensions.get('window');

export default function MainMenu() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <NaftalNavbar />
      <ScrollView contentContainerStyle={styles.cardContainer}>
        {/* Tires Card */}
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('Tires')}
        >
          <Image
            source={require('../assets/Continental/ultracontact.png')}
            style={styles.image}
            resizeMode="contain"
          />
          <Text style={styles.label}>Tires</Text>
        </TouchableOpacity>

        {/* Lubricants Card */}
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('Lubricant')}
        >
          <Image
            source={require('../assets/Lubricant/naftaliasup.png')}
            style={styles.image}
            resizeMode="contain"
          />
          <Text style={styles.label}>Lubricants</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFD600',
  },
  cardContainer: {
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FDF3C1',
    borderRadius: 16,
    padding: 10,
    alignItems: 'center',
    width: '90%',
    height: height * 0.4, // 40% of screen height
    marginVertical: 15,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  image: {
    width: '100%',
    height: '75%',
    borderRadius: 12,
  },
  label: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1B1F3B',
  },
});
