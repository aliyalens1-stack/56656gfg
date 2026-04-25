import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../src/context/ThemeContext';

interface Chat {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
  isOnline: boolean;
  type: 'provider' | 'support';
}

const MOCK_CHATS: Chat[] = [
  {
    id: '1',
    name: 'АвтоМастер Pro',
    avatar: 'A',
    lastMessage: 'Добрый день! Ваш автомобиль готов к выдаче.',
    timestamp: new Date().toISOString(),
    unreadCount: 2,
    isOnline: true,
    type: 'provider',
  },
  {
    id: '2',
    name: 'Быстрый Сервис',
    avatar: 'Б',
    lastMessage: 'Можем записать вас на завтра в 10:00',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    unreadCount: 0,
    isOnline: false,
    type: 'provider',
  },
  {
    id: '3',
    name: 'Поддержка AutoSearch',
    avatar: 'S',
    lastMessage: 'Спасибо за обращение! Рады помочь.',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    unreadCount: 0,
    isOnline: true,
    type: 'support',
  },
];

export default function MessagesScreen() {
  const { colors } = useThemeContext();
  const [chats, setChats] = useState<Chat[]>(MOCK_CHATS);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 86400000) {
      return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 172800000) return 'Вчера';
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const filteredChats = chats.filter(chat => 
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderChat = ({ item }: { item: Chat }) => {
    return (
      <TouchableOpacity
        style={[styles.chatCard, { backgroundColor: colors.card }]}
        onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id, name: item.name } })}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          <View style={[
            styles.avatar, 
            { backgroundColor: item.type === 'support' ? '#8B5CF6' : colors.primary }
          ]}>
            <Text style={styles.avatarText}>{item.avatar}</Text>
          </View>
          {item.isOnline && <View style={styles.onlineBadge} />}
        </View>
        
        <View style={styles.chatContent}>
          <View style={styles.chatHeader}>
            <Text style={[styles.chatName, { color: colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.chatTime, { color: colors.textMuted }]}>
              {formatTime(item.timestamp)}
            </Text>
          </View>
          <View style={styles.chatFooter}>
            <Text 
              style={[styles.lastMessage, { color: colors.textSecondary }]} 
              numberOfLines={1}
            >
              {item.lastMessage}
            </Text>
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const totalUnread = chats.reduce((sum, chat) => sum + chat.unreadCount, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={['top']} style={[styles.header, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Сообщения</Text>
          {totalUnread > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{totalUnread}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.newChatBtn}>
          <Ionicons name="create-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Search */}
      <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
        <View style={[styles.searchInput, { backgroundColor: colors.backgroundTertiary }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchText, { color: colors.text }]}
            placeholder="Поиск"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <FlatList
        data={filteredChats}
        renderItem={renderChat}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Нет сообщений
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
              Начните диалог с мастером после записи
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  headerBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  newChatBtn: { padding: 4 },
  
  searchContainer: { paddingHorizontal: 16, paddingVertical: 12 },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  searchText: { flex: 1, fontSize: 15 },
  
  listContent: { padding: 16, gap: 8 },
  chatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    gap: 12,
  },
  avatarContainer: { position: 'relative' },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  onlineBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#fff',
  },
  chatContent: { flex: 1 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatName: { fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  chatTime: { fontSize: 12 },
  chatFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  lastMessage: { flex: 1, fontSize: 14, marginRight: 8 },
  unreadBadge: {
    backgroundColor: '#3B82F6',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    gap: 12,
  },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptySubtext: { fontSize: 13, textAlign: 'center' },
});
