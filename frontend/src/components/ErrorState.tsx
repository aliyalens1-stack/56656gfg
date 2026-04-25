import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ErrorStateProps {
  type?: 'network' | 'server' | 'notFound' | 'generic';
  title?: string;
  message?: string;
  onRetry?: () => void;
}

const ERROR_CONFIG = {
  network: {
    icon: 'wifi-outline',
    iconColor: '#EF4444',
    title: 'Нет подключения',
    message: 'Проверьте интернет-соединение и попробуйте снова',
  },
  server: {
    icon: 'server-outline',
    iconColor: '#F59E0B',
    title: 'Ошибка сервера',
    message: 'Что-то пошло не так. Попробуйте позже',
  },
  notFound: {
    icon: 'search-outline',
    iconColor: '#6B7280',
    title: 'Не найдено',
    message: 'Запрошенные данные не найдены',
  },
  generic: {
    icon: 'alert-circle-outline',
    iconColor: '#EF4444',
    title: 'Ошибка',
    message: 'Произошла ошибка. Попробуйте позже',
  },
};

export function ErrorState({ type = 'generic', title, message, onRetry }: ErrorStateProps) {
  const config = ERROR_CONFIG[type];

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrapper, { backgroundColor: `${config.iconColor}15` }]}>
        <Ionicons name={config.icon as any} size={48} color={config.iconColor} />
      </View>
      <Text style={styles.title}>{title || config.title}</Text>
      <Text style={styles.message}>{message || config.message}</Text>
      {onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
          <Ionicons name="refresh" size={18} color="#FFFFFF" />
          <Text style={styles.retryText}>Попробовать снова</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// Specific error states
export function NetworkError({ onRetry }: { onRetry?: () => void }) {
  return <ErrorState type="network" onRetry={onRetry} />;
}

export function ServerError({ onRetry }: { onRetry?: () => void }) {
  return <ErrorState type="server" onRetry={onRetry} />;
}

export function NotFoundError({ message }: { message?: string }) {
  return <ErrorState type="notFound" message={message} />;
}

// Inline error banner (for forms, etc.)
interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <View style={styles.banner}>
      <Ionicons name="alert-circle" size={20} color="#EF4444" />
      <Text style={styles.bannerText}>{message}</Text>
      {onDismiss && (
        <TouchableOpacity onPress={onDismiss} style={styles.bannerClose}>
          <Ionicons name="close" size={18} color="#EF4444" />
        </TouchableOpacity>
      )}
    </View>
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
    width: 88,
    height: 88,
    borderRadius: 44,
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
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
  },
  retryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.1)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 10,
    marginBottom: 16,
  },
  bannerText: {
    flex: 1,
    fontSize: 14,
    color: '#EF4444',
    lineHeight: 20,
  },
  bannerClose: {
    padding: 4,
  },
});
