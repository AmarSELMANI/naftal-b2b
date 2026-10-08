import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';


// Replace with your actual image path7
import naftalLogo from './assets/naf.png';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigation = useNavigation();
  const handleLogin = () => {
    // You can add validation logic here
    navigation.replace('Drawer');
    ('Drawer'); // This should match your screen name in the navigator
  };


  return (
    <SafeAreaView style={styles.container}>
      <Image source={naftalLogo} style={styles.logo} resizeMode="contain" />

      <Text style={styles.title}>Login</Text>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.form}
      >
        <View style={styles.inputContainer}>
          <Ionicons name="person-outline" size={20} color="#334B7C" style={styles.icon} />
          <TextInput
            placeholder="Username"
            placeholderTextColor="#888"
            style={styles.input}
            value={username}
            onChangeText={setUsername}
          />
        </View>

        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed-outline" size={20} color="#334B7C" style={styles.icon} />
          <TextInput
            placeholder="Password"
            placeholderTextColor="#888"
            secureTextEntry
            style={styles.input}
            value={password}
            onChangeText={setPassword}
          />
        </View>

        <Text style={styles.forgot}>Forgot your password?</Text>

        <TouchableOpacity style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>Login</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#FFD600',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    logo: {
      width: 120,
      height: 120,
      marginTop: 20,
    },
    title: {
      fontSize: 32,
      fontWeight: 'bold',
      color: '#334B7C',
      marginVertical: 30,
    },
    form: {
      width: '100%',
      alignItems: 'center',
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: '#334B7C',
      marginBottom: 20,
      width: '100%',
      paddingVertical: 6,
    },
    icon: {
      marginRight: 10,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: '#001853',
    },
    forgot: {
      color: '#334B7C',
      fontSize: 14,
      marginTop: 10,
      marginBottom: 30,
      alignSelf: 'flex-end',
    },
    button: {
      backgroundColor: '#334B7C',
      paddingVertical: 15,
      paddingHorizontal: 80,
      borderRadius: 12,
      elevation: 5,
    },
    buttonText: {
      color: '#FFD600',
      fontSize: 18,
      fontWeight: 'bold',
    },
  });
  