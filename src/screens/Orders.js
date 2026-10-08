// Orders.
//
// Replaces orders.js, which rendered two hardcoded mock orders and computed the
// deadline itself:
//
//     calculateDaysLeft(deadline)   // new Date() maths on the device
//     getDaysLeftColor(deadline)    // red / orange / green, decided locally
//
// Both are gone. The server returns `daysLeft` and `urgency` (§5.7), so the
// rule lives on one side of the wire instead of being duplicated on both — and
// the device clock, which the user can change, no longer decides whether their
// own payment is late.

import React, { useState } from 'react';
import {
  View, Text, FlatList, Image, StyleSheet, TouchableOpacity,
  Modal, Pressable, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NaftalNavbar from '../components/NaftalBar.js';
import { useOrders, useCredit, useDeclarePayment, URGENCY_COLOUR } from '../api/orders.js';
import { useI18n } from '../i18n/index.js';
import { Loading, ErrorState } from '../components/States.js';

const PAYMENT_METHODS = ['cheque', 'cash', 'card', 'bank_transfer'];

export default function Orders() {
  const { t, money, lang } = useI18n();
  const { data, isLoading, error, refetch, isRefetching } = useOrders();
  const { data: credit } = useCredit();
  const declarePayment = useDeclarePayment();

  const [selected, setSelected] = useState(null);
  const [method, setMethod] = useState(null);

  const pay = async () => {
    try {
      await declarePayment.mutateAsync({ orderId: selected.id, method });
      setSelected(null);
      setMethod(null);
    } catch {
      setSelected(null);
    }
  };

  const dateFmt = (d) =>
    d ? new Date(d).toLocaleDateString(lang === 'fr' ? 'fr-DZ' : 'en-GB',
      { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const deadlineLabel = (o) => {
    if (o.urgency === 'overdue') return t('orders.overdue');
    if (o.daysLeft === 0) return t('orders.dueToday');
    return `${t('orders.daysLeft')}: ${o.daysLeft}`;
  };

  const renderItem = ({ item: order }) => {
    const first = order.items[0];
    const extra = order.items.length - 1;
    const owes = order.paymentType === 'credit' && order.paymentState !== 'paid';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={owes ? 0.7 : 1}
        onPress={() => owes && setSelected(order)}
      >
        {first?.imageUrl
          ? <Image source={{ uri: first.imageUrl }} style={styles.image} />
          : <View style={styles.image} />}

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {first?.name}{extra > 0 ? ` +${extra}` : ''}
          </Text>
          <Text style={styles.line}>{t('orders.command')}: {order.orderNo}</Text>
          <Text style={styles.line}>
            {t('orders.quantity')}: {order.items.reduce((s, i) => s + i.quantity, 0)}
          </Text>
          <Text style={styles.line}>{t('orders.price')}: {money(order.total)}</Text>
          <Text style={styles.line}>
            {t('orders.payment')}: {t(`pay.${order.paymentType === 'credit' ? 'credit' : 'now'}`)}
          </Text>

          {order.paymentState === 'paid' && (
            <Text style={[styles.badge, { color: URGENCY_COLOUR.ok }]}>{t('orders.paid')}</Text>
          )}

          {owes && (
            <>
              {/* colour comes straight from the server's urgency */}
              <Text style={[styles.badge, { color: URGENCY_COLOUR[order.urgency] ?? '#333' }]}>
                {deadlineLabel(order)}
              </Text>
              <Text style={styles.due}>{t('orders.due')}: {dateFmt(order.dueDate)}</Text>
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const body = () => {
    if (isLoading) return <Loading />;
    if (error) return <ErrorState error={error} onRetry={refetch} />;

    return (
      <FlatList
        data={data?.items ?? []}
        renderItem={renderItem}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListHeaderComponent={
          credit ? (
            <View style={styles.creditBar}>
              <View>
                <Text style={styles.creditLabel}>{t('credit.available')}</Text>
                <Text style={styles.creditValue}>{money(credit.available)}</Text>
              </View>
              <View style={styles.creditRight}>
                <Text style={styles.creditLabel}>{t('credit.limit')}</Text>
                <Text style={styles.creditSub}>{money(credit.creditLimit)}</Text>
                {credit.overdueCount > 0 && (
                  <Text style={styles.overdue}>
                    {credit.overdueCount} {t('orders.overdue').toLowerCase()}
                  </Text>
                )}
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={<Text style={styles.empty}>{t('orders.empty')}</Text>}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <NaftalNavbar />
      <Text style={styles.title}>{t('orders.title')}</Text>
      {body()}

      <Modal transparent visible={!!selected} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t('orders.payPrompt')}</Text>
            {!!selected && (
              <Text style={styles.modalAmount}>{money(selected.remaining)}</Text>
            )}

            <Text style={styles.modalSub}>{t('pay.method')}</Text>
            {PAYMENT_METHODS.map((m) => (
              <Pressable
                key={m}
                style={[styles.modalBtn, method === m && styles.modalBtnOn]}
                onPress={() => setMethod(m)}
              >
                <Text style={styles.modalText}>{t(`pay.${m === 'bank_transfer' ? 'transfer' : m}`)}</Text>
              </Pressable>
            ))}

            {/* Deliberately explicit: declaring is not paying. An agent has to
                confirm the money arrived before the credit frees up. §3.3 */}
            <Text style={styles.disclaimer}>{t('orders.paymentPending')}</Text>

            <Pressable
              style={[styles.confirmBtn, !method && styles.confirmBtnOff]}
              disabled={!method || declarePayment.isPending}
              onPress={pay}
            >
              {declarePayment.isPending
                ? <ActivityIndicator color="#FFD600" />
                : <Text style={styles.confirmText}>{t('orders.declare')}</Text>}
            </Pressable>

            <Pressable onPress={() => { setSelected(null); setMethod(null); }}>
              <Text style={styles.cancel}>{t('pay.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFD600' },
  title: {
    fontSize: 30, fontWeight: 'bold', color: '#334B7C',
    textAlign: 'center', marginTop: 20, marginBottom: 10,
  },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  creditBar: {
    backgroundColor: '#001853',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  creditLabel: { color: '#9fb4e0', fontSize: 12 },
  creditValue: { color: '#FFD600', fontSize: 22, fontWeight: 'bold', marginTop: 2 },
  creditSub: { color: '#fff', fontSize: 15, marginTop: 2 },
  creditRight: { alignItems: 'flex-end' },
  overdue: { color: '#ff8a80', fontSize: 12, marginTop: 4, fontWeight: '600' },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FDF3C1',
    borderRadius: 12,
    padding: 12,
    marginVertical: 6,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  image: { width: 78, height: 78, marginRight: 14, resizeMode: 'contain' },
  info: { flex: 1, justifyContent: 'center' },
  name: { fontWeight: 'bold', fontSize: 16, color: '#1B1F3B', marginBottom: 2 },
  line: { fontSize: 13, color: '#333' },
  badge: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  due: { fontSize: 11, color: '#666' },
  empty: { textAlign: 'center', color: '#334B7C', marginTop: 40, fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modal: { backgroundColor: 'white', padding: 22, borderRadius: 12, width: '85%', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1B1F3B', textAlign: 'center' },
  modalAmount: { fontSize: 26, fontWeight: 'bold', color: '#001853', marginVertical: 10 },
  modalSub: { fontSize: 13, color: '#666', marginTop: 6, marginBottom: 8 },
  modalBtn: {
    backgroundColor: '#f3f4f8',
    paddingVertical: 11,
    borderRadius: 8,
    marginTop: 8,
    width: '100%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modalBtnOn: { backgroundColor: '#FFD600', borderColor: '#001853' },
  modalText: { fontSize: 15, color: '#001853', fontWeight: '600' },
  disclaimer: { fontSize: 11, color: '#666', marginTop: 14, textAlign: 'center', fontStyle: 'italic' },
  confirmBtn: {
    backgroundColor: '#334B7C',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 14,
    width: '100%',
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  confirmBtnOff: { opacity: 0.5 },
  confirmText: { color: '#FFD600', fontWeight: 'bold', fontSize: 16 },
  cancel: { marginTop: 12, color: 'gray' },
});
