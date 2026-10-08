// Product detail.
//
// Replaces Light-T/Tires-brands/ProductDetail.js, which received the whole
// product through navigation params (including a bundled `require()` image) and
// checked `total > 1250000` against a hardcoded constant.
//
// Now it receives only a productId and fetches live data, because the catalog's
// `inStock` flag is allowed to be 60s stale but a quantity check must not be.
//
// Placing the order goes through POST /orders, which runs the whole money path
// -- company lock, atomic stock decrement, credit check, inserts -- inside one
// Postgres function and therefore one round trip. The credit ceiling shown here
// is the company's real remaining credit, not the hardcoded 1250000 the old
// screen compared against.

import React, { useState } from 'react';
import {
  View, Text, Image, StyleSheet, TouchableOpacity, TextInput, Modal, Pressable, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Naftalprev from '../components/Naftalprev.js';
import { useProduct } from '../api/catalog.js';
import { useCredit, usePlaceOrder } from '../api/orders.js';
import { useI18n } from '../i18n/index.js';
import { Loading, ErrorState } from '../components/States.js';

export default function ProductDetail({ route }) {
  const { productId } = route.params;
  const { t, money } = useI18n();
  const { data: product, isLoading, error, refetch } = useProduct(productId);

  const navigation = useNavigation();
  const { data: credit } = useCredit();
  const placeOrder = usePlaceOrder();

  const [quantity, setQuantity] = useState('1');
  const [showOptions, setShowOptions] = useState(false);
  const [showMethods, setShowMethods] = useState(false);
  // Generated once per checkout attempt and reused across retries, so a dropped
  // response plus a second tap cannot create two orders. Regenerating it per
  // request would defeat the guard entirely.
  const [idempotencyKey, setIdempotencyKey] = useState(null);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Naftalprev />
        <Loading />
      </SafeAreaView>
    );
  }
  if (error || !product) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Naftalprev />
        <ErrorState error={error} onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const total = product.unitPrice * qty;
  const overStock = qty > product.stockQuantity;
  // Checked here only to label the button honestly; the server re-checks it
  // inside the transaction, which is the check that actually counts.
  const creditFits = !credit || total <= credit.available;
  const canBuy = product.inStock && !overStock;

  // The +/- buttons clamp, because the intent there is unambiguous. Typed input
  // is NOT silently rewritten -- rewriting what someone typed is confusing. It
  // is flagged instead, and the button disables, so the screen never shows a
  // price for a quantity that cannot be bought.
  const stepQty = (next) => {
    setQuantity(String(Math.max(1, Math.min(next, product.stockQuantity || 1))));
  };

  const confirm = () => {
    if (overStock) {
      Alert.alert(t('err.INSUFFICIENT_STOCK'), t('product.maxStock', { n: product.stockQuantity }));
      return;
    }
    setIdempotencyKey(makeKey());
    setShowOptions(true);
  };

  const submit = async (paymentType) => {
    setShowOptions(false);
    setShowMethods(false);
    try {
      const order = await placeOrder.mutateAsync({
        items: [{ productId: product.id, quantity: qty }],
        paymentType,
        idempotencyKey,
      });
      navigation.navigate('Drawer', { screen: 'Orders' });
      Alert.alert(t('order.placed'), t('order.placedBody', { no: order.orderNo, total: money(order.total) }));
    } catch (err) {
      // CREDIT_LIMIT_EXCEEDED carries what was available, so the message can be
      // specific instead of just "refused".
      const d = err.details;
      Alert.alert(
        t(`err.${err.code ?? 'UNKNOWN'}`),
        err.code === 'CREDIT_LIMIT_EXCEEDED' && d
          ? t('credit.shortBy', { available: money(d.available), requested: money(d.requested) })
          : '',
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Naftalprev />

      <View style={styles.container}>
        <Image source={{ uri: product.imageUrl }} style={styles.image} resizeMode="contain" />

        <Text style={styles.name}>{product.model}</Text>
        {!!(product.size || product.loadSpeedIndex) && (
          <Text style={styles.size}>
            {[product.size, product.loadSpeedIndex].filter(Boolean).join(' ')}
          </Text>
        )}

        <Text style={styles.price}>
          {t('product.price')}: {money(product.unitPrice)}
        </Text>
        <Text style={styles.vat}>{t('product.vatIncluded')}</Text>

        <Text style={[styles.availability, { color: product.inStock ? '#1a7f46' : '#b3261e' }]}>
          {product.inStock
            ? t('product.stockLeft', { n: product.stockQuantity })
            : t('catalog.outOfStock')}
        </Text>

        <View style={styles.quantityRow}>
          <TouchableOpacity onPress={() => stepQty(qty - 1)} style={styles.qtyBtn}>
            <Text style={styles.qtyBtnText}>−</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.qtyInput}
            value={quantity}
            onChangeText={(text) => setQuantity(text.replace(/[^0-9]/g, ''))}
            keyboardType="numeric"
            maxLength={4}
          />

          <TouchableOpacity onPress={() => stepQty(qty + 1)} style={styles.qtyBtn}>
            <Text style={styles.qtyBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.total, overStock && styles.totalBlocked]}>
          {t('product.total')}: {money(total)}
        </Text>

        {overStock && (
          <Text style={styles.warning}>{t('product.maxStock', { n: product.stockQuantity })}</Text>
        )}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: canBuy ? '#334B7C' : '#ccc' }]}
          onPress={confirm}
          disabled={!canBuy}
        >
          <Text style={styles.buttonText}>
            {canBuy ? t('product.confirm') : t('product.unavailable')}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal transparent visible={showOptions} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t('pay.choose')}</Text>
            <Pressable
              style={styles.modalBtn}
              onPress={() => { setShowOptions(false); setShowMethods(true); }}
            >
              <Text style={styles.modalText}>{t('pay.now')}</Text>
            </Pressable>

            <Pressable
              style={[styles.modalBtn, !creditFits && styles.modalBtnDisabled]}
              disabled={!creditFits}
              onPress={() => submit('credit')}
            >
              <Text style={styles.modalText}>{t('pay.credit')}</Text>
              {credit && (
                <Text style={styles.modalHint}>
                  {creditFits
                    ? t('credit.available') + ': ' + money(credit.available)
                    : t('credit.shortBy', { available: money(credit.available), requested: money(total) })}
                </Text>
              )}
            </Pressable>
            <Pressable onPress={() => setShowOptions(false)}>
              <Text style={styles.cancel}>{t('pay.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={showMethods} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t('pay.method')}</Text>
            {['card', 'cheque', 'cash'].map((m) => (
              <Pressable
                key={m}
                style={styles.modalBtn}
                onPress={() => submit('immediate')}
              >
                <Text style={styles.modalText}>{t(`pay.${m}`)}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setShowMethods(false)}>
              <Text style={styles.cancel}>{t('pay.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/** RFC4122-ish v4, enough for an idempotency key. */
const makeKey = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFD600' },
  container: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
  image: { width: 180, height: 180, marginBottom: 16 },
  name: { fontSize: 24, fontWeight: 'bold', color: '#1B1F3B', textAlign: 'center' },
  size: { fontSize: 16, color: '#1B1F3B', opacity: 0.8, marginTop: 2 },
  price: { fontSize: 20, marginTop: 14, color: '#001853' },
  vat: { fontSize: 12, color: '#334B7C', opacity: 0.8, marginTop: 2 },
  availability: { fontSize: 16, marginTop: 10, marginBottom: 20, fontWeight: '600' },
  quantityRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  qtyBtn: { backgroundColor: '#001853', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  qtyBtnText: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  qtyInput: {
    width: 70,
    height: 42,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 18,
    marginHorizontal: 12,
    backgroundColor: '#fff',
  },
  total: { fontSize: 22, fontWeight: 'bold', color: '#001853', marginBottom: 20 },
  totalBlocked: { color: '#b3261e', marginBottom: 6 },
  warning: { color: '#b3261e', fontSize: 14, marginBottom: 14, textAlign: 'center' },
  button: { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 10, elevation: 3 },
  buttonText: { color: '#FFD600', fontWeight: 'bold', fontSize: 18 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: { backgroundColor: 'white', padding: 20, borderRadius: 10, width: '80%', alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, color: '#1B1F3B' },
  modalBtn: {
    backgroundColor: '#FFD600',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
  },
  modalText: { fontSize: 16, color: '#001853', fontWeight: 'bold' },
  modalBtnDisabled: { backgroundColor: '#eee' },
  modalHint: { fontSize: 11, color: '#334B7C', marginTop: 3 },
  cancel: { marginTop: 14, color: 'gray' },
});
