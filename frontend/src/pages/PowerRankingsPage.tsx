/**
 * Power Rankings: the league's posted rankings, imported from a file. Weekly
 * (each week's ranks and write-ups), Season (bump chart and per-team stats),
 * All-Time (records across seasons) and Archive (every post, search, import).
 * Weeks with no posted rankings borrow the nearest week's and are marked.
 */
import { useMemo, useState } from 'react'
import { ErrorMessage } from '../components/ErrorMessage'
import { ListSkeleton } from '../components/Loading'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { WriteupModal } from '../components/WriteupModal'
import { useLeague } from '../contexts/LeagueContext'
import { usePowerRankings } from '../hooks/usePowerRankings'
import { numberParam, useUrlState } from '../hooks/useUrlState'
import { SeasonPicker } from '../components/SeasonPicker'
import { type PrOptions } from '../lib/powerRankings'
import { AllTimeView } from './powerRankings/AllTimeView'
import { ArchiveView } from './powerRankings/ArchiveView'
import { EmptyState } from './powerRankings/ImportPanel'
import { SeasonView } from './powerRankings/SeasonView'
import { WeekView } from './powerRankings/WeekView'
import { type OpenPost, OptionToggles } from './powerRankings/shared'

type View = 'week' | 'season' | 'alltime' | 'archive'
const VIEWS: { key: View; label: string }[] = [
  { key: 'week', label: 'Weekly' },
  { key: 'season', label: 'Season' },
  { key: 'alltime', label: 'All-Time' },
  { key: 'archive', label: 'Archive' },
]

export function PowerRankingsPage() {
  const { selectedLeague } = useLeague()
  const leagueId = selectedLeague?.espn_league_id ?? null
  const { data, loading, error, reload, hasData } = usePowerRankings(leagueId)
  const [params, update] = useUrlState()
  const view = (VIEWS.find((v) => v.key === params.get('view'))?.key ?? 'week') as View
  const includeAssumed = params.get('assumed') === '1'
  const includeGuest = params.get('guest') !== '0'
  // One object per setting, so the views' memoised stats recompute only
  // when a toggle changes.
  const opts = useMemo<PrOptions>(() => ({ includeAssumed, includeGuest }), [includeAssumed, includeGuest])
  const [modal, setModal] = useState<{ postId: number; highlight?: string } | null>(null)
  const openPost: OpenPost = (postId, highlight) => setModal({ postId, highlight })

  if (!selectedLeague || !leagueId) return <NoLeagueSelected />

  const seasons = data?.seasons ?? []
  const yearParam = numberParam(params, 'year')
  const season = seasons.find((s) => s.season === yearParam) ?? seasons[seasons.length - 1]
  const years = seasons.map((s) => s.season)

  return (
    <div className="page power-rankings-page">
      <header className="page-header">
        <h2>Power Rankings</h2>
        {hasData && data && (
          <span className="league">
            {years[0]}–{years[years.length - 1]} · {data.posts.length} posts
            {data.primary_author && ` · by ${data.primary_author}`}
          </span>
        )}
      </header>

      {error && <ErrorMessage message={error} />}
      {loading && <ListSkeleton rows={8} />}

      {!loading && data && !hasData && (
        <EmptyState leagueId={leagueId} onImported={reload} />
      )}

      {!loading && data && hasData && season && (
        <>
          <nav className="hub-tabs" aria-label="Power rankings views">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                className={view === v.key ? 'active' : ''}
                onClick={() => update({ view: v.key === 'week' ? null : v.key })}
              >
                {v.label}
              </button>
            ))}
          </nav>

          {(view === 'week' || view === 'season') && (
            <SeasonPicker
              years={years}
              value={season.season}
              onChange={(y) => update({ year: String(y), week: null })}
            />
          )}

          {(view === 'season' || view === 'alltime') && (
            <OptionToggles opts={opts} onChange={(o) => update({ assumed: o.includeAssumed ? '1' : null, guest: o.includeGuest ? null : '0' })} />
          )}

          {view === 'week' && (
            <WeekView
              data={data}
              season={season}
              week={numberParam(params, 'week')}
              onWeek={(w) => update({ week: String(w) })}
              openPost={openPost}
              leagueId={leagueId}
            />
          )}
          {view === 'season' && <SeasonView data={data} season={season} opts={opts} />}
          {view === 'alltime' && (
            <AllTimeView
              data={data}
              opts={opts}
              onPickWeek={(y, w) => update({ view: null, year: String(y), week: String(w) })}
            />
          )}
          {view === 'archive' && (
            <ArchiveView data={data} leagueId={leagueId} openPost={openPost} onImported={reload} />
          )}
        </>
      )}

      {modal && (
        <WriteupModal leagueId={leagueId} postId={modal.postId} highlight={modal.highlight} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
