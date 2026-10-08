import React from 'react';
import { ScrollView } from 'react-native';
import ProductCard from '../../../../../../Components/ProductCard';

export default function ProductListScreen() {
  return (
    <ScrollView>
      <ProductCard
        name="Tire Aures 16-inch"
        price={120.99}
        available={true}
        image={require('../assets/tires/aures.png')}
        onBuy={() => alert('Buying Aures tire')}
      />
      <ProductCard
        name="Tire Stormy 18-inch"
        price={150.50}
        available={false}
        image={require('../assets/tires/stormy.png')}
        onBuy={() => alert('Buying Stormy tire')}
      />
    </ScrollView>
  );
}
