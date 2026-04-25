import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../src/context/AuthContext';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailNotifs, setEmailNotifs] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const push = await AsyncStorage.getItem('settings_push');
      const email = await AsyncStorage.getItem('settings_email');
      if (push !== null) setPushEnabled(push === 'true');
      if (email !== null) setEmailNotifs(email === 'true');
    } catch {}
  };

  const handlePushToggle = async (value: boolean) => {
    setPushEnabled(value);
    await AsyncStorage.setItem('settings_push', value.toString());
  };

  const handleEmailToggle = async (value: boolean) => {
    setEmailNotifs(value);
    await AsyncStorage.setItem('settings_email', value.toString());
  };

  const handleLogout = () => {
    Alert.alert('Выход', 'Вы уверены, что хотите выйти?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Удалить аккаунт?',
      'Это действие нельзя отменить. Все ваши данные будут удалены.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Функция в разработке', 'Обратитесь в поддержку для удаления аккаунта');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Настройки</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Notifications Section */}
        <Text style={styles.sectionTitle}>Уведомления</Text>
        <View style={styles.section}>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="notifications" size={22} color="#3B82F6" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Push-уведомления</Text>
                <Text style={styles.settingDesc}>Получать уведомления о заявках</Text>
              </View>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={handlePushToggle}
              trackColor={{ false: '#374151', true: '#3B82F6' }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="mail" size={22} color="#8B5CF6" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Email-уведомления</Text>
                <Text style={styles.settingDesc}>Получать письма о статусе заказов</Text>
              </View>
            </View>
            <Switch
              value={emailNotifs}
              onValueChange={handleEmailToggle}
              trackColor={{ false: '#374151', true: '#8B5CF6' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Language Section */}
        <Text style={styles.sectionTitle}>Язык</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="language" size={22} color="#10B981" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Язык приложения</Text>
                <Text style={styles.settingDesc}>Русский</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Support Section */}
        <Text style={styles.sectionTitle}>Поддержка</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="help-circle" size={22} color="#F59E0B" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>FAQ</Text>
                <Text style={styles.settingDesc}>Часто задаваемые вопросы</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="chatbubble-ellipses" size={22} color="#3B82F6" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Связаться с поддержкой</Text>
                <Text style={styles.settingDesc}>Ответим в течение 24 часов</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Legal Section */}
        <Text style={styles.sectionTitle}>Правовая информация</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="document-text" size={22} color="#6B7280" />
              <Text style={styles.settingLabel}>Условия использования</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="shield-checkmark" size={22} color="#6B7280" />
              <Text style={styles.settingLabel}>Политика конфиденциальности</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Account Section */}
        {user && (
          <>
            <Text style={styles.sectionTitle}>Аккаунт</Text>
            <View style={styles.section}>
              <TouchableOpacity style={styles.settingItem} onPress={handleLogout}>
                <View style={styles.settingInfo}>
                  <Ionicons name="log-out" size={22} color="#EF4444" />
                  <Text style={[styles.settingLabel, { color: '#EF4444' }]}>Выйти из аккаунта</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.settingItem} onPress={handleDeleteAccount}>
                <View style={styles.settingInfo}>
                  <Ionicons name="trash" size={22} color="#EF4444" />
                  <Text style={[styles.settingLabel, { color: '#EF4444' }]}>Удалить аккаунт</Text>
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Version */}
        <Text style={styles.version}>AutoService v1.0.0</Text>
        <Text style={styles.copyright}>© 2026 AutoService Platform</Text>

        <View style={{ height: 40 }} />
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
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: '#6B7280',
    marginTop: 24, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase',
  },
  section: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16,
  },
  settingInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  settingText: { flex: 1 },
  settingLabel: { fontSize: 16, color: '#FFFFFF' },
  settingDesc: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 50 },
  version: { textAlign: 'center', fontSize: 14, color: '#6B7280', marginTop: 32 },
  copyright: { textAlign: 'center', fontSize: 12, color: '#4B5563', marginTop: 4 },
});
