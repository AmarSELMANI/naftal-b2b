import React from 'react';
import { View, Image, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';  // Import hook

export default function ProductsCard({ product }) {
  const navigation = useNavigation(); // Get navigation inside the component

  const handlePress = () => {
    navigation.navigate('ProductDetail', {
      name: product.name,
      image: product.img,
      price: product.price,
      available: product.available, // dynamic availability
    });
  };

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress}>
      <Image source={product.img} style={styles.image} resizeMode="contain" />
      <Text style={styles.model}>{product.name.split(' ')[0]}</Text>
      <Text style={styles.size}>{product.name.split(' ').slice(1).join(' ')}</Text>
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