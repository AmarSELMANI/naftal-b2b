import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import NaftalNavbar from '../../NaftalBar';

const tireCategories = [
  {
    id: '1',
    label: 'Light Tires',
    screen: 'LightTires',
    icon: <FontAwesome5 name="car" size={32} color="#001853" />,
  },
  {
    id: '2',
    label: 'Heavy Tires',
    screen: 'HeavyTires',
    icon: <FontAwesome5 name="truck" size={36} color="#001853" />,
  },
  {
    id: '3',
    label: 'Agricultural Tires',
    screen: 'AgriculturalTires',
    icon: <FontAwesome5 name="tractor" size={36} color="#001853" solid />,
  },
];

export default function Tires() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <NaftalNavbar />
      <Text style={styles.title}>Tires</Text>

      <FlatList
        data={tireCategories}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate(item.screen)}
          >
            <View style={styles.icon}>{item.icon}</View>
            <Text style={styles.label}>{item.label}</Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFD600',
  },
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
  icon: {
    marginRight: 20,
  },
  label: {
    fontSize: 20,
    color: '#001853',
  },
});
