import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { quotesAPI, bookingsAPI } from '../../src/services/api';

function TTLBadge({ expiresAt }: { expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('Истекла'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setTimeLeft(`${h}:${String(m).padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  const isLow = new Date(expiresAt).getTime() - Date.now() < 3600000;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons name="time-outline" size={13} color={isLow ? '#EF4444' : '#F59E0B'} />
      <Text style={{ fontSize: 12, color: isLow ? '#EF4444' : '#F59E0B', fontWeight: '600' }}>
        ещё {timeLeft}
      </Text>
    </View>
  );
}

export default function QuotesScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'quotes' | 'bookings'>('quotes');

  const isProvider = user?.role === 'provider_owner';

  const fetchData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      if (isProvider) {
        // Provider: fetch incoming quotes
        const [quotesRes, bookingsRes] = await Promise.all([
          quotesAPI.getIncoming(),
          bookingsAPI.getIncoming(),
        ]);
        setQuotes(quotesRes.data || []);
        setBookings(bookingsRes.data || []);
      } else {
        // Customer: fetch my quotes and bookings
        const [quotesRes, bookingsRes] = await Promise.all([
          quotesAPI.getMy(),
          bookingsAPI.getMy(),
        ]);
        setQuotes(quotesRes.data || []);
        setBookings(bookingsRes.data || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#F59E0B';
      case 'responded': return '#3B82F6';
      case 'accepted': return '#10B981';
      case 'completed': return '#10B981';
      case 'cancelled': return '#EF4444';
      case 'confirmed': return '#3B82F6';
      case 'in_progress': return '#8B5CF6';
      default: return '#6B7280';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Ожидание';
      case 'in_review': return 'На рассмотрении';
      case 'responded': return 'Есть ответы';
      case 'accepted': return 'Принято';
      case 'cancelled': return 'Отменено';
      case 'confirmed': return 'Подтверждено';
      case 'in_progress': return 'В работе';
      case 'completed': return 'Завершено';
      default: return status;
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.authPrompt}>
          <Ionicons name="document-text-outline" size={64} color="#6B7280" />
          <Text style={styles.authTitle}>Войдите для просмотра заявок</Text>
          <TouchableOpacity
            style={styles.authButton}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.authButtonText}>Войти</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{isProvider ? 'Входящие заявки' : 'Мои заявки'}</Text>
        {!isProvider && (
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => router.push('/create-quote')}
          >
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'quotes' && styles.tabActive]}
          onPress={() => setActiveTab('quotes')}
        >
          <Text style={[styles.tabText, activeTab === 'quotes' && styles.tabTextActive]}>
            Заявки ({quotes.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'bookings' && styles.tabActive]}
          onPress={() => setActiveTab('bookings')}
        >
          <Text style={[styles.tabText, activeTab === 'bookings' && styles.tabTextActive]}>
            Записи ({bookings.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
      >
        {loading ? (
          <ActivityIndicator color="#3B82F6" style={{ marginTop: 40 }} />
        ) : activeTab === 'quotes' ? (
          quotes.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={64} color="#6B7280" />
              <Text style={styles.emptyTitle}>Нет заявок</Text>
              <Text style={styles.emptyText}>Создайте заявку на поиск СТО</Text>
              <TouchableOpacity
                style={styles.createEmptyButton}
                onPress={() => router.push('/create-quote')}
              >
                <Text style={styles.createEmptyButtonText}>Создать заявку</Text>
              </TouchableOpacity>
            </View>
          ) : (
            quotes.map((quote: any, index: number) => (
              <TouchableOpacity
                key={quote._id || index}
                style={styles.card}
                onPress={() => router.push(`/quote/${quote._id}`)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>
                    Заявка #{String(quote._id).slice(-6)}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(quote.status)}20` }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(quote.status) }]}>
                      {getStatusText(quote.status)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardDescription} numberOfLines={2}>
                  {quote.description || 'Описание не указано'}
                </Text>
                <View style={styles.cardFooter}>
                  <View style={styles.cardStat}>
                    <Ionicons name="chatbubbles-outline" size={14} color="#6B7280" />
                    <Text style={styles.cardStatText}>{quote.responsesCount || 0} ответов</Text>
                  </View>
                  {quote.expiresAt && new Date(quote.expiresAt) > new Date() ? (
                    <TTLBadge expiresAt={quote.expiresAt} />
                  ) : quote.expiresAt && new Date(quote.expiresAt) <= new Date() ? (
                    <Text style={[styles.cardDate, { color: '#EF4444' }]}>Истекла</Text>
                  ) : (
                    <Text style={styles.cardDate}>
                      {new Date(quote.createdAt).toLocaleDateString('ru-RU')}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ))
          )
        ) : (
          bookings.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={64} color="#6B7280" />
              <Text style={styles.emptyTitle}>Нет записей</Text>
              <Text style={styles.emptyText}>Записи появятся после принятия заявки</Text>
            </View>
          ) : (
            bookings.map((booking: any, index: number) => (
              <TouchableOpacity
                key={booking._id || index}
                style={styles.card}
                onPress={() => router.push(`/booking/${booking._id}`)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>
                    {booking.snapshot?.serviceName || 'Услуга'}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(booking.status)}20` }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(booking.status) }]}>
                      {getStatusText(booking.status)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardDescription}>
                  {booking.snapshot?.orgName || 'СТО'}
                </Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.cardPrice}>
                    {booking.snapshot?.price?.toLocaleString() || 0} ₽
                  </Text>
                  <Text style={styles.cardDate}>
                    {new Date(booking.createdAt).toLocaleDateString('ru-RU')}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  createButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#3B82F6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardDescription: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardStat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardStatText: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 4,
  },
  cardPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10B981',
  },
  cardDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  createEmptyButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#3B82F6',
    borderRadius: 10,
  },
  createEmptyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  authPrompt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  authTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 16,
    textAlign: 'center',
  },
  authButton: {
    marginTop: 24,
    paddingHorizontal: 48,
    paddingVertical: 14,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
  },
  authButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
