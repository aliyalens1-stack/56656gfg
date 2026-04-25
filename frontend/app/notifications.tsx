import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../src/context/ThemeContext';

interface Notification {
  id: string;
  type: 'booking' | 'message' | 'promo' | 'system' | 'alert';
  title: string;
  body: string;
  timestamp: string;
  isRead: boolean;
  actionUrl?: string;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    type: 'booking',
    title: 'Запись подтверждена',
    body: 'Ваша запись к мастеру АвтоМастер Pro на 14:00 подтверждена',
    timestamp: new Date().toISOString(),
    isRead: false,
    actionUrl: '/bookings',
  },
  {
    id: '2',
    type: 'alert',
    title: '2 мастера доступны сейчас',
    body: 'Рядом с вами есть свободные мастера. Запишитесь прямо сейчас!',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    isRead: false,
    actionUrl: '/fullmap',
  },
  {
    id: '3',
    type: 'promo',
    title: 'Скидка 20% на диагностику',
    body: 'Только сегодня! Получите скидку на комплексную диагностику',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    isRead: true,
  },
  {
    id: '4',
    type: 'system',
    title: 'Обновление приложения',
    body: 'Доступна новая версия с улучшенной картой',
    timestamp: new Date(Date.now() - 172800000).toISOString(),
    isRead: true,
  },
];

export default function NotificationsScreen() {
  const { colors } = useThemeContext();
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'booking': return { name: 'calendar', color: '#3B82F6' };
      case 'message': return { name: 'chatbubble', color: '#8B5CF6' };
      case 'promo': return { name: 'gift', color: '#F59E0B' };
      case 'alert': return { name: 'flash', color: '#EF4444' };
      default: return { name: 'notifications', color: colors.textSecondary };
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч назад`;
    if (diff < 172800000) return 'Вчера';
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const handlePress = (notification: Notification) => {
    markAsRead(notification.id);
    if (notification.actionUrl) {
      router.push(notification.actionUrl as any);
    }
  };

  const renderNotification = ({ item }: { item: Notification }) => {
    const icon = getIcon(item.type);
    
    return (
      <TouchableOpacity
        style={[
          styles.notificationCard,
          { backgroundColor: item.isRead ? colors.card : colors.primary + '10' },
        ]}
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconContainer, { backgroundColor: icon.color + '20' }]}>
          <Ionicons name={icon.name as any} size={22} color={icon.color} />
        </View>
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            {!item.isRead && <View style={styles.unreadDot} />}
          </View>
          <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={[styles.time, { color: colors.textMuted }]}>
            {formatTime(item.timestamp)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    );
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={['top']} style={[styles.header, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Уведомления</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity 
          style={styles.markAllBtn}
          onPress={() => setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))}
        >
          <Ionicons name="checkmark-done" size={22} color={colors.primary} />
        </TouchableOpacity>
      </SafeAreaView>

      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Нет уведомлений
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  unreadBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  unreadBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  markAllBtn: { padding: 4 },
  listContent: { padding: 16, gap: 10 },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    gap: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 15, fontWeight: '600', flex: 1 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
  },
  body: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  time: { fontSize: 11, marginTop: 6 },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    gap: 12,
  },
  emptyText: { fontSize: 15 },
});
