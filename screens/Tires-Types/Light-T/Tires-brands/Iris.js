import Checkbox from "expo-checkbox";
import { StatusBar } from "expo-status-bar";
import AntDesign from "@expo/vector-icons/AntDesign";
import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Image,
  Animated,
  PanResponder,
  Dimensions,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  FlatList,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import Naftalprev from './../../../../Naftalprev';
import ProductsCard from './../../../../Components/Procucts-Card'; 
const Tires = [
    {
        id:'1',
        name : "AURES 225/55 R 18",
        price : 9200,
        available: true,
        img : require('../../../../assets/Iris/aures.png')
    },
    {
        id:'2',
        name : "ECORIS 225/55 R 18",
        price : 8700,
        available: true,
        img : require('../../../../assets/Iris/ecoris.png')
    },
    {
        id:'3',
        name : "STORMY 225/55 R 18",
        price : 11000,
        available: true,
        img : require('../../../../assets/Iris/stormy.png')
    },
]
export default function Iris({ navigation }) {


    return(
        <SafeAreaView style={styles.container}>
        <Naftalprev/>
        <View style={styles.content}>
        <Text style={styles.title}>Iris</Text>
      </View>
      <FlatList 
  data={Tires}
  keyExtractor={(item) => item.id}
  numColumns={2}
  renderItem={({ item }) => <ProductsCard product={item} navigation={navigation} />}
/>

        </SafeAreaView>
    );
}
const styles = StyleSheet.create({
    container:{
        flex:1,
        backgroundColor:"#FFD600"
    },  
    content: {
        flex: 1,
        paddingHorizontal: 20, // Only apply padding to content
      },
      title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#334B7C',
        marginTop: 30,
        textAlign: 'center',
      },
})