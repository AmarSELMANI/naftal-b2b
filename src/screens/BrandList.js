// Brands within one tire category.
//
// Replaces THREE near-identical files — Light-T/Light-Tires-car.js,
// Heavy-T/Heavy-T-Brands.js and Agriculture/Agricultural-T-Brands.js — which
// differed only by their hardcoded `Brands` array and the screen each card
// navigated to. The category now arrives as a route param and the brands come
// from the API.

import React from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Naftalprev from '../components/Naftalprev.js';
import { useBrands } from '../api/catalog.js';
import { resolveImageUrl } from '../api/config.js';
import { useI18n } from '../i18n/index.js';
import { Loading, ErrorState } from '../components/States.js';

export default function BrandList({ route, navigation }) {
  const { categorySlug } = route.params;
  const { t, name } = useI18n();
  const { brands, category, isLoading, error, refetch } = useBrands(categorySlug);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Naftalprev />
        <Loading />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <Naftalprev />
        <ErrorState error={error} onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Naftalprev />
      <FlatList
        data={brands}
        keyExtractor={(b) => b.slug}
        numColumns={2}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.title}>{category ? name(category.name) : t('catalog.brands')}</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              navigation.navigate('BrandProducts', {
                categorySlug,
                brandSlug: item.slug,
                brandName: item.name,
              })
            }
          >
            {item.logoUrl ? (
              <Image
                source={{ uri: resolveImageUrl(item.logoUrl) }}
                style={styles.image}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.image} />
            )}
            <Text style={styles.model}>{item.name}</Text>
            {/* The count is what lets the empty state be honest rather than hardcoded */}
            <Text style={styles.count}>
              {item.productCount}{' '}
              {item.productCount === 1 ? t('catalog.product') : t('catalog.products')}
            </Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFD600' },
  list: { paddingHorizontal: 20, paddingBottom: 20 },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#334B7C',
    marginTop: 30,
    marginBottom: 20,
    textAlign: 'center',
  },
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
  image: { width: 75, height: 75, marginBottom: 12 },
  model: { fontSize: 18, fontWeight: 'bold', color: '#1B1F3B', marginBottom: 4 },
  count: { fontSize: 13, color: '#1B1F3B', opacity: 0.7 },
});
