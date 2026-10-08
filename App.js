// App shell and navigation.
//
// The previous version (kept as App.legacy.js for reference) registered 18
// screens, 8 of which were the same brand-products screen duplicated per brand
// and 3 the same brand-list screen duplicated per tire category. Those 11 are
// now two parameterised routes: BrandList and BrandProducts.
//
// Providers, outermost first:
//   QueryClientProvider — caching, retries, loading/error state for the API
//   I18nProvider        — FR/EN, opening in the phone's own language

import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { I18nProvider, useI18n } from './src/i18n/index.js';

import MainMenu from './src/screens/MainMenu';
import TireCategories from './src/screens/TireCategories';
import Lubricants from './src/screens/Lubricants';
import BrandList from './src/screens/BrandList';
import BrandProducts from './src/screens/BrandProducts';
import ProductDetail from './src/screens/ProductDetail';

import Bootstrap from './src/screens/Bootstrap';
import LoginScreen from './src/screens/Login';
import Register from './src/screens/Register';
import Wait from './src/screens/Wait';
import Orders from './src/screens/Orders';

const Drawer = createDrawerNavigator();
const Stack = createNativeStackNavigator();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A mobile network drops requests; two retries is the right amount of
      // patience before showing an error the user can retry themselves.
      retry: 2,
      refetchOnWindowFocus: false,
      // The catalog is served with a 60s server cache and an ETag, so refetching
      // on every screen focus would mostly collect 304s. Let staleTime decide.
      refetchOnMount: false,
    },
  },
});

function DrawerNavigator() {
  const { t } = useI18n();

  return (
    <Drawer.Navigator
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: '#001853',
          width: '100%',
          height: '100%',
          marginTop: StatusBar.currentHeight,
        },
        drawerLabelStyle: { fontSize: 25, fontWeight: 'bold' },
        drawerActiveTintColor: '#FFD700',
        drawerInactiveTintColor: '#fff',
      }}
    >
      <Drawer.Screen name="Home" component={MainMenu} options={{ title: t('nav.home') }} />
      <Drawer.Screen name="Tires" component={TireCategories} options={{ title: t('nav.tires') }} />
      <Drawer.Screen name="Lubricant" component={Lubricants} options={{ title: t('nav.lubricants') }} />
      <Drawer.Screen name="Orders" component={Orders} options={{ title: t('nav.orders') }} />
    </Drawer.Navigator>
  );
}

function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Bootstrap"
        screenOptions={{
          headerShown: false,
          animation: 'fade_from_bottom',
          animationDuration: 300,
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name="Bootstrap" component={Bootstrap} />
        <Stack.Screen name="Register" component={Register} />
        <Stack.Screen name="LoginScreen" component={LoginScreen} />
        <Stack.Screen name="Wait" component={Wait} />
        <Stack.Screen name="Drawer" component={DrawerNavigator} />

        {/* These two replace the 11 per-brand / per-category screens. */}
        <Stack.Screen name="BrandList" component={BrandList} />
        <Stack.Screen name="BrandProducts" component={BrandProducts} />
        <Stack.Screen name="ProductDetail" component={ProductDetail} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RootNavigator />
      </I18nProvider>
    </QueryClientProvider>
  );
}
