/**
 * Authentication Store (Zustand)
 *
 * Manages user authentication state and role-based access control.
 * Persisted to AsyncStorage so users stay logged in across app restarts.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, AuthUser } from '@/services/api';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser, token: string) => void;
  clearError: () => void;
  init: () => Promise<void>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.login(email, password);
          await api.setToken(response.token);
          set({ 
            user: response.user, 
            token: response.token,
            isLoading: false,
            error: null,
          });
        } catch (error: any) {
          const message = error?.message || 'Login failed. Please try again.';
          set({ 
            isLoading: false, 
            error: message,
            user: null,
            token: null,
          });
          throw error;
        }
      },

      logout: async () => {
        await api.clearToken();
        set({ 
          user: null, 
          token: null, 
          error: null,
          isLoading: false,
        });
      },

      setUser: (user: AuthUser, token: string) => {
        set({ user, token });
      },

      clearError: () => {
        set({ error: null });
      },

      init: async () => {
        const state = get();
        if (state.token) {
          await api.setToken(state.token);
        }
      },
    }),
    {
      name: '@bidii:auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
      }),
    }
  )
);

// ── Role-based permissions helpers ───────────────────────────────────────────

export const ROLES = {
  PRINCIPAL: 'PRINCIPAL',
  ADMIN_STAFF: 'ADMIN_STAFF',
  LIBRARIAN: 'ADMIN_STAFF', // alias — librarians are ADMIN_STAFF with library module access
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
} as const;

export type UserRole = keyof typeof ROLES;

/**
 * Check if current user has one of the allowed roles
 */
export function hasRole(allowedRoles: UserRole[]): boolean {
  const user = useAuth.getState().user;
  if (!user) return false;
  return allowedRoles.includes(user.role as UserRole);
}

/**
 * Check if current user is a Principal
 */
export function isPrincipal(): boolean {
  return useAuth.getState().user?.role === ROLES.PRINCIPAL;
}

/**
 * Check if current user is a Librarian (ADMIN_STAFF with library permissions)
 */
export function isLibrarian(): boolean {
  const user = useAuth.getState().user;
  return user?.role === ROLES.ADMIN_STAFF;
}

/**
 * Check if current user is a Student
 */
export function isStudent(): boolean {
  return useAuth.getState().user?.role === ROLES.STUDENT;
}

/**
 * Check if current user is a Teacher
 */
export function isTeacher(): boolean {
  return useAuth.getState().user?.role === ROLES.TEACHER;
}

/**
 * Get user's display name
 */
export function getDisplayName(): string {
  return useAuth.getState().user?.email.split('@')[0] || 'User';
}
