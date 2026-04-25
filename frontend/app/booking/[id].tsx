import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { bookingsAPI, api } from '../../src/services/api';

export default function BookingDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [booking, setBooking] = useState<any>(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchBooking = async () => {
    try {
      const res = await bookingsAPI.getById(id as string);
      setBooking(res.data);
    } catch (error) {
      console.error('Error fetching booking:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить бронирование');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBooking();
  }, [id]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBooking();
  };

  const handlePay = () => {
    router.push({
      pathname: '/booking/payment',
      params: {
        bookingId: booking._id,
        price: String(booking.snapshot?.price || 0),
        orgName: booking.snapshot?.orgName || 'СТО',
        serviceName: booking.snapshot?.serviceName || 'Услуга',
      },
    });
  };

  const handleCancel = () => {
    Alert.alert('Отменить запись?', 'Слот будет освобождён', [
      { text: 'Нет', style: 'cancel' },
      {
        text: 'Отменить',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            await api.patch(`/bookings/${id}/status`, { status: 'cancelled' });
            Alert.alert('Запись отменена');
            fetchBooking();
          } catch (error: any) {
            const msg = error.response?.data?.message || 'Не удалось отменить';
            Alert.alert('Ошибка', Array.isArray(msg) ? msg[0] : msg);
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  const handleReview = () => {
    router.push({
      pathname: '/review/create',
      params: {
        bookingId: booking._id,
        orgName: booking.snapshot?.orgName || 'СТО',
        serviceName: booking.snapshot?.serviceName || 'Услуга',
      },
    });
  };

  const handleDispute = () => {
    Alert.alert('Спор', 'Функция споров будет доступна в следующем обновлении');
  };

  // 🔥 REPEAT BOOKING - 1 клік = новий заказ
  const handleRepeat = () => {
    router.push({
      pathname: '/booking/repeat',
      params: {
        bookingId: booking._id,
        organizationId: booking.organizationId,
        branchId: booking.branchId,
        serviceId: booking.providerServiceId,
        vehicleId: booking.vehicleId || '',
        orgName: booking.snapshot?.orgName || 'СТО',
        serviceName: booking.snapshot?.serviceName || 'Услуга',
        price: String(booking.snapshot?.price || 0),
        branchAddress: booking.snapshot?.branchAddress || '',
      },
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#F59E0B';
      case 'confirmed': return '#3B82F6';
      case 'in_progress': return '#8B5CF6';
      case 'completed': return '#10B981';
      case 'cancelled': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Ожидание';
      case 'confirmed': return 'Подтверждено';
      case 'in_progress': return 'В работе';
      case 'completed': return 'Завершено';
      case 'cancelled': return 'Отменено';
      case 'no_show': return 'Неявка';
      default: return status;
    }
  };

  const getPaymentText = (status: string) => {
    switch (status) {
      case 'paid': return 'Оплачено';
      case 'refunded': return 'Возврат';
      default: return 'Не оплачено';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Бронирование не найдено</Text>
          <TouchableOpacity style={styles.goBackBtn} onPress={() => router.back()}>
            <Text style={styles.goBackText}>Назад</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isPaid = booking.paymentStatus === 'paid' || booking.isPaid;
  const canPay = !isPaid && booking.status !== 'cancelled' && booking.status !== 'completed';
  const canCancel = booking.status === 'pending' || booking.status === 'confirmed';
  const isCompleted = booking.status === 'completed';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity testID="booking-back-btn" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Запись</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
      >
        {/* Status */}
        <View style={styles.statusSection}>
          <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(booking.status)}20` }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(booking.status) }]} />
            <Text testID="booking-status" style={[styles.statusText, { color: getStatusColor(booking.status) }]}>
              {getStatusText(booking.status)}
            </Text>
          </View>
          <View style={[styles.paymentBadge, { backgroundColor: isPaid ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)' }]}>
            <Text style={[styles.paymentText, { color: isPaid ? '#10B981' : '#F59E0B' }]}>
              {getPaymentText(booking.paymentStatus)}
            </Text>
          </View>
        </View>

        {/* Main Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.orgIcon}>
              <Ionicons name="business" size={28} color="#3B82F6" />
            </View>
            <View style={styles.cardHeaderInfo}>
              <Text testID="booking-org-name" style={styles.orgName}>{booking.snapshot?.orgName || 'СТО'}</Text>
              <Text style={styles.serviceName}>{booking.snapshot?.serviceName || 'Услуга'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Schedule */}
          {booking.scheduledAt && (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="calendar-outline" size={20} color="#3B82F6" />
              </View>
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Дата и время</Text>
                <Text style={styles.detailValue}>
                  {new Date(booking.scheduledAt).toLocaleDateString('ru-RU', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}{' '}
                  в{' '}
                  {new Date(booking.scheduledAt).toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            </View>
          )}

          {/* Address */}
          {booking.snapshot?.branchAddress && (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="location-outline" size={20} color="#3B82F6" />
              </View>
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Адрес</Text>
                <Text style={styles.detailValue}>{booking.snapshot.branchAddress}</Text>
              </View>
            </View>
          )}

          <View style={styles.divider} />

          {/* Price */}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Стоимость</Text>
            <Text testID="booking-price" style={styles.priceValue}>
              {(booking.snapshot?.price || 0).toLocaleString()} ₽
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsSection}>
          {canPay && (
            <TouchableOpacity testID="booking-pay-btn" style={styles.payButton} onPress={handlePay}>
              <Ionicons name="card" size={20} color="#FFFFFF" />
              <Text style={styles.payButtonText}>Оплатить</Text>
            </TouchableOpacity>
          )}

          {isCompleted && (
            <>
              {/* 🔥 REPEAT BOOKING - головна кнопка для LTV */}
              <TouchableOpacity 
                testID="booking-repeat-btn" 
                style={styles.repeatButton} 
                onPress={handleRepeat}
              >
                <Ionicons name="repeat" size={20} color="#FFFFFF" />
                <Text style={styles.repeatButtonText}>Повторить заказ</Text>
              </TouchableOpacity>
              
              <TouchableOpacity testID="booking-review-btn" style={styles.reviewButton} onPress={handleReview}>
                <Ionicons name="star" size={20} color="#F59E0B" />
                <Text style={styles.reviewButtonText}>Оставить отзыв</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="booking-dispute-btn" style={styles.disputeButton} onPress={handleDispute}>
                <Ionicons name="alert-circle" size={20} color="#EF4444" />
                <Text style={styles.disputeButtonText}>Сообщить о проблеме</Text>
              </TouchableOpacity>
            </>
          )}

          {canCancel && (
            <TouchableOpacity
              testID="booking-cancel-btn"
              style={styles.cancelButton}
              onPress={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? (
                <ActivityIndicator color="#EF4444" />
              ) : (
                <Text style={styles.cancelButtonText}>Отменить запись</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 16, color: '#EF4444' },
  goBackBtn: { marginTop: 16, padding: 12 },
  goBackText: { fontSize: 15, color: '#3B82F6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '600', color: '#FFFFFF' },
  content: { flex: 1, paddingHorizontal: 20 },
  statusSection: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 20,
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, gap: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 14, fontWeight: '600' },
  paymentBadge: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  paymentText: { fontSize: 13, fontWeight: '600' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16, padding: 20, marginTop: 20,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  orgIcon: {
    width: 56, height: 56, borderRadius: 14,
    backgroundColor: 'rgba(59,130,246,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardHeaderInfo: { flex: 1, marginLeft: 16 },
  orgName: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  serviceName: { fontSize: 14, color: '#9CA3AF', marginTop: 4 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  detailIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  detailInfo: { marginLeft: 12 },
  detailLabel: { fontSize: 12, color: '#6B7280' },
  detailValue: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', marginTop: 2 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel: { fontSize: 15, color: '#9CA3AF' },
  priceValue: { fontSize: 22, fontWeight: '700', color: '#10B981' },
  actionsSection: { marginTop: 24, gap: 12 },
  payButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 12, gap: 8,
  },
  payButtonText: { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
  repeatButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#3B82F6', paddingVertical: 16, borderRadius: 12, gap: 8,
  },
  repeatButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  reviewButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(245,158,11,0.15)', paddingVertical: 16, borderRadius: 12, gap: 8,
  },
  reviewButtonText: { fontSize: 15, fontWeight: '600', color: '#F59E0B' },
  disputeButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.1)', paddingVertical: 14, borderRadius: 12, gap: 8,
  },
  disputeButtonText: { fontSize: 15, fontWeight: '600', color: '#EF4444' },
  cancelButton: { alignItems: 'center', paddingVertical: 16 },
  cancelButtonText: { fontSize: 15, color: '#EF4444' },
});
