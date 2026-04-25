import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../src/context/ThemeContext';
import api from '../src/services/api';

interface BoostPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  duration: number;
  extraLeadsPercent: number;
  multiplier: number;
  benefits: string[];
  popular?: boolean;
}

export default function ProviderBoostScreen() {
  const { colors } = useThemeContext();
  const params = useLocalSearchParams();
  const organizationId = params.orgId as string;

  const [plans, setPlans] = useState<BoostPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const response = await api.get('/organizations/boost/plans');
      setPlans(response.data);
      // Select popular plan by default
      const popular = response.data.find((p: BoostPlan) => p.popular);
      if (popular) setSelectedPlan(popular.id);
    } catch (error) {
      console.log('Error loading plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (planId: string) => {
    if (!organizationId) {
      Alert.alert('Ошибка', 'Организация не найдена');
      return;
    }

    setActivating(planId);
    try {
      const response = await api.post(`/organizations/${organizationId}/boost/activate`, {
        planId,
      });

      if (response.data.success) {
        Alert.alert(
          'Boost активирован!',
          response.data.message,
          [{ text: 'Отлично', onPress: () => router.back() }]
        );
      }
    } catch (error: any) {
      Alert.alert('Ошибка', error.response?.data?.message || 'Не удалось активировать boost');
    } finally {
      setActivating(null);
    }
  };

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'basic': return 'flash';
      case 'pro': return 'rocket';
      case 'premium': return 'crown';
      default: return 'star';
    }
  };

  const getPlanColor = (planId: string) => {
    switch (planId) {
      case 'basic': return '#3B82F6';
      case 'pro': return '#8B5CF6';
      case 'premium': return '#F59E0B';
      default: return colors.primary;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Boost</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Ionicons name="trending-up" size={48} color={colors.primary} />
          <Text style={[styles.heroTitle, { color: colors.text }]}>
            Получайте больше заказов
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
            Boost повышает ваш приоритет в поиске и на карте
          </Text>
        </View>

        {/* Plans */}
        {plans.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          const isLoading = activating === plan.id;
          const planColor = getPlanColor(plan.id);

          return (
            <TouchableOpacity
              key={plan.id}
              style={[
                styles.planCard,
                { backgroundColor: colors.card },
                isSelected && { borderColor: planColor, borderWidth: 2 },
              ]}
              onPress={() => setSelectedPlan(plan.id)}
              activeOpacity={0.7}
            >
              {plan.popular && (
                <View style={[styles.popularBadge, { backgroundColor: planColor }]}>
                  <Text style={styles.popularText}>Популярный</Text>
                </View>
              )}

              <View style={styles.planHeader}>
                <View style={[styles.planIconCircle, { backgroundColor: planColor + '20' }]}>
                  <Ionicons name={getPlanIcon(plan.id) as any} size={24} color={planColor} />
                </View>
                <View style={styles.planInfo}>
                  <Text style={[styles.planName, { color: colors.text }]}>{plan.name}</Text>
                  <Text style={[styles.planDesc, { color: planColor }]}>{plan.description}</Text>
                </View>
                <View style={styles.planPrice}>
                  <Text style={[styles.priceValue, { color: colors.text }]}>${plan.price}</Text>
                  <Text style={[styles.priceUnit, { color: colors.textSecondary }]}>/мес</Text>
                </View>
              </View>

              <View style={styles.benefitsList}>
                {plan.benefits.map((benefit, i) => (
                  <View key={i} style={styles.benefitRow}>
                    <Ionicons name="checkmark-circle" size={18} color={planColor} />
                    <Text style={[styles.benefitText, { color: colors.text }]}>{benefit}</Text>
                  </View>
                ))}
              </View>

              {isSelected && (
                <TouchableOpacity
                  style={[styles.activateButton, { backgroundColor: planColor }]}
                  onPress={() => handleActivate(plan.id)}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.activateButtonText}>Активировать</Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </>
                  )}
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Info */}
        <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.infoTitle, { color: colors.text }]}>Как работает Boost?</Text>
          
          <View style={styles.infoRow}>
            <Ionicons name="search" size={20} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Ваш профиль показывается выше в результатах поиска
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="map" size={20} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Выделение на карте привлекает больше внимания
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="flash" size={20} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Quick Request приоритет — первые заявки приходят к вам
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Отмена в любое время без дополнительных платежей
            </Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
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
  hero: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
  },
  planCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    position: 'relative',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  popularText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  planIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planInfo: {
    flex: 1,
    marginLeft: 12,
  },
  planName: {
    fontSize: 18,
    fontWeight: '600',
  },
  planDesc: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  planPrice: {
    alignItems: 'flex-end',
  },
  priceValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  priceUnit: {
    fontSize: 12,
  },
  benefitsList: {
    gap: 8,
    marginBottom: 16,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  benefitText: {
    fontSize: 14,
  },
  activateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  activateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoCard: {
    borderRadius: 16,
    padding: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
});
