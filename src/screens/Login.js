// Login.
//
// Replaces Login.js, whose handleLogin was `navigation.replace('Drawer')` with
// no check at all. Now it authenticates, stores the session in SecureStore, and
// routes on what the server says about the company:
//
//   approved           -> Drawer
//   pending / denied   -> Wait, which shows the real decision
//
// A pending applicant still logs in successfully and receives an
// onboarding-scoped token (§6), which is why this is a routing decision rather
// than an error.

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api } from '../api/client.js';
import { saveSession } from '../api/session.js';
import { registerForPush } from '../api/push.js';
import { useI18n } from '../i18n/index.js';
import naftalLogo from '../../assets/naf.png';

export default function LoginScreen() {
  const navigation = useNavigation();
  const { t, lang, setLang } = useI18n();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      const session = await api.login(username.trim(), password);
      await saveSession(session);

      // Fire-and-forget: a device that cannot register for push (Expo Go,
      // simulator, permission refused) must still reach the app.
      registerForPush({ language: lang }).catch(() => {}); // never block sign-in

      if (session.company?.approvalStatus === 'approved' || session.user.role !== 'customer') {
        navigation.replace('Drawer');
      } else {
        navigation.replace('Wait', {
          username: session.user.firstName,
          approvalStatus: session.company?.approvalStatus,
        });
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.langRow}>
        {['fr', 'en'].map((l) => (
          <TouchableOpacity
            key={l}
            onPress={() => setLang(l)}
            style={[styles.langBtn, lang === l && styles.langBtnOn]}
          >
            <Text style={[styles.langText, lang === l && styles.langTextOn]}>{l.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Image source={naftalLogo} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>{t('auth.login')}</Text>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.form}
      >
        {!!error && <Text style={styles.error}>{t(`err.${error.code ?? 'UNKNOWN'}`)}</Text>}

        <View style={styles.inputContainer}>
          <Ionicons name="person-outline" size={20} color="#334B7C" style={styles.icon} />
          <TextInput
            placeholder={t('auth.username')}
            placeholderTextColor="#888"
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
          />
        </View>

        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed-outline" size={20} color="#334B7C" style={styles.icon} />
          <TextInput
            placeholder={t('auth.password')}
            placeholderTextColor="#888"
            secureTextEntry
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            textContentType="password"
            onSubmitEditing={handleLogin}
          />
        </View>

        <Text style={styles.forgot}>{t('auth.forgot')}</Text>

        <TouchableOpacity
          style={[styles.button, (busy || !username || !password) && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={busy || !username || !password}
        >
          {busy ? (
            <ActivityIndicator color="#FFD600" />
          ) : (
            <Text style={styles.buttonText}>{t('auth.signIn')}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={styles.link}>{t('auth.noAccount')}</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFD600', alignItems: 'center', paddingHorizontal: 20 },
  langRow: { flexDirection: 'row', alignSelf: 'flex-end', marginTop: 8, gap: 6 },
  langBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#334B7C' },
  langBtnOn: { backgroundColor: '#334B7C' },
  langText: { color: '#334B7C', fontWeight: 'bold', fontSize: 12 },
  langTextOn: { color: '#FFD600' },
  logo: { width: 120, height: 120, marginTop: 4 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#334B7C', marginVertical: 24 },
  form: { width: '100%', alignItems: 'center' },
  error: {
    color: '#b3261e',
    backgroundColor: '#fdeceb',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 16,
    textAlign: 'center',
    width: '100%',
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
  icon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: '#001853' },
  forgot: { color: '#334B7C', fontSize: 14, marginTop: 4, marginBottom: 26, alignSelf: 'flex-end' },
  button: {
    backgroundColor: '#334B7C',
    paddingVertical: 15,
    paddingHorizontal: 80,
    borderRadius: 12,
    elevation: 5,
    minWidth: 220,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFD600', fontSize: 18, fontWeight: 'bold' },
  link: { color: '#334B7C', fontSize: 14, marginTop: 22, textDecorationLine: 'underline' },
});
