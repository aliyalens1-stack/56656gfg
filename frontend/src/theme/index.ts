/**
 * AutoService Design System
 * Inspired by Monobank / Revolut / Uber
 * 
 * Principles:
 * - Minimalism + Depth + White Space
 * - Consistent spacing (4, 8, 12, 16, 24)
 * - Clear hierarchy
 * - Premium feel
 */

// ============================================
// COLORS
// ============================================
export const Colors = {
  // Dark Theme (Primary)
  dark: {
    background: '#0B0F14',
    backgroundSecondary: '#111827',
    card: '#1A1F2E',
    cardElevated: '#242938',
    
    primary: '#3B82F6',
    primaryLight: '#60A5FA',
    primaryDark: '#2563EB',
    
    text: '#F1F5F9',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    
    border: '#1F2937',
    borderLight: '#374151',
    
    success: '#22C55E',
    successBg: 'rgba(34, 197, 94, 0.12)',
    
    warning: '#F59E0B',
    warningBg: 'rgba(245, 158, 11, 0.12)',
    
    error: '#EF4444',
    errorBg: 'rgba(239, 68, 68, 0.12)',
    
    info: '#3B82F6',
    infoBg: 'rgba(59, 130, 246, 0.12)',
  },
  
  // Light Theme
  light: {
    background: '#F7F8FA',
    backgroundSecondary: '#FFFFFF',
    card: '#FFFFFF',
    cardElevated: '#FFFFFF',
    
    primary: '#2563EB',
    primaryLight: '#3B82F6',
    primaryDark: '#1D4ED8',
    
    text: '#0F172A',
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
    
    border: '#E2E8F0',
    borderLight: '#F1F5F9',
    
    success: '#16A34A',
    successBg: 'rgba(22, 163, 74, 0.08)',
    
    warning: '#D97706',
    warningBg: 'rgba(217, 119, 6, 0.08)',
    
    error: '#DC2626',
    errorBg: 'rgba(220, 38, 38, 0.08)',
    
    info: '#2563EB',
    infoBg: 'rgba(37, 99, 235, 0.08)',
  },
};

// ============================================
// SPACING
// ============================================
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// ============================================
// TYPOGRAPHY
// ============================================
export const Typography = {
  // Sizes
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  
  // Weights
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  
  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
};

// ============================================
// BORDER RADIUS
// ============================================
export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

// ============================================
// SHADOWS
// ============================================
export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
};

// ============================================
// STATUS COLORS
// ============================================
export const StatusColors = {
  pending: { bg: '#374151', text: '#9CA3AF', label: 'Ожидание' },
  confirmed: { bg: '#1E40AF', text: '#60A5FA', label: 'Подтверждено' },
  in_progress: { bg: '#B45309', text: '#FBBF24', label: 'В работе' },
  completed: { bg: '#166534', text: '#4ADE80', label: 'Завершено' },
  cancelled: { bg: '#991B1B', text: '#FCA5A5', label: 'Отменено' },
  paid: { bg: '#166534', text: '#4ADE80', label: 'Оплачено' },
  failed: { bg: '#991B1B', text: '#FCA5A5', label: 'Ошибка' },
  refunded: { bg: '#6B21A8', text: '#C084FC', label: 'Возврат' },
};

// ============================================
// COMPONENT SIZES
// ============================================
export const ComponentSizes = {
  // Buttons
  buttonHeight: {
    sm: 36,
    md: 44,
    lg: 52,
  },
  
  // Inputs
  inputHeight: 52,
  
  // Touch targets (minimum 44pt for iOS, 48dp for Android)
  touchTarget: 48,
  
  // Icons
  iconSize: {
    sm: 18,
    md: 22,
    lg: 28,
    xl: 32,
  },
  
  // Avatar
  avatarSize: {
    sm: 32,
    md: 44,
    lg: 64,
    xl: 88,
  },
  
  // Tab bar
  tabBarHeight: 80,
  tabBarIconSize: 24,
  
  // Header
  headerHeight: 56,
};

// ============================================
// ANIMATION
// ============================================
export const Animation = {
  fast: 150,
  normal: 250,
  slow: 400,
};

// ============================================
// THEME HOOK (default dark)
// ============================================
export const useTheme = () => {
  // For now, always use dark theme (Monobank style)
  return {
    colors: Colors.dark,
    spacing: Spacing,
    typography: Typography,
    borderRadius: BorderRadius,
    shadows: Shadows,
    status: StatusColors,
    sizes: ComponentSizes,
    animation: Animation,
  };
};

export default {
  Colors,
  Spacing,
  Typography,
  BorderRadius,
  Shadows,
  StatusColors,
  ComponentSizes,
  Animation,
  useTheme,
};
