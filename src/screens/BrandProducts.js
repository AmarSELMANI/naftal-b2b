// Products of one brand within one category.
//
// Replaces EIGHT byte-for-byte identical files:
//   Light-T/Tires-brands/{continental,Iris,semperit}.js
//   Heavy-T/Tires-Brands/{continental,Iris,semperit}.js
//   Agriculture/Tire-Brands/{Continental,Semperit}.js
// They differed only in a `const Tires` array and a title string. Both now come
// from route params and the API.

import React from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Naftalprev from '../components/Naftalprev.js';
import { useBrandProducts } from '../api/catalog.js';
import { useI18n } from '../i18n/index.js';
import { Loading, ErrorState, EmptyProducts } from '../components/States.js';

export default function BrandProducts({ route }) {
  const { categorySlug, brandSlug, brandName } = route.params;
  const { t, money } = useI18n();
  const { products, brand, isLoading, error, refetch } = useBrandProducts(categorySlug, brandSlug);

  const body = () => {
    if (isLoading) return <Loading />;
    if (error) return <ErrorState error={error} onRetry={refetch} />;
    // Reached because the brand genuinely carries nothing here — which is the
    // real situation for Iris in agricultural tires.
    if (products.length === 0) return <EmptyProducts />;

    return (
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        numColumns={2}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <ProductCard product={item} t={t} money={money} />}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Naftalprev />
      <Text style={styles.title}>{brand?.name ?? brandName}</Text>
      {body()}
    </SafeAreaView>
  );
}

function ProductCard({ product, t, money }) {
  const navigation = useNavigation();

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ProductDetail', { productId: product.id })}
    >
      <Image source={{ uri: product.imageUrl }} style={styles.image} resizeMode="contain" />
      {/* model and size are separate columns now, so no more name.split(' ') */}
      <Text style={styles.model} numberOfLines={1}>{product.model}</Text>
      <Text style={styles.size} numberOfLines={1}>
        {[product.size, product.loadSpeedIndex].filter(Boolean).join(' ')}
      </Text>
      <Text style={styles.price}>{money(product.unitPrice)}</Text>
      <Text style={[styles.stock, { color: product.inStock ? '#1a7f46' : '#b3261e' }]}>
        {product.inStock ? t('catalog.inStock') : t('catalog.outOfStock')}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFD600' },
  list: { paddingHorizontal: 10, paddingBottom: 20 },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#334B7C',
    marginTop: 30,
    marginBottom: 10,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#FDF3C1',
    borderRadius: 20,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '45%',
    margin: 10,
    minHeight: 200,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  image: { width: 75, height: 75, marginBottom: 10 },
  model: { fontSize: 16, fontWeight: 'bold', color: '#1B1F3B', textAlign: 'center' },
  // Fixed height so a product with no size (e.g. MPT81) still occupies the
  // same card height as one with a size, keeping the grid rows aligned.
  size: {
    fontSize: 13,
    lineHeight: 18,
    height: 18,
    color: '#1B1F3B',
    opacity: 0.8,
    textAlign: 'center',
    marginBottom: 6,
  },
  price: { fontSize: 15, fontWeight: '600', color: '#001853' },
  stock: { fontSize: 12, marginTop: 4, fontWeight: '600' },
});
