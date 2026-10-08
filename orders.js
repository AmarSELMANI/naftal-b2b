import React, { useState } from 'react';
import { View, Text, FlatList, Image, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Naftalprev from './Naftalprev';

const mockOrders = [
  {
    id: 'CMD001',
    productName: 'Aures',
    quantity: 2,
    image: require('./assets/Iris/aures.png'),
    price: 9200,
    paymentMethod: 'credit',
    deadline: '2025-07-01',
  },
  {
    id: 'CMD002',
    productName: 'Ecoris',
    quantity: 1,
    image: require('./assets/Iris/ecoris.png'),
    price: 8700,
    paymentMethod: 'achat immediat',
    deadline: null,
  },
];

function calculateDaysLeft(deadline) {
  const deadlineDate = new Date(deadline);
  const today = new Date();
  const diffTime = deadlineDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 'Délai dépassé';
}

function getDaysLeftColor(deadline) {
  const days = calculateDaysLeft(deadline);
  if (typeof days === 'string') return 'red';
  if (days <= 5) return 'orange';
  return 'green';
}

export default function Orders() {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const handleCreditPress = (item) => {
    setSelectedOrder(item);
    setModalVisible(true);
  };

  const renderItem = ({ item }) => {
    const isCredit = item.paymentMethod === 'credit';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={isCredit ? 0.7 : 1}
        onPress={() => isCredit && handleCreditPress(item)}
      >
        <Image source={item.image} style={styles.image} />
        <View style={styles.info}>
          <Text style={styles.name}>{item.productName}</Text>
          <Text>Command: {item.id}</Text>
          <Text>Quantity: {item.quantity}</Text>
          <Text>Price: {item.price} DA</Text>
          <Text>payment Method: {item.paymentMethod}</Text>
          {isCredit && (
            <Text style={{ color: getDaysLeftColor(item.deadline) }}>
              Jours restants: {calculateDaysLeft(item.deadline)}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Naftalprev />
      <FlatList
        data={mockOrders}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 20 }}
      />

      {/* Modal for credit payment */}
      <Modal transparent visible={modalVisible} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Are you willing to pay ?</Text>

            <Pressable style={styles.modalBtn}>
              <Text style={styles.modalText}>Pay</Text>
            </Pressable>

            <Pressable onPress={() => setModalVisible(false)}>
              <Text style={{ marginTop: 10, color: 'gray' }}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFD600',
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FDF3C1',
    borderRadius: 12,
    padding: 10,
    marginVertical: 6,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  image: {
    width: 80,
    height: 80,
    marginRight: 15,
    resizeMode: 'contain',
  },
  info: {
    flex: 1,
    justifyContent: 'space-between',
  },
  name: {
    fontWeight: 'bold',
    fontSize: 16,
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
    color: '#1B1F3B',
  },
  modalBtn: {
    backgroundColor: '#FFD600',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 10,
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
  },
  modalText: {
    fontSize: 16,
    color: '#001853',
    fontWeight: 'bold',
  },
});
