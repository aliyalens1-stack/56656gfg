import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../src/context/ThemeContext';
import { useLanguage } from '../src/context/LanguageContext';
import { useAuth } from '../src/context/AuthContext';

export default function WelcomeScreen() {
  const { colors } = useThemeContext();
  const { t } = useLanguage();
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} testID="welcome-screen">
      <View style={styles.content}>
        <Image
          source={require('../assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
          testID="welcome-logo"
        />
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t?.welcome?.subtitle || 'Маркетплейс автосервисов · быстрый поиск мастера'}
        </Text>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/login')}
          testID="login-button"
        >
          <Ionicons name="log-in-outline" size={20} color="#fff" />
          <Text style={styles.btnText}>{t?.welcome?.login || 'Войти'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnOutline, { borderColor: colors.primary }]}
          onPress={() => router.push('/register')}
          testID="register-button"
        >
          <Ionicons name="person-add-outline" size={20} color={colors.primary} />
          <Text style={[styles.btnText, { color: colors.primary }]}>
            {t?.welcome?.register || 'Зарегистрироваться'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skip}
          onPress={() => router.replace('/(tabs)')}
          testID="skip-link"
        >
          <Text style={[styles.skipText, { color: colors.textSecondary }]}>
            {t?.welcome?.skip || 'Пропустить и продолжить'} →
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  content: { maxWidth: 400, width: '100%', alignItems: 'center' },
  logo: {
    width: 240,
    height: 160,
    marginBottom: 16,
  },
  logoCircle: {
    width: 96, height: 96, borderRadius: 48, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  title: { fontSize: 32, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 15, textAlign: 'center', marginBottom: 40, lineHeight: 22 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, paddingHorizontal: 24, borderRadius: 12,
    gap: 10, width: '100%', marginBottom: 12,
  },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1.5 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skip: { paddingVertical: 12, marginTop: 8 },
  skipText: { fontSize: 14, fontWeight: '500' },
});
