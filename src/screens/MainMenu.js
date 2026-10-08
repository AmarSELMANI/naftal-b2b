// Home.
//
// Replaces screens/mainmenu.js, which hardcoded two cards with two bundled
// images. The cards are now the top-level categories from the API, each
// illustrated by one of its own products — so a third category added in the
// database appears here with no code change.

import React, { useMemo } from 'react';
import { Text, TouchableOpacity, StyleSheet, Image, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NaftalNavbar from '../components/NaftalBar.js';
import { useCatalog } from '../api/catalog.js';
import { resolveImageUrl } from '../api/config.js';
import { useI18n } from '../i18n/index.js';
import { Loading, ErrorState } from '../components/States.js';

const { height } = Dimensions.get('window');

/** First product image anywhere under a category, for the card illustration. */
function coverImage(node) {
  for (const b of node.brands ?? []) {
    const withImage = b.products?.find((p) => p.imageUrl);
    if (withImage) return resolveImageUrl(withImage.imageUrl);
  }
  for (const child of node.children ?? []) {
    const hit = coverImage(child);
    if (hit) return hit;
  }
  return null;
}

// Top-level slug -> the drawer route that shows it.
const ROUTE_FOR = { tires: 'Tires', lubricants: 'Lubricant' };

export default function MainMenu({ navigation }) {
  const { name } = useI18n();
  const { data, isLoading, error, refetch } = useCatalog();

  const cards = useMemo(
    () =>
      (data?.categories ?? [])
        .filter((c) => ROUTE_FOR[c.slug])
        .map((c) => ({ slug: c.slug, label: name(c.name), image: coverImage(c), route: ROUTE_FOR[c.slug] })),
    [data, name],
  );

  return (
    <SafeAreaView style={styles.container}>
      <NaftalNavbar />

      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {!isLoading && !error && (
        <ScrollView contentContainerStyle={styles.cardContainer}>
          {cards.map((c) => (
            <TouchableOpacity
              key={c.slug}
              style={styles.card}
              onPress={() => navigation.navigate(c.route)}
            >
              {c.image && (
                <Image source={{ uri: c.image }} style={styles.image} resizeMode="contain" />
              )}
              <Text style={styles.label}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFD600' },
  cardContainer: { alignItems: 'center', padding: 20 },
  card: {
    backgroundColor: '#FDF3C1',
    borderRadius: 16,
    padding: 10,
    alignItems: 'center',
    width: '90%',
    height: height * 0.4,
    marginVertical: 15,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  image: { width: '100%', height: '75%', borderRadius: 12 },
  label: { marginTop: 10, fontSize: 20, fontWeight: 'bold', color: '#1B1F3B' },
});
