import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================
// TRANSLATIONS
// ============================================
export const translations = {
  ru: {
    // App
    appName: 'Auto Search',
    
    // Welcome Screen
    welcome: {
      title: 'Найди свой автосервис',
      subtitle: 'Быстрый поиск надёжных СТО рядом с вами',
      feature1: 'Поиск СТО поблизости',
      feature2: 'Реальные отзывы',
      feature3: 'Онлайн запись',
      feature4: 'Безопасная оплата',
      login: 'Войти',
      register: 'Создать аккаунт',
      skip: 'Пропустить',
    },
    
    // Navigation
    nav: {
      home: 'Главная',
      search: 'Поиск',
      bookings: 'Записи',
      garage: 'Гараж',
      profile: 'Профиль',
    },
    
    // Home Screen
    home: {
      greeting: 'Добрый день',
      guest: 'Гость',
      findSTO: 'Найти СТО',
      newQuote: 'Новая заявка',
      myGarage: 'Мой гараж',
      bookings: 'Записи',
      nearbySTO: 'СТО рядом',
      viewAll: 'Все',
      noSTO: 'СТО не найдены',
      enableGeo: 'Включите геолокацию для поиска ближайших СТО',
      loginPrompt: 'Войдите в аккаунт',
      loginPromptDesc: 'Чтобы создавать заявки и записываться на сервис',
    },
    
    // Search Screen
    search: {
      title: 'Поиск',
      placeholder: 'Поиск СТО или услуги',
      results: 'результатов',
      result: 'результат',
      resulta: 'результата',
      noResults: 'Ничего не найдено',
      noResultsHint: 'Попробуйте увеличить радиус поиска',
      increaseRadius: 'Увеличить радиус',
      respondsIn: 'отвечает за',
      min: 'мин',
      hour: 'ч',
      from: 'от',
      book: 'Записаться',
      priceOnRequest: 'Цена по запросу',
    },
    
    // Profile
    profile: {
      title: 'Профиль',
      settings: 'Настройки',
      language: 'Язык',
      theme: 'Тема',
      darkTheme: 'Тёмная',
      lightTheme: 'Светлая',
      notifications: 'Уведомления',
      logout: 'Выйти',
      login: 'Войти',
    },
    
    // Common
    common: {
      km: 'км',
      m: 'м',
      loading: 'Загрузка...',
      error: 'Ошибка',
      retry: 'Повторить',
      cancel: 'Отмена',
      save: 'Сохранить',
      delete: 'Удалить',
      edit: 'Редактировать',
    },
  },
  
  de: {
    // App
    appName: 'Auto Search',
    
    // Welcome Screen
    welcome: {
      title: 'Finde deine Werkstatt',
      subtitle: 'Schnelle Suche nach zuverlässigen Werkstätten in deiner Nähe',
      feature1: 'Werkstätten in der Nähe',
      feature2: 'Echte Bewertungen',
      feature3: 'Online-Buchung',
      feature4: 'Sichere Zahlung',
      login: 'Anmelden',
      register: 'Konto erstellen',
      skip: 'Überspringen',
    },
    
    // Navigation
    nav: {
      home: 'Start',
      search: 'Suche',
      bookings: 'Buchungen',
      garage: 'Garage',
      profile: 'Profil',
    },
    
    // Home Screen
    home: {
      greeting: 'Guten Tag',
      guest: 'Gast',
      findSTO: 'Werkstatt finden',
      newQuote: 'Neue Anfrage',
      myGarage: 'Meine Garage',
      bookings: 'Buchungen',
      nearbySTO: 'Werkstätten in der Nähe',
      viewAll: 'Alle',
      noSTO: 'Keine Werkstätten gefunden',
      enableGeo: 'Aktivieren Sie die Geolokalisierung',
      loginPrompt: 'Anmelden',
      loginPromptDesc: 'Um Anfragen zu erstellen und Termine zu buchen',
    },
    
    // Search Screen
    search: {
      title: 'Suche',
      placeholder: 'Werkstatt oder Service suchen',
      results: 'Ergebnisse',
      result: 'Ergebnis',
      resulta: 'Ergebnisse',
      noResults: 'Nichts gefunden',
      noResultsHint: 'Versuchen Sie, den Radius zu erhöhen',
      increaseRadius: 'Radius erhöhen',
      respondsIn: 'antwortet in',
      min: 'Min',
      hour: 'Std',
      from: 'ab',
      book: 'Buchen',
      priceOnRequest: 'Preis auf Anfrage',
    },
    
    // Profile
    profile: {
      title: 'Profil',
      settings: 'Einstellungen',
      language: 'Sprache',
      theme: 'Design',
      darkTheme: 'Dunkel',
      lightTheme: 'Hell',
      notifications: 'Benachrichtigungen',
      logout: 'Abmelden',
      login: 'Anmelden',
    },
    
    // Common
    common: {
      km: 'km',
      m: 'm',
      loading: 'Wird geladen...',
      error: 'Fehler',
      retry: 'Wiederholen',
      cancel: 'Abbrechen',
      save: 'Speichern',
      delete: 'Löschen',
      edit: 'Bearbeiten',
    },
  },
  
  en: {
    // App
    appName: 'Auto Search',
    
    // Welcome Screen
    welcome: {
      title: 'Find your auto service',
      subtitle: 'Quick search for reliable car services near you',
      feature1: 'Find nearby services',
      feature2: 'Real reviews',
      feature3: 'Online booking',
      feature4: 'Secure payment',
      login: 'Sign In',
      register: 'Create Account',
      skip: 'Skip',
    },
    
    // Navigation
    nav: {
      home: 'Home',
      search: 'Search',
      bookings: 'Bookings',
      garage: 'Garage',
      profile: 'Profile',
    },
    
    // Home Screen
    home: {
      greeting: 'Good day',
      guest: 'Guest',
      findSTO: 'Find Service',
      newQuote: 'New Quote',
      myGarage: 'My Garage',
      bookings: 'Bookings',
      nearbySTO: 'Nearby Services',
      viewAll: 'All',
      noSTO: 'No services found',
      enableGeo: 'Enable geolocation to find nearby services',
      loginPrompt: 'Sign in to your account',
      loginPromptDesc: 'To create quotes and book services',
    },
    
    // Search Screen
    search: {
      title: 'Search',
      placeholder: 'Search services or workshops',
      results: 'results',
      result: 'result',
      resulta: 'results',
      noResults: 'Nothing found',
      noResultsHint: 'Try increasing the search radius',
      increaseRadius: 'Increase radius',
      respondsIn: 'responds in',
      min: 'min',
      hour: 'h',
      from: 'from',
      book: 'Book',
      priceOnRequest: 'Price on request',
    },
    
    // Profile
    profile: {
      title: 'Profile',
      settings: 'Settings',
      language: 'Language',
      theme: 'Theme',
      darkTheme: 'Dark',
      lightTheme: 'Light',
      notifications: 'Notifications',
      logout: 'Sign Out',
      login: 'Sign In',
    },
    
    // Common
    common: {
      km: 'km',
      m: 'm',
      loading: 'Loading...',
      error: 'Error',
      retry: 'Retry',
      cancel: 'Cancel',
      save: 'Save',
      delete: 'Delete',
      edit: 'Edit',
    },
  },
};

export type Language = 'ru' | 'de' | 'en';
export type TranslationKeys = typeof translations.ru;

// ============================================
// LANGUAGE CONTEXT
// ============================================
interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: TranslationKeys;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ru');

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const saved = await AsyncStorage.getItem('app_language');
      if (saved && (saved === 'ru' || saved === 'de' || saved === 'en')) {
        setLanguageState(saved as Language);
      }
    } catch (e) {
      console.log('Error loading language:', e);
    }
  };

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    try {
      await AsyncStorage.setItem('app_language', lang);
    } catch (e) {
      console.log('Error saving language:', e);
    }
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t: translations[language],
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
