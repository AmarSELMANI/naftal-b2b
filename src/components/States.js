// Loading / error / empty states.
//
// The old screens had none of these, because a `const` array cannot fail. Real
// data can, so every list screen needs all three and they should look the same
// everywhere.

import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { useI18n } from '../i18n/index.js';

export function Loading({ label }) {
  const { t } = useI18n();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#001853" />
      <Text style={styles.muted}>{label ?? t('catalog.loading')}</Text>
    </View>
  );
}

export function ErrorState({ error, onRetry }) {
  const { t } = useI18n();
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{t(`err.${error?.code ?? 'UNKNOWN'}`)}</Text>
      {onRetry && (
        <TouchableOpacity style={styles.button} onPress={onRetry}>
          <Text style={styles.buttonText}>{t('catalog.retry')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Replaces the old productnf.js — now reached because a brand genuinely has
 *  zero products, not because it was hardcoded for Iris/Agricultural. */
export function EmptyProducts() {
  const { t } = useI18n();
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{t('catalog.empty.title')}</Text>
      <Text style={styles.body}>{t('catalog.empty.body')}</Text>
      <Text style={styles.hint}>{t('catalog.empty.hint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#334B7C',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: { fontSize: 16, color: '#334B7C', textAlign: 'center', marginBottom: 6 },
  hint: { fontSize: 14, color: '#333', opacity: 0.7, textAlign: 'center', marginTop: 8 },
  muted: { marginTop: 12, color: '#334B7C', fontSize: 15 },
  button: {
    marginTop: 18,
    backgroundColor: '#334B7C',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  buttonText: { color: '#FFD600', fontWeight: 'bold', fontSize: 16 },
});
