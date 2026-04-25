import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = 'file-tray-outline',
  iconColor = '#6B7280',
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrapper}>
        <Ionicons name={icon} size={56} color={iconColor} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.message}>{message}</Text>}
      {actionLabel && onAction && (
        <TouchableOpacity style={styles.button} onPress={onAction}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// Predefined empty states
export function EmptyVehicles({ onAdd }: { onAdd?: () => void }) {
  return (
    <EmptyState
      icon="car-outline"
      iconColor="#3B82F6"
      title="Нет автомобилей"
      message="Добавьте свой автомобиль для создания заявок"
      actionLabel="Добавить авто"
      onAction={onAdd}
    />
  );
}

export function EmptyBookings({ onFind }: { onFind?: () => void }) {
  return (
    <EmptyState
      icon="calendar-outline"
      iconColor="#10B981"
      title="Нет записей"
      message="Здесь появятся ваши записи на автосервис"
      actionLabel="Найти СТО"
      onAction={onFind}
    />
  );
}

export function EmptyQuotes({ onCreate }: { onCreate?: () => void }) {
  return (
    <EmptyState
      icon="document-text-outline"
      iconColor="#F59E0B"
      title="Нет заявок"
      message="Создайте заявку, чтобы получить предложения от СТО"
      actionLabel="Создать заявку"
      onAction={onCreate}
    />
  );
}

export function EmptyFavorites({ onFind }: { onFind?: () => void }) {
  return (
    <EmptyState
      icon="heart-outline"
      iconColor="#EF4444"
      title="Нет избранных"
      message="Добавляйте понравившиеся СТО в избранное"
      actionLabel="Найти СТО"
      onAction={onFind}
    />
  );
}

export function EmptyNotifications() {
  return (
    <EmptyState
      icon="notifications-outline"
      iconColor="#8B5CF6"
      title="Нет уведомлений"
      message="Здесь появятся важные уведомления о ваших заказах"
    />
  );
}

export function EmptySearch() {
  return (
    <EmptyState
      icon="search-outline"
      iconColor="#6B7280"
      title="Ничего не найдено"
      message="Попробуйте изменить параметры поиска или увеличить радиус"
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  iconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  button: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
