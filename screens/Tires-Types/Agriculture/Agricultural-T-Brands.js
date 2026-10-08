import React from 'react';
import { View, Text, StyleSheet, FlatList} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Naftalprev from '../../../Naftalprev';
import TireBrandCard from '../../../Components/Card'; 

const Brands =[
    {
        id:'1',
        name:"IrisA",
        img: require('../../../assets/Iris.png'),
      },
      {
        id:'2',
        name:"ContinentalA",
        img: require('../../../assets/Continental.png'),
      },
      {
        id:'3',
        name:"SemperitA",
        img: require('../../../assets/semperit.png'),
      }
]
export default function AgriculturalTires({navigation}) {
  return (
    <SafeAreaView style={styles.container}>
      <Naftalprev />

      {/* Page content */}
      <View style={styles.content}>
        <Text style={styles.title}>Tires Brands</Text>
        {/* Add more content here */}
      </View>
      <FlatList data={Brands}
                keyExtractor={(item)=> item.id}
                numColumns={2}
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
  content: {
    flex: 1,
    paddingHorizontal: 20, // Only apply padding to content
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#334B7C',
    marginTop: 30,
    textAlign: 'center',
  },
});
