import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../src/context/AuthContext';
import { quotesAPI } from '../src/services/api';
import { useThemeContext } from '../src/context/ThemeContext';

// Quick service types
const SERVICE_TYPES = [
  { type: 'engine_wont_start', label: 'Не заводится', icon: 'car-outline', color: '#EF4444' },
  { type: 'oil_change', label: 'Замена масла', icon: 'water-outline', color: '#F59E0B' },
  { type: 'brakes', label: 'Тормоза', icon: 'stop-circle-outline', color: '#8B5CF6' },
  { type: 'diagnostics', label: 'Диагностика', icon: 'search-outline', color: '#3B82F6' },
  { type: 'urgent', label: 'Срочно', icon: 'alert-circle-outline', color: '#DC2626' },
  { type: 'suspension', label: 'Подвеска', icon: 'swap-vertical-outline', color: '#10B981' },
  { type: 'electrical', label: 'Электрика', icon: 'flash-outline', color: '#6366F1' },
  { type: 'other', label: 'Другое', icon: 'ellipsis-horizontal-outline', color: '#6B7280' },
];

export default function QuickRequestScreen() {
  const { user, token } = useAuth();
  const { colors } = useThemeContext();
  
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);

  // Get location on mount
  useEffect(() => {
    getLocation();
  }, []);

  const getLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Доступ к геолокации',
          'Для быстрого поиска мастеров необходим доступ к вашему местоположению',
          [{ text: 'OK' }]
        );
        // Use default location (Kyiv)
        setLocation({ lat: 50.4501, lng: 30.5234 });
        setLocationLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch (error) {
      console.log('Location error:', error);
      // Use default location
      setLocation({ lat: 50.4501, lng: 30.5234 });
    } finally {
      setLocationLoading(false);
    }
  };

  const handleServiceSelect = async (serviceType: string) => {
    if (!user || !token) {
      Alert.alert('Авторизация', 'Войдите в систему для создания заявки', [
        { text: 'Отмена' },
        { text: 'Войти', onPress: () => router.push('/login') },
      ]);
      return;
    }

    if (!location) {
      Alert.alert('Геолокация', 'Определяем ваше местоположение...');
      return;
    }

    setSelectedType(serviceType);
    setLoading(true);

    try {
      const response = await quotesAPI.quickRequest({
        serviceType,
        lat: location.lat,
        lng: location.lng,
        urgent: serviceType === 'urgent',
      });

      const { quote, matches } = response.data;

      // 🔥 AUTO-CONVERSION: Если есть лучший мастер — сразу Direct Mode!
      if (matches && matches.length > 0) {
        const topProvider = matches[0]; // Лучший мастер
        
        // Сразу на Direct Mode — минус 1 шаг = +30% конверсии
        router.push({
          pathname: '/direct',
          params: {
            providerId: topProvider.providerId || topProvider._id,
            lat: String(location.lat),
            lng: String(location.lng),
            mode: 'quick_request', // 🔥 Активирует "Лучший мастер для вас"
            providerName: topProvider.name,
          },
        });
      } else {
        // Нет мастеров — показываем matching экран
        router.push({
          pathname: '/quick-matching',
          params: {
            quoteId: quote._id,
            matches: JSON.stringify(matches || []),
            serviceType,
          },
        });
      }
    } catch (error: any) {
      console.log('Quick request error:', error);
      Alert.alert(
        'Ошибка',
        error.response?.data?.message || 'Не удалось создать заявку'
      );
    } finally {
      setLoading(false);
      setSelectedType(null);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Быстрая заявка</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Location status */}
        <View style={[styles.locationCard, { backgroundColor: colors.card }]}>
          <View style={styles.locationInfo}>
            <Ionicons 
              name={locationLoading ? 'location-outline' : 'location'} 
              size={20} 
              color={locationLoading ? colors.textSecondary : '#10B981'} 
            />
            <Text style={[styles.locationText, { color: colors.textSecondary }]}>
              {locationLoading ? 'Определяем местоположение...' : 'Местоположение определено'}
            </Text>
          </View>
          {locationLoading && <ActivityIndicator size="small" color={colors.primary} />}
        </View>

        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.text }]}>Что случилось?</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Выберите проблему — мы мгновенно найдем лучших мастеров
          </Text>
        </View>

        {/* Service Types Grid */}
        <View style={styles.grid}>
          {SERVICE_TYPES.map((service) => {
            const isSelected = selectedType === service.type;
            const isLoading = loading && isSelected;

            return (
              <TouchableOpacity
                key={service.type}
                style={[
                  styles.serviceCard,
                  { backgroundColor: colors.card },
                  isSelected && { borderColor: service.color, borderWidth: 2 },
                ]}
                onPress={() => handleServiceSelect(service.type)}
                disabled={loading}
                activeOpacity={0.7}
              >
                {isLoading ? (
                  <ActivityIndicator size="large" color={service.color} />
                ) : (
                  <>
                    <View style={[styles.iconCircle, { backgroundColor: `${service.color}15` }]}>
                      <Ionicons name={service.icon as any} size={28} color={service.color} />
                    </View>
                    <Text style={[styles.serviceLabel, { color: colors.text }]}>
                      {service.label}
                    </Text>
                    {service.type === 'urgent' && (
                      <View style={[styles.urgentBadge, { backgroundColor: '#DC2626' }]}>
                        <Text style={styles.urgentText}>24/7</Text>
                      </View>
                    )}
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Info Section */}
        <View style={[styles.infoSection, { backgroundColor: colors.card }]}>
          <View style={styles.infoRow}>
            <Ionicons name="flash" size={20} color="#F59E0B" />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              1 нажатие — заявка создана
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="people" size={20} color="#3B82F6" />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Мастера сразу получат вашу заявку
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time" size={20} color="#10B981" />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Средний ответ — 5 минут
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    marginBottom: 24,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationText: {
    fontSize: 14,
  },
  titleSection: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  serviceCard: {
    width: '47%',
    aspectRatio: 1.1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  serviceLabel: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  urgentBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  urgentText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  infoSection: {
    padding: 16,
    borderRadius: 16,
    gap: 12,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoText: {
    fontSize: 14,
    flex: 1,
  },
});
