import React from 'react';
import { Tabs } from 'expo-router';
import { View, TouchableOpacity, StyleSheet, Platform, Text, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useThemeContext } from '../../src/context/ThemeContext';
import { useLanguage } from '../../src/context/LanguageContext';

// Monobank-style Custom Tab Bar
function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, isDark } = useThemeContext();
  const { t } = useLanguage();
  
  const tabs = [
    { name: 'index', icon: 'home', label: t.nav.home },
    { name: 'services', icon: 'map', label: 'Карта' },
    { name: 'create', icon: 'add', label: '', isCenter: true },
    { name: 'quotes', icon: 'document-text', label: t.nav.bookings },
    { name: 'profile', icon: 'person', label: t.nav.profile },
  ];

  return (
    <View 
      style={[
        styles.tabBarContainer, 
        { 
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          paddingBottom: Math.max(insets.bottom, 8),
        }
      ]}
    >
      <View style={styles.tabBarInner}>
        {tabs.map((tab, index) => {
          const routeIndex = state.routes.findIndex((r: any) => r.name === tab.name);
          const isFocused = state.index === routeIndex;
          
          // Center FAB button
          if (tab.isCenter) {
            return (
              <TouchableOpacity
                key={tab.name}
                style={styles.fabContainer}
                onPress={() => router.push('/create-quote')}
                activeOpacity={0.85}
              >
                <View style={[styles.fabButton, { backgroundColor: colors.primary }]}>
                  <Ionicons name="add" size={26} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            );
          }
          
          const iconName = isFocused ? tab.icon : `${tab.icon}-outline`;
          
          return (
            <TouchableOpacity
              key={tab.name}
              onPress={() => {
                if (!isFocused && routeIndex !== -1) {
                  navigation.navigate(tab.name);
                }
              }}
              style={styles.tabItem}
              activeOpacity={0.7}
            >
              <View style={styles.tabItemInner}>
                <View style={[
                  styles.iconContainer,
                  isFocused && { backgroundColor: colors.infoBg }
                ]}>
                  <Ionicons
                    name={iconName as any}
                    size={22}
                    color={isFocused ? colors.primary : colors.tabInactive}
                  />
                </View>
                <Text 
                  style={[
                    styles.tabLabel, 
                    { color: isFocused ? colors.primary : colors.tabInactive }
                  ]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { colors } = useThemeContext();
  
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="services" />
      <Tabs.Screen
        name="create"
        options={{ href: null }}
        listeners={{ tabPress: (e) => e.preventDefault() }}
      />
      <Tabs.Screen name="quotes" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="garage" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    borderTopWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  tabBarInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 64,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
  },
  tabItemInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconContainer: {
    width: 40,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  fabContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  fabButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
});
