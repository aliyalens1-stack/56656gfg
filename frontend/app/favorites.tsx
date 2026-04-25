import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/services/api';
import { useAuth } from '../src/context/AuthContext';

export default function FavoritesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [favorites, setFavorites] = useState<any[]>([]);

  const fetchFavorites = async () => {
    try {
      const res = await api.get('/favorites/my');
      setFavorites(res.data || []);
    } catch (error) {
      console.error('Error fetching favorites:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) fetchFavorites();
    else setLoading(false);
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFavorites();
  };

  const handleRemoveFavorite = async (orgId: string) => {
    Alert.alert('Удалить из избранного?', '', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/favorites/${orgId}`);
            setFavorites(prev => prev.filter(f => f.organizationId !== orgId && f.organization?._id !== orgId));
          } catch {}
        },
      },
    ]);
  };

  const handleBook = (org: any) => {
    router.push(`/create-quote?orgId=${org._id || org.organizationId}`);
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Избранное</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.authPrompt}>
          <Ionicons name="heart-outline" size={64} color="#6B7280" />
          <Text style={styles.authTitle}>Войдите для доступа к избранному</Text>
          <TouchableOpacity style={styles.authButton} onPress={() => router.push('/login')}>
            <Text style={styles.authButtonText}>Войти</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Избранное</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
      >
        {loading ? (
          <ActivityIndicator color="#3B82F6" style={{ marginTop: 40 }} />
        ) : favorites.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="heart-outline" size={64} color="#374151" />
            <Text style={styles.emptyTitle}>Нет избранных СТО</Text>
            <Text style={styles.emptyText}>Добавляйте понравившиеся автосервисы в избранное</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/(tabs)/services')}>
              <Ionicons name="search" size={18} color="#FFFFFF" />
              <Text style={styles.emptyBtnText}>Найти СТО</Text>
            </TouchableOpacity>
          </View>
        ) : (
          favorites.map((fav, idx) => {
            const org = fav.organization || fav;
            return (
              <View key={fav._id || idx} style={styles.favCard}>
                <View style={styles.orgIcon}>
                  <Ionicons name="business" size={28} color="#3B82F6" />
                </View>
                <View style={styles.orgInfo}>
                  <Text style={styles.orgName} numberOfLines={1}>{org.name || 'СТО'}</Text>
                  <View style={styles.ratingRow}>
                    <Ionicons name="star" size={14} color="#F59E0B" />
                    <Text style={styles.ratingText}>
                      {(org.ratingAvg || org.rating || 5).toFixed(1)} ({org.reviewsCount || 0} отзывов)
                    </Text>
                  </View>
                  {org.address && <Text style={styles.address} numberOfLines={1}>{org.address}</Text>}
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.bookBtn} onPress={() => handleBook(org)}>
                    <Text style={styles.bookBtnText}>Записаться</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleRemoveFavorite(org._id || fav.organizationId)} style={styles.removeBtn}>
                    <Ionicons name="heart-dislike" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '600', color: '#FFFFFF' },
  content: { flex: 1, paddingHorizontal: 16 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#FFFFFF', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#6B7280', marginTop: 6, textAlign: 'center', paddingHorizontal: 20 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 24, paddingHorizontal: 24, paddingVertical: 14,
    backgroundColor: '#3B82F6', borderRadius: 12,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  favCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16,
    padding: 14, marginTop: 12,
  },
  orgIcon: {
    width: 56, height: 56, borderRadius: 14,
    backgroundColor: 'rgba(59,130,246,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  orgInfo: { flex: 1, marginLeft: 12 },
  orgName: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  ratingText: { fontSize: 13, color: '#9CA3AF', marginLeft: 4 },
  address: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  actions: { alignItems: 'flex-end', gap: 8 },
  bookBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#3B82F6', borderRadius: 8,
  },
  bookBtnText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  removeBtn: { padding: 8 },
  authPrompt: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  authTitle: { fontSize: 18, fontWeight: '600', color: '#FFFFFF', marginTop: 16, textAlign: 'center' },
  authButton: {
    marginTop: 24, paddingHorizontal: 48, paddingVertical: 14,
    backgroundColor: '#3B82F6', borderRadius: 12,
  },
  authButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
