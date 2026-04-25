import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../src/context/ThemeContext';
import { useLocation } from '../../src/context/LocationContext';
import { mapAPI } from '../../src/services/api';
import LocationPermissionModal from '../../src/components/LocationPermissionModal';

const { width, height } = Dimensions.get('window');
const KYIV = { lat: 50.4501, lng: 30.5234 };

const RADIUS_OPTIONS = [
  { value: 1, label: '1км' },
  { value: 2, label: '2км' },
  { value: 5, label: '5км' },
  { value: 10, label: '10км' },
];

interface MapProvider {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
  rating: number;
  isVerified: boolean;
}

function ProviderCard({ provider, colors, onSelect }: any) {
  return (
    <TouchableOpacity style={[styles.providerCard, { backgroundColor: colors.card }]} onPress={onSelect}>
      <View style={[styles.providerAvatar, { backgroundColor: provider.isVerified ? '#22C55E' : colors.primary }]}>
        <Text style={styles.providerAvatarText}>{provider.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.providerInfo}>
        <Text style={[styles.providerName, { color: colors.text }]} numberOfLines={1}>{provider.name}</Text>
        <View style={styles.providerMeta}>
          <Ionicons name="star" size={12} color="#FFB800" />
          <Text style={[styles.providerRating, { color: colors.text }]}>{provider.rating > 0 ? provider.rating.toFixed(1) : '—'}</Text>
          <Text style={[styles.providerDistance, { color: colors.textSecondary }]}>• {provider.distanceKm < 1 ? `${(provider.distanceKm * 1000).toFixed(0)}м` : `${provider.distanceKm.toFixed(1)}км`}</Text>
        </View>
      </View>
      <TouchableOpacity style={[styles.providerCTA, { backgroundColor: colors.primary }]} onPress={onSelect}>
        <Text style={styles.providerCTAText}>Выбрать</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function ServicesMapScreen() {
  const { colors } = useThemeContext();
  const insets = useSafeAreaInsets();
  const { location, isLocationEnabled, refreshLocation, setShowPermissionModal, hasAskedPermission } = useLocation();

  const [providers, setProviders] = useState<MapProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRadius, setSelectedRadius] = useState(2);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);

  // Показать модалку геолокации при первом входе на карту
  useEffect(() => {
    if (!isLocationEnabled && !hasAskedPermission) {
      setTimeout(() => setShowPermissionModal(true), 500);
    }
  }, [isLocationEnabled, hasAskedPermission]);

  const toggleSheet = () => {
    setIsSheetExpanded(!isSheetExpanded);
  };

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

  useEffect(() => {
    const loc = location || KYIV;
    fetchProviders(loc.lat, loc.lng, selectedRadius);
  }, [location, selectedRadius]);

  const handleSelectProvider = (provider: MapProvider) => {
    router.push({
      pathname: '/direct',
      params: { providerId: provider.id, lat: String(location?.lat || KYIV.lat), lng: String(location?.lng || KYIV.lng), providerName: provider.name },
    });
  };

  const handleRefresh = () => fetchProviders((location || KYIV).lat, (location || KYIV).lng, selectedRadius);

  const userLoc = location || KYIV;
  
  // Memoize map URL to prevent iframe reloading on every render
  const mapUrl = useMemo(() => {
    const bounds = {
      minLng: userLoc.lng - selectedRadius * 0.012,
      maxLng: userLoc.lng + selectedRadius * 0.012,
      minLat: userLoc.lat - selectedRadius * 0.008,
      maxLat: userLoc.lat + selectedRadius * 0.008,
    };
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}&layer=mapnik&marker=${userLoc.lat},${userLoc.lng}`;
  }, [userLoc.lat, userLoc.lng, selectedRadius]);

  const sheetBottom = insets.bottom;

  return (
    <View style={styles.container}>
      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* LAYER 1: MAP - STATIC - NEVER CHANGES */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <View style={styles.mapLayer}>
        {Platform.OS === 'web' ? (
          <iframe
            src={mapUrl}
            style={{ 
              width: '100%', 
              height: '100%', 
              border: 'none',
            }}
          />
        ) : (
          <View style={[styles.mapFallback, { backgroundColor: colors.card }]}>
            <Ionicons name="map" size={64} color={colors.textMuted || '#666'} />
          </View>
        )}
      </View>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* LAYER 2: HEADER OVERLAY */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <View style={[styles.headerLayer, { paddingTop: insets.top + 8 }]}>
        <View style={[styles.headerCard, { backgroundColor: colors.background }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Карта мастеров</Text>
            <TouchableOpacity onPress={handleRefresh} style={styles.headerBtn}>
              <Ionicons name="refresh" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.radiusRow}>
            {RADIUS_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.radiusChip, { backgroundColor: selectedRadius === opt.value ? colors.primary : colors.card }]}
                onPress={() => setSelectedRadius(opt.value)}
              >
                <Text style={[styles.radiusChipText, { color: selectedRadius === opt.value ? '#fff' : colors.text }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {!isLocationEnabled && (
          <View style={[styles.geoAlert, { backgroundColor: colors.card }]}>
            <Ionicons name="location-outline" size={18} color="#F59E0B" />
            <Text style={[styles.geoAlertText, { color: colors.text }]}>Геолокация отключена</Text>
            <TouchableOpacity style={[styles.geoAlertBtn, { backgroundColor: colors.primary }]} onPress={() => setShowPermissionModal(true)}>
              <Text style={styles.geoAlertBtnText}>Включить</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* LAYER 3: FABs */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <TouchableOpacity style={[styles.fabQuick, { bottom: 100 + sheetBottom }]} onPress={() => router.push('/quick-request')}>
        <Ionicons name="flash" size={24} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.fabLocate, { bottom: 100 + sheetBottom, backgroundColor: colors.card }]} onPress={() => isLocationEnabled ? refreshLocation() : setShowPermissionModal(true)}>
        <Ionicons name={isLocationEnabled ? 'locate' : 'location-outline'} size={22} color={isLocationEnabled ? colors.primary : colors.textSecondary} />
      </TouchableOpacity>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* LAYER 4: BOTTOM SHEET - positioned at bottom */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <View 
        style={[
          styles.sheetLayer, 
          { 
            backgroundColor: colors.background,
            height: isSheetExpanded ? 350 : 80,
          }
        ]}
      >
        <TouchableOpacity style={styles.sheetHeader} onPress={toggleSheet} activeOpacity={0.9}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border || '#555' }]} />
          <View style={styles.sheetTitleRow}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {isLoading ? 'Поиск...' : `${providers.length} мастеров рядом`}
            </Text>
            <Ionicons name={isSheetExpanded ? 'chevron-down' : 'chevron-up'} size={20} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>

        {isSheetExpanded && (
          <ScrollView style={styles.sheetContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 16 }} />
            ) : providers.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Нет мастеров в этом радиусе</Text>
            ) : (
              providers.map((p) => <ProviderCard key={p.id} provider={p} colors={colors} onSelect={() => handleSelectProvider(p)} />)
            )}
          </ScrollView>
        )}
      </View>
      
      {/* Модалка геолокации - показывается только на карте */}
      <LocationPermissionModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000',
    position: 'relative' as any,
    overflow: 'hidden' as any,
  },

  // LAYER 1: Map - FIXED full screen, STATIC - never changes
  mapLayer: {
    position: 'absolute' as any,
    top: 0,
    left: 0,
    width: '100%' as any,
    height: '100%' as any,
    zIndex: 1,
  },
  mapFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // LAYER 2: Header overlay
  headerLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 16,
  },
  headerCard: {
    borderRadius: 16,
    padding: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8 },
      android: { elevation: 4 },
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' },
    }),
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  radiusRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 },
  radiusChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18 },
  radiusChipText: { fontSize: 13, fontWeight: '600' },

  geoAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    borderRadius: 12,
    padding: 10,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 2 },
      web: { boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
    }),
  },
  geoAlertText: { flex: 1, fontSize: 13, fontWeight: '500' },
  geoAlertBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  geoAlertBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // LAYER 3: FABs
  fabQuick: {
    position: 'absolute',
    left: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 },
      android: { elevation: 8 },
      web: { boxShadow: '0 4px 12px rgba(0,0,0,0.25)' },
    }),
  },
  fabLocate: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 },
      android: { elevation: 4 },
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' },
    }),
  },

  // LAYER 4: Bottom sheet - fixed height, slides with translateY
  sheetLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 350,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 16 },
      web: { boxShadow: '0 -4px 16px rgba(0,0,0,0.12)' },
    }),
  },
  sheetHeader: { paddingTop: 10, paddingHorizontal: 16, paddingBottom: 8 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 15, fontWeight: '600' },
  sheetContent: { flex: 1, paddingHorizontal: 16 },
  emptyText: { textAlign: 'center', marginTop: 20, fontSize: 14 },

  providerCard: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12, marginBottom: 8, gap: 10 },
  providerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  providerAvatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  providerInfo: { flex: 1 },
  providerName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  providerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  providerRating: { fontSize: 12, fontWeight: '500' },
  providerDistance: { fontSize: 12 },
  providerCTA: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  providerCTAText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
