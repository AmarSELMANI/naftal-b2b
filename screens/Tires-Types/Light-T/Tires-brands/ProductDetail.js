import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Alert,TextInput } from 'react-native';
import Naftalprev from '../../../../Naftalprev';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { Modal, Pressable } from 'react-native';
export default function ProductDetail({ route }) {
  const { name, image, price, available } = route.params;
  const [quantity, setQuantity] = useState(1);
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);
  const [showPayMethods, setShowPayMethods] = useState(false);

  const total = price * quantity;

  const handleConfirm = () => {
    const total = price * quantity;
    if (total > 1250000) {
      Alert.alert("Limit Exceeded", "You surpassed the authorized amount of 1250000 DA.");
      return;
    }
    setShowPaymentOptions(true);
  };
  

  const handlePayNow = () => {
    setShowPaymentOptions(false);
    setShowPayMethods(true);
  };

  const handlePayMethod = (method) => {
    setShowPayMethods(false);
    Alert.alert('Payment Method Selected', `You chose to pay by ${method}`);
  };
  const handleBuy = () => {
    Alert.alert('Purchase Confirmed', `You bought: ${name} for DA ${price}`);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Naftalprev />

      <View style={styles.container}>
        <Image source={image} style={styles.image} />
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.price}>Price: DA {price}</Text>
        <Text style={styles.availability}>
          {available ? 'In Stock' : 'Out of Stock'}
        </Text>

     
        {/* Quantity Selector */}
        <View style={styles.quantityRow}>
  <TouchableOpacity onPress={() => setQuantity(q => Math.max(1, q - 1))} style={styles.qtyBtn}>
    <Text style={styles.qtyBtnText}>-</Text>
  </TouchableOpacity>

  <TextInput
    style={styles.qtyInput}
    value={quantity.toString()}
    onChangeText={(text) => {
      const num = parseInt(text);
      if (!isNaN(num) && num >= 1) {
        setQuantity(num);
      } else if (text === "") {
        setQuantity("");
      }
    }}
    keyboardType="numeric"
  />

  <TouchableOpacity onPress={() => setQuantity(q => q + 1)} style={styles.qtyBtn}>
    <Text style={styles.qtyBtnText}>+</Text>
  </TouchableOpacity>
</View>


        <Text style={styles.price}>Total: DA {total}</Text>
          
         {/* buy button*/} 
        <TouchableOpacity
          style={[styles.button, { backgroundColor: available ? '#334B7C' : '#ccc' }]}
          onPress={handleConfirm}
          disabled={!available}
        >
          <Text style={styles.buttonText}>{available ? 'Confirm Purchase' : 'Unavailable'}</Text>
        </TouchableOpacity>
      </View>

      {/* Payment Choice Modal */}
      <Modal transparent visible={showPaymentOptions} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Choose Payment Option</Text>
            <Pressable style={styles.modalBtn} onPress={handlePayNow}>
              <Text style={styles.modalText}>Pay Now</Text>
            </Pressable>
            <Pressable style={styles.modalBtn} onPress={() => {
              setShowPaymentOptions(false);
              Alert.alert('Purchase on Credit', 'You chose to buy in debt.');
            }}>
              <Text style={styles.modalText}>Buy in Credit</Text>
            </Pressable>
            <Pressable onPress={() => setShowPaymentOptions(false)}>
              <Text style={{ marginTop: 10, color: 'gray' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Pay Method Modal */}
      <Modal transparent visible={showPayMethods} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Select Payment Method</Text>
            {['Card', 'Cheque', 'Cash'].map(method => (
              <Pressable key={method} style={styles.modalBtn} onPress={() => handlePayMethod(method)}>
                <Text style={styles.modalText}>{method}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setShowPayMethods(false)}>
              <Text style={{ marginTop: 10, color: 'gray' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFD600',
  },
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: 200,
    height: 200,
    marginBottom: 20,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1B1F3B',
    textAlign: 'center',
  },
  price: {
    fontSize: 20,
    marginVertical: 10,
    color: '#001853',
  },
  availability: {
    fontSize: 18,
    color: '#1B1F3B',
    marginBottom: 30,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 10,
    elevation: 3,
  },
  buttonText: {
    color: '#FFD600',
    fontWeight: 'bold',
    fontSize: 18,
  },
  qtyBtn: {
    backgroundColor: '#001853',
    padding: 10,
    borderRadius: 8,
  },
  qtyBtnText: {
    color: 'white',
    fontSize: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    width: '80%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  modalBtn: {
    backgroundColor: '#FFD600',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
  },
  modalText: {
    fontSize: 16,
    color: '#001853',
    fontWeight: 'bold',
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  qtyInput: {
    width: 60,
    height: 40,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 18,
    marginHorizontal: 10,
    backgroundColor: '#fff',
    paddingVertical: 5,
  },
});
