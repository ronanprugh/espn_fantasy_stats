import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { fetchMyLeagues, type LeagueSummary } from '../api'
import { useAuth } from './AuthContext'

const STORAGE_KEY = 'selected_league_espn_id'

type LeagueState = {
  leagues: LeagueSummary[]
  selectedLeague: LeagueSummary | null
  loading: boolean
  refresh: () => Promise<void>
  select: (espnLeagueId: number) => void
}

const LeagueContext = createContext<LeagueState | undefined>(undefined)

export function LeagueProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [leagues, setLeagues] = useState<LeagueSummary[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? Number(raw) : null
  })
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchMyLeagues()
      setLeagues(list)
      if (list.length === 0) {
        setSelectedId(null)
      } else if (!selectedId || !list.find((l) => l.espn_league_id === selectedId)) {
        // selected league no longer valid; default to first
        setSelectedId(list[0].espn_league_id)
      }
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    if (user) {
      refresh()
    } else {
      setLeagues([])
      setSelectedId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    if (selectedId != null) {
      window.localStorage.setItem(STORAGE_KEY, String(selectedId))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [selectedId])

  const select = useCallback((espnLeagueId: number) => {
    setSelectedId(espnLeagueId)
  }, [])

  const selectedLeague =
    selectedId != null ? leagues.find((l) => l.espn_league_id === selectedId) ?? null : null

  return (
    <LeagueContext.Provider value={{ leagues, selectedLeague, loading, refresh, select }}>
      {children}
    </LeagueContext.Provider>
  )
}

export function useLeague(): LeagueState {
  const ctx = useContext(LeagueContext)
  if (!ctx) throw new Error('useLeague must be used inside LeagueProvider')
  return ctx
}
