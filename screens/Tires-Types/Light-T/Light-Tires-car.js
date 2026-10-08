import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Naftalprev from '../../../Naftalprev';
import TireBrandCard from '../../../Components/Card'; 

const Brands = [
  {
    id: '1',
    name: "IRIS",
    img: require('../../../assets/Iris.png'),
  },
  {
    id: '2',
    name: "Continental",
    img: require('../../../assets/Continental.png'),
  },
  {
    id: '3',
    name: "Semperit",
    img: require('../../../assets/semperit.png'),
  }
];

export default function LightTires({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <Naftalprev />

      <FlatList
        data={Brands}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.listContainer}
        ListHeaderComponent={
          <Text style={styles.title}>Tires Brands</Text>
        }
        renderItem={({ item }) => <TireBrandCard brand={item} navigation={navigation} />}
        />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFD600',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#334B7C',
    marginTop: 30,
    marginBottom: 20,
    textAlign: 'center',
  },
});
