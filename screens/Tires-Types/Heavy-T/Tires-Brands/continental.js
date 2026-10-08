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
import Naftalprev from "../../../../Naftalprev";
import ProductsCard from '../../../../Components/Procucts-Card'; 
const Tires = [
    {
        id:'1',
        name : "HDL-3-EP 11 R 22.5 144/142L",
        img : require('../../../../assets/Continental/CHDL3EP_L3Q.png'),
        price : 13500,
        available : true 
    },
    {
        id:'2',
        name : "HAU-5 305/85 R 22.5	152/149K",
        img : require('../../../../assets/Continental/CHAU5_L3Q.png'),
        price : 15500,
        available : false
    },
    {
        id:'3',
        name : "HCS 445/65 R 22.5 169K",
        img : require('../../../../assets/Continental/HCS.png'),
        price : 17000,
        available : true 
    },
]
export default function ContinentalH({navigation}){

    return(
        <SafeAreaView style={styles.container}>
        <Naftalprev/>
        <View style={styles.content}>
        <Text style={styles.title}>Continental</Text>
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