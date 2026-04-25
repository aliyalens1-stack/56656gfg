/**
 * Sprint 11 — Provider Action Hub
 * Money cockpit with earnings, lost revenue pressure, opportunities, demand zone.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { providerIntelligenceAPI } from '../services/api';

type Props = { colors: any };

export default function ProviderActionHub({ colors }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [earnings, setEarnings] = useState<any>(null);
  const [lost, setLost] = useState<any>(null);
  const [opps, setOpps] = useState<any[]>([]);
  const [demand, setDemand] = useState<any>(null);
  const [perf, setPerf] = useState<any>(null);
  const [intel, setIntel] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, l, o, d, p, i] = await Promise.all([
        providerIntelligenceAPI.getEarnings().catch(() => ({ data: null })),
        providerIntelligenceAPI.getLostRevenue().catch(() => ({ data: null })),
        providerIntelligenceAPI.getOpportunities().catch(() => ({ data: { opportunities: [] } })),
        providerIntelligenceAPI.getDemand().catch(() => ({ data: null })),
        providerIntelligenceAPI.getPerformance().catch(() => ({ data: null })),
        providerIntelligenceAPI.getIntelligence().catch(() => ({ data: null })),
      ]);
      setEarnings(e.data);
      setLost(l.data);
      setOpps(((o.data as any)?.opportunities || (o.data as any)?.items || []).slice(0, 4));
      setDemand(d.data);
      setPerf(p.data);
      setIntel(i.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const today = earnings?.today?.total ?? earnings?.today ?? 0;
  const week = earnings?.week?.total ?? earnings?.week ?? 0;
  const month = earnings?.month?.total ?? earnings?.month ?? 0;
  // Sprint 11 — lost revenue shape: { today: {missed, lostRevenue}, week, month, reasons[] }
  const lostAmount = lost?.today?.lostRevenue ?? lost?.totalLost ?? lost?.lostRevenue ?? lost?.amount ?? 0;
  const missedJobs = lost?.today?.missed ?? lost?.missedJobs ?? lost?.missedBookings ?? 0;
  const tier = intel?.tier || perf?.tier || 'Bronze';
  const score = perf?.score ?? intel?.score ?? 0;
  const topZone = demand?.topZone || demand?.zones?.[0];

  if (loading && !earnings && !lost) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <ActivityIndicator color={colors?.primary || '#4F46E5'} />
      </View>
    );
  }

  return (
    <View testID="provider-action-hub" style={{ padding: 16 }}>
      {/* Tier & score */}
      <View style={styles.tierCard}>
        <View style={styles.tierIconWrap}>
          <Ionicons name="trophy" size={22} color="#D97706" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tierLabel}>TIER</Text>
          <Text style={styles.tierName}>
            {tier} · score {score}
          </Text>
        </View>
      </View>

      {/* Earnings cards */}
      <Text style={styles.sectionTitle}>💰 Заработок</Text>
      <View style={styles.earningsRow}>
        <EarnCard label="Сегодня" value={today} accent="#10B981" testId="earn-today" />
        <EarnCard label="Неделя" value={week} accent="#3B82F6" testId="earn-week" />
        <EarnCard label="Месяц" value={month} accent="#A855F7" testId="earn-month" />
      </View>

      {/* Pressure UX — lost revenue */}
      {lostAmount > 0 && (
        <TouchableOpacity
          testID="lost-revenue-card"
          onPress={() => router.push('/provider-boost')}
          style={styles.lostCard}
          activeOpacity={0.85}
        >
          <Ionicons name="trending-down" size={22} color="#DC2626" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.lostTitle}>Вы потеряли {lostAmount} ₴</Text>
            <Text style={styles.lostSub}>
              {missedJobs > 0
                ? `Пропущено ${missedJobs} заказ${missedJobs > 1 ? 'ов' : ''} — `
                : ''}
              включите Priority (+37%)
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#DC2626" />
        </TouchableOpacity>
      )}

      {/* Demand zone pressure */}
      {topZone && (
        <TouchableOpacity
          testID="demand-zone-card"
          onPress={() => router.push('/map')}
          style={styles.demandCard}
          activeOpacity={0.85}
        >
          <Ionicons name="location" size={22} color="#0F766E" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.demandTitle}>
              Перейдите в {topZone.name || topZone.id}
            </Text>
            <Text style={styles.demandSub}>
              {topZone.demandScore ?? 0} заявок · surge ×
              {topZone.surgeMultiplier || 1}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#0F766E" />
        </TouchableOpacity>
      )}

      {/* Opportunities */}
      {opps.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>🔥 Возможности</Text>
          {opps.map((o: any, i: number) => (
            <View key={i} testID={`opp-${i}`} style={styles.oppRow}>
              <View style={styles.oppIcon}>
                <Ionicons name="flame" size={16} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.oppTitle} numberOfLines={1}>
                  {o.title || o.name || 'Возможность'}
                </Text>
                <Text style={styles.oppSub} numberOfLines={2}>
                  {o.description || o.reason || ''}
                  {o.potentialRevenue && (
                    <Text style={styles.oppRevenue}>
                      {'  +'}{o.potentialRevenue} ₴
                    </Text>
                  )}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push(o.ctaRoute || '/provider-boost')}
                style={styles.oppBtn}
              >
                <Text style={styles.oppBtnText}>{o.ctaLabel || 'Взять'}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      {/* Performance */}
      {perf && (
        <>
          <Text style={styles.sectionTitle}>📊 Производительность</Text>
          <View style={styles.perfRow}>
            <PerfCard label="Принято" value={`${perf.acceptanceRate ?? 0}%`} />
            <PerfCard label="Отмены" value={`${perf.cancellationRate ?? 0}%`} />
            <PerfCard label="Рейтинг" value={perf.avgRating ?? '—'} />
          </View>
        </>
      )}
    </View>
  );
}

function EarnCard({
  label, value, accent, testId,
}: {
  label: string;
  value: number;
  accent: string;
  testId: string;
}) {
  return (
    <View testID={testId} style={[styles.earnCard, { borderColor: accent + '40' }]}>
      <Text style={styles.earnLabel}>{label}</Text>
      <Text style={[styles.earnValue, { color: accent }]}>
        {typeof value === 'number' ? `${value} ₴` : value}
      </Text>
    </View>
  );
}

function PerfCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.perfCard}>
      <Text style={styles.perfLabel}>{label}</Text>
      <Text style={styles.perfValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    marginBottom: 16,
  },
  tierIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  tierLabel: { fontSize: 10, color: '#92400E', letterSpacing: 1 },
  tierName: { fontSize: 16, fontWeight: '700', color: '#78350F' },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 16,
    marginBottom: 8,
  },
  earningsRow: { flexDirection: 'row', gap: 8 },
  earnCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#fff',
  },
  earnLabel: { fontSize: 11, color: '#64748B' },
  earnValue: { fontSize: 18, fontWeight: '700', marginTop: 4 },

  lostCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    marginTop: 12,
  },
  lostTitle: { fontSize: 15, fontWeight: '700', color: '#991B1B' },
  lostSub: { fontSize: 12, color: '#7F1D1D', marginTop: 2 },

  demandCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#ECFEFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: 12,
  },
  demandTitle: { fontSize: 15, fontWeight: '700', color: '#0F766E' },
  demandSub: { fontSize: 12, color: '#115E59', marginTop: 2 },

  oppRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
  },
  oppIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  oppTitle: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  oppSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  oppRevenue: { color: '#10B981', fontWeight: '700' },
  oppBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    marginLeft: 6,
  },
  oppBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  perfRow: { flexDirection: 'row', gap: 8 },
  perfCard: {
    flex: 1,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  perfLabel: { fontSize: 11, color: '#64748B' },
  perfValue: { fontSize: 18, fontWeight: '700', marginTop: 4, color: '#0F172A' },
});
