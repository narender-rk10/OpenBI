import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import api from './api'
import type { User, AuthResponse } from './types'

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isSuperAdmin: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, name: string, orgName: string) => Promise<void>
  logout: () => void
  updateUser: (updates: Partial<User>) => void
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('openbi_token')
    const savedUser = localStorage.getItem('openbi_user')
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch { /* ignore */ }
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    const { data } = await api.post<AuthResponse>('/api/auth/login', { email, password })
    localStorage.setItem('openbi_token', data.access_token)
    localStorage.setItem('openbi_user', JSON.stringify(data.user))
    setUser(data.user)
  }

  const signup = async (email: string, password: string, name: string, orgName: string) => {
    const { data } = await api.post<AuthResponse>('/api/auth/signup', {
      email, password, name, org_name: orgName,
    })
    localStorage.setItem('openbi_token', data.access_token)
    localStorage.setItem('openbi_user', JSON.stringify(data.user))
    setUser(data.user)
  }

  const logout = () => {
    localStorage.removeItem('openbi_token')
    localStorage.removeItem('openbi_user')
    setUser(null)
  }

  const updateUser = (updates: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev
      const updated = { ...prev, ...updates }
      localStorage.setItem('openbi_user', JSON.stringify(updated))
      return updated
    })
  }

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isSuperAdmin: user?.role === 'super_admin',
      isLoading,
      login,
      signup,
      logout,
      updateUser,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
