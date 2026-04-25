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
import { useAuth } from '../src/context/AuthContext';
import api from '../src/services/api';

interface PressureStats {
  missedRequests: {
    today: number;
    thisWeek: number;
    reasons: string[];
  };
  healthScore: {
    score: number;
    breakdown: {
      responseSpeed: { score: number; label: string };
      rating: { score: number; label: string };
      completionRate: { score: number; label: string };
      activityLevel: { score: number; label: string };
    };
    positives: string[];
    negatives: string[];
  };
  nearbyOpportunities: {
    todayCount: number;
    potentialRevenue: number;
  };
  commission: {
    currentRate: number;
    breakdown: {
      base: number;
      loyaltyDiscount: number;
      ratingBonus: number;
      responseBonus: number;
      missedPenalty: number;
    };
    nextGoal: { rate: number; description: string };
    tips: string[];
  };
  boost: {
    isActive: boolean;
    expiresAt: string | null;
    currentPlan: string | null;
    extraLeadsPercent: number;
  };
  summary: {
    moneyLostToday: number;
    potentialWithBoost: number;
    urgentActions: string[];
  };
}

export default function ProviderDashboardScreen() {
  const { colors } = useThemeContext();
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const organizationId = params.orgId as string;

  const [stats, setStats] = useState<PressureStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (organizationId) {
      loadStats();
    }
  }, [organizationId]);

  const loadStats = async () => {
    try {
      const response = await api.get(`/organizations/${organizationId}/pressure`);
      setStats(response.data);
    } catch (error) {
      console.log('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  if (!stats) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>
          Не удалось загрузить данные
        </Text>
      </SafeAreaView>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 75) return '#10B981';
    if (score >= 50) return '#F59E0B';
    return '#EF4444';
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Эффективность</Text>
        <TouchableOpacity onPress={loadStats}>
          <Ionicons name="refresh" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* 🔴 URGENT BLOCK — You're Losing Orders */}
        {stats.missedRequests.today > 0 && (
          <View style={[styles.urgentCard, { backgroundColor: '#FEE2E2' }]}>
            <View style={styles.urgentHeader}>
              <Ionicons name="alert-circle" size={24} color="#DC2626" />
              <Text style={styles.urgentTitle}>Вы теряете заказы</Text>
            </View>
            <Text style={styles.urgentValue}>
              {stats.missedRequests.today} заявок пропущено сегодня
            </Text>
            <View style={styles.reasonsList}>
              {stats.missedRequests.reasons.map((reason, i) => (
                <View key={i} style={styles.reasonRow}>
                  <Ionicons name="close-circle" size={16} color="#DC2626" />
                  <Text style={styles.reasonText}>{reason}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={styles.urgentButton}
              onPress={() => router.push({ pathname: '/provider-boost', params: { orgId: organizationId } })}
            >
              <Ionicons name="trending-up" size={18} color="#fff" />
              <Text style={styles.urgentButtonText}>Повысить приоритет</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 🟡 HEALTH SCORE */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Ваш рейтинг</Text>
            <View style={[styles.scoreBadge, { backgroundColor: getScoreColor(stats.healthScore.score) + '20' }]}>
              <Text style={[styles.scoreValue, { color: getScoreColor(stats.healthScore.score) }]}>
                {stats.healthScore.score}/100
              </Text>
            </View>
          </View>

          {/* Score Breakdown */}
          <View style={styles.breakdownList}>
            {Object.entries(stats.healthScore.breakdown).map(([key, value]) => (
              <View key={key} style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>
                  {key === 'responseSpeed' ? 'Скорость ответа' :
                   key === 'rating' ? 'Рейтинг' :
                   key === 'completionRate' ? 'Выполнение' : 'Активность'}
                </Text>
                <View style={styles.breakdownValue}>
                  <Text style={[styles.breakdownScore, { color: colors.text }]}>
                    {value.score}/25
                  </Text>
                  <Text style={[styles.breakdownStatus, { 
                    color: value.label === 'Отлично' ? '#10B981' : 
                           value.label === 'Хорошо' ? '#3B82F6' : '#F59E0B'
                  }]}>
                    {value.label}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Positives / Negatives */}
          <View style={styles.feedbackSection}>
            {stats.healthScore.positives.map((pos, i) => (
              <View key={i} style={styles.feedbackRow}>
                <Ionicons name="add-circle" size={16} color="#10B981" />
                <Text style={[styles.feedbackText, { color: '#10B981' }]}>{pos}</Text>
              </View>
            ))}
            {stats.healthScore.negatives.map((neg, i) => (
              <View key={i} style={styles.feedbackRow}>
                <Ionicons name="remove-circle" size={16} color="#EF4444" />
                <Text style={[styles.feedbackText, { color: '#EF4444' }]}>{neg}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 🟢 FOMO — Nearby Opportunities */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Заявки рядом</Text>
            <Ionicons name="location" size={20} color="#10B981" />
          </View>
          <View style={styles.fomoContent}>
            <View style={styles.fomoStat}>
              <Text style={[styles.fomoValue, { color: colors.text }]}>
                {stats.nearbyOpportunities.todayCount}
              </Text>
              <Text style={[styles.fomoLabel, { color: colors.textSecondary }]}>
                доступно сегодня
              </Text>
            </View>
            <View style={styles.fomoStat}>
              <Text style={[styles.fomoValue, { color: '#10B981' }]}>
                ${stats.nearbyOpportunities.potentialRevenue}
              </Text>
              <Text style={[styles.fomoLabel, { color: colors.textSecondary }]}>
                потенциальный доход
              </Text>
            </View>
          </View>
          {!stats.boost.isActive && (
            <TouchableOpacity
              style={[styles.fomoButton, { backgroundColor: colors.primary + '15' }]}
              onPress={() => router.push({ pathname: '/provider-boost', params: { orgId: organizationId } })}
            >
              <Text style={[styles.fomoButtonText, { color: colors.primary }]}>
                Получить больше заявок
              </Text>
              <Ionicons name="arrow-forward" size={18} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* 💰 COMMISSION BREAKDOWN */}
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.card }]}
          onPress={() => router.push({ pathname: '/provider-commission', params: { orgId: organizationId } })}
        >
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Комиссия</Text>
            <View style={styles.commissionBadge}>
              <Text style={styles.commissionValue}>{stats.commission.currentRate}%</Text>
            </View>
          </View>
          <View style={styles.commissionBreakdown}>
            <View style={styles.commissionRow}>
              <Text style={[styles.commissionLabel, { color: colors.textSecondary }]}>База</Text>
              <Text style={[styles.commissionAmount, { color: colors.text }]}>{stats.commission.breakdown.base}%</Text>
            </View>
            {stats.commission.breakdown.ratingBonus > 0 && (
              <View style={styles.commissionRow}>
                <Text style={[styles.commissionLabel, { color: '#10B981' }]}>Высокий рейтинг</Text>
                <Text style={[styles.commissionAmount, { color: '#10B981' }]}>-{stats.commission.breakdown.ratingBonus}%</Text>
              </View>
            )}
            {stats.commission.breakdown.responseBonus > 0 && (
              <View style={styles.commissionRow}>
                <Text style={[styles.commissionLabel, { color: '#10B981' }]}>Быстрые ответы</Text>
                <Text style={[styles.commissionAmount, { color: '#10B981' }]}>-{stats.commission.breakdown.responseBonus}%</Text>
              </View>
            )}
            {stats.commission.breakdown.missedPenalty > 0 && (
              <View style={styles.commissionRow}>
                <Text style={[styles.commissionLabel, { color: '#EF4444' }]}>Пропущенные заявки</Text>
                <Text style={[styles.commissionAmount, { color: '#EF4444' }]}>+{stats.commission.breakdown.missedPenalty}%</Text>
              </View>
            )}
          </View>
          <View style={styles.goalSection}>
            <Text style={[styles.goalText, { color: colors.primary }]}>
              Снизьте комиссию до {stats.commission.nextGoal.rate}%
            </Text>
            <Text style={[styles.goalHint, { color: colors.textSecondary }]}>
              {stats.commission.nextGoal.description}
            </Text>
          </View>
        </TouchableOpacity>

        {/* 🚀 BOOST STATUS */}
        <TouchableOpacity
          style={[styles.card, { backgroundColor: stats.boost.isActive ? '#10B98115' : colors.card }]}
          onPress={() => router.push({ pathname: '/provider-boost', params: { orgId: organizationId } })}
        >
          <View style={styles.cardHeader}>
            <View style={styles.boostHeader}>
              <Ionicons 
                name={stats.boost.isActive ? 'rocket' : 'rocket-outline'} 
                size={24} 
                color={stats.boost.isActive ? '#10B981' : colors.textSecondary} 
              />
              <Text style={[styles.cardTitle, { color: colors.text, marginLeft: 8 }]}>
                {stats.boost.isActive ? 'Boost активен' : 'Boost'}
              </Text>
            </View>
            {stats.boost.isActive && (
              <View style={styles.boostBadge}>
                <Text style={styles.boostBadgeText}>+{stats.boost.extraLeadsPercent}%</Text>
              </View>
            )}
          </View>
          {stats.boost.isActive ? (
            <Text style={[styles.boostExpires, { color: colors.textSecondary }]}>
              Активен до {new Date(stats.boost.expiresAt!).toLocaleDateString()}
            </Text>
          ) : (
            <View style={styles.boostCta}>
              <Text style={[styles.boostCtaText, { color: colors.text }]}>
                Получайте до +150% заявок
              </Text>
              <Ionicons name="arrow-forward" size={18} color={colors.primary} />
            </View>
          )}
        </TouchableOpacity>

        {/* SUMMARY */}
        {stats.summary.urgentActions.length > 0 && (
          <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.summaryTitle, { color: colors.text }]}>Рекомендации</Text>
            {stats.summary.urgentActions.map((action, i) => (
              <View key={i} style={styles.summaryRow}>
                <Ionicons name="bulb" size={18} color="#F59E0B" />
                <Text style={[styles.summaryText, { color: colors.text }]}>{action}</Text>
              </View>
            ))}
          </View>
        )}

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
  errorText: {
    textAlign: 'center',
    marginTop: 100,
  },
  // Urgent Card
  urgentCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  urgentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  urgentTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#DC2626',
  },
  urgentValue: {
    fontSize: 15,
    color: '#991B1B',
    marginBottom: 12,
  },
  reasonsList: {
    gap: 6,
    marginBottom: 16,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reasonText: {
    fontSize: 14,
    color: '#7F1D1D',
  },
  urgentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    borderRadius: 10,
  },
  urgentButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  // Card
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  scoreBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  scoreValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  // Breakdown
  breakdownList: {
    gap: 12,
    marginBottom: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 14,
  },
  breakdownValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breakdownScore: {
    fontSize: 14,
    fontWeight: '600',
  },
  breakdownStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Feedback
  feedbackSection: {
    gap: 6,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  feedbackText: {
    fontSize: 13,
  },
  // FOMO
  fomoContent: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 16,
  },
  fomoStat: {
    alignItems: 'center',
  },
  fomoValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  fomoLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  fomoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  fomoButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Commission
  commissionBadge: {
    backgroundColor: '#3B82F615',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  commissionValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3B82F6',
  },
  commissionBreakdown: {
    gap: 8,
    marginBottom: 16,
  },
  commissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  commissionLabel: {
    fontSize: 14,
  },
  commissionAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  goalSection: {
    padding: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 10,
  },
  goalText: {
    fontSize: 14,
    fontWeight: '600',
  },
  goalHint: {
    fontSize: 12,
    marginTop: 4,
  },
  // Boost
  boostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  boostBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  boostBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  boostExpires: {
    fontSize: 13,
  },
  boostCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  boostCtaText: {
    fontSize: 14,
  },
  // Summary
  summaryCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 14,
    flex: 1,
  },
});
