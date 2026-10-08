import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Tires from './tires'; // screen with cards
import LightTires from './Light-T/Light-Tires-car';
import HeavyTires from './Heavy-T/Heavy-T-Brands';
import AgriculturalTires from './Agriculture/Agricultural-T-Brands';

const Stack = createNativeStackNavigator();

export default function TiresStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="TiresMain" component={Tires} />
      <Stack.Screen name="LightTires" component={LightTires} />
      <Stack.Screen name="HeavyTires" component={HeavyTires} />
      <Stack.Screen name="AgriculturalTires" component={AgriculturalTires} />
    </Stack.Navigator>
  );
}
