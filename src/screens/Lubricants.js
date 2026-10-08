// Lubricants.
//
// Replaces the hardcoded `Lube` array in screens/lubricant.js. Lubricants have
// no brand drill-down in the UI, so every brand's products in the category are
// flattened into one grid — which is exactly what the old screen showed.

import React, { useMemo } from 'react';
import { Text, StyleSheet, FlatList, Image, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import NaftalNavbar from '../components/NaftalBar.js';
import { useBrands } from '../api/catalog.js';
import { resolveImageUrl } from '../api/config.js';
import { useI18n } from '../i18n/index.js';
import { Loading, ErrorState, EmptyProducts } from '../components/States.js';

export default function Lubricants() {
  const { t, money } = useI18n();
  const navigation = useNavigation();
  const { brands, isLoading, error, refetch } = useBrands('lubricants');

  const products = useMemo(
    () =>
      brands.flatMap((b) =>
        b.products.map((p) => ({ ...p, brandName: b.name, imageUrl: resolveImageUrl(p.imageUrl) })),
      ),
    [brands],
  );

  const body = () => {
    if (isLoading) return <Loading />;
    if (error) return <ErrorState error={error} onRetry={refetch} />;
    if (products.length === 0) return <EmptyProducts />;

    return (
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        numColumns={2}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
          >
            <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="contain" />
            <Text style={styles.model} numberOfLines={2}>{item.model}</Text>
            <Text style={styles.price}>{money(item.unitPrice)}</Text>
            <Text style={[styles.stock, { color: item.inStock ? '#1a7f46' : '#b3261e' }]}>
              {item.inStock ? t('catalog.inStock') : t('catalog.outOfStock')}
            </Text>
          </TouchableOpacity>
        )}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <NaftalNavbar />
      <Text style={styles.title}>{t('catalog.lubricants')}</Text>
      {body()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFD600' },
  list: { paddingHorizontal: 10, paddingBottom: 20 },
  title: {
    fontSize: 35,
    fontWeight: 'bold',
    color: '#334B7C',
    marginBottom: 20,
    textAlign: 'center',
    marginTop: 30,
  },
  card: {
    backgroundColor: '#FDF3C1',
    borderRadius: 20,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '45%',
    margin: 10,
    minHeight: 190,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  image: { width: 75, height: 75, marginBottom: 10 },
  model: { fontSize: 15, fontWeight: 'bold', color: '#1B1F3B', textAlign: 'center', marginBottom: 6 },
  price: { fontSize: 15, fontWeight: '600', color: '#001853' },
  stock: { fontSize: 12, marginTop: 4, fontWeight: '600' },
});
