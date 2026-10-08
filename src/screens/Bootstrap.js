// Entry point.
//
// The old app always opened on Register's welcome animation — an 8-second
// sequence every single launch, even for someone who logged in yesterday. This
// checks for a stored session first and routes accordingly:
//
//   no session        -> Register   (first run: the welcome sequence)
//   session, approved -> Drawer
//   session, pending  -> Wait       (shows the live decision)
//   stale session     -> Login
//
// `/me` is one request against a 15-minute access token, so this is fast; if it
// fails the session is stale and the user logs in again.

import React, { useEffect } from 'react';
import { View, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../api/client.js';
import { loadSession, clearSession } from '../api/session.js';
import naftalLogo from '../../assets/naf.png';

export default function Bootstrap() {
  const navigation = useNavigation();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const session = await loadSession();
      if (cancelled) return;

      if (!session?.accessToken) {
        navigation.replace('Register');
        return;
      }

      try {
        const me = await api.me();
        if (cancelled) return;

        const approved = me.company?.approvalStatus === 'approved';
        if (approved || me.user.role !== 'customer') {
          navigation.replace('Drawer');
        } else {
          navigation.replace('Wait', {
            username: me.user.firstName,
            approvalStatus: me.company?.approvalStatus,
          });
        }
      } catch {
        // Expired or revoked: start clean rather than half-authenticated.
        await clearSession();
        if (!cancelled) navigation.replace('LoginScreen');
      }
    })();

    return () => { cancelled = true; };
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Image source={naftalLogo} style={styles.logo} resizeMode="contain" />
      <ActivityIndicator size="large" color="#334B7C" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFD600', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 140, height: 140, marginBottom: 30 },
});
