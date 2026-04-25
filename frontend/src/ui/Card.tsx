import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../theme';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  elevated?: boolean;
  style?: ViewStyle;
}

export function Card({ children, onPress, elevated = false, style }: CardProps) {
  const colors = Colors.dark;
  
  const Container = onPress ? TouchableOpacity : View;
  
  return (
    <Container
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={[
        styles.card,
        { backgroundColor: elevated ? colors.cardElevated : colors.card },
        style,
      ]}
    >
      {children}
    </Container>
  );
}

// Service Provider Card (СТО)
interface ProviderCardProps {
  name: string;
  rating?: number;
  reviewsCount?: number;
  distance?: number | null;
  responseTime?: number;
  address?: string;
  onPress?: () => void;
  onBook?: () => void;
}

export function ProviderCard({
  name,
  rating = 5.0,
  reviewsCount = 0,
  distance,
  responseTime,
  address,
  onPress,
  onBook,
}: ProviderCardProps) {
  const colors = Colors.dark;
  
  return (
    <Card onPress={onPress} style={styles.providerCard}>
      <View style={styles.providerHeader}>
        <View style={[styles.providerIcon, { backgroundColor: colors.infoBg }]}>
          <Ionicons name="business" size={24} color={colors.primary} />
        </View>
        <View style={styles.providerInfo}>
          <Text style={[styles.providerName, { color: colors.text }]} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.providerMeta}>
            <Ionicons name="star" size={14} color="#FBBF24" />
            <Text style={[styles.providerRating, { color: colors.text }]}>
              {rating.toFixed(1)}
            </Text>
            <Text style={[styles.providerReviews, { color: colors.textMuted }]}>
              ({reviewsCount})
            </Text>
          </View>
        </View>
      </View>
      
      <View style={styles.providerDetails}>
        {distance !== null && distance !== undefined && (
          <View style={styles.detailItem}>
            <Ionicons name="location" size={14} color={colors.textSecondary} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>
              {distance < 1 ? `${(distance * 1000).toFixed(0)} м` : `${distance.toFixed(1)} км`}
            </Text>
          </View>
        )}
        {responseTime && (
          <View style={styles.detailItem}>
            <Ionicons name="flash" size={14} color={colors.warning} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>
              ~{responseTime} мин
            </Text>
          </View>
        )}
      </View>
      
      {address && (
        <Text style={[styles.providerAddress, { color: colors.textMuted }]} numberOfLines={1}>
          {address}
        </Text>
      )}
      
      {onBook && (
        <TouchableOpacity
          style={[styles.bookButton, { backgroundColor: colors.primary }]}
          onPress={(e) => {
            e.stopPropagation?.();
            onBook();
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.bookButtonText}>Записаться</Text>
        </TouchableOpacity>
      )}
    </Card>
  );
}

// Booking Card
interface BookingCardProps {
  serviceName: string;
  providerName: string;
  date: string;
  time?: string;
  status: string;
  statusColor?: string;
  price?: number;
  onPress?: () => void;
}

export function BookingCard({
  serviceName,
  providerName,
  date,
  time,
  status,
  statusColor,
  price,
  onPress,
}: BookingCardProps) {
  const colors = Colors.dark;
  
  return (
    <Card onPress={onPress} style={styles.bookingCard}>
      <View style={styles.bookingHeader}>
        <View style={styles.bookingInfo}>
          <Text style={[styles.bookingService, { color: colors.text }]} numberOfLines={1}>
            {serviceName}
          </Text>
          <Text style={[styles.bookingProvider, { color: colors.textSecondary }]} numberOfLines={1}>
            {providerName}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor || colors.infoBg }]}>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      </View>
      
      <View style={styles.bookingMeta}>
        <View style={styles.bookingDate}>
          <Ionicons name="calendar" size={16} color={colors.textSecondary} />
          <Text style={[styles.bookingDateText, { color: colors.textSecondary }]}>
            {date}{time ? ` в ${time}` : ''}
          </Text>
        </View>
        {price !== undefined && (
          <Text style={[styles.bookingPrice, { color: colors.text }]}>
            {price.toLocaleString('ru-RU')} ₽
          </Text>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
  },
  
  // Provider Card
  providerCard: {
    marginBottom: Spacing.md,
  },
  providerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  providerName: {
    fontSize: Typography.size.md,
    fontWeight: '600',
    marginBottom: 2,
  },
  providerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerRating: {
    fontSize: Typography.size.sm,
    fontWeight: '600',
    marginLeft: 4,
  },
  providerReviews: {
    fontSize: Typography.size.sm,
    marginLeft: 2,
  },
  providerDetails: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    gap: Spacing.base,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: Typography.size.sm,
  },
  providerAddress: {
    fontSize: Typography.size.xs,
    marginTop: Spacing.sm,
  },
  bookButton: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  bookButtonText: {
    color: '#FFFFFF',
    fontSize: Typography.size.sm,
    fontWeight: '600',
  },
  
  // Booking Card
  bookingCard: {
    marginBottom: Spacing.md,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  bookingInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  bookingService: {
    fontSize: Typography.size.base,
    fontWeight: '600',
    marginBottom: 2,
  },
  bookingProvider: {
    fontSize: Typography.size.sm,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: Typography.size.xs,
    fontWeight: '600',
  },
  bookingMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  bookingDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  bookingDateText: {
    fontSize: Typography.size.sm,
  },
  bookingPrice: {
    fontSize: Typography.size.md,
    fontWeight: '700',
  },
});
