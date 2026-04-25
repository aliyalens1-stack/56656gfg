import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  ActivityIndicator,
  ScrollView,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useThemeContext } from '../src/context/ThemeContext';
import { mapAPI } from '../src/services/api';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const KYIV = { lat: 50.4501, lng: 30.5234 };

interface MapProvider {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
  rating: number;
  isVerified: boolean;
  isMobile: boolean;
  pinType: 'verified' | 'admin' | 'unverified' | 'popular' | 'mobile' | 'standard';
  locationSource: 'self' | 'admin' | 'auto';
  isLocationVerified: boolean;
  specializations: string[];
}

// Pin colors by type
const PIN_COLORS: Record<string, string> = {
  verified: '#22C55E',    // Green
  admin: '#3B82F6',       // Blue
  unverified: '#F59E0B',  // Orange
  popular: '#8B5CF6',     // Purple
  mobile: '#06B6D4',      // Cyan
  standard: '#6B7280',    // Gray
};

export default function MapScreen() {
  const { colors } = useThemeContext();
  const insets = useSafeAreaInsets();
  
  const [providers, setProviders] = useState<MapProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRadius, setSelectedRadius] = useState(5);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [showList, setShowList] = useState(false);

  // Request location
  const requestLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationGranted(true);
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        setUserLocation(coords);
        fetchProviders(coords.lat, coords.lng, selectedRadius);
      }
    } catch (e) {
      console.log('Location error:', e);
    }
  };

  // Fetch providers
  const fetchProviders = useCallback(async (lat: number, lng: number, radius: number) => {
    try {
      setIsLoading(true);
      const res = await mapAPI.getNearby(lat, lng, radius, 30);
      setProviders(res.data || []);
    } catch (error) {
      setProviders([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    requestLocation().then(() => {
      if (!userLocation) {
        fetchProviders(KYIV.lat, KYIV.lng, selectedRadius);
      }
    });
  }, []);

  // Reload on radius change
  useEffect(() => {
    const coords = userLocation || KYIV;
    fetchProviders(coords.lat, coords.lng, selectedRadius);
  }, [selectedRadius]);

  const handleSelectProvider = (provider: MapProvider) => {
    const coords = userLocation || KYIV;
    setShowList(false);
    router.push({
      pathname: '/direct',
      params: { providerId: provider.id, lat: String(coords.lat), lng: String(coords.lng) },
    });
  };

  const coords = userLocation || KYIV;
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng - selectedRadius * 0.01},${coords.lat - selectedRadius * 0.008},${coords.lng + selectedRadius * 0.01},${coords.lat + selectedRadius * 0.008}&layer=mapnik&marker=${coords.lat},${coords.lng}`;

  // Get badge for provider type
  const getTypeBadge = (provider: MapProvider) => {
    if (provider.locationSource === 'admin') return { icon: 'shield-checkmark', color: '#3B82F6', label: 'Админ' };
    if (provider.isLocationVerified) return { icon: 'checkmark-circle', color: '#22C55E', label: 'Проверен' };
    if (provider.locationSource === 'auto') return { icon: 'help-circle', color: '#F59E0B', label: 'Авто' };
    return null;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 4, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Карта мастеров</Text>
        <TouchableOpacity onPress={() => fetchProviders(coords.lat, coords.lng, selectedRadius)} style={styles.headerBtn}>
          <Ionicons name="refresh" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Radius selector */}
      <View style={[styles.radiusBar, { backgroundColor: colors.background }]}>
        {[1, 2, 5, 10].map(r => (
          <TouchableOpacity
            key={r}
            style={[styles.radiusBtn, { backgroundColor: selectedRadius === r ? colors.primary : colors.card }]}
            onPress={() => setSelectedRadius(r)}
          >
            <Text style={{ color: selectedRadius === r ? '#fff' : colors.text, fontWeight: '600', fontSize: 13 }}>{r}км</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Legend */}
      <View style={[styles.legend, { backgroundColor: colors.card }]}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: PIN_COLORS.verified }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>Проверен</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: PIN_COLORS.admin }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>Админ</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: PIN_COLORS.unverified }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>Авто</Text>
        </View>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        {Platform.OS === 'web' ? (
          <iframe src={mapUrl} style={{ width: '100%', height: '100%', border: 'none' } as any} />
        ) : (
          <View style={[styles.mapPlaceholder, { backgroundColor: colors.card }]}>
            <Ionicons name="map" size={48} color={colors.textMuted} />
          </View>
        )}
        
        {/* FABs */}
        <TouchableOpacity style={styles.quickFab} onPress={() => router.push('/quick-request')}>
          <Ionicons name="flash" size={22} color="#fff" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.locateFab, { backgroundColor: colors.card }]} 
          onPress={requestLocation}
        >
          <Ionicons 
            name={locationGranted ? 'locate' : 'location-outline'} 
            size={22} 
            color={locationGranted ? colors.primary : '#F59E0B'} 
          />
        </TouchableOpacity>
      </View>

      {/* Bottom bar - tap to show list */}
      <TouchableOpacity
        style={[styles.bottomBar, { backgroundColor: colors.card }]}
        onPress={() => setShowList(true)}
        activeOpacity={0.9}
      >
        <View style={[styles.handle, { backgroundColor: colors.border || '#555' }]} />
        <View style={styles.bottomBarContent}>
          <Text style={[styles.bottomBarText, { color: colors.text }]}>
            {isLoading ? 'Загрузка...' : `${providers.length} мастеров рядом`}
          </Text>
          <View style={[styles.expandIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="chevron-up" size={18} color="#fff" />
          </View>
        </View>
      </TouchableOpacity>

      {/* Modal with providers list */}
      <Modal
        visible={showList}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowList(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBg} onPress={() => setShowList(false)} />
          <View style={[styles.modalContent, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
            {/* Handle to close */}
            <TouchableOpacity style={styles.modalHeader} onPress={() => setShowList(false)}>
              <View style={[styles.handle, { backgroundColor: colors.border || '#555' }]} />
              <View style={styles.modalTitleRow}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {providers.length} мастеров
                </Text>
                <View style={[styles.closeBtn, { backgroundColor: colors.card }]}>
                  <Ionicons name="chevron-down" size={20} color={colors.text} />
                </View>
              </View>
            </TouchableOpacity>

            {/* List */}
            <ScrollView style={styles.list} showsVerticalScrollIndicator={true}>
              {isLoading ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
              ) : providers.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="search" size={40} color={colors.textMuted} />
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Нет мастеров в радиусе {selectedRadius}км</Text>
                </View>
              ) : (
                providers.map(p => {
                  const badge = getTypeBadge(p);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.card, { backgroundColor: colors.card }]}
                      onPress={() => handleSelectProvider(p)}
                    >
                      <View style={[styles.avatar, { backgroundColor: PIN_COLORS[p.pinType] || colors.primary }]}>
                        <Text style={styles.avatarText}>{p.name[0]}</Text>
                      </View>
                      <View style={styles.cardInfo}>
                        <View style={styles.cardNameRow}>
                          <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{p.name}</Text>
                          {badge && (
                            <View style={[styles.typeBadge, { backgroundColor: badge.color + '20' }]}>
                              <Ionicons name={badge.icon as any} size={11} color={badge.color} />
                              <Text style={[styles.typeBadgeText, { color: badge.color }]}>{badge.label}</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.cardMeta}>
                          <Ionicons name="star" size={12} color="#FFB800" />
                          <Text style={{ color: colors.text, fontSize: 12, marginLeft: 2 }}>
                            {p.rating > 0 ? p.rating.toFixed(1) : '—'}
                          </Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 8 }}>
                            {p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)}м` : `${p.distanceKm.toFixed(1)}км`}
                          </Text>
                          {p.isMobile && (
                            <View style={styles.mobileBadge}>
                              <Ionicons name="car" size={11} color="#06B6D4" />
                              <Text style={{ color: '#06B6D4', fontSize: 10, marginLeft: 2 }}>Выезд</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={[styles.selectBtn, { backgroundColor: colors.primary }]}>
                        <Text style={styles.selectBtnText}>Выбрать</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 6 },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 18, fontWeight: '600', textAlign: 'center' },
  
  radiusBar: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  radiusBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18 },
  
  legend: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    gap: 16, 
    paddingVertical: 8, 
    marginHorizontal: 16, 
    borderRadius: 10,
    marginBottom: 8,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11 },
  
  mapContainer: { flex: 1, position: 'relative' },
  mapPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  
  quickFab: {
    position: 'absolute', left: 16, bottom: 80,
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    elevation: 4,
  },
  locateFab: {
    position: 'absolute', right: 16, bottom: 80,
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    elevation: 3,
  },
  
  bottomBar: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    paddingTop: 10, paddingBottom: 24, paddingHorizontal: 16,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    elevation: 10,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  bottomBarContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bottomBarText: { fontSize: 16, fontWeight: '600' },
  expandIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent: {
    maxHeight: SCREEN_HEIGHT * 0.75,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    elevation: 20,
  },
  modalHeader: { paddingTop: 10, paddingBottom: 12, paddingHorizontal: 16 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 18, fontWeight: '600' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  
  list: { paddingHorizontal: 16, maxHeight: SCREEN_HEIGHT * 0.6 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 15 },
  
  card: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 12, 
    borderRadius: 14, 
    marginBottom: 10, 
    gap: 10,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  cardInfo: { flex: 1 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' },
  cardName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  
  typeBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 5, 
    paddingVertical: 2, 
    borderRadius: 5,
    gap: 2,
  },
  typeBadgeText: { fontSize: 9, fontWeight: '600' },
  
  mobileBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginLeft: 8,
  },
  
  selectBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  selectBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
