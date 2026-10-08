// Top bar for the drawer screens.
//
// Replaces NaftalBar.js, which had two problems now that sessions are real:
//   1. "Log out" was a hardcoded English string.
//   2. It called navigation.replace('LoginScreen') WITHOUT clearing the stored
//      session — so Bootstrap would find that session on next launch and log the
//      user straight back in. Logging out has to revoke and clear.

import React, { useState } from 'react';
import { View, Image, StyleSheet, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { loadSession, clearSession } from '../api/session.js';
import { unregisterPush } from '../api/push.js';
import { useI18n } from '../i18n/index.js';

export default function NaftalNavbar() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  const handleLogout = async () => {
    setBusy(true);
    try {
      await unregisterPush(); // before the token is cleared
      const session = await loadSession();
      // Revoke server-side so the refresh token cannot be replayed. If the
      // network is down this still proceeds — a local logout must never be
      // blocked by a server the user cannot reach.
      if (session?.refreshToken) await api.logout(session.refreshToken).catch(() => {});
    } finally {
      await clearSession();
      queryClient.clear(); // drop cached catalog//me for the next user
      setBusy(false);
      navigation.reset({ index: 0, routes: [{ name: 'LoginScreen' }] });
    }
  };

  return (
    <View style={styles.navbar}>
      <TouchableOpacity style={styles.sideIcon} onPress={() => navigation.openDrawer()}>
        <FontAwesome5 name="bars" size={24} color="#fff" />
      </TouchableOpacity>

      <View style={styles.logoContainer}>
        <Image
          source={require('../../assets/naf2.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} disabled={busy}>
        {busy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.logoutText}>{t('nav.logout')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  navbar: {
    width: '100%',
    backgroundColor: '#001853',
    flexDirection: 'row',
    alignItems: 'center',
    height: 80,
  },
  sideIcon: { width: 70, alignItems: 'center', justifyContent: 'center' },
  logoutButton: { width: 70, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  logoutText: { color: '#fff', fontSize: 11, fontWeight: 'bold', textAlign: 'center' },
  logoContainer: { flex: 1, alignItems: 'center' },
  logo: { width: 140, height: 50 },
});
