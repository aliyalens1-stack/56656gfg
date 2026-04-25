import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusColors, BorderRadius, Spacing, Typography } from '../theme';

type StatusType = keyof typeof StatusColors;

interface StatusBadgeProps {
  status: StatusType | string;
  label?: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, label, size = 'md' }: StatusBadgeProps) {
  const config = StatusColors[status as StatusType] || {
    bg: '#374151',
    text: '#9CA3AF',
    label: status,
  };
  
  const displayLabel = label || config.label;
  const isSmall = size === 'sm';
  
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: config.bg,
          paddingHorizontal: isSmall ? Spacing.sm : Spacing.md,
          paddingVertical: isSmall ? 2 : Spacing.xs,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: config.text,
            fontSize: isSmall ? Typography.size.xs : Typography.size.sm,
          },
        ]}
      >
        {displayLabel}
      </Text>
    </View>
  );
}

// Payment status badge with specific styling
export function PaymentStatusBadge({ status }: { status: string }) {
  const mapping: Record<string, StatusType> = {
    pending: 'pending',
    processing: 'pending',
    paid: 'paid',
    confirmed: 'paid',
    failed: 'failed',
    refunded: 'refunded',
    cancelled: 'cancelled',
  };
  
  return <StatusBadge status={mapping[status] || status} />;
}

// Booking status badge
export function BookingStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} />;
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: BorderRadius.sm,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '600',
  },
});
