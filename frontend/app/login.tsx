import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../src/theme';
import { Input } from '../src/ui/Input';
import { PrimaryButton } from '../src/ui/Button';
import { useAuth } from '../src/context/AuthContext';

export default function LoginScreen() {
  const router = useRouter();
  const { login, loading: authLoading } = useAuth();
  const colors = Colors.dark;
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState('');
  
  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Введите email и пароль');
      return;
    }
    
    setError('');
    setLoading(true);
    
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Неверный email или пароль');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string, demoPassword: string, role: string) => {
    setError('');
    setDemoLoading(role);
    try {
      await login(demoEmail, demoPassword);
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка демо-входа');
    } finally {
      setDemoLoading('');
    }
  };

  const DEMO_ACCOUNTS = [
    { role: 'customer', label: 'Клиент', icon: 'person-outline' as const, email: 'customer@test.com', password: 'Customer123!', color: '#3B82F6', desc: 'Иван Петров' },
    { role: 'provider', label: 'Мастер', icon: 'construct-outline' as const, email: 'provider@test.com', password: 'Provider123!', color: '#22C55E', desc: 'Сергей Мастеров' },
    { role: 'admin', label: 'Админ', icon: 'shield-checkmark-outline' as const, email: 'admin@autoservice.com', password: 'Admin123!', color: '#F59E0B', desc: 'Панель управления' },
  ];
  
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back Button */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: colors.card }]}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          
          {/* Logo & Header */}
          <View style={styles.header}>
            <Image
              source={require('../assets/images/logo.png')}
              style={{ width: 200, height: 130, marginBottom: Spacing.md }}
              resizeMode="contain"
              testID="login-logo"
            />
            <Text style={[styles.title, { color: colors.text }]}>
              Вход в аккаунт
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Введите данные для входа
            </Text>
          </View>
          
          {/* Form */}
          <View style={styles.form}>
            {error ? (
              <View style={[styles.errorBox, { backgroundColor: colors.errorBg }]}>
                <Ionicons name="alert-circle" size={18} color={colors.error} />
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
            ) : null}
            
            <Input
              label="Email"
              placeholder="example@mail.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              icon="mail-outline"
            />
            
            <Input
              label="Пароль"
              placeholder="Ваш пароль"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              icon="lock-closed-outline"
            />
            
            <TouchableOpacity style={styles.forgotPassword} onPress={() => router.push('/forgot-password')} testID="forgot-password-link">
              <Text style={[styles.forgotText, { color: colors.primary }]}>
                Забыли пароль?
              </Text>
            </TouchableOpacity>
            
            <PrimaryButton
              testID="login-submit-button"
              onPress={handleLogin}
              loading={loading || authLoading}
              fullWidth
              size="lg"
            >
              Войти
            </PrimaryButton>
          </View>

          {/* Demo Accounts */}
          <View style={styles.demoSection}>
            <View style={styles.demoHeader}>
              <View style={[styles.demoDivider, { backgroundColor: colors.border }]} />
              <Text style={[styles.demoTitle, { color: colors.textMuted }]}>DEMO ВХОД</Text>
              <View style={[styles.demoDivider, { backgroundColor: colors.border }]} />
            </View>
            {DEMO_ACCOUNTS.map((demo) => (
              <TouchableOpacity
                key={demo.role}
                testID={`demo-login-${demo.role}`}
                style={[styles.demoButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => handleDemoLogin(demo.email, demo.password, demo.role)}
                activeOpacity={0.7}
                disabled={!!demoLoading}
              >
                {demoLoading === demo.role ? (
                  <ActivityIndicator size="small" color={demo.color} />
                ) : (
                  <View style={[styles.demoIcon, { backgroundColor: demo.color + '20' }]}>  
                    <Ionicons name={demo.icon} size={20} color={demo.color} />
                  </View>
                )}
                <View style={styles.demoInfo}>
                  <Text style={[styles.demoLabel, { color: colors.text }]}>{demo.label}</Text>
                  <Text style={[styles.demoDesc, { color: colors.textMuted }]}>{demo.desc}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
          
          {/* Register Link */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              Нет аккаунта?{' '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/register')}>
              <Text style={[styles.linkText, { color: colors.primary }]}>
                Зарегистрироваться
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.xxl,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logoContainer: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: Typography.size.xl,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: Typography.size.base,
    textAlign: 'center',
  },
  form: {
    flex: 1,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.base,
    gap: Spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: Typography.size.sm,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.lg,
    marginTop: -Spacing.sm,
  },
  forgotText: {
    fontSize: Typography.size.sm,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  footerText: {
    fontSize: Typography.size.base,
  },
  linkText: {
    fontSize: Typography.size.base,
    fontWeight: '600',
  },
  demoSection: {
    marginTop: Spacing.lg,
  },
  demoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Spacing.base,
  },
  demoDivider: {
    flex: 1,
    height: 1,
  },
  demoTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  demoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoInfo: {
    flex: 1,
  },
  demoLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  demoDesc: {
    fontSize: 12,
    marginTop: 1,
  },
});
