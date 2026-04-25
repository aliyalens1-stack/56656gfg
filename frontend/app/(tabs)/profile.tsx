import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext, ThemeMode } from '../../src/context/ThemeContext';
import { useLanguage, Language } from '../../src/context/LanguageContext';
import { useAuth } from '../../src/context/AuthContext';

const LANGUAGES: { code: Language; name: string; flag: string }[] = [
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { colors, isDark, theme, setTheme } = useThemeContext();
  const { t, language, setLanguage } = useLanguage();
  const { user, logout } = useAuth();

  const [showLanguageModal, setShowLanguageModal] = useState(false);

  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      // On web, use custom modal instead of Alert
      setShowLogoutModal(true);
    } else {
      Alert.alert(
        t.profile.logout,
        '',
        [
          { text: t.common.cancel, style: 'cancel' },
          {
            text: t.profile.logout,
            style: 'destructive',
            onPress: performLogout,
          },
        ]
      );
    }
  };

  const performLogout = async () => {
    setShowLogoutModal(false);
    await logout();
    router.replace('/');
  };

  const currentLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {t.profile.title}
            </Text>
          </View>

          {/* User Card */}
          <View style={[styles.userCard, { backgroundColor: colors.card }]}>
            <View style={[styles.avatarCircle, { backgroundColor: colors.infoBg }]}>
              <Ionicons name="person" size={28} color={colors.primary} />
            </View>
            <View style={styles.userInfo}>
              {user ? (
                <>
                  <Text style={[styles.userName, { color: colors.text }]}>
                    {user.firstName} {user.lastName}
                  </Text>
                  <Text style={[styles.userEmail, { color: colors.textSecondary }]}>
                    {user.email}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.userName, { color: colors.text }]}>
                    {t.home.guest}
                  </Text>
                  <TouchableOpacity onPress={() => router.push('/login')}>
                    <Text style={[styles.loginLink, { color: colors.primary }]}>
                      {t.profile.login}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {/* Settings Section */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {t.profile.settings}
          </Text>

          <View style={[styles.settingsCard, { backgroundColor: colors.card }]}>
            {/* Language */}
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => setShowLanguageModal(true)}
              activeOpacity={0.7}
            >
              <View style={[styles.settingsIconWrap, { backgroundColor: colors.infoBg }]}>
                <Ionicons name="language" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.text }]}>
                {t.profile.language}
              </Text>
              <View style={styles.settingsValue}>
                <Text style={[styles.settingsValueText, { color: colors.textSecondary }]}>
                  {currentLang.flag} {currentLang.name}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.divider }]} />

            {/* Theme Toggle */}
            <View style={styles.settingsRow}>
              <View style={[styles.settingsIconWrap, { backgroundColor: isDark ? colors.card : colors.infoBg }]}>
                <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={isDark ? colors.primary : '#F59E0B'} />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.text }]}>
                {t.profile.theme}
              </Text>
              <View style={styles.themeToggle}>
                <Text style={[styles.themeLabel, { color: colors.textSecondary }]}>
                  {isDark ? t.profile.darkTheme : t.profile.lightTheme}
                </Text>
                <Switch
                  value={isDark}
                  onValueChange={(value) => setTheme(value ? 'dark' : 'light')}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.divider }]} />

            {/* Notifications */}
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => router.push('/settings')}
              activeOpacity={0.7}
            >
              <View style={[styles.settingsIconWrap, { backgroundColor: colors.warningBg }]}>
                <Ionicons name="notifications" size={20} color={colors.warning} />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.text }]}>
                {t.profile.notifications}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Quick Actions */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            Быстрые действия
          </Text>

          <View style={[styles.settingsCard, { backgroundColor: colors.card }]}>
            {/* My Garage */}
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => router.push('/garage')}
              activeOpacity={0.7}
            >
              <View style={[styles.settingsIconWrap, { backgroundColor: '#3B82F620' }]}>
                <Ionicons name="car" size={20} color="#3B82F6" />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.text }]}>
                Мой гараж
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.divider }]} />

            {/* Favorites */}
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => router.push('/favorites')}
              activeOpacity={0.7}
            >
              <View style={[styles.settingsIconWrap, { backgroundColor: '#EF444420' }]}>
                <Ionicons name="heart" size={20} color="#EF4444" />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.text }]}>
                Избранные СТО
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.divider }]} />

            {/* Disputes */}
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => router.push('/disputes')}
              activeOpacity={0.7}
            >
              <View style={[styles.settingsIconWrap, { backgroundColor: '#F59E0B20' }]}>
                <Ionicons name="warning" size={20} color="#F59E0B" />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.text }]}>
                Споры
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Support */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            Поддержка
          </Text>

          <View style={[styles.settingsCard, { backgroundColor: colors.card }]}>
            {/* Help */}
            <TouchableOpacity
              style={styles.settingsRow}
              activeOpacity={0.7}
            >
              <View style={[styles.settingsIconWrap, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="help-circle" size={20} color="#10B981" />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.text }]}>
                Помощь и FAQ
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.divider }]} />

            {/* Contact Support */}
            <TouchableOpacity
              style={styles.settingsRow}
              activeOpacity={0.7}
            >
              <View style={[styles.settingsIconWrap, { backgroundColor: '#8B5CF620' }]}>
                <Ionicons name="chatbubble-ellipses" size={20} color="#8B5CF6" />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.text }]}>
                Связаться с поддержкой
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.divider }]} />

            {/* About */}
            <TouchableOpacity
              style={styles.settingsRow}
              activeOpacity={0.7}
            >
              <View style={[styles.settingsIconWrap, { backgroundColor: colors.border }]}>
                <Ionicons name="information-circle" size={20} color={colors.textSecondary} />
              </View>
              <Text style={[styles.settingsLabel, { color: colors.text }]}>
                О приложении
              </Text>
              <View style={styles.settingsValue}>
                <Text style={[styles.settingsValueText, { color: colors.textSecondary }]}>
                  v1.0.0
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Logout Button */}
          {user && (
            <TouchableOpacity
              style={[styles.logoutButton, { backgroundColor: colors.errorBg, borderColor: colors.error }]}
              onPress={handleLogout}
              activeOpacity={0.8}
            >
              <Ionicons name="log-out-outline" size={20} color={colors.error} />
              <Text style={[styles.logoutText, { color: colors.error }]}>
                {t.profile.logout}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Logout Confirmation Modal (for web) */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setShowLogoutModal(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Ionicons name="log-out" size={48} color={colors.error} style={{ alignSelf: 'center', marginBottom: 16 }} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Выйти из аккаунта?
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Вы уверены, что хотите выйти?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.border }]}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>
                  Отмена
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.error }]}
                onPress={performLogout}
              >
                <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>
                  Выйти
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Language Selection Modal */}
      <Modal
        visible={showLanguageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setShowLanguageModal(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {t.profile.language}
            </Text>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.langOption,
                  language === lang.code && { backgroundColor: colors.infoBg },
                ]}
                onPress={() => {
                  setLanguage(lang.code);
                  setShowLanguageModal(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.langFlag}>{lang.flag}</Text>
                <Text style={[styles.langName, { color: colors.text }]}>
                  {lang.name}
                </Text>
                {language === lang.code && (
                  <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },

  header: { paddingVertical: 16 },
  headerTitle: { fontSize: 28, fontWeight: '700' },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    marginBottom: 24,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: { flex: 1, marginLeft: 14 },
  userName: { fontSize: 18, fontWeight: '600' },
  userEmail: { fontSize: 14, marginTop: 2 },
  loginLink: { fontSize: 14, fontWeight: '600', marginTop: 2 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginLeft: 4,
  },

  settingsCard: { borderRadius: 18, overflow: 'hidden', marginBottom: 24 },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsLabel: { flex: 1, fontSize: 16, fontWeight: '500', marginLeft: 12 },
  settingsValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  settingsValueText: { fontSize: 15 },

  divider: { height: 1, marginLeft: 64 },

  themeToggle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  themeLabel: { fontSize: 14 },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  logoutText: { fontSize: 16, fontWeight: '600' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  langFlag: { fontSize: 24, marginRight: 12 },
  langName: { flex: 1, fontSize: 16, fontWeight: '500' },
  
  // Logout Modal
  modalSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
