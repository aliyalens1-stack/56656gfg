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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/services/api';
import ProviderActionHub from '../../src/components/ProviderActionHub';

export default function ProviderDashboardScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bookings, setBookings] = useState<any[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchBookings = async () => {
    try {
      const res = await api.get('/bookings/incoming');
      setBookings(res.data || []);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookings();
  };

  const updateStatus = async (bookingId: string, newStatus: string, label: string) => {
    setUpdatingId(bookingId);
    try {
      await api.patch(`/bookings/${bookingId}/status`, { status: newStatus });
      Alert.alert('Готово', `Статус изменён: ${label}`);
      fetchBookings();
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Ошибка обновления';
      Alert.alert('Ошибка', Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setUpdatingId(null);
    }
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
      default: return status;
    }
  };

  const getActions = (booking: any) => {
    const actions: { label: string; status: string; color: string; icon: string }[] = [];
    switch (booking.status) {
      case 'pending':
        actions.push({ label: 'Подтвердить', status: 'confirmed', color: '#3B82F6', icon: 'checkmark-circle' });
        actions.push({ label: 'Отменить', status: 'cancelled', color: '#EF4444', icon: 'close-circle' });
        break;
      case 'confirmed':
        actions.push({ label: 'Начать работу', status: 'in_progress', color: '#8B5CF6', icon: 'play-circle' });
        actions.push({ label: 'Отменить', status: 'cancelled', color: '#EF4444', icon: 'close-circle' });
        break;
      case 'in_progress':
        actions.push({ label: 'Завершить', status: 'completed', color: '#10B981', icon: 'checkmark-done-circle' });
        break;
    }
    return actions;
  };

  // 🔥 Показуємо loading поки auth ініціалізується
  if (authLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={[styles.emptyText, { marginTop: 16 }]}>Загрузка...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user || user.role !== 'provider_owner') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={48} color="#6B7280" />
          <Text style={styles.emptyTitle}>Доступ только для провайдеров</Text>
          <TouchableOpacity style={styles.loginBtn} onPress={() => router.back()}>
            <Text style={styles.loginBtnText}>Назад</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity testID="provider-back-btn" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Входящие записи</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
      >
        {/* Sprint 11 — Action Hub (money cockpit) */}
        <ProviderActionHub colors={{ primary: '#3B82F6' }} />

        {loading ? (
          <ActivityIndicator color="#3B82F6" style={{ marginTop: 40 }} />
        ) : bookings.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#6B7280" />
            <Text style={styles.emptyTitle}>Нет входящих записей</Text>
            <Text style={styles.emptyText}>Записи клиентов появятся здесь</Text>
          </View>
        ) : (
          bookings.map((booking: any) => {
            const actions = getActions(booking);
            return (
              <View key={booking._id} style={styles.bookingCard} testID={`provider-booking-${booking._id}`}>
                <View style={styles.cardTop}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardService}>{booking.snapshot?.serviceName || 'Услуга'}</Text>
                    <Text style={styles.cardCustomer}>{booking.snapshot?.customerName || 'Клиент'}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(booking.status)}20` }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(booking.status) }]}>
                      {getStatusText(booking.status)}
                    </Text>
                  </View>
                </View>

                {booking.scheduledAt && (
                  <View style={styles.scheduleRow}>
                    <Ionicons name="calendar" size={16} color="#3B82F6" />
                    <Text style={styles.scheduleText}>
                      {new Date(booking.scheduledAt).toLocaleDateString('ru-RU', {
                        day: 'numeric', month: 'short',
                      })}{' в '}
                      {new Date(booking.scheduledAt).toLocaleTimeString('ru-RU', {
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                    <Text style={styles.priceText}>
                      {(booking.snapshot?.price || 0).toLocaleString()} ₽
                    </Text>
                  </View>
                )}

                {actions.length > 0 && (
                  <View style={styles.actionsRow}>
                    {actions.map((action) => (
                      <TouchableOpacity
                        key={action.status}
                        testID={`provider-action-${action.status}-${booking._id}`}
                        style={[styles.actionBtn, { backgroundColor: `${action.color}20` }]}
                        onPress={() => updateStatus(booking._id, action.status, action.label)}
                        disabled={updatingId === booking._id}
                      >
                        {updatingId === booking._id ? (
                          <ActivityIndicator size="small" color={action.color} />
                        ) : (
                          <>
                            <Ionicons name={action.icon as any} size={18} color={action.color} />
                            <Text style={[styles.actionBtnText, { color: action.color }]}>{action.label}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '600', color: '#FFFFFF' },
  content: { flex: 1, paddingHorizontal: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#FFFFFF', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  loginBtn: { marginTop: 24, paddingHorizontal: 48, paddingVertical: 14, backgroundColor: '#3B82F6', borderRadius: 12 },
  loginBtnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  bookingCard: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16,
    padding: 16, marginTop: 12,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardInfo: { flex: 1, marginRight: 12 },
  cardService: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  cardCustomer: { fontSize: 14, color: '#9CA3AF', marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '600' },
  scheduleRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8,
  },
  scheduleText: { flex: 1, fontSize: 14, color: '#9CA3AF' },
  priceText: { fontSize: 16, fontWeight: '700', color: '#10B981' },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 10, gap: 6,
  },
  actionBtnText: { fontSize: 14, fontWeight: '600' },
});
