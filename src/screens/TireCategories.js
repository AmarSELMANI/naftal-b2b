// The three tire categories.
//
// Replaces the hardcoded `tireCategories` array in screens/Tires-Types/tires.js,
// including its `screen:` field — categories now come from the API and every one
// routes to the same BrandList with its slug, so adding a fourth category to the
// database makes it appear here with no code change.

import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import NaftalNavbar from '../components/NaftalBar.js';
import { useCategories } from '../api/catalog.js';
import { useI18n } from '../i18n/index.js';
import { Loading, ErrorState } from '../components/States.js';

export default function TireCategories({ navigation }) {
  const { t, name } = useI18n();
  const { categories, isLoading, error, refetch } = useCategories('tires');

  return (
    <SafeAreaView style={styles.container}>
      <NaftalNavbar />
      <Text style={styles.title}>{t('catalog.tires')}</Text>

      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {!isLoading && !error && (
        <FlatList
          data={categories}
          keyExtractor={(c) => c.slug}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('BrandList', { categorySlug: item.slug })}
            >
              <View style={styles.icon}>
                {/* icon name comes from the database, matching the old screen */}
                <FontAwesome5 name={item.icon || 'circle'} size={34} color="#001853" solid />
              </View>
              <Text style={styles.label}>{name(item.name)}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFD600' },
  title: {
    fontSize: 35,
    fontWeight: 'bold',
    color: '#334B7C',
    marginBottom: 30,
    textAlign: 'center',
    marginTop: 30,
  },
  card: {
    backgroundColor: '#FDF3C1',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  icon: { marginRight: 20, width: 40, alignItems: 'center' },
  label: { fontSize: 20, color: '#001853' },
});
