import "react-native-gesture-handler";
import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import MainMenu from './screens/mainmenu';
import Tires from "./screens/Tires-Types/tires";
import Lubricant from "./screens/lubricant";
import LightTires from "./screens/Tires-Types/Light-T/Light-Tires-car";
import HeavyTires from "./screens/Tires-Types/Heavy-T/Heavy-T-Brands";
import AgriculturalTires from "./screens/Tires-Types/Agriculture/Agricultural-T-Brands";
import {
  CardStyleInterpolators,
  TransitionSpecs,
} from '@react-navigation/stack';
import Continental from "./screens/Tires-Types/Light-T/Tires-brands/continental";
import Iris from "./screens/Tires-Types/Light-T/Tires-brands/Iris";
import Semperit from "./screens/Tires-Types/Light-T/Tires-brands/semperit";
import ProductDetail from './screens/Tires-Types/Light-T/Tires-brands/ProductDetail';
import LoginScreen from "./Login";
import Register from "./Register";
import Wait from "./Wait";
import ContinentalH from "./screens/Tires-Types/Heavy-T/Tires-Brands/continental";
import SemperitH from "./screens/Tires-Types/Heavy-T/Tires-Brands/semperit";
import IrisH from "./screens/Tires-Types/Heavy-T/Tires-Brands/Iris";
import ContinentalA from "./screens/Tires-Types/Agriculture/Tire-Brands/Continental";
import SemperitA from "./screens/Tires-Types/Agriculture/Tire-Brands/Semperit";
import NoTiresAvailable from "./productnf";
import Orders from "./orders";
const Drawer = createDrawerNavigator();
const Stack = createNativeStackNavigator(); // ✅ Create the stack navigator

function DrawerNavigator() {
  return (
    <Drawer.Navigator
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: '#001853',
          width: "100%",
          height: "100%",
          marginTop: StatusBar.currentHeight,
        },
        drawerLabelStyle: {
          fontSize: 25,
          fontWeight: 'bold',
        },
        drawerActiveTintColor: '#FFD700',
        drawerInactiveTintColor: '#fff',
      }}
    >
      <Drawer.Screen name="Home" component={MainMenu} />
      <Drawer.Screen name="Tires" component={Tires} />
      <Drawer.Screen name="Lubricant" component={Lubricant} />
      <Drawer.Screen name="Orders" component={Orders} />

    </Drawer.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
      initialRouteName="Register"
      screenOptions={{ headerShown: false,
                                        animation: 'fade_from_bottom', // Add custom transition animation here
                                        animationDuration: 300, // Adjust duration if needed
                                        gestureEnabled: true // Enable native gestures

       }}>
        <Stack.Screen name="Tires" component={Tires}/>
        <Stack.Screen name="Register" component={Register}/>
        <Stack.Screen name="LoginScreen" component={LoginScreen}/>
        <Stack.Screen name="Drawer" component={DrawerNavigator} />
        <Stack.Screen name="LightTires" component={LightTires} />
        <Stack.Screen name="HeavyTires" component={HeavyTires} />
        <Stack.Screen name="AgriculturalTires" component={AgriculturalTires} />
        <Stack.Screen name="Continental" component={Continental} />
        <Stack.Screen name="Iris" component={Iris} />
        <Stack.Screen name="Semperit" component={Semperit} />
        <Stack.Screen name="ProductDetail" component={ProductDetail} />
        <Stack.Screen name="Wait" component={Wait} />
        <Stack.Screen name="ContinentalH" component={ContinentalH}/>
        <Stack.Screen name="SemperitH" component={SemperitH}/>
        <Stack.Screen name="IrisH" component={IrisH}/>
        <Stack.Screen name="ContinentalA" component={ContinentalA}/>
        <Stack.Screen name="SemperitA" component={SemperitA}/>
        <Stack.Screen name="prodnf" component={NoTiresAvailable}/>

      </Stack.Navigator>
    </NavigationContainer>
  );
}
