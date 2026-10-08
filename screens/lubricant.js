import React from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import NaftalNavbar from '../NaftalBar';
import LubeCard from '../Components/LubeCard';
const Lube = [
  {
    id: '1',
    name: 'Naftalia Super',
    img : require('../assets/Lubricant/naftaliasup.png'),
    price : 7800,
    available : true 
  },
  {
    id: '2',
    name: 'Total Quartz',
    img : require('../assets/Lubricant/quartz.png'),
    price : 7800,
    available : true 
  },
  {
    id: '3',
    name: 'Total Rubia',
    img : require('../assets/Lubricant/rubia.png'),
    price : 7800,
    available : true 
  },
];

export default function Lubricant({navigation}) {
  return (
    <SafeAreaView style={styles.container}>
      <NaftalNavbar/>

      {/* Title */}
      <Text style={styles.title}>Lubricant</Text>

      {/* Luberificant List */}
      <FlatList
       data={Lube}
         keyExtractor={(item) => item.id}
         numColumns={2}
         renderItem={({ item }) => <LubeCard product={item} navigation={navigation} />}
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
});
