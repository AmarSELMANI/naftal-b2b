import React from 'react';
import { View, Image, Text, StyleSheet,TouchableOpacity } from 'react-native';

export default function TireBrandCard({ brand, navigation }) {
  const handlePress = () => {
    switch (brand.name) {
      case 'IRIS':
        navigation.navigate('Iris');
        break;
      case 'Continental':
        navigation.navigate('Continental'); 
        break;
      case 'Semperit':
        navigation.navigate('Semperit');
        break;
        case 'SemperitH':
        navigation.navigate('SemperitH');
        break;
        case 'IrisH':
        navigation.navigate('IrisH');
        break;
        case 'ContinentalH':
        navigation.navigate('ContinentalH');
        break;
        case 'ContinentalA':
        navigation.navigate('ContinentalA');
        break;
        case 'IrisA':
          navigation.navigate('prodnf');
          break;
        case 'SemperitA':
            navigation.navigate('SemperitA');
          break;
      default:
        break;
    }
    
  };

   return (
    <TouchableOpacity style={styles.card} onPress={handlePress}>
      <Image source={brand.img} style={styles.image} resizeMode="contain" />
      <Text style={styles.model}>{brand.name.split(' ')[0]}</Text>
      <Text style={styles.size}>{brand.name.split(' ').slice(1).join(' ')}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FDF3C1',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '45%',
    aspectRatio: 1,
    margin: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  image: {
    width: 75,
    height: 75,
    marginBottom: 12,
  },
  model: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1B1F3B',
    marginBottom: 4,
  },
  size: {
    fontSize: 14,
    color: '#1B1F3B',
    opacity: 0.8,
  },
});