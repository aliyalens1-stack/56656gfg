import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../src/context/ThemeContext';

export default function QuickSuccessScreen() {
  const { colors } = useThemeContext();
  const params = useLocalSearchParams();
  
  const providerName = params.providerName as string;
  const quoteId = params.quoteId as string;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.successIcon}>
          <View style={[styles.iconCircle, { backgroundColor: '#10B98120' }]}>
            <View style={[styles.iconCircleInner, { backgroundColor: '#10B981' }]}>
              <Ionicons name="checkmark" size={48} color="#fff" />
            </View>
          </View>
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: colors.text }]}>
          Заявка отправлена!
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {providerName} получил вашу заявку
        </Text>

        {/* Info Cards */}
        <View style={styles.infoCards}>
          <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
            <Ionicons name="time-outline" size={28} color="#3B82F6" />
            <Text style={[styles.infoCardTitle, { color: colors.text }]}>
              Ожидайте звонка
            </Text>
            <Text style={[styles.infoCardText, { color: colors.textSecondary }]}>
              Мастер свяжется с вами в течение 15 минут для уточнения деталей
            </Text>
          </View>

          <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
            <Ionicons name="notifications-outline" size={28} color="#F59E0B" />
            <Text style={[styles.infoCardTitle, { color: colors.text }]}>
              Уведомления
            </Text>
            <Text style={[styles.infoCardText, { color: colors.textSecondary }]}>
              Вы получите уведомление, когда мастер ответит
            </Text>
          </View>
        </View>

        {/* What's Next */}
        <View style={[styles.nextSteps, { backgroundColor: colors.card }]}>
          <Text style={[styles.nextStepsTitle, { color: colors.text }]}>
            Что дальше?
          </Text>
          
          <View style={styles.stepRow}>
            <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={[styles.stepTitle, { color: colors.text }]}>
                Мастер свяжется с вами
              </Text>
              <Text style={[styles.stepText, { color: colors.textSecondary }]}>
                Обсудите детали и договоритесь о времени
              </Text>
            </View>
          </View>

          <View style={styles.stepRow}>
            <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={[styles.stepTitle, { color: colors.text }]}>
                Приезжайте или ждите мастера
              </Text>
              <Text style={[styles.stepText, { color: colors.textSecondary }]}>
                В зависимости от типа услуги
              </Text>
            </View>
          </View>

          <View style={styles.stepRow}>
            <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={[styles.stepTitle, { color: colors.text }]}>
                Оплатите через платформу
              </Text>
              <Text style={[styles.stepText, { color: colors.textSecondary }]}>
                Безопасная оплата с гарантией
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Bottom Actions */}
      <View style={[styles.bottomActions, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/my-quotes')}
        >
          <Ionicons name="list-outline" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>Мои заявки</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: colors.border }]}
          onPress={() => router.replace('/(tabs)')}
        >
          <Ionicons name="home-outline" size={20} color={colors.text} />
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
            На главную
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  successIcon: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 32,
  },
  infoCards: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  infoCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  infoCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  infoCardText: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 16,
  },
  nextSteps: {
    borderRadius: 16,
    padding: 20,
  },
  nextStepsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  stepRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  stepText: {
    fontSize: 12,
  },
  bottomActions: {
    padding: 16,
    paddingBottom: 24,
    gap: 10,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
