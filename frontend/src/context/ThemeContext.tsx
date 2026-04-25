import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================
// THEME COLORS - MONOBANK INSPIRED
// ============================================
export const ThemeColors = {
  dark: {
    // Backgrounds
    background: '#0A0E14',
    backgroundSecondary: '#0F1419',
    backgroundTertiary: '#161D26',
    card: '#1A222D',
    cardElevated: '#212B38',
    
    // Primary - Blue gradient style
    primary: '#3B82F6',
    primaryLight: '#60A5FA',
    primaryDark: '#2563EB',
    primaryGradient: ['#3B82F6', '#2563EB'],
    
    // Accent
    accent: '#8B5CF6',
    accentLight: '#A78BFA',
    
    // Text
    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    textInverse: '#0F172A',
    
    // Borders
    border: '#1E293B',
    borderLight: '#334155',
    divider: 'rgba(255,255,255,0.06)',
    
    // Status
    success: '#22C55E',
    successBg: 'rgba(34, 197, 94, 0.15)',
    warning: '#F59E0B',
    warningBg: 'rgba(245, 158, 11, 0.15)',
    error: '#EF4444',
    errorBg: 'rgba(239, 68, 68, 0.15)',
    info: '#3B82F6',
    infoBg: 'rgba(59, 130, 246, 0.15)',
    
    // Tab bar
    tabBar: '#0F1419',
    tabBarBorder: '#1E293B',
    tabInactive: '#64748B',
    tabActive: '#3B82F6',
    
    // Overlay
    overlay: 'rgba(0, 0, 0, 0.7)',
    
    // Input
    inputBg: '#1A222D',
    inputBorder: '#334155',
    inputFocus: '#3B82F6',
    
    // Shadow
    shadowColor: '#000000',
  },
  
  light: {
    // Backgrounds - Clean white with subtle warmth
    background: '#F5F7FA',
    backgroundSecondary: '#FFFFFF',
    backgroundTertiary: '#EEF2F6',
    card: '#FFFFFF',
    cardElevated: '#FFFFFF',
    
    // Primary - Vibrant blue
    primary: '#2563EB',
    primaryLight: '#3B82F6',
    primaryDark: '#1D4ED8',
    primaryGradient: ['#3B82F6', '#2563EB'],
    
    // Accent
    accent: '#7C3AED',
    accentLight: '#8B5CF6',
    
    // Text - High contrast
    text: '#111827',
    textSecondary: '#4B5563',
    textMuted: '#9CA3AF',
    textInverse: '#FFFFFF',
    
    // Borders
    border: '#E5E7EB',
    borderLight: '#F3F4F6',
    divider: 'rgba(0,0,0,0.08)',
    
    // Status - Vibrant
    success: '#059669',
    successBg: '#ECFDF5',
    warning: '#D97706',
    warningBg: '#FFFBEB',
    error: '#DC2626',
    errorBg: '#FEF2F2',
    info: '#2563EB',
    infoBg: '#EFF6FF',
    
    // Tab bar
    tabBar: '#FFFFFF',
    tabBarBorder: '#E5E7EB',
    tabInactive: '#9CA3AF',
    tabActive: '#2563EB',
    
    // Overlay
    overlay: 'rgba(0, 0, 0, 0.4)',
    
    // Input
    inputBg: '#FFFFFF',
    inputBorder: '#D1D5DB',
    inputFocus: '#2563EB',
    
    // Shadow
    shadowColor: '#6B7280',
  },
};

export type ThemeMode = 'dark' | 'light';
export type ThemeColorsType = typeof ThemeColors.dark;

// ============================================
// THEME CONTEXT
// ============================================
interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  colors: ThemeColorsType;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const saved = await AsyncStorage.getItem('app_theme');
      if (saved === 'light' || saved === 'dark') {
        setThemeState(saved);
      }
    } catch (e) {
      console.log('Error loading theme:', e);
    }
  };

  const setTheme = async (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      await AsyncStorage.setItem('app_theme', newTheme);
    } catch (e) {
      console.log('Error saving theme:', e);
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        colors: ThemeColors[theme],
        isDark: theme === 'dark',
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within ThemeProvider');
  }
  return context;
}
