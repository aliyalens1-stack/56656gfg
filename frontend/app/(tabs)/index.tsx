import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Animated,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeContext } from '../../src/context/ThemeContext';
import { useLanguage } from '../../src/context/LanguageContext';
import { useAuth } from '../../src/context/AuthContext';
import { useLocation } from '../../src/context/LocationContext';
import { api } from '../../src/services/api';
import IntelligenceHub from '../../src/components/IntelligenceHub';

const { width, height } = Dimensions.get('window');

// ═══════════════════════════════════════════════════════════
// 🔥 V5 UX — ГЛАВНАЯ = РЕШЕНИЕ ЗАДАЧИ, НЕ МЕНЮ
// 
// Структура:
// 1. HERO: "Что случилось с машиной?" + 2 кнопки
// 2. SMART MATCHING: 1-2 лучших мастера
// 3. QUICK ACTIONS: компактные иконки
// 4. NEARBY: при скролле
// ═══════════════════════════════════════════════════════════

// 🔥 PROVIDER HOME (без изменений)
function ProviderHome() {
  const router = useRouter();
  const { colors, isDark } = useThemeContext();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ pending: 0, today: 0, completed: 0, revenue: 0 });
  const [pendingQuotes, setPendingQuotes] = useState<any[]>([]);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const fetchData = useCallback(async () => {
    try {
      // Fetch incoming quotes for provider
      const quotesRes = await api.get('/quotes/incoming');
      const quotes = quotesRes.data || [];
      setPendingQuotes(quotes.filter((q: any) => q.status === 'pending').slice(0, 3));
      
      setStats({
        pending: quotes.filter((q: any) => q.status === 'pending').length,
        today: quotes.filter((q: any) => {
          const date = new Date(q.createdAt);
          return date.toDateString() === new Date().toDateString();
        }).length,
        completed: 0,
        revenue: 0,
      });
    } catch (error) {
      console.log('Provider fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }).start();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.ScrollView
          style={{ opacity: fadeAnim }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.greeting, { color: colors.textSecondary }]}>Панель мастера</Text>
              <Text style={[styles.userName, { color: colors.text }]}>{user?.firstName || 'Мастер'}</Text>
            </View>
            <TouchableOpacity
              style={[styles.headerIconBtn, { backgroundColor: colors.card }]}
              onPress={() => router.push('/settings')}
            >
              <Ionicons name="settings-outline" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Stats Cards */}
          <View style={styles.providerStats}>
            <View style={[styles.statCard, { backgroundColor: '#EF444415' }]}>
              <Ionicons name="time" size={24} color="#EF4444" />
              <Text style={[styles.statValue, { color: colors.text }]}>{stats.pending}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Ожидают</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#3B82F615' }]}>
              <Ionicons name="today" size={24} color="#3B82F6" />
              <Text style={[styles.statValue, { color: colors.text }]}>{stats.today}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Сегодня</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#10B98115' }]}>
              <Ionicons name="checkmark-circle" size={24} color="#10B981" />
              <Text style={[styles.statValue, { color: colors.text }]}>{stats.completed}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Выполнено</Text>
            </View>
          </View>

          {/* Pending Quotes */}
          {pendingQuotes.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Новые заявки</Text>
              {pendingQuotes.map((quote) => (
                <TouchableOpacity
                  key={quote._id}
                  style={[styles.quoteCard, { backgroundColor: colors.card }]}
                  onPress={() => router.push({ pathname: '/quote-details', params: { id: quote._id } })}
                >
                  <View style={styles.quoteHeader}>
                    <Text style={[styles.quoteTitle, { color: colors.text }]} numberOfLines={1}>
                      {quote.description || 'Заявка'}
                    </Text>
                    <View style={[styles.newBadge, { backgroundColor: '#EF4444' }]}>
                      <Text style={styles.newBadgeText}>Новая</Text>
                    </View>
                  </View>
                  <View style={styles.quoteFooter}>
                    <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.quoteTime, { color: colors.textSecondary }]}>
                      {new Date(quote.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Quick Actions */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Быстрые действия</Text>
            <View style={styles.providerActions}>
              <TouchableOpacity
                testID="provider-inbox-btn"
                style={[styles.providerActionBtn, { backgroundColor: '#EF444415' }]}
                onPress={() => router.push('/provider/inbox')}
              >
                <Ionicons name="mail" size={24} color="#EF4444" />
                <Text style={[styles.providerActionText, { color: colors.text }]}>Inbox</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="provider-job-btn"
                style={[styles.providerActionBtn, { backgroundColor: '#3B82F615' }]}
                onPress={() => router.push('/provider/current-job')}
              >
                <Ionicons name="navigate" size={24} color="#3B82F6" />
                <Text style={[styles.providerActionText, { color: colors.text }]}>Текущий</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="provider-stats-btn"
                style={[styles.providerActionBtn, { backgroundColor: '#F59E0B15' }]}
                onPress={() => router.push('/provider/stats')}
              >
                <Ionicons name="pulse" size={24} color="#F59E0B" />
                <Text style={[styles.providerActionText, { color: colors.text }]}>Pressure</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.providerActions, { marginTop: 10 }]}>
              <TouchableOpacity
                testID="provider-earnings-btn"
                style={[styles.providerActionBtn, { backgroundColor: '#10B98115' }]}
                onPress={() => router.push('/provider/earnings')}
              >
                <Ionicons name="wallet" size={24} color="#10B981" />
                <Text style={[styles.providerActionText, { color: colors.text }]}>Доход</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.providerActionBtn, { backgroundColor: colors.card }]}
                onPress={() => router.push('/provider/availability')}
              >
                <Ionicons name="calendar" size={24} color={colors.primary} />
                <Text style={[styles.providerActionText, { color: colors.text }]}>Расписание</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.providerActionBtn, { backgroundColor: colors.card }]}
                onPress={() => router.push('/settings')}
              >
                <Ionicons name="cog" size={24} color={colors.textSecondary} />
                <Text style={[styles.providerActionText, { color: colors.text }]}>Настройки</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 100 }} />
        </Animated.ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// 🔥 V5 CUSTOMER HOME — UBER-STYLE UX
// ═══════════════════════════════════════════════════════════
function CustomerHome() {
  const router = useRouter();
  const { colors, isDark } = useThemeContext();
  const { t } = useLanguage();
  const { user } = useAuth();
  
  // 🌍 Используем глобальный LocationContext
  const { location, isLocationEnabled, refreshLocation, setShowPermissionModal } = useLocation();

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [matchedProviders, setMatchedProviders] = useState<any[]>([]);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  // 🔥 Загружаем matching при изменении локации
  useEffect(() => {
    if (location) {
      fetchMatching(location.lat, location.lng);
    }
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [location]);

  const fetchMatching = async (lat: number, lng: number) => {
    try {
      setLoading(true);
      const res = await api.get('/matching/nearby', { params: { lat, lng, limit: 3 } });
      setMatchedProviders(res.data || []);
    } catch (error) {
      console.log('Matching error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshLocation();
    if (location) {
      await fetchMatching(location.lat, location.lng);
    }
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Доброе утро';
    if (hour < 18) return 'Добрый день';
    return 'Добрый вечер';
  };

  // 🌍 Обработчик клика по кнопке геолокации
  const handleLocationPress = () => {
    if (!isLocationEnabled) {
      setShowPermissionModal(true);
    } else {
      refreshLocation();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.ScrollView
          style={{ opacity: fadeAnim }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* ═══════ HEADER — 3 ICONS (Alerts, Messages, Map) ═══════ */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.greeting, { color: colors.textSecondary }]}>{getGreeting()}</Text>
              <Text style={[styles.userName, { color: colors.text }]}>{user?.firstName || 'Гость'}</Text>
            </View>
            <View style={styles.headerRight}>
              {/* Notifications/Alerts */}
              <TouchableOpacity
                style={[styles.headerIconBtn, { backgroundColor: colors.card }]}
                onPress={() => router.push('/notifications')}
              >
                <Ionicons name="notifications-outline" size={20} color={colors.text} />
                {/* Badge for unread */}
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>2</Text>
                </View>
              </TouchableOpacity>

              {/* Messages */}
              <TouchableOpacity
                style={[styles.headerIconBtn, { backgroundColor: colors.card }]}
                onPress={() => router.push('/messages')}
              >
                <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
              </TouchableOpacity>

              {/* Map - opens full map view */}
              <TouchableOpacity
                style={[styles.headerIconBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/map')}
              >
                <Ionicons name="map" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* ═══════ 🔥 HERO — ОДНО ДЕЙСТВИЕ ═══════ */}
          <View style={styles.heroSection}>
            <Text style={[styles.heroQuestion, { color: colors.text }]}>
              Что случилось с машиной?
            </Text>

            {/* Primary CTA — Quick Request */}
            <TouchableOpacity activeOpacity={0.9} onPress={() => router.push('/quick-request')}>
              <LinearGradient
                colors={['#EF4444', '#DC2626', '#B91C1C']}
                style={styles.primaryCTA}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="flash" size={24} color="#fff" />
                <View style={styles.ctaTextBlock}>
                  <Text style={styles.primaryCTATitle}>Быстро решить</Text>
                  <Text style={styles.primaryCTASub}>1 tap — мастера уже ищут</Text>
                </View>
                <Ionicons name="arrow-forward-circle" size={28} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>

            {/* Secondary CTA — Services */}
            <TouchableOpacity
              style={[styles.secondaryCTA, { backgroundColor: colors.card }]}
              onPress={() => router.push('/services')}
              activeOpacity={0.7}
            >
              <View style={[styles.secondaryCTAIcon, { backgroundColor: colors.primary + '15' }]}>
                <Ionicons name="list" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.secondaryCTAText, { color: colors.text }]}>Выбрать услугу</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* ═══════ 🔥 SMART STATUS — НЕ СПИСОК, А ИНФОРМАЦИЯ ═══════ */}
          <View style={styles.matchingSection}>
            {/* Quick Service Grid - Uber style */}
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Популярные услуги
            </Text>
            <View style={styles.serviceGrid}>
              {[
                { icon: 'car-outline', label: 'Не заводится', color: '#EF4444', type: 'engine_wont_start' },
                { icon: 'water-outline', label: 'Замена масла', color: '#F59E0B', type: 'oil_change' },
                { icon: 'stop-circle-outline', label: 'Тормоза', color: '#8B5CF6', type: 'brakes' },
                { icon: 'search-outline', label: 'Диагностика', color: '#3B82F6', type: 'diagnostics' },
                { icon: 'flash-outline', label: 'Электрика', color: '#6366F1', type: 'electrical' },
                { icon: 'swap-vertical-outline', label: 'Подвеска', color: '#10B981', type: 'suspension' },
              ].map((s, i) => (
                <TouchableOpacity
                  key={i}
                  testID={`service-${s.type}`}
                  style={[styles.serviceItem, { backgroundColor: colors.card }]}
                  onPress={() => router.push({ pathname: '/quick-request', params: { preselect: s.type } })}
                  activeOpacity={0.7}
                >
                  <View style={[styles.serviceIconWrap, { backgroundColor: s.color + '15' }]}>
                    <Ionicons name={s.icon as any} size={24} color={s.color} />
                  </View>
                  <Text style={[styles.serviceLabel, { color: colors.text }]} numberOfLines={1}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Info Banner - мастера рядом */}
            {matchedProviders.length > 0 && (
              <View style={[styles.infoBanner, { backgroundColor: colors.card }]}>
                <View style={[styles.infoBannerIcon, { backgroundColor: '#10B98115' }]}>
                  <Ionicons name="people" size={20} color="#10B981" />
                </View>
                <View style={styles.infoBannerContent}>
                  <Text style={[styles.infoBannerTitle, { color: colors.text }]}>
                    {matchedProviders.length} мастеров готовы помочь
                  </Text>
                  <Text style={[styles.infoBannerSub, { color: colors.textSecondary }]}>
                    Ближайший в {matchedProviders[0]?.distanceKm?.toFixed(1) || '0.5'} км • ~{Math.round((matchedProviders[0]?.distanceKm || 1) * 4 + 3)} мин
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </View>
            )}

            {/* Surge indicator */}
            <View style={[styles.surgeCard, { backgroundColor: '#EF444410', borderColor: '#EF444430' }]}>
              <Ionicons name="flame" size={18} color="#EF4444" />
              <View style={styles.surgeContent}>
                <Text style={[styles.surgeTitle, { color: '#EF4444' }]}>Высокий спрос в вашем районе</Text>
                <Text style={[styles.surgeSub, { color: colors.textSecondary }]}>Мастера отвечают быстрее обычного</Text>
              </View>
            </View>
          </View>

          {/* ═══════ QUICK ACTIONS — COMPACT ═══════ */}
          <View style={styles.quickActionsSection}>
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                style={[styles.quickActionItem, { backgroundColor: colors.card }]}
                onPress={() => router.push('/map')}
              >
                <Ionicons name="location" size={22} color="#EF4444" />
                <Text style={[styles.quickActionText, { color: colors.text }]}>Найти СТО</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickActionItem, { backgroundColor: colors.card }]}
                onPress={() => router.push('/my-garage')}
              >
                <Ionicons name="car-sport" size={22} color="#3B82F6" />
                <Text style={[styles.quickActionText, { color: colors.text }]}>Мой гараж</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickActionItem, { backgroundColor: colors.card }]}
                onPress={() => router.push('/my-bookings')}
              >
                <Ionicons name="calendar" size={22} color="#10B981" />
                <Text style={[styles.quickActionText, { color: colors.text }]}>Записи</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickActionItem, { backgroundColor: colors.card }]}
                onPress={() => router.push('/my-quotes')}
              >
                <Ionicons name="document-text" size={22} color="#F59E0B" />
                <Text style={[styles.quickActionText, { color: colors.text }]}>Заявки</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ═══════ 🔥 SPRINT 11 INTELLIGENCE HUB ═══════ */}
          <IntelligenceHub colors={colors} />

          <View style={{ height: 120 }} />
        </Animated.ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════
export default function HomeScreen() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (user?.role === 'provider_owner') {
    return <ProviderHome />;
  }

  return <CustomerHome />;
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: 14,
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 10,
  },
  headerIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },

  // Hero Section
  heroSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  heroQuestion: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 16,
    lineHeight: 32,
  },
  primaryCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 16,
    gap: 14,
  },
  ctaTextBlock: {
    flex: 1,
  },
  primaryCTATitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  primaryCTASub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  secondaryCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginTop: 10,
  },
  secondaryCTAIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  secondaryCTAText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },

  // Matching Section
  matchingSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 14,
  },
  providerCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  providerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  providerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerAvatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  providerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  providerName: {
    fontSize: 16,
    fontWeight: '600',
  },
  providerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  providerRating: {
    fontSize: 13,
    fontWeight: '600',
  },
  providerDistance: {
    fontSize: 13,
  },
  providerResponse: {
    fontSize: 12,
  },
  matchBadge: {
    backgroundColor: '#10B98120',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  matchBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10B981',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  reasonsBlock: {
    marginBottom: 12,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  reasonText: {
    fontSize: 12,
  },
  selectBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  selectBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Quick Actions
  quickActionsSection: {
    paddingHorizontal: 20,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickActionItem: {
    width: (width - 60) / 4,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 14,
  },
  quickActionText: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },

  // Provider Home Styles
  providerStats: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 14,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  quoteCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  quoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  quoteTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  newBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  newBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  quoteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quoteTime: {
    fontSize: 12,
  },
  providerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  providerActionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 18,
    borderRadius: 14,
  },
  providerActionText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 8,
  },

  // Service Grid (Uber-style)
  serviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  serviceItem: {
    width: (width - 60) / 3,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 14,
  },
  serviceIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  serviceLabel: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Info Banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
  },
  infoBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoBannerContent: {
    flex: 1,
  },
  infoBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoBannerSub: {
    fontSize: 12,
    marginTop: 2,
  },

  // Surge Card
  surgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  surgeContent: {
    flex: 1,
  },
  surgeTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  surgeSub: {
    fontSize: 11,
    marginTop: 2,
  },
});
