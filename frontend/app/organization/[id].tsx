import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Dimensions,
  Animated,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeContext } from '../../src/context/ThemeContext';
import { useLanguage } from '../../src/context/LanguageContext';
import { api, bookingsAPI } from '../../src/services/api';
import { useAuth } from '../../src/context/AuthContext';

const { width } = Dimensions.get('window');

type TabType = 'info' | 'services' | 'reviews';

export default function OrganizationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors, isDark } = useThemeContext();
  const { t } = useLanguage();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<any>(null);
  const [branch, setBranch] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('info');
  const [isFavorite, setIsFavorite] = useState(false);
  const [hasPaidBooking, setHasPaidBooking] = useState(false);
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const tabIndicatorAnim = useRef(new Animated.Value(0)).current;
  const heartScale = useRef(new Animated.Value(1)).current;
  
  useEffect(() => {
    fetchData();
  }, [id]);

  useEffect(() => {
    // Animate tab indicator
    const tabIndex = activeTab === 'info' ? 0 : activeTab === 'services' ? 1 : 2;
    Animated.spring(tabIndicatorAnim, {
      toValue: tabIndex * (width - 40) / 3,
      useNativeDriver: Platform.OS !== 'web',
      friction: 8,
    }).start();
  }, [activeTab]);
  
  const fetchData = async () => {
    try {
      const orgRes = await api.get(`/organizations/${id}`);
      setOrg(orgRes.data);
      
      if (orgRes.data?.branches?.[0]) {
        setBranch(orgRes.data.branches[0]);
      }
      
      // 🔥 Check if user has paid booking with this organization
      if (user) {
        try {
          const bookingsRes = await bookingsAPI.getMy();
          const paidBooking = (bookingsRes.data || []).find(
            (b: any) => b.organizationId === id && (b.isPaid || b.paymentStatus === 'paid')
          );
          setHasPaidBooking(!!paidBooking);
        } catch (e) {
          console.log('Error checking bookings:', e);
        }
      }
      
      // Animate in
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(headerOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
      
      // Mock services
      setServices([
        { _id: '1', name: 'Диагностика двигателя', description: 'Полная компьютерная диагностика', priceMin: 30 },
        { _id: '2', name: 'Замена масла', description: 'Масло + фильтр', priceMin: 45 },
        { _id: '3', name: 'Техосмотр', description: 'Полный технический осмотр', priceMin: 60 },
        { _id: '4', name: 'Ремонт тормозов', description: 'Колодки, диски, суппорты', priceMin: 80 },
      ]);
      
      // Mock reviews
      setReviews([
        { _id: '1', user: { firstName: 'Александр' }, rating: 5, text: 'Отличный сервис! Быстро и качественно заменили масло.' },
        { _id: '2', user: { firstName: 'Мария' }, rating: 4, text: 'Хорошие цены, вежливый персонал.' },
        { _id: '3', user: { firstName: 'Дмитрий' }, rating: 5, text: 'Рекомендую! Профессиональный подход.' },
      ]);
    } catch (error) {
      console.log('Error fetching organization:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleCall = () => {
    // 🔥 ANTI-BYPASS: Контакти доступні тільки після оплати
    if (!hasPaidBooking) {
      Alert.alert(
        'Контакти доступні після оплати',
        'Щоб зв\'язатися з СТО напряму, спочатку оформіть та оплатіть запис через платформу.',
        [
          { text: 'Створити заявку', onPress: () => handleBook() },
          { text: 'Закрити', style: 'cancel' },
        ]
      );
      return;
    }
    
    const phone = branch?.phone || org?.phone || '+7 (495) 123-45-67';
    Linking.openURL(`tel:${phone}`);
  };
  
  const handleDirections = () => {
    const address = branch?.address || org?.address || 'Москва';
    Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(address)}`);
  };
  
  const handleFavorite = () => {
    if (!user) {
      router.push('/login');
      return;
    }
    
    // Animate heart
    Animated.sequence([
      Animated.timing(heartScale, {
        toValue: 1.3,
        duration: 150,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(heartScale, {
        toValue: 1,
        duration: 150,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
    
    setIsFavorite(!isFavorite);
  };
  
  const handleBook = (serviceId?: string) => {
    router.push(`/create-quote?orgId=${id}${serviceId ? `&serviceId=${serviceId}` : ''}` as any);
  };
  
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <SafeAreaView style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
        </SafeAreaView>
      </View>
    );
  }
  
  if (!org) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <TouchableOpacity 
              onPress={() => router.back()} 
              style={[styles.headerBtn, { backgroundColor: colors.card }]}
            >
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={64} color={colors.textMuted} />
            <Text style={[styles.errorText, { color: colors.text }]}>СТО не найдено</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }
  
  const rating = org.ratingAvg || 4.6;
  const reviewsCount = org.reviewsCount || reviews.length;
  const responseTime = org.avgResponseTimeMinutes || 15;
  const isOpen = true;
  const tabs: TabType[] = ['info', 'services', 'reviews'];
  const tabLabels = {
    info: 'Инфо',
    services: 'Услуги',
    reviews: `Отзывы (${reviewsCount})`,
  };
  
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Animated Header */}
        <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
          <TouchableOpacity 
            onPress={() => router.back()} 
            style={[styles.headerBtn, { backgroundColor: colors.card }]}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={handleFavorite} style={[styles.headerBtn, { backgroundColor: colors.card }]}>
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <Ionicons 
                  name={isFavorite ? 'heart' : 'heart-outline'} 
                  size={22} 
                  color={isFavorite ? colors.error : colors.text} 
                />
              </Animated.View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.headerBtn, { backgroundColor: colors.card }]}>
              <Ionicons name="share-outline" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </Animated.View>
        
        <Animated.ScrollView 
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Section */}
          <View style={styles.heroSection}>
            {/* Avatar with gradient */}
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              style={styles.heroAvatar}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="car-sport" size={40} color="#FFFFFF" />
            </LinearGradient>
            
            <Text style={[styles.orgName, { color: colors.text }]}>{org.name}</Text>
            
            {/* Rating */}
            <View style={styles.ratingContainer}>
              <View style={[styles.ratingBadge, { backgroundColor: colors.warningBg }]}>
                <Ionicons name="star" size={16} color="#FBBF24" />
                <Text style={[styles.ratingText, { color: colors.text }]}>{rating.toFixed(1)}</Text>
              </View>
              <Text style={[styles.reviewsText, { color: colors.textSecondary }]}>
                {reviewsCount} отзывов
              </Text>
            </View>
            
            {/* Info Badges */}
            <View style={styles.badgesContainer}>
              {/* Verified Badge */}
              {org?.isVerified && (
                <View style={[styles.infoBadge, { backgroundColor: '#DCFCE7' }]}>
                  <Ionicons name="shield-checkmark" size={14} color="#16A34A" />
                  <Text style={[styles.badgeText, { color: '#166534' }]}>
                    Проверенный
                  </Text>
                </View>
              )}
              {/* Popular Badge */}
              {org?.isPopular && (
                <View style={[styles.infoBadge, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="flame" size={14} color="#D97706" />
                  <Text style={[styles.badgeText, { color: '#92400E' }]}>
                    Популярный
                  </Text>
                </View>
              )}
              {/* Fast Response */}
              {responseTime <= 15 && (
                <View style={[styles.infoBadge, { backgroundColor: '#DBEAFE' }]}>
                  <Ionicons name="flash" size={14} color="#2563EB" />
                  <Text style={[styles.badgeText, { color: '#1E40AF' }]}>
                    Быстро (~{responseTime} мин)
                  </Text>
                </View>
              )}
              {responseTime > 15 && (
                <View style={[styles.infoBadge, { backgroundColor: colors.infoBg }]}>
                  <Ionicons name="time" size={14} color={colors.primary} />
                  <Text style={[styles.badgeText, { color: colors.primary }]}>
                    ~{responseTime} мин
                  </Text>
                </View>
              )}
              <View style={[styles.infoBadge, { backgroundColor: colors.successBg }]}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={[styles.badgeText, { color: colors.success }]}>
                  {isOpen ? 'Открыто' : 'Закрыто'}
                </Text>
              </View>
              {branch?.distance && (
                <View style={[styles.infoBadge, { backgroundColor: colors.card }]}>
                  <Ionicons name="location" size={14} color={colors.textSecondary} />
                  <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                    {branch.distance < 1 
                      ? `${(branch.distance * 1000).toFixed(0)} м`
                      : `${branch.distance.toFixed(1)} км`}
                  </Text>
                </View>
              )}
            </View>

            {/* 🔥 V5: "Why Choose" Block */}
            {(org?.isVerified || org?.completedBookingsCount > 0 || rating >= 4.5) && (
              <View style={[styles.whyChooseBlock, { backgroundColor: isDark ? '#0D2818' : '#F0FDF4' }]}>
                <Text style={[styles.whyChooseTitle, { color: '#166534' }]}>
                  Почему выбрать:
                </Text>
                {rating >= 4.5 && (
                  <View style={styles.whyChooseItem}>
                    <Ionicons name="checkmark" size={14} color="#16A34A" />
                    <Text style={[styles.whyChooseText, { color: '#15803D' }]}>
                      {Math.round(rating * 20)}% довольных клиентов
                    </Text>
                  </View>
                )}
                {responseTime <= 15 && (
                  <View style={styles.whyChooseItem}>
                    <Ionicons name="checkmark" size={14} color="#16A34A" />
                    <Text style={[styles.whyChooseText, { color: '#15803D' }]}>
                      Отвечает за {responseTime} мин
                    </Text>
                  </View>
                )}
                {(org?.completedBookingsCount || 0) > 0 && (
                  <View style={styles.whyChooseItem}>
                    <Ionicons name="checkmark" size={14} color="#16A34A" />
                    <Text style={[styles.whyChooseText, { color: '#15803D' }]}>
                      {org.completedBookingsCount} выполненных заказов
                    </Text>
                  </View>
                )}
                {org?.isVerified && (
                  <View style={styles.whyChooseItem}>
                    <Ionicons name="checkmark" size={14} color="#16A34A" />
                    <Text style={[styles.whyChooseText, { color: '#15803D' }]}>
                      Верифицирован платформой
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
          
          {/* Stats Row - виконані закази */}
          <View style={styles.statsRow}>
            <View style={[styles.statItem, { backgroundColor: colors.card }]}>
              <Text style={[styles.statNumber, { color: colors.primary }]}>
                {org?.completedBookingsCount || 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Заказов
              </Text>
            </View>
            <View style={[styles.statItem, { backgroundColor: colors.card }]}>
              <Text style={[styles.statNumber, { color: '#F59E0B' }]}>
                {reviewsCount}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Отзывов
              </Text>
            </View>
            <View style={[styles.statItem, { backgroundColor: colors.card }]}>
              <Text style={[styles.statNumber, { color: '#10B981' }]}>
                {rating > 0 ? rating.toFixed(1) : '-'}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Рейтинг
              </Text>
            </View>
          </View>
          
          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <QuickActionButton 
              icon="call" 
              label="Позвонить" 
              colors={colors}
              onPress={handleCall}
            />
            <QuickActionButton 
              icon="navigate" 
              label="Маршрут" 
              colors={colors}
              onPress={handleDirections}
            />
            <QuickActionButton 
              icon="chatbubble-ellipses" 
              label="Чат" 
              colors={colors}
              onPress={() => {}}
            />
          </View>
          
          {/* Tabs */}
          <View style={[styles.tabsContainer, { backgroundColor: colors.card }]}>
            <View style={styles.tabsRow}>
              {tabs.map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={styles.tab}
                  onPress={() => setActiveTab(tab)}
                  activeOpacity={0.7}
                >
                  <Text 
                    style={[
                      styles.tabText, 
                      { color: activeTab === tab ? colors.primary : colors.textMuted }
                    ]}
                  >
                    {tabLabels[tab]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Animated Indicator */}
            <Animated.View 
              style={[
                styles.tabIndicator, 
                { 
                  backgroundColor: colors.primary,
                  transform: [{ translateX: tabIndicatorAnim }],
                }
              ]} 
            />
          </View>
          
          {/* Tab Content */}
          <View style={styles.tabContent}>
            {activeTab === 'info' && (
              <InfoTab org={org} branch={branch} colors={colors} />
            )}
            {activeTab === 'services' && (
              <ServicesTab services={services} colors={colors} onBook={handleBook} />
            )}
            {activeTab === 'reviews' && (
              <ReviewsTab reviews={reviews} colors={colors} />
            )}
          </View>
          
          <View style={{ height: 100 }} />
        </Animated.ScrollView>
        
        {/* Sticky CTA */}
        <View style={[styles.stickyFooter, { backgroundColor: colors.background }]}>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => handleBook()}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              style={styles.ctaGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.ctaText}>Записаться</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

/* ──────────── Quick Action Button ──────────── */
function QuickActionButton({ icon, label, colors, onPress }: any) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };
  
  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };
  
  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
    >
      <Animated.View 
        style={[
          styles.quickAction, 
          { backgroundColor: colors.card, transform: [{ scale: scaleAnim }] }
        ]}
      >
        <View style={[styles.quickActionIcon, { backgroundColor: colors.infoBg }]}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <Text style={[styles.quickActionText, { color: colors.text }]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

/* ──────────── Info Tab ──────────── */
function InfoTab({ org, branch, colors }: any) {
  return (
    <View>
      {org.description && (
        <View style={styles.infoBlock}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>О компании</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{org.description}</Text>
        </View>
      )}
      
      <View style={styles.infoBlock}>
        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Адрес</Text>
        <Text style={[styles.infoValue, { color: colors.text }]}>
          {branch?.address || org.address || 'ул. Тверская, 15, Москва'}
        </Text>
      </View>
      
      <View style={styles.infoBlock}>
        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Часы работы</Text>
        <View style={styles.hoursRow}>
          <Text style={[styles.hoursDay, { color: colors.text }]}>Пн-Пт</Text>
          <Text style={[styles.hoursTime, { color: colors.textSecondary }]}>09:00 - 20:00</Text>
        </View>
        <View style={styles.hoursRow}>
          <Text style={[styles.hoursDay, { color: colors.text }]}>Сб</Text>
          <Text style={[styles.hoursTime, { color: colors.textSecondary }]}>10:00 - 18:00</Text>
        </View>
        <View style={styles.hoursRow}>
          <Text style={[styles.hoursDay, { color: colors.text }]}>Вс</Text>
          <Text style={[styles.hoursTime, { color: colors.textMuted }]}>Выходной</Text>
        </View>
      </View>
      
      {org.specializations && org.specializations.length > 0 && (
        <View style={styles.infoBlock}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Специализация</Text>
          <View style={styles.tagsRow}>
            {org.specializations.map((spec: string, idx: number) => (
              <View key={idx} style={[styles.tag, { backgroundColor: colors.infoBg }]}>
                <Text style={[styles.tagText, { color: colors.primary }]}>{spec}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

/* ──────────── Services Tab ──────────── */
function ServicesTab({ services, colors, onBook }: any) {
  return (
    <View style={styles.servicesGrid}>
      {services.map((service: any) => (
        <ServiceCard key={service._id} service={service} colors={colors} onBook={onBook} />
      ))}
    </View>
  );
}

function ServiceCard({ service, colors, onBook }: any) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.98, useNativeDriver: Platform.OS !== 'web' }).start();
  };
  
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: Platform.OS !== 'web' }).start();
  };
  
  return (
    <TouchableOpacity
      onPress={() => onBook(service._id)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
    >
      <Animated.View 
        style={[
          styles.serviceCard, 
          { backgroundColor: colors.card, transform: [{ scale: scaleAnim }] }
        ]}
      >
        <View style={styles.serviceInfo}>
          <Text style={[styles.serviceName, { color: colors.text }]}>{service.name}</Text>
          {service.description && (
            <Text style={[styles.serviceDesc, { color: colors.textSecondary }]} numberOfLines={1}>
              {service.description}
            </Text>
          )}
        </View>
        <View style={styles.serviceRight}>
          <Text style={[styles.servicePrice, { color: colors.primary }]}>
            от {service.priceMin}€
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

/* ──────────── Reviews Tab ──────────── */
function ReviewsTab({ reviews, colors }: any) {
  return (
    <View>
      {reviews.map((review: any, idx: number) => (
        <ReviewCard key={review._id || idx} review={review} colors={colors} index={idx} />
      ))}
    </View>
  );
}

function ReviewCard({ review, colors, index }: any) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      delay: index * 100,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, []);
  
  const initials = (review.user?.firstName?.[0] || 'U').toUpperCase();
  
  return (
    <Animated.View 
      style={[
        styles.reviewCard, 
        { backgroundColor: colors.card, opacity: fadeAnim }
      ]}
    >
      <View style={styles.reviewHeader}>
        <View style={styles.reviewUser}>
          <LinearGradient
            colors={[colors.primary, colors.accent]}
            style={styles.reviewAvatar}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.reviewAvatarText}>{initials}</Text>
          </LinearGradient>
          <View>
            <Text style={[styles.reviewName, { color: colors.text }]}>
              {review.user?.firstName || 'Пользователь'}
            </Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Ionicons
                  key={star}
                  name={star <= review.rating ? 'star' : 'star-outline'}
                  size={12}
                  color="#FBBF24"
                />
              ))}
            </View>
          </View>
        </View>
      </View>
      <Text style={[styles.reviewText, { color: colors.textSecondary }]}>
        {review.text}
      </Text>
    </Animated.View>
  );
}

/* ──────────── Styles ──────────── */
const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: { flexDirection: 'row', gap: 10 },
  
  scrollContent: { paddingBottom: 40 },
  
  // Hero
  heroSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  heroAvatar: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  orgName: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  ratingText: { fontSize: 15, fontWeight: '700' },
  reviewsText: { fontSize: 14 },
  
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 5,
  },
  badgeText: { fontSize: 13, fontWeight: '500' },

  // Why Choose Block
  whyChooseBlock: {
    marginTop: 16,
    marginHorizontal: 20,
    padding: 14,
    borderRadius: 12,
  },
  whyChooseTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  whyChooseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  whyChooseText: {
    fontSize: 13,
    flex: 1,
  },
  
  // Quick Actions
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 16,
    minHeight: 90,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickActionText: { 
    fontSize: 12, 
    fontWeight: '600',
    textAlign: 'center',
  },
  
  // Tabs
  tabsContainer: {
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  tabsRow: {
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabText: { fontSize: 14, fontWeight: '600' },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: (width - 40) / 3,
    height: 3,
    borderRadius: 2,
  },
  
  // Tab Content
  tabContent: { paddingHorizontal: 20 },
  
  // Stats Row
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  
  // Info Tab
  infoBlock: { marginBottom: 20 },
  infoLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 },
  infoValue: { fontSize: 15, lineHeight: 22 },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  hoursDay: { fontSize: 14, fontWeight: '500' },
  hoursTime: { fontSize: 14 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  tagText: { fontSize: 13, fontWeight: '500' },
  
  // Services Tab
  servicesGrid: { gap: 10 },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
  },
  serviceInfo: { flex: 1, marginRight: 12 },
  serviceName: { fontSize: 15, fontWeight: '600' },
  serviceDesc: { fontSize: 13, marginTop: 4 },
  serviceRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  servicePrice: { fontSize: 15, fontWeight: '700' },
  
  // Reviews Tab
  reviewCard: { padding: 16, borderRadius: 14, marginBottom: 12 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  reviewUser: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reviewAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  reviewAvatarText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  reviewName: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  starsRow: { flexDirection: 'row', gap: 2 },
  reviewText: { fontSize: 14, lineHeight: 20 },
  
  // Sticky Footer
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  ctaButton: { borderRadius: 16, overflow: 'hidden' },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    gap: 8,
  },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
});
