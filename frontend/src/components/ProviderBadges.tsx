import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface BadgeConfig {
  isVerified?: boolean;
  isPopular?: boolean;
  isMobile?: boolean;
  hasAvailableSlotsToday?: boolean;
  isFastResponse?: boolean;
  isMatched?: boolean;
  visibilityScore?: number;
}

interface ProviderBadgesProps {
  config: BadgeConfig;
  size?: 'small' | 'medium';
  limit?: number;
}

const BADGE_DEFS = [
  {
    key: 'isVerified',
    icon: 'checkmark-circle',
    label: 'Проверенный',
    bg: '#DCFCE7',
    color: '#166534',
    iconColor: '#16A34A',
  },
  {
    key: 'isPopular',
    icon: 'flame',
    label: 'Популярный',
    bg: '#FEF3C7',
    color: '#92400E',
    iconColor: '#D97706',
  },
  {
    key: 'isFastResponse',
    icon: 'flash',
    label: 'Быстро',
    bg: '#DBEAFE',
    color: '#1E40AF',
    iconColor: '#2563EB',
  },
  {
    key: 'hasAvailableSlotsToday',
    icon: 'time',
    label: 'Сегодня',
    bg: '#E0E7FF',
    color: '#3730A3',
    iconColor: '#4F46E5',
  },
  {
    key: 'isMobile',
    icon: 'car',
    label: 'Выезд',
    bg: '#F3E8FF',
    color: '#5B21B6',
    iconColor: '#7C3AED',
  },
  {
    key: 'isMatched',
    icon: 'sparkles',
    label: 'Подходит вам',
    bg: '#FFF7ED',
    color: '#9A3412',
    iconColor: '#EA580C',
  },
] as const;

// Check if a provider has fast response based on avgResponseTimeMinutes
export function computeBadgeConfig(provider: any): BadgeConfig {
  return {
    isVerified: !!provider.isVerified,
    isPopular: !!provider.isPopular,
    isMobile: !!provider.isMobile,
    hasAvailableSlotsToday: !!provider.hasAvailableSlotsToday,
    isFastResponse: (provider.avgResponseTimeMinutes || 999) <= 15,
    isMatched: (provider.matchingScore || 0) >= 70,
    visibilityScore: provider.visibilityScore,
  };
}

export default function ProviderBadges({ config, size = 'medium', limit }: ProviderBadgesProps) {
  const activeBadges = BADGE_DEFS.filter((def) => config[def.key as keyof BadgeConfig]);
  const displayBadges = limit ? activeBadges.slice(0, limit) : activeBadges;

  if (displayBadges.length === 0) return null;

  const isSmall = size === 'small';

  return (
    <View style={styles.container}>
      {displayBadges.map((badge) => (
        <View
          key={badge.key}
          style={[
            styles.badge,
            { backgroundColor: badge.bg },
            isSmall && styles.badgeSmall,
          ]}
        >
          <Ionicons
            name={badge.icon as any}
            size={isSmall ? 10 : 12}
            color={badge.iconColor}
          />
          <Text
            style={[
              styles.badgeText,
              { color: badge.color },
              isSmall && styles.badgeTextSmall,
            ]}
          >
            {badge.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  badgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  badgeTextSmall: {
    fontSize: 10,
  },
});
