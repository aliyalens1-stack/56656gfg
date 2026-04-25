import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';

export default function BookingConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const {
    slotId,
    quoteId,
    responseId,
    branchId,
    providerServiceId,
    price,
    orgName,
    serviceName,
    date,
    startTime,
    endTime,
  } = params;

  const [submitting, setSubmitting] = useState(false);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };

  const handleConfirmBooking = async () => {
    setSubmitting(true);
    try {
      // Create booking with slot
      const res = await api.post('/bookings/create-with-slot', {
        slotId,
        branchId,
        providerServiceId,
        quoteId: quoteId || undefined,
        customerNotes: '',
      });

      const booking = res.data.booking;

      // Navigate to payment
      router.replace({
        pathname: '/booking/payment',
        params: {
          bookingId: booking._id,
          price: price as string,
          orgName: orgName as string,
          serviceName: serviceName as string,
        },
      });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Не удалось создать бронирование';
      Alert.alert('Ошибка', Array.isArray(message) ? message[0] : message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Подтверждение</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Booking Card */}
        <View style={styles.bookingCard}>
          <View style={styles.cardHeader}>
            <View style={styles.orgIcon}>
              <Ionicons name="business" size={28} color="#3B82F6" />
            </View>
            <View style={styles.cardHeaderInfo}>
              <Text style={styles.orgName}>{orgName}</Text>
              <Text style={styles.serviceName}>{serviceName}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Details */}
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="calendar-outline" size={20} color="#3B82F6" />
            </View>
            <View style={styles.detailInfo}>
              <Text style={styles.detailLabel}>Дата</Text>
              <Text style={styles.detailValue}>{formatDate(date as string)}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="time-outline" size={20} color="#3B82F6" />
            </View>
            <View style={styles.detailInfo}>
              <Text style={styles.detailLabel}>Время</Text>
              <Text style={styles.detailValue}>{startTime} - {endTime}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Price */}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Стоимость услуги</Text>
            <Text style={styles.priceValue}>{Number(price).toLocaleString()} ₽</Text>
          </View>
        </View>

        {/* Info Notice */}
        <View style={styles.infoNotice}>
          <Ionicons name="information-circle" size={20} color="#3B82F6" />
          <Text style={styles.infoText}>
            Слот забронирован на 15 минут. После подтверждения вы перейдёте к оплате.
          </Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.bottomCTA}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Итого к оплате</Text>
          <Text style={styles.totalValue}>{Number(price).toLocaleString()} ₽</Text>
        </View>
        <TouchableOpacity
          style={[styles.confirmButton, submitting && styles.confirmButtonDisabled]}
          onPress={handleConfirmBooking}
          disabled={submitting}
          testID="confirm-booking-btn"
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.confirmButtonText}>Подтвердить и оплатить</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  bookingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orgIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderInfo: {
    flex: 1,
    marginLeft: 16,
  },
  orgName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  serviceName: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailInfo: {
    marginLeft: 12,
  },
  detailLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 15,
    color: '#9CA3AF',
  },
  priceValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#10B981',
  },
  infoNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#9CA3AF',
    lineHeight: 20,
  },
  bottomCTA: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 32,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 15,
    color: '#6B7280',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  confirmButtonDisabled: {
    opacity: 0.7,
  },
  confirmButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
