import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';

interface AuthContextType {
  user: any;
  token: string | null;
  login: (data: any) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  const parseUserData = (userData: any) => {
    if (userData && userData.concentrationProfile && typeof userData.concentrationProfile === 'string') {
      try {
        userData.concentrationProfile = JSON.parse(userData.concentrationProfile);
      } catch (e) {
        console.error('Failed to parse concentrationProfile', e);
      }
    }
    return userData;
  };

  const refreshUser = async () => {
    if (token) {
      try {
        const userData = await api.auth.me();
        if (userData.id) {
          setUser(parseUserData(userData));
        } else {
          logout();
        }
      } catch (err) {
        logout();
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    refreshUser();
  }, [token]);

  const login = async (data: any) => {
    const res = await api.auth.login(data);
    if (res.token) {
      localStorage.setItem('token', res.token);
      setToken(res.token);
      setUser(parseUserData(res.user));
    } else {
      throw new Error(res.message || 'Login failed');
    }
  };

  const register = async (data: any) => {
    const res = await api.auth.register(data);
    if (res.token) {
      localStorage.setItem('token', res.token);
      setToken(res.token);
      setUser(parseUserData(res.user));
    } else {
      throw new Error(res.message || 'Registration failed');
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
