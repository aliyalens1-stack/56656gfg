import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setLogoutHandler } from '../services/api';

interface User {
  id: string;
  _id?: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'auth_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 🔥 INIT AUTH - завантажуємо токен при старті
  useEffect(() => {
    const initAuth = async () => {
      console.log('[AuthContext] Initializing auth...');
      try {
        const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
        console.log('[AuthContext] Stored token:', storedToken ? 'exists' : 'none');
        
        if (storedToken) {
          // Встановлюємо токен в axios headers
          api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
          setToken(storedToken);
          
          // Підтягуємо user info
          try {
            const response = await api.get('/auth/me');
            console.log('[AuthContext] User loaded:', response.data?.email);
            setUser(response.data);
          } catch (error: any) {
            console.log('[AuthContext] Failed to load user, clearing token:', error?.message);
            // Токен недійсний - очищаємо
            await AsyncStorage.removeItem(TOKEN_KEY);
            delete api.defaults.headers.common['Authorization'];
            setToken(null);
            setUser(null);
          }
        }
      } catch (error) {
        console.log('[AuthContext] Init error:', error);
      } finally {
        setIsLoading(false);
        console.log('[AuthContext] Init complete');
      }
    };

    initAuth();
  }, []);

  // 🔥 LOGIN
  const login = useCallback(async (email: string, password: string) => {
    console.log('[AuthContext] Login attempt for:', email);
    const response = await api.post('/auth/login', { email, password });
    const { accessToken, user: userData } = response.data;
    
    console.log('[AuthContext] Login success, saving token...');
    
    // Зберігаємо токен
    await AsyncStorage.setItem(TOKEN_KEY, accessToken);
    
    // Встановлюємо в axios
    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    
    // Оновлюємо state
    setToken(accessToken);
    setUser(userData);
    
    console.log('[AuthContext] Login complete, user:', userData?.email);
  }, []);

  // 🔥 REGISTER
  const register = useCallback(async (data: RegisterData) => {
    console.log('[AuthContext] Register attempt for:', data.email);
    const response = await api.post('/auth/register', data);
    const { accessToken, user: userData } = response.data;
    
    // Зберігаємо токен
    await AsyncStorage.setItem(TOKEN_KEY, accessToken);
    
    // Встановлюємо в axios
    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    
    // Оновлюємо state
    setToken(accessToken);
    setUser(userData);
    
    console.log('[AuthContext] Register complete');
  }, []);

  // 🔥 LOGOUT
  const logout = useCallback(async () => {
    console.log('[AuthContext] Logout...');
    
    // Очищаємо storage
    await AsyncStorage.removeItem(TOKEN_KEY);
    
    // Очищаємо axios headers
    delete api.defaults.headers.common['Authorization'];
    
    // Очищаємо state
    setToken(null);
    setUser(null);
    
    console.log('[AuthContext] Logout complete');
  }, []);

  // 🔥 Set logout handler for 401 interceptor
  useEffect(() => {
    setLogoutHandler(logout);
  }, [logout]);

  // 🔥 REFRESH USER
  const refreshUser = useCallback(async () => {
    if (!token) return;
    
    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
    } catch (error) {
      console.log('[AuthContext] Refresh user failed');
    }
  }, [token]);

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    isAuthenticated: !!token && !!user,
    login,
    register,
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
