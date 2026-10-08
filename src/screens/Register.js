// Account request.
//
// Replaces Register.js, which rendered eight TextInputs that were bound to
// nothing, a document picker that only console.logged, and a submit button whose
// handler was:
//
//     navigation.replace('Wait', { username: 'JohnDoe', isApproved: true })
//
// The welcome sequence and the drag-up gesture are kept — they are the app's
// identity — but every field is now bound, validated, and submitted to
// POST /auth/register, and the five documents actually upload.

import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet, Text, View, Image, Animated, PanResponder, Dimensions,
  TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import Checkbox from 'expo-checkbox';
import AntDesign from '@expo/vector-icons/AntDesign';
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '../api/client.js';
import { saveSession } from '../api/session.js';
import { uploadDocument, DOCUMENT_KINDS } from '../api/onboarding.js';
import { registerForPush } from '../api/push.js';
import { useI18n } from '../i18n/index.js';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const FORM_HEIGHT = SCREEN_HEIGHT * 0.8;
const RECTANGLE_HEIGHT = 15;
const RECTANGLE_MARGIN = 20;

export default function Register() {
  const navigation = useNavigation();
  const { t, lang, setLang } = useI18n();

  // --- form state -------------------------------------------------------
  const [form, setForm] = useState({
    firstName: '', lastName: '', username: '', password: '',
    email: '', phone: '', enterpriseName: '', enterpriseStatus: '',
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const [documents, setDocuments] = useState({}); // kind -> picked file
  const [isChecked, setIsChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldError, setFieldError] = useState(null);

  // --- welcome animation (unchanged behaviour) --------------------------
  const progress = useRef(new Animated.Value(0)).current;
  const secondTextOpacity = useRef(new Animated.Value(0)).current;
  const thirdTextOpacity = useRef(new Animated.Value(0)).current;
  const rectangleOpacity = useRef(new Animated.Value(0)).current;
  const [showSecondText, setShowSecondText] = useState(false);
  const [showThirdText, setShowThirdText] = useState(false);

  const dragY = useRef(new Animated.Value(0)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(FORM_HEIGHT)).current;

  const pickDocument = async (kind) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
      });
      // SDK 49+ returns { canceled, assets[] }; older returns { type: 'success' }
      const asset = res?.assets?.[0] ?? (res?.type === 'success' ? res : null);
      if (!asset || res?.canceled) return;
      setDocuments((d) => ({ ...d, [kind]: asset }));
    } catch {
      setError({ code: 'UNKNOWN' });
    }
  };

  const validate = () => {
    if (!form.firstName.trim() || !form.lastName.trim()) return 'name';
    if (form.username.trim().length < 3) return 'username';
    if (form.password.length < 8) return 'password';
    if (!form.enterpriseName.trim()) return 'enterprise';
    if (!isChecked) return 'terms';
    return null;
  };

  const submit = async () => {
    const bad = validate();
    if (bad) { setFieldError(bad); return; }

    setBusy(true);
    setError(null);
    setFieldError(null);

    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        username: form.username.trim(),
        password: form.password,
        enterpriseName: form.enterpriseName.trim(),
        termsAccepted: true,
      };
      // Optional fields are omitted entirely rather than sent empty — the API
      // validates `email` as a format, and "" is not a valid email.
      if (form.email.trim()) payload.email = form.email.trim();
      if (form.phone.trim()) payload.phone = form.phone.trim();
      if (form.enterpriseStatus.trim()) payload.enterpriseStatus = form.enterpriseStatus.trim();

      const session = await api.register(payload);
      await saveSession(session);

      // Subscribed while still pending, because the approval push is the whole
      // point and it arrives before the account is approved.
      registerForPush({ language: lang });

      // Documents upload after registration, because they attach to the account
      // request that registration creates. A failed upload must not lose the
      // request — the applicant can add the missing piece later.
      for (const kind of Object.keys(documents)) {
        try {
          await uploadDocument({
            accountRequestId: session.accountRequestId,
            kind,
            file: documents[kind],
          });
        } catch { /* reported on the Wait screen as a missing document */ }
      }

      navigation.replace('Wait', { username: session.user.firstName });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const newY = Math.max(-FORM_HEIGHT + RECTANGLE_MARGIN, -g.dy);
        dragY.setValue(newY);
        formOpacity.setValue(Math.min(1, -newY / (FORM_HEIGHT - RECTANGLE_MARGIN)));
        formTranslateY.setValue(FORM_HEIGHT + newY - RECTANGLE_MARGIN);
      },
      onPanResponderRelease: (_, g) => {
        const open = g.vy < -0.5 || -g.dy > (FORM_HEIGHT - RECTANGLE_MARGIN) / 2;
        Animated.parallel([
          Animated.spring(dragY, { toValue: open ? -FORM_HEIGHT + RECTANGLE_MARGIN : 0, useNativeDriver: true }),
          Animated.spring(formOpacity, { toValue: open ? 1 : 0, useNativeDriver: true }),
          Animated.spring(formTranslateY, { toValue: open ? RECTANGLE_MARGIN : FORM_HEIGHT, useNativeDriver: true }),
        ]).start();
      },
    }),
  ).current;

  useEffect(() => {
    const timers = [];
    Animated.timing(progress, { toValue: 1, duration: 2000, useNativeDriver: false }).start();

    timers.push(setTimeout(() => {
      Animated.timing(progress, { toValue: 0, duration: 2000, useNativeDriver: false }).start();

      timers.push(setTimeout(() => {
        setShowSecondText(true);
        Animated.timing(secondTextOpacity, { toValue: 1, duration: 2000, useNativeDriver: false }).start();

        timers.push(setTimeout(() => {
          Animated.timing(secondTextOpacity, { toValue: 0, duration: 2000, useNativeDriver: false }).start();

          timers.push(setTimeout(() => {
            setShowSecondText(false);
            setShowThirdText(true);
            Animated.timing(thirdTextOpacity, { toValue: 1, duration: 2000, useNativeDriver: false }).start();
            Animated.timing(rectangleOpacity, { toValue: 1, duration: 2000, useNativeDriver: false }).start();
          }, 2000));
        }, 2000));
      }, 2000));
    }, 2000));

    // The original captured timer2..4 in inner scopes, so the cleanup only ever
    // cleared timer1 and the rest fired after unmount.
    return () => timers.forEach(clearTimeout);
  }, []);

  const field = (key, placeholder, extra = {}) => (
    <TextInput
      style={[styles.textInput, fieldError === key && styles.inputBad]}
      placeholder={placeholder}
      placeholderTextColor="#888"
      value={form[key]}
      onChangeText={set(key)}
      {...extra}
    />
  );

  return (
    <SafeAreaProvider>
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

        <Image source={require('../../assets/naf.png')} style={styles.img} resizeMode="contain" />

        <View style={styles.centerContainer}>
          <Animated.View style={[styles.textContainer, { opacity: progress }]}>
            <Text style={styles.text}>{t('register.welcome')}</Text>
          </Animated.View>

          {showSecondText && (
            <Animated.View style={[styles.textContainer, { opacity: secondTextOpacity }]}>
              <Text style={styles.secondText}>{t('register.private')}</Text>
            </Animated.View>
          )}

          {showThirdText && (
            <Animated.View style={[styles.textContainer, { opacity: thirdTextOpacity }]}>
              <Text style={styles.secondText}>{t('register.scrollUp')}</Text>
            </Animated.View>
          )}
        </View>

        <Animated.View
          style={[
            styles.formContainer,
            { opacity: formOpacity, transform: [{ translateY: formTranslateY }] },
          ]}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {!!error && (
              <Text style={styles.errorBox}>{t(`err.${error.code ?? 'UNKNOWN'}`)}</Text>
            )}
            {!!fieldError && (
              <Text style={styles.errorBox}>{t(`register.invalid.${fieldError}`)}</Text>
            )}

            {field('firstName', t('register.name'))}
            {field('lastName', t('register.surname'))}
            {field('username', t('auth.username'), { autoCapitalize: 'none', autoCorrect: false })}
            {field('password', t('auth.password'), { secureTextEntry: true })}
            {field('email', t('register.email'), { keyboardType: 'email-address', autoCapitalize: 'none' })}
            {field('phone', t('register.phone'), { keyboardType: 'phone-pad' })}
            {field('enterpriseName', t('register.enterpriseName'))}
            {field('enterpriseStatus', t('register.enterpriseStatus'))}

            <Text style={styles.docsTitle}>{t('register.documents')}</Text>
            {DOCUMENT_KINDS.map((kind) => {
              const picked = documents[kind];
              return (
                <TouchableOpacity key={kind} style={styles.docRow} onPress={() => pickDocument(kind)}>
                  <AntDesign
                    name={picked ? 'checkcircle' : 'upcircleo'}
                    size={20}
                    color={picked ? '#5cd68a' : '#FFD600'}
                  />
                  <View style={styles.docLabel}>
                    <Text style={styles.docName}>{t(`doc.${kind}`)}</Text>
                    {!!picked && (
                      <Text style={styles.docFile} numberOfLines={1}>{picked.name}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
            <Text style={styles.docsHint}>{t('register.documentsOptional')}</Text>

            <View style={styles.checkboxContainer}>
              <Checkbox
                value={isChecked}
                onValueChange={setIsChecked}
                color={isChecked ? '#003C74' : undefined}
                style={styles.checkbox}
              />
              <Text style={styles.label}>{t('register.terms')}</Text>
            </View>

            <TouchableOpacity onPress={() => navigation.navigate('LoginScreen')}>
              <Text style={styles.txtt}>{t('auth.haveAccount')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.reqButton, busy && styles.reqButtonBusy]}
              onPress={submit}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#FFD600" />
              ) : (
                <Text style={styles.reqtxt}>{t('register.submit')}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>

        {showThirdText && (
          <Animated.View
            style={[
              styles.rectangleContainer,
              { opacity: rectangleOpacity, transform: [{ translateY: dragY }] },
            ]}
            {...panResponder.panHandlers}
          >
            <View style={styles.rectangle} />
          </Animated.View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFD600' },
  langRow: { flexDirection: 'row', alignSelf: 'flex-end', marginTop: 8, marginRight: 12, gap: 6, zIndex: 30 },
  langBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#334B7C' },
  langBtnOn: { backgroundColor: '#334B7C' },
  langText: { color: '#334B7C', fontWeight: 'bold', fontSize: 12 },
  langTextOn: { color: '#FFD600' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
  img: { position: 'absolute', top: 20, width: 140, height: 200, alignSelf: 'center' },
  textContainer: { position: 'absolute', justifyContent: 'center', alignItems: 'center', width: '100%' },
  text: { fontSize: 60, fontWeight: 'bold', color: '#003C74', textAlign: 'center' },
  secondText: { textAlign: 'center', fontSize: 30, fontWeight: '600', color: '#003C74', paddingHorizontal: 30 },
  formContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: FORM_HEIGHT,
    backgroundColor: '#001853',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: RECTANGLE_MARGIN + 10,
    zIndex: 10,
  },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 60 },
  textInput: {
    borderColor: '#FFD600',
    borderBottomWidth: 2,
    fontSize: 17,
    color: '#FFD600',
    marginBottom: 14,
    paddingVertical: 8,
  },
  inputBad: { borderColor: '#ff8a80' },
  errorBox: {
    backgroundColor: '#5a1a16',
    color: '#ffd7d4',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 14,
    textAlign: 'center',
  },
  docsTitle: { color: '#FFD600', fontSize: 18, fontWeight: '600', marginTop: 18, marginBottom: 10 },
  docRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  docLabel: { flex: 1, marginLeft: 12 },
  docName: { color: '#fff', fontSize: 15 },
  docFile: { color: '#9fb4e0', fontSize: 12, marginTop: 2 },
  docsHint: { color: '#9fb4e0', fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  checkboxContainer: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 22, marginBottom: 16, paddingHorizontal: 5 },
  checkbox: { marginRight: 10, marginTop: 3, borderColor: '#FFD600', width: 20, height: 20 },
  label: { flex: 1, fontSize: 15, color: 'white', lineHeight: 20 },
  txtt: { fontSize: 13, color: '#FFD600', marginLeft: 5, textDecorationLine: 'underline' },
  reqButton: {
    backgroundColor: '#01247A',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
    minHeight: 54,
    justifyContent: 'center',
  },
  reqButtonBusy: { opacity: 0.7 },
  reqtxt: { fontSize: 19, fontWeight: '600', color: '#FFD600', textAlign: 'center' },
  rectangleContainer: { position: 'absolute', bottom: RECTANGLE_MARGIN, left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  rectangle: { width: 60, height: RECTANGLE_HEIGHT, backgroundColor: '#003C74', borderRadius: 8 },
});
