// Waiting for the decision.
//
// Replaces Wait.js, which was a timed animation driven by
// `route.params.isApproved` — a value the caller hardcoded to `true`. It walked
// through six scripted steps on setTimeout and told the applicant they were
// approved whether or not anyone had looked at their file.
//
// Now it subscribes to the real decision: SSE first, polling underneath, so the
// screen advances the instant an agent clicks approve (§4) and still resolves if
// the stream is lost.

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Animated, StyleSheet, TouchableOpacity, Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { watchDecision } from '../api/onboarding.js';
import { api } from '../api/client.js';
import { saveSession, loadSession, clearSession } from '../api/session.js';
import { useI18n } from '../i18n/index.js';

export default function Wait() {
  const navigation = useNavigation();
  const route = useRoute();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const [status, setStatus] = useState(null);     // the request payload
  const [decision, setDecision] = useState(null); // approved | denied
  const [error, setError] = useState(null);
  const [continuing, setContinuing] = useState(false);

  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  const username = route.params?.username ?? status?.companyName ?? '';

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 800, useNativeDriver: true }).start();

    // A slow breathing pulse while waiting, so the screen reads as "working"
    // rather than frozen — the honest replacement for the old scripted sequence.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    const unsubscribe = watchDecision({
      onStatus: (s) => { setStatus(s); if (s.status !== 'pending') setDecision(s.status); },
      onDecision: (d) => setDecision(d.status ?? d.approvalStatus),
      onError: (e) => setError(e),
    });
    return unsubscribe;
  }, []);

  // On approval the stored token still carries the onboarding scope until it is
  // refreshed, so refresh before entering the app rather than letting the first
  // protected call 403.
  const handleContinue = async () => {
    setContinuing(true);
    try {
      const session = await loadSession();
      if (session?.refreshToken) {
        const fresh = await api.refresh?.(session.refreshToken).catch(() => null);
        if (fresh) await saveSession(fresh);
      }
    } catch { /* Bootstrap will sort it out */ }
    queryClient.clear();
    navigation.reset({ index: 0, routes: [{ name: 'Drawer' }] });
  };

  const handleRetry = async () => {
    await clearSession();
    queryClient.clear();
    navigation.reset({ index: 0, routes: [{ name: 'Register' }] });
  };

  const pulseStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
  };

  const body = () => {
    if (decision === 'approved') {
      return (
        <>
          <Text style={styles.heading}>{t('wait.approved')}</Text>
          <Text style={styles.text}>{t('wait.welcome', { name: username })}</Text>
          <TouchableOpacity style={styles.button} onPress={handleContinue} disabled={continuing}>
            {continuing
              ? <ActivityIndicator color="#FFD600" />
              : <Text style={styles.buttonText}>{t('wait.continue')}</Text>}
          </TouchableOpacity>
        </>
      );
    }

    if (decision === 'denied') {
      return (
        <>
          <Text style={styles.heading}>{t('wait.denied')}</Text>
          {!!status?.denialReason && (
            <Text style={styles.reason}>{t('wait.reason')}: {status.denialReason}</Text>
          )}
          <TouchableOpacity style={styles.button} onPress={handleRetry}>
            <Text style={styles.buttonText}>{t('wait.sendAnother')}</Text>
          </TouchableOpacity>
        </>
      );
    }

    return (
      <>
        <Text style={styles.heading}>{t('wait.thanks')}</Text>
        <Text style={styles.text}>{t('wait.reviewing')}</Text>

        <Animated.View style={[styles.pending, pulseStyle]}>
          <ActivityIndicator color="#003C74" />
          <Text style={styles.pendingText}>{t('wait.pending')}</Text>
        </Animated.View>

        {/* Missing documents are actionable information while waiting, not an
            error — the agent cannot approve a file that is incomplete. */}
        {!!status?.missingDocuments?.length && (
          <View style={styles.missingBox}>
            <Text style={styles.missingTitle}>{t('wait.missingDocuments')}</Text>
            {status.missingDocuments.map((k) => (
              <Text key={k} style={styles.missingItem}>• {t(`doc.${k}`)}</Text>
            ))}
          </View>
        )}

        {!!error && <Text style={styles.offline}>{t(`err.${error.code ?? 'UNKNOWN'}`)}</Text>}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Image source={require('../../assets/naf.png')} style={styles.logo} resizeMode="contain" />
      <Animated.View style={[styles.content, { opacity: fade }]}>{body()}</Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFD600', paddingHorizontal: 20, alignItems: 'center' },
  logo: { width: 120, height: 120, marginTop: 20 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%', paddingBottom: 60 },
  heading: { fontSize: 26, fontWeight: 'bold', color: '#003C74', textAlign: 'center', marginBottom: 14 },
  text: { fontSize: 18, textAlign: 'center', color: '#003C74', marginBottom: 20, lineHeight: 26 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  pendingText: { color: '#003C74', fontSize: 15, marginLeft: 8 },
  reason: {
    fontSize: 16,
    color: '#7a1c17',
    backgroundColor: '#ffd9d6',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    textAlign: 'center',
    marginBottom: 20,
  },
  missingBox: {
    marginTop: 26,
    backgroundColor: '#fff6c9',
    borderRadius: 10,
    padding: 14,
    width: '100%',
    borderLeftWidth: 3,
    borderLeftColor: '#003C74',
  },
  missingTitle: { color: '#003C74', fontWeight: '700', marginBottom: 6 },
  missingItem: { color: '#334B7C', fontSize: 14, lineHeight: 20 },
  offline: { marginTop: 18, color: '#7a1c17', fontSize: 13, textAlign: 'center' },
  button: {
    marginTop: 10,
    backgroundColor: '#334B7C',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonText: { color: '#FFD600', fontSize: 17, fontWeight: 'bold' },
});
