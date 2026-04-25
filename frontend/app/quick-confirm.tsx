import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../src/context/ThemeContext';
import { quotesAPI, bookingsAPI } from '../src/services/api';

export default function QuickConfirmScreen() {
  const { colors } = useThemeContext();
  const params = useLocalSearchParams();
  
  const quoteId = params.quoteId as string;
  const providerId = params.providerId as string;
  const branchId = params.branchId as string;
  const providerName = params.providerName as string;
  const matchingScore = parseInt(params.matchingScore as string) || 0;
  const rating = parseFloat(params.rating as string) || 4.5;
  const priceFrom = parseFloat(params.priceFrom as string) || 0;
  const address = params.address as string;
  
  let reasons: string[] = [];
  try {
    reasons = JSON.parse(params.reasons as string || '[]');
  } catch {}

  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      // Navigate to success screen directly
      router.replace({
        pathname: '/quick-success',
        params: {
          providerName,
          quoteId,
        },
      });
    } catch (error: any) {
      console.log('Confirm error:', error);
      Alert.alert('Ошибка', error.response?.data?.message || 'Не удалось подтвердить');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Подтверждение</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Provider Card */}
        <View style={[styles.providerCard, { backgroundColor: colors.card }]}>
          {/* Name & Rating */}
          <View style={styles.providerHeader}>
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>
                {providerName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.providerInfo}>
              <Text style={[styles.providerName, { color: colors.text }]} numberOfLines={1}>
                {providerName}
              </Text>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={14} color="#F59E0B" />
                <Text style={[styles.ratingText, { color: colors.text }]}>
                  {rating.toFixed(1)}
                </Text>
              </View>
            </View>
            <View style={styles.matchBadge}>
              <Text style={styles.matchText}>{matchingScore}%</Text>
              <Text style={styles.matchLabel}>match</Text>
            </View>
          </View>

          {/* Address */}
          {address && (
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
              <Text style={[styles.addressText, { color: colors.textSecondary }]}>
                {address}
              </Text>
            </View>
          )}

          {/* Reasons */}
          {reasons.length > 0 && (
            <View style={styles.reasonsBox}>
              <Text style={[styles.reasonsTitle, { color: colors.text }]}>
                Почему выбрать:
              </Text>
              {reasons.map((reason, i) => (
                <View key={i} style={styles.reasonRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                  <Text style={[styles.reasonText, { color: colors.text }]}>{reason}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Price Section */}
        <View style={[styles.priceSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.priceSectionTitle, { color: colors.textSecondary }]}>
            Ориентировочная цена
          </Text>
          <Text style={[styles.priceValue, { color: colors.text }]}>
            {priceFrom > 0 ? `от ${priceFrom} ₴` : 'По договорённости'}
          </Text>
          <Text style={[styles.priceNote, { color: colors.textSecondary }]}>
            Точная цена после осмотра
          </Text>
        </View>

        {/* Info Cards */}
        <View style={styles.infoCards}>
          <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
            <Ionicons name="time-outline" size={24} color="#3B82F6" />
            <Text style={[styles.infoCardTitle, { color: colors.text }]}>
              Быстрый ответ
            </Text>
            <Text style={[styles.infoCardText, { color: colors.textSecondary }]}>
              Мастер ответит в течение 15 минут
            </Text>
          </View>

          <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#10B981" />
            <Text style={[styles.infoCardTitle, { color: colors.text }]}>
              Гарантия
            </Text>
            <Text style={[styles.infoCardText, { color: colors.textSecondary }]}>
              Защита через платформу
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Action */}
      <View style={[styles.bottomAction, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={[
            styles.confirmButton,
            { backgroundColor: colors.primary },
            confirming && { opacity: 0.7 },
          ]}
          onPress={handleConfirm}
          disabled={confirming}
        >
          {confirming ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.confirmButtonText}>Подтвердить</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={[styles.bottomNote, { color: colors.textSecondary }]}>
          Вы сможете отменить до начала работ
        </Text>
      </View>
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
  providerCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  providerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
  },
  providerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  providerName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  matchBadge: {
    backgroundColor: '#10B98115',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  matchText: {
    color: '#10B981',
    fontSize: 18,
    fontWeight: '700',
  },
  matchLabel: {
    color: '#10B981',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  addressText: {
    fontSize: 14,
    flex: 1,
  },
  reasonsBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    borderRadius: 12,
  },
  reasonsTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  reasonText: {
    fontSize: 14,
  },
  priceSection: {
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  priceSectionTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  priceNote: {
    fontSize: 12,
    marginTop: 4,
  },
  infoCards: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  infoCard: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  infoCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  infoCardText: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  bottomAction: {
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
  },
});
