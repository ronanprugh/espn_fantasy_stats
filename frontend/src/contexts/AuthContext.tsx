import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  SESSION_EXPIRED_EVENT,
  fetchAuthMe,
  login as loginApi,
  logout as logoutApi,
  type AuthUser,
} from '../api'

type AuthState = {
  user: AuthUser | null
  loading: boolean
  /** The last sign-out was an expired session rather than a deliberate logout. */
  sessionExpired: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const userRef = useRef(user)
  userRef.current = user

  useEffect(() => {
    const onExpired = () => {
      if (!userRef.current) return
      setSessionExpired(true)
      setUser(null)
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  useEffect(() => {
    fetchAuthMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const u = await loginApi(username, password)
    setSessionExpired(false)
    setUser(u)
  }, [])

  const logout = useCallback(async () => {
    await logoutApi()
    setUser(null)
  }, [])

  return <AuthContext.Provider value={{ user, loading, sessionExpired, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
