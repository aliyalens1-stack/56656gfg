import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../src/context/ThemeContext';

const { width } = Dimensions.get('window');

interface MatchedProvider {
  providerId: string;
  branchId: string;
  name: string;
  matchingScore: number;
  reasons: string[];
  distanceKm: number;
  rating: number;
  reviewsCount?: number;
  isVerified: boolean;
  isPopular: boolean;
  isMobile: boolean;
  hasAvailableSlotsToday: boolean;
  priceFrom?: number;
  avgResponseTimeMinutes?: number;
  hasBoost?: boolean;
  lat: number;
  lng: number;
  address?: string;
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  engine_wont_start: 'Не заводится',
  oil_change: 'Замена масла',
  brakes: 'Тормоза',
  diagnostics: 'Диагностика',
  urgent: 'Срочный ремонт',
  suspension: 'Подвеска',
  electrical: 'Электрика',
  other: 'Другое',
};

export default function QuickMatchingScreen() {
  const { colors } = useThemeContext();
  const params = useLocalSearchParams();
  const quoteId = params.quoteId as string;
  const serviceType = params.serviceType as string;
  const matchesParam = params.matches as string;
  const [showAll, setShowAll] = useState(false);

  const matches: MatchedProvider[] = useMemo(() => {
    try { return JSON.parse(matchesParam || '[]'); }
    catch { return []; }
  }, [matchesParam]);

  const bestProvider = matches[0] || null;
  const others = matches.slice(1);

  const handleSelect = (provider: MatchedProvider) => {
    router.push({
      pathname: '/quick-confirm',
      params: {
        quoteId,
        providerId: provider.providerId || provider.branchId,
        branchId: provider.branchId,
        providerName: provider.name,
        matchingScore: String(provider.matchingScore),
        rating: String(provider.rating),
        priceFrom: String(provider.priceFrom || 0),
        address: provider.address || '',
        reasons: JSON.stringify(provider.reasons),
        distance: String(provider.distanceKm),
        eta: String(Math.round(provider.distanceKm * 4 + 3)),
      },
    });
  };

  if (!bestProvider) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Мастера не найдены</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Попробуйте расширить радиус поиска</Text>
          <TouchableOpacity testID="go-back-btn" onPress={() => router.back()} style={[styles.emptyBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.emptyBtnText}>Назад</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const eta = Math.round(bestProvider.distanceKm * 4 + 3);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {SERVICE_TYPE_LABELS[serviceType] || 'Результат'}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* HERO: "Мы нашли решение" */}
        <Text style={[styles.heroTitle, { color: colors.text }]}>Мы нашли для вас решение</Text>
        <Text style={[styles.heroSub, { color: colors.textSecondary }]}>Лучший мастер рядом с вами</Text>

        {/* BEST PROVIDER CARD */}
        <View testID="best-provider-card" style={[styles.bestCard, { backgroundColor: colors.card }]}>
          {/* Name + Rating */}
          <View style={styles.bestHeader}>
            <View style={styles.bestInfo}>
              <Text style={[styles.bestName, { color: colors.text }]}>{bestProvider.name}</Text>
              <View style={styles.bestMeta}>
                <Ionicons name="star" size={16} color="#F59E0B" />
                <Text style={[styles.bestRating, { color: colors.text }]}>{bestProvider.rating?.toFixed(1)}</Text>
                {bestProvider.reviewsCount ? <Text style={[styles.bestReviews, { color: colors.textSecondary }]}>({bestProvider.reviewsCount})</Text> : null}
              </View>
            </View>
            <View style={styles.matchBadge}>
              <Text style={styles.matchValue}>{bestProvider.matchingScore}%</Text>
              <Text style={styles.matchLabel}>match</Text>
            </View>
          </View>

          {/* Quick Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="location-outline" size={18} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.text }]}>{bestProvider.distanceKm} км</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="time-outline" size={18} color="#F59E0B" />
              <Text style={[styles.statValue, { color: colors.text }]}>~{eta} мин</Text>
            </View>
            {bestProvider.priceFrom ? (
              <View style={styles.statItem}>
                <Ionicons name="cash-outline" size={18} color="#10B981" />
                <Text style={[styles.statValue, { color: colors.text }]}>от {bestProvider.priceFrom} грн</Text>
              </View>
            ) : null}
          </View>

          {/* Badges */}
          <View style={styles.badgesRow}>
            {bestProvider.isVerified && (
              <View style={[styles.badge, { backgroundColor: '#10B98115' }]}>
                <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                <Text style={[styles.badgeText, { color: '#10B981' }]}>Проверенный</Text>
              </View>
            )}
            {bestProvider.hasAvailableSlotsToday && (
              <View style={[styles.badge, { backgroundColor: '#3B82F615' }]}>
                <Ionicons name="calendar" size={12} color="#3B82F6" />
                <Text style={[styles.badgeText, { color: '#3B82F6' }]}>Свободен сегодня</Text>
              </View>
            )}
            {bestProvider.isMobile && (
              <View style={[styles.badge, { backgroundColor: '#8B5CF615' }]}>
                <Ionicons name="car" size={12} color="#8B5CF6" />
                <Text style={[styles.badgeText, { color: '#8B5CF6' }]}>Выезд к вам</Text>
              </View>
            )}
            {(bestProvider.avgResponseTimeMinutes || 0) <= 10 && (
              <View style={[styles.badge, { backgroundColor: '#EF444415' }]}>
                <Ionicons name="flash" size={12} color="#EF4444" />
                <Text style={[styles.badgeText, { color: '#EF4444' }]}>Быстрый ответ</Text>
              </View>
            )}
          </View>

          {/* WHY THIS PROVIDER */}
          {bestProvider.reasons.length > 0 && (
            <View style={[styles.reasonsBox, { borderTopColor: colors.border }]}>
              <Text style={[styles.reasonsTitle, { color: colors.textSecondary }]}>Почему этот мастер?</Text>
              {bestProvider.reasons.slice(0, 4).map((reason, i) => (
                <View key={i} style={styles.reasonRow}>
                  <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                  <Text style={[styles.reasonText, { color: colors.text }]}>{reason}</Text>
                </View>
              ))}
            </View>
          )}

          {/* CONFIRM BUTTON */}
          <TouchableOpacity
            testID="confirm-best-btn"
            style={styles.confirmBtn}
            onPress={() => handleSelect(bestProvider)}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-circle" size={20} color="#FFF" />
            <Text style={styles.confirmBtnText}>Подтвердить</Text>
          </TouchableOpacity>
        </View>

        {/* SHOW OTHERS */}
        {others.length > 0 && !showAll && (
          <TouchableOpacity testID="show-others-btn" onPress={() => setShowAll(true)} style={styles.showOthersBtn}>
            <Text style={[styles.showOthersText, { color: colors.textSecondary }]}>
              Не подходит? Показать другие варианты ({others.length})
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        {/* OTHERS LIST (hidden by default) */}
        {showAll && others.map((p, i) => (
          <TouchableOpacity
            key={p.providerId || i}
            testID={`other-provider-${i}`}
            style={[styles.otherCard, { backgroundColor: colors.card }]}
            onPress={() => handleSelect(p)}
          >
            <View style={styles.otherRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.otherName, { color: colors.text }]}>{p.name}</Text>
                <View style={styles.otherMeta}>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text style={[styles.otherMetaText, { color: colors.textSecondary }]}>{p.rating?.toFixed(1)}</Text>
                  <Text style={[styles.otherMetaText, { color: colors.textSecondary }]}>• {p.distanceKm} км</Text>
                  {p.priceFrom ? <Text style={[styles.otherMetaText, { color: colors.textSecondary }]}>• от {p.priceFrom} грн</Text> : null}
                </View>
              </View>
              <View style={[styles.otherScore, { backgroundColor: '#10B98115' }]}>
                <Text style={styles.otherScoreText}>{p.matchingScore}%</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, paddingHorizontal: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },

  heroTitle: { fontSize: 24, fontWeight: '800', marginTop: 8 },
  heroSub: { fontSize: 14, marginTop: 4, marginBottom: 20 },

  bestCard: { borderRadius: 20, padding: 20, marginBottom: 16 },
  bestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  bestInfo: { flex: 1, marginRight: 12 },
  bestName: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  bestMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bestRating: { fontSize: 15, fontWeight: '600' },
  bestReviews: { fontSize: 13 },
  matchBadge: { backgroundColor: '#10B98118', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  matchValue: { fontSize: 18, fontWeight: '800', color: '#10B981' },
  matchLabel: { fontSize: 9, color: '#10B981', textTransform: 'uppercase', fontWeight: '600' },

  statsRow: { flexDirection: 'row', gap: 20, marginBottom: 14 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: { fontSize: 14, fontWeight: '600' },

  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, gap: 4 },
  badgeText: { fontSize: 11, fontWeight: '500' },

  reasonsBox: { borderTopWidth: 1, paddingTop: 14, marginBottom: 16 },
  reasonsTitle: { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  reasonText: { fontSize: 13, flex: 1 },

  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 14 },
  confirmBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },

  showOthersBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  showOthersText: { fontSize: 14 },

  otherCard: { borderRadius: 14, padding: 14, marginBottom: 8 },
  otherRow: { flexDirection: 'row', alignItems: 'center' },
  otherName: { fontSize: 15, fontWeight: '600' },
  otherMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  otherMetaText: { fontSize: 12 },
  otherScore: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  otherScoreText: { fontSize: 14, fontWeight: '700', color: '#10B981' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', marginBottom: 20 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText: { color: '#FFF', fontWeight: '600' },
});
