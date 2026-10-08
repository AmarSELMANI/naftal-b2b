import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Naftalprev from './Naftalprev'; 

export default function NoTiresAvailable() {
  return (
    <SafeAreaView style={styles.container}>
      <Naftalprev />

      <View style={styles.content}>
        <Text style={styles.title}>No Tires Available</Text>
        <Text style={styles.subtitle}>
          We currently do not have any tires listed for this brand.
        </Text>
        <Text style={styles.note}>Please check back later or explore other brands.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFD600',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#334B7C',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#334B7C',
    marginBottom: 5,
  },
  note: {
    fontSize: 14,
    color: '#333',
    opacity: 0.7,
    textAlign: 'center',
    marginTop: 10,
  },
});
