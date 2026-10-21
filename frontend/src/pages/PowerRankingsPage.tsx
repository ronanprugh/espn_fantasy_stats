import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  deletePowerRankings,
  importPowerRankings,
  powerRankingImageUrl,
  type PowerRankingPostSummary,
  type PowerRankings,
  type PowerRankingSeason,
} from '../api'
import { BumpChart } from '../components/BumpChart'
import { ErrorMessage } from '../components/ErrorMessage'
import { Loading } from '../components/Loading'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { SortableTh, type SortDir } from '../components/SortableTh'
import { WriteupModal } from '../components/WriteupModal'
import { useLeague } from '../contexts/LeagueContext'
import { usePowerRankings } from '../hooks/usePowerRankings'
import { numberParam, useUrlState } from '../hooks/useUrlState'
import {
  authorOwnerId,
  biggestUpsets,
  formatChange,
  isAssumed,
  ordinal,
  ownerSeasonStats,
  ownerStats,
  pickAccuracy,
  postIndex,
  sourceLabel,
  teamIn,
  weekLabel,
  type OwnerPrStats,
  type OwnerSeasonPr,
  type PrOptions,
} from '../lib/powerRankings'

type View = 'week' | 'season' | 'alltime' | 'archive'
const VIEWS: { key: View; label: string }[] = [
  { key: 'week', label: 'Weekly' },
  { key: 'season', label: 'Season' },
  { key: 'alltime', label: 'All-Time' },
  { key: 'archive', label: 'Archive' },
]

type OpenPost = (postId: number, highlight?: string) => void

export const teamHubHref = (ownerId: string, season?: number) =>
  `/team_hub?team=${encodeURIComponent(ownerId)}&tab=power${season ? `&year=${season}` : ''}`

export function PowerRankingsPage() {
  const { selectedLeague } = useLeague()
  const leagueId = selectedLeague?.espn_league_id ?? null
  const { data, loading, error, reload, hasData } = usePowerRankings(leagueId)
  const [params, update] = useUrlState()
  const view = (VIEWS.find((v) => v.key === params.get('view'))?.key ?? 'week') as View
  const opts: PrOptions = {
    includeAssumed: params.get('assumed') === '1',
    includeGuest: params.get('guest') !== '0',
  }
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
      {loading && <Loading />}

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
            <nav className="years" aria-label="Season">
              {[...years].reverse().map((y) => (
                <button
                  key={y}
                  className={y === season.season ? 'active' : ''}
                  onClick={() => update({ year: String(y), week: null })}
                >
                  {y}
                </button>
              ))}
            </nav>
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

function OptionToggles({ opts, onChange }: { opts: PrOptions; onChange: (o: PrOptions) => void }) {
  return (
    <div className="pr-options">
      <label className="season-toggle" title="Weeks with no posted rankings take the nearest week's ranks. Leave this off to count only what was actually posted.">
        <input
          type="checkbox"
          checked={opts.includeAssumed}
          onChange={(e) => onChange({ ...opts, includeAssumed: e.target.checked })}
        />
        Count carried-over weeks
      </label>
      <label className="season-toggle" title="Rankings written by someone other than the regular writer.">
        <input
          type="checkbox"
          checked={opts.includeGuest}
          onChange={(e) => onChange({ ...opts, includeGuest: e.target.checked })}
        />
        Count guest editions
      </label>
    </div>
  )
}

// --------------------------------------------------------------------------- //
// Weekly
// --------------------------------------------------------------------------- //

function WeekView({
  data,
  season,
  week: weekParam,
  onWeek,
  openPost,
  leagueId,
}: {
  data: PowerRankings
  season: PowerRankingSeason
  week: number | null
  onWeek: (w: number) => void
  openPost: OpenPost
  leagueId: number
}) {
  const posts = postIndex(data)
  // Open on the most recent posted week, not a carried-over one.
  const latestPosted = [...season.weeks].reverse().find((w) => w.source === 'posted') ?? season.weeks[season.weeks.length - 1]
  const w = season.weeks.find((x) => x.week === weekParam) ?? latestPosted
  const post = w.post_id != null ? posts.get(w.post_id) : undefined
  const extras = w.extra_post_ids.map((id) => posts.get(id)).filter((p): p is PowerRankingPostSummary => !!p)
  const previews = season.previews.map((id) => posts.get(id)).filter((p): p is PowerRankingPostSummary => !!p)
  const rankOf = new Map(w.entries.map((e) => [e.team_id, e.rank]))

  return (
    <section className="pr-week">
      <div className="pr-weeks" role="group" aria-label="Week">
        {season.weeks.map((x) => {
          const p = x.post_id != null ? posts.get(x.post_id) : undefined
          return (
            <button
              key={x.week}
              className={`pr-week-pill ${x.source === 'posted' ? 'posted' : 'assumed'}${x.week === w.week ? ' active' : ''}`}
              onClick={() => onWeek(x.week)}
              title={x.source === 'posted' ? `${weekLabel(x.week)}: ${p?.title ?? 'posted'}${p?.is_guest ? ` (guest: ${p.author})` : ''}` : `${weekLabel(x.week)}: ${sourceLabel(x)}`}
            >
              {x.week === 1 ? 'Pre' : x.week}
              {p?.is_guest && <span className="pill-mark">G</span>}
            </button>
          )
        })}
        {previews.map((p) => (
          <button key={p.id} className="pr-week-pill preview" onClick={() => openPost(p.id)} title={p.title}>
            {previewLabel(p)}
          </button>
        ))}
      </div>

      <div className="pr-week-head">
        <div>
          <h3>
            {season.season} · {weekLabel(w.week)}
          </h3>
          {post && (
            <div className="pr-post-meta">
              {post.title} · {fmtDate(post.posted_at)} · {post.author}
            </div>
          )}
        </div>
        {post && (
          <button className="secondary-btn" onClick={() => openPost(post.id)}>
            Read the full post
          </button>
        )}
      </div>

      {isAssumed(w) && (
        <div className="pr-banner assumed" role="note">
          <strong>Assumed ranks.</strong> {sourceLabel(w)} Records and standings are this week's real ones.
        </div>
      )}
      {post?.is_guest && (
        <div className="pr-banner guest" role="note">
          <strong>Guest edition by {post.author}.</strong>{' '}
          {post.note ?? `Written by ${post.author}${data.primary_author ? `, not ${data.primary_author}` : ''}.`}
        </div>
      )}
      {post && !post.is_guest && post.note && <div className="pr-banner info">{post.note}</div>}

      {extras.map((p) => (
        <figure key={p.id} className="pr-extra">
          <figcaption>
            <strong>{p.title}</strong> · {fmtDate(p.posted_at)} · {p.author}
            {p.note && <div className="pr-extra-note">{p.note}</div>}
          </figcaption>
          {p.has_image ? (
            <button className="pr-extra-image" onClick={() => openPost(p.id)} title="Open">
              <img src={powerRankingImageUrl(leagueId, p.id)} alt={p.title} loading="lazy" />
            </button>
          ) : (
            p.format === 'image' && <div className="pr-extra-missing">The image for this post wasn't saved.</div>
          )}
          {!p.has_image && p.format === 'text' && (
            <button className="link-btn" onClick={() => openPost(p.id)}>Read it</button>
          )}
        </figure>
      ))}

      <ol className="pr-list">
        {w.entries.map((e) => {
          const t = teamIn(season, e.team_id)
          const game = w.games.find((g) => g[0] === e.team_id || g[1] === e.team_id)
          const oppId = game ? (game[0] === e.team_id ? game[1] : game[0]) : null
          const opp = oppId != null ? teamIn(season, oppId) : undefined
          const result = game ? (game[2] === e.team_id ? 'W' : game[2] == null ? 'T' : 'L') : null
          return (
            <li key={e.team_id} className={`pr-row${isAssumed(w) ? ' assumed' : ''}${e.rank === 1 ? ' top' : ''}`}>
              <div className="pr-rank">{e.rank}</div>
              <div className="pr-main">
                <div className="pr-team-line">
                  {t ? (
                    <Link className="pr-team" to={teamHubHref(t.owner_id, season.season)}>
                      {t.team_name}
                    </Link>
                  ) : (
                    <span className="pr-team">{e.written_name}</span>
                  )}
                  <span className={`pr-move ${e.change == null ? '' : e.change > 0 ? 'pos' : e.change < 0 ? 'neg' : 'flat'}`}>
                    {formatChange(e.change)}
                  </span>
                </div>
                <div className="pr-meta">
                  {t?.owner_name} · {e.record}
                  {e.standing != null && ` · ${ordinal(e.standing)} in standings`}
                  {result && opp && (
                    <>
                      {' · '}
                      <span className={`result-inline ${result === 'W' ? 'pos' : result === 'L' ? 'neg' : ''}`}>
                        {result === 'W' ? 'Beat' : result === 'L' ? 'Lost to' : 'Tied'} #{rankOf.get(opp.team_id)} {opp.team_name}
                      </span>
                    </>
                  )}
                </div>
                {e.blurb ? (
                  <Blurb text={e.blurb} onFull={post ? () => openPost(post.id, e.blurb) : undefined} />
                ) : (
                  isAssumed(w) && <div className="pr-carried">Rank carried over from Week {w.source_week}.</div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Blurb({ text, onFull }: { text: string; onFull?: () => void }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 260
  return (
    <div className="pr-blurb">
      <p className={!open && long ? 'clamped' : ''}>{text}</p>
      <div className="pr-blurb-actions">
        {long && (
          <button className="link-btn" onClick={() => setOpen((o) => !o)}>
            {open ? 'Show less' : 'Show more'}
          </button>
        )}
        {onFull && (
          <button className="link-btn" onClick={onFull}>
            In the full post
          </button>
        )}
      </div>
    </div>
  )
}

function previewLabel(p: PowerRankingPostSummary): string {
  const t = p.title.toLowerCase()
  if (t.includes('toilet')) return 'Toilet Bowl'
  if (t.includes('bowl') || t.includes('championship')) return 'Final'
  if (t.includes('final four')) return 'Final Four'
  if (t.includes('round 1') || t.includes('first round')) return 'Round 1'
  return 'Preview'
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

// --------------------------------------------------------------------------- //
// Season
// --------------------------------------------------------------------------- //

type SeasonSortKey = 'team' | 'avg' | 'pre' | 'final' | 'best' | 'worst' | 'at1' | 'finish' | 'beat'

function SeasonView({ data, season, opts }: { data: PowerRankings; season: PowerRankingSeason; opts: PrOptions }) {
  const [focus, setFocus] = useState<Set<number>>(new Set())
  const [sortKey, setSortKey] = useState<SeasonSortKey>('avg')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const stats = useMemo(() => ownerSeasonStats(data, opts), [data, opts.includeAssumed, opts.includeGuest])
  const rows = season.teams.map((t) => stats.get(`${season.season}:${t.owner_id}`)!).filter(Boolean)
  const posted = season.weeks.filter((w) => w.source === 'posted').length

  const value = (r: OwnerSeasonPr, k: SeasonSortKey): number | string | null => {
    switch (k) {
      case 'team': return r.teamName
      case 'avg': return r.avgRank
      case 'pre': return r.preseasonRank
      case 'final': return r.finalRank
      case 'best': return r.bestRank
      case 'worst': return r.worstRank
      case 'at1': return r.weeksAt1
      case 'finish': return r.finish
      case 'beat': return r.preseasonRank != null && r.finish != null ? r.preseasonRank - r.finish : null
    }
  }
  const sorted = sortRows(rows, (r) => value(r, sortKey), sortDir)
  const onSort = (k: SeasonSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir(k === 'at1' || k === 'beat' ? 'desc' : 'asc')
    }
  }
  const th = (k: SeasonSortKey, label: string, title?: string) => (
    <SortableTh sortKey={k} activeKey={sortKey} dir={sortDir} onClick={onSort} title={title} numeric={k !== 'team'}>
      {label}
    </SortableTh>
  )

  return (
    <section className="pr-season">
      <p className="subtitle">
        {posted} of {season.weeks.length} weeks posted
        {season.live && ' · season in progress'}
      </p>
      <BumpChart
        season={season}
        focus={focus}
        onToggle={(id) =>
          setFocus((f) => {
            const next = new Set(f)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
          })
        }
      />
      <h3 className="chart-title">{season.season} season</h3>
      <div className="teams-wrap">
        <table className="teams">
          <thead>
            <tr>
              {th('team', 'Team')}
              {th('avg', 'Avg', 'Average power rank across the weeks counted.')}
              {th('pre', 'Pre', 'Preseason rank (Week 1).')}
              {th('final', 'Last', "Rank in the season's last counted week.")}
              {th('best', 'Best')}
              {th('worst', 'Worst')}
              {th('at1', '#1 Wks', 'Weeks ranked #1.')}
              {th('finish', 'Finish', 'Place after the playoffs.')}
              {th('beat', 'vs Pre', 'Preseason rank minus final finish. Positive means the team finished better than it was ranked before the season.')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const team = season.teams.find((t) => t.owner_id === r.ownerId)
              const beat = r.preseasonRank != null && r.finish != null ? r.preseasonRank - r.finish : null
              return (
                <tr key={r.ownerId}>
                  <td>
                    <Link to={teamHubHref(r.ownerId, season.season)}>{r.teamName}</Link>
                    <div className="opp-owner">{team?.owner_name}</div>
                  </td>
                  <td className="num">{fmt(r.avgRank)}</td>
                  <td className="num">{r.preseasonRank ?? '—'}</td>
                  <td className="num">{r.finalRank ?? '—'}</td>
                  <td className="num">{r.bestRank ?? '—'}</td>
                  <td className="num">{r.worstRank ?? '—'}</td>
                  <td className="num">{r.weeksAt1}</td>
                  <td className="num">{r.finish ?? '—'}</td>
                  <td className={`num ${beat == null ? '' : beat > 0 ? 'pos' : beat < 0 ? 'neg' : ''}`}>
                    {beat == null ? '—' : beat > 0 ? `+${beat}` : beat}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// --------------------------------------------------------------------------- //
// All-time
// --------------------------------------------------------------------------- //

type AllSortKey =
  | 'owner' | 'seasons' | 'weeks' | 'avg' | 'best' | 'worst' | 'at1' | 'top3' | 'last'
  | 'streak' | 'pre1' | 'pre' | 'final' | 'vol' | 'respect'

const MIN_WEEKS_FOR_AVG = 20

function AllTimeView({
  data,
  opts,
  onPickWeek,
}: {
  data: PowerRankings
  opts: PrOptions
  onPickWeek: (season: number, week: number) => void
}) {
  const stats = useMemo(() => ownerStats(data, opts), [data, opts.includeAssumed, opts.includeGuest])
  const accuracy = useMemo(() => pickAccuracy(data, opts), [data, opts.includeAssumed, opts.includeGuest])
  const upsets = useMemo(() => biggestUpsets(data, 8, opts), [data, opts.includeAssumed, opts.includeGuest])
  const seasonStats = useMemo(() => ownerSeasonStats(data, opts), [data, opts.includeAssumed, opts.includeGuest])
  const author = authorOwnerId(data)
  const [sortKey, setSortKey] = useState<AllSortKey>('avg')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const top = <K extends keyof OwnerPrStats>(key: K, dir: 'max' | 'min', filter: (o: OwnerPrStats) => boolean = () => true) => {
    const pool = stats.filter((o) => o[key] != null && filter(o))
    if (!pool.length) return null
    return pool.reduce((best, o) => {
      const a = o[key] as unknown as number
      const b = best[key] as unknown as number
      return (dir === 'max' ? a > b : a < b) ? o : best
    })
  }
  const nameOf = (o: OwnerPrStats | null) => (o ? `${o.teamName} · ${o.ownerName}` : '—')
  const mostAt1 = top('weeksAt1', 'max')
  const streak = top('longestAt1', 'max')
  const bestAvg = top('avgRank', 'min', (o) => o.weeks >= MIN_WEEKS_FOR_AVG)
  const worstAvg = top('avgRank', 'max', (o) => o.weeks >= MIN_WEEKS_FOR_AVG)
  const pre1 = top('preseasonAt1', 'max')
  const climbs = stats.filter((o) => o.biggestClimb).sort((a, b) => b.biggestClimb!.value - a.biggestClimb!.value)[0]
  const drops = stats.filter((o) => o.biggestDrop).sort((a, b) => b.biggestDrop!.value - a.biggestDrop!.value)[0]
  const loved = top('respect', 'max', (o) => o.weeks >= MIN_WEEKS_FOR_AVG)
  const doubted = top('respect', 'min', (o) => o.weeks >= MIN_WEEKS_FOR_AVG)
  const writer = author ? stats.find((o) => o.ownerId === author) : undefined

  const value = (o: OwnerPrStats, k: AllSortKey): number | string | null => {
    switch (k) {
      case 'owner': return o.ownerName
      case 'seasons': return o.seasons
      case 'weeks': return o.weeks
      case 'avg': return o.avgRank
      case 'best': return o.bestRank
      case 'worst': return o.worstRank
      case 'at1': return o.weeksAt1
      case 'top3': return o.top3Weeks
      case 'last': return o.lastWeeks
      case 'streak': return o.longestAt1
      case 'pre1': return o.preseasonAt1
      case 'pre': return o.avgPreseasonRank
      case 'final': return o.avgFinalRank
      case 'vol': return o.volatility
      case 'respect': return o.respect
    }
  }
  const ASC: Set<AllSortKey> = new Set(['owner', 'avg', 'best', 'worst', 'pre', 'final', 'vol'])
  const onSort = (k: AllSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir(ASC.has(k) ? 'asc' : 'desc')
    }
  }
  const th = (k: AllSortKey, label: string, title?: string) => (
    <SortableTh sortKey={k} activeKey={sortKey} dir={sortDir} onClick={onSort} title={title} numeric={k !== 'owner'}>
      {label}
    </SortableTh>
  )
  const sorted = sortRows(stats, (o) => value(o, sortKey), sortDir)
  const pct = accuracy.games ? (100 * accuracy.correct) / accuracy.games : null

  return (
    <section className="pr-alltime">
      <div className="records-grid pr-records">
        <Card label="Most weeks at #1" value={mostAt1 ? String(mostAt1.weeksAt1) : '—'} sub={nameOf(mostAt1)} />
        <Card label="Longest run at #1" value={streak ? `${streak.longestAt1} wks` : '—'} sub={nameOf(streak)} />
        <Card label="Best average rank" value={fmt(bestAvg?.avgRank ?? null)} sub={`${nameOf(bestAvg)} (min ${MIN_WEEKS_FOR_AVG} wks)`} accent="pos" />
        <Card label="Worst average rank" value={fmt(worstAvg?.avgRank ?? null)} sub={nameOf(worstAvg)} accent="neg" />
        <Card label="Most preseason #1s" value={pre1 ? String(pre1.preseasonAt1) : '—'} sub={nameOf(pre1)} />
        <Card
          label="Biggest one-week climb"
          value={climbs ? `▲${climbs.biggestClimb!.value}` : '—'}
          sub={climbs ? `${nameOf(climbs)} · ${climbs.biggestClimb!.season} ${weekLabel(climbs.biggestClimb!.week)}` : ''}
          accent="pos"
          onClick={climbs ? () => onPickWeek(climbs.biggestClimb!.season, climbs.biggestClimb!.week) : undefined}
        />
        <Card
          label="Biggest one-week fall"
          value={drops ? `▼${drops.biggestDrop!.value}` : '—'}
          sub={drops ? `${nameOf(drops)} · ${drops.biggestDrop!.season} ${weekLabel(drops.biggestDrop!.week)}` : ''}
          accent="neg"
          onClick={drops ? () => onPickWeek(drops.biggestDrop!.season, drops.biggestDrop!.week) : undefined}
        />
        <Card
          label="Ranked furthest above record"
          value={loved?.respect != null ? `+${loved.respect.toFixed(1)}` : '—'}
          sub={`${nameOf(loved)} · places above their standing, on average`}
        />
        <Card
          label="Ranked furthest below record"
          value={doubted?.respect != null ? doubted.respect.toFixed(1) : '—'}
          sub={`${nameOf(doubted)} · places below their standing, on average`}
        />
        <Card
          label="Better-ranked team won"
          value={pct != null ? `${pct.toFixed(1)}%` : '—'}
          sub={`${accuracy.correct} of ${accuracy.games} regular-season games`}
        />
        {writer && data.primary_author && (
          <Card
            label={`The writer's own team`}
            value={fmt(writer.avgRank)}
            sub={`Average rank ${data.primary_author.split(' ')[0]} gives ${writer.teamName}${
              writer.respect != null
                ? `, ${Math.abs(writer.respect).toFixed(1)} places ${writer.respect >= 0 ? 'above' : 'below'} its standing`
                : ''
            }.`}
          />
        )}
      </div>

      <h3 className="chart-title">Every owner</h3>
      <div className="teams-wrap">
        <table className="teams">
          <thead>
            <tr>
              {th('owner', 'Owner')}
              {th('avg', 'Avg', 'Average power rank.')}
              {th('at1', '#1', 'Weeks ranked #1.')}
              {th('top3', 'Top 3', 'Weeks ranked in the top three.')}
              {th('last', 'Last', 'Weeks ranked last.')}
              {th('streak', 'Run', 'Longest run of consecutive weeks at #1 within a season.')}
              {th('best', 'Best')}
              {th('worst', 'Worst')}
              {th('pre1', 'Pre #1', 'Seasons opened at #1 in the preseason rankings.')}
              {th('pre', 'Avg Pre', 'Average preseason rank.')}
              {th('final', 'Avg Last', "Average rank in each season's last counted week.")}
              {th('respect', 'vs Record', 'Average of standing minus power rank. Positive means ranked higher than the record says.')}
              {th('vol', 'Moves', 'Average places moved per week, either direction.')}
              {th('weeks', 'Wks', 'Weeks counted.')}
              {th('seasons', 'Sns', 'Seasons ranked.')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((o) => (
              <tr key={o.ownerId}>
                <td>
                  <Link to={teamHubHref(o.ownerId)}>{o.ownerName}</Link>
                  <div className="opp-owner">{o.teamName}</div>
                </td>
                <td className="num">{fmt(o.avgRank)}</td>
                <td className="num">{o.weeksAt1}</td>
                <td className="num">{o.top3Weeks}</td>
                <td className="num">{o.lastWeeks}</td>
                <td className="num">{o.longestAt1}</td>
                <td className="num">{o.bestRank ?? '—'}</td>
                <td className="num">{o.worstRank ?? '—'}</td>
                <td className="num">{o.preseasonAt1}</td>
                <td className="num">{fmt(o.avgPreseasonRank)}</td>
                <td className="num">{fmt(o.avgFinalRank)}</td>
                <td className={`num ${o.respect == null ? '' : o.respect >= 0 ? 'pos' : 'neg'}`}>
                  {o.respect == null ? '—' : `${o.respect >= 0 ? '+' : ''}${o.respect.toFixed(2)}`}
                </td>
                <td className="num">{fmt(o.volatility)}</td>
                <td className="num">{o.weeks}</td>
                <td className="num">{o.seasons}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="chart-title">Average rank by season</h3>
      <Heatmap data={data} stats={seasonStats} owners={sorted} />

      <div className="pr-two-col">
        <section>
          <h3 className="chart-title">Biggest upsets</h3>
          <ol className="pr-upsets">
            {upsets.map((u, i) => {
              const s = data.seasons.find((x) => x.season === u.season)!
              return (
                <li key={i}>
                  <button className="link-btn" onClick={() => onPickWeek(u.season, u.week)}>
                    {u.season} {weekLabel(u.week)}
                  </button>
                  : #{u.winnerRank} {teamIn(s, u.winnerTeamId)?.team_name} beat #{u.loserRank} {teamIn(s, u.loserTeamId)?.team_name}
                </li>
              )
            })}
          </ol>
        </section>
        <section>
          <h3 className="chart-title">How often the better-ranked team won</h3>
          <table className="teams pr-accuracy">
            <tbody>
              {accuracy.bySeason.map((s) => (
                <tr key={s.season}>
                  <td>{s.season}</td>
                  <td className="num">{((100 * s.correct) / s.games).toFixed(0)}%</td>
                  <td className="num opp-owner">{s.correct} of {s.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <h3 className="chart-title">Coverage</h3>
      <Coverage data={data} onPick={onPickWeek} />
    </section>
  )
}

function Heatmap({ data, stats, owners }: { data: PowerRankings; stats: Map<string, OwnerSeasonPr>; owners: OwnerPrStats[] }) {
  const seasons = data.seasons
  return (
    <div className="teams-wrap">
      <table className="pr-heatmap">
        <thead>
          <tr>
            <th />
            {seasons.map((s) => (
              <th key={s.season} className="num">{s.season}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {owners.map((o) => (
            <tr key={o.ownerId}>
              <th scope="row">{o.ownerName}</th>
              {seasons.map((s) => {
                const r = stats.get(`${s.season}:${o.ownerId}`)
                const avg = r?.avgRank ?? null
                const n = s.teams.length
                // 0 for the best rank, 1 for the worst.
                const t = avg == null ? null : (avg - 1) / Math.max(1, n - 1)
                const style = t == null ? undefined : {
                  background: t < 0.5
                    ? `color-mix(in srgb, var(--success) ${Math.round((0.5 - t) * 120)}%, transparent)`
                    : `color-mix(in srgb, var(--danger) ${Math.round((t - 0.5) * 120)}%, transparent)`,
                }
                return (
                  <td key={s.season} className="num" style={style} title={r ? `${r.teamName}: ${fmt(avg)} average, finished ${r.finish ?? '—'}` : 'Not ranked'}>
                    {fmt(avg, 1)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Coverage({ data, onPick }: { data: PowerRankings; onPick: (season: number, week: number) => void }) {
  const posts = postIndex(data)
  const maxWeeks = Math.max(...data.seasons.map((s) => s.reg_weeks))
  return (
    <div className="teams-wrap">
      <table className="pr-coverage">
        <thead>
          <tr>
            <th />
            {Array.from({ length: maxWeeks }, (_, i) => (
              <th key={i} className="num">{i === 0 ? 'Pre' : i + 1}</th>
            ))}
            <th className="num">Posted</th>
          </tr>
        </thead>
        <tbody>
          {[...data.seasons].reverse().map((s) => (
            <tr key={s.season}>
              <th scope="row">{s.season}</th>
              {Array.from({ length: maxWeeks }, (_, i) => {
                const w = s.weeks.find((x) => x.week === i + 1)
                if (!w) return <td key={i}><span className={`cov ${i < s.reg_weeks ? 'future' : 'none'}`} /></td>
                const p = w.post_id != null ? posts.get(w.post_id) : undefined
                return (
                  <td key={i}>
                    <button
                      className={`cov ${w.source === 'posted' ? 'posted' : 'assumed'}`}
                      onClick={() => onPick(s.season, w.week)}
                      title={w.source === 'posted' ? `${weekLabel(w.week)}: ${p?.title}${p?.is_guest ? ` (guest: ${p.author})` : ''}` : `${weekLabel(w.week)}: ${sourceLabel(w)}`}
                      aria-label={`${s.season} ${weekLabel(w.week)}`}
                    >
                      {p?.is_guest ? 'G' : ''}
                    </button>
                  </td>
                )
              })}
              <td className="num opp-owner">
                {s.weeks.filter((w) => w.source === 'posted').length}/{s.weeks.length}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="chart-footnote">
        Solid: rankings posted. Hatched: no rankings that week, so the nearest week's are used. G: guest edition. Click a week to open it.
      </p>
    </div>
  )
}

// --------------------------------------------------------------------------- //
// Archive
// --------------------------------------------------------------------------- //

function ArchiveView({
  data,
  leagueId,
  openPost,
  onImported,
}: {
  data: PowerRankings
  leagueId: number
  openPost: OpenPost
  onImported: () => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const hits = useMemo(() => {
    if (q.length < 3) return []
    const out: { season: number; week: number; teamName: string; blurb: string; postId: number }[] = []
    for (const s of data.seasons) {
      for (const w of s.weeks) {
        if (w.post_id == null) continue
        for (const e of w.entries) {
          if (e.blurb.toLowerCase().includes(q) || teamIn(s, e.team_id)?.team_name.toLowerCase().includes(q)) {
            if (!e.blurb) continue
            out.push({ season: s.season, week: w.week, teamName: teamIn(s, e.team_id)?.team_name ?? '', blurb: e.blurb, postId: w.post_id })
          }
        }
      }
    }
    return out.reverse().slice(0, 60)
  }, [data, q])
  const bySeason = new Map<number, PowerRankingPostSummary[]>()
  for (const p of data.posts) (bySeason.get(p.season) ?? bySeason.set(p.season, []).get(p.season)!).push(p)

  return (
    <section className="pr-archive">
      <div className="control pr-search">
        <label htmlFor="pr-search">Search the write-ups</label>
        <input
          id="pr-search"
          type="search"
          placeholder="A player, a team, a nickname…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {q.length >= 3 && (
        <div className="pr-hits">
          <p className="subtitle">{hits.length === 60 ? 'First 60 matches' : `${hits.length} match${hits.length === 1 ? '' : 'es'}`}</p>
          <ul>
            {hits.map((h, i) => (
              <li key={i}>
                <button className="pr-hit" onClick={() => openPost(h.postId, h.blurb)}>
                  <span className="pr-hit-when">{h.season} {weekLabel(h.week)} · {h.teamName}</span>
                  <span className="pr-hit-text">{snippet(h.blurb, q)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {[...bySeason.entries()].reverse().map(([season, posts]) => (
        <section key={season} className="pr-archive-season">
          <h3>{season}</h3>
          <ul className="pr-posts">
            {posts.map((p) => (
              <li key={p.id}>
                <button className="pr-post-row" onClick={() => openPost(p.id)}>
                  <span className="pr-post-when">{fmtDate(p.posted_at)}</span>
                  <span className="pr-post-title">{p.title}</span>
                  <span className="pr-post-tags">
                    {p.kind === 'preview' && <span className="tag">Playoff preview</span>}
                    {p.format === 'image' && <span className="tag">{p.has_image ? 'Image' : 'Image not saved'}</span>}
                    {p.is_guest && <span className="tag guest">Guest: {p.author}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <details className="pr-manage">
        <summary>Replace or remove this league's power rankings</summary>
        <ImportPanel leagueId={leagueId} onDone={onImported} replacing />
      </details>
    </section>
  )
}

function snippet(text: string, q: string): ReactNode {
  const at = text.toLowerCase().indexOf(q)
  if (at < 0) return text.slice(0, 160) + (text.length > 160 ? '…' : '')
  const start = Math.max(0, at - 60)
  const end = Math.min(text.length, at + q.length + 100)
  return (
    <>
      {start > 0 && '…'}
      {text.slice(start, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length, end)}
      {end < text.length && '…'}
    </>
  )
}

// --------------------------------------------------------------------------- //
// Import
// --------------------------------------------------------------------------- //

function EmptyState({ leagueId, onImported }: { leagueId: number; onImported: () => void }) {
  return (
    <section className="pr-empty">
      <h3>No power rankings yet</h3>
      <p>
        Import your league's power rankings to chart them week by week, read every write-up, and see rankings next to
        results on Season Stats, Team Hub, Team Comparison, Head to Head and the Scoreboard.
      </p>
      <ImportPanel leagueId={leagueId} onDone={onImported} />
      <details className="pr-format">
        <summary>What the file looks like</summary>
        <pre>{`{
  "posts": [
    {
      "season": 2024,
      "week": 2,                     // the week it looks ahead to; preseason is 1
      "posted_at": "2024-09-12T17:07:18",
      "title": "POWER RANKINGS WEEK 2",
      "author": "Your Commissioner",
      "kind": "rankings",            // or "preview"
      "format": "text",              // or "image", with image_base64 + image_mime
      "text": "The full post…",
      "entries": [
        { "rank": 1, "team_name": "Team Name", "record": "1-0", "blurb": "…" }
      ]
    }
  ]
}`}</pre>
        <p>
          Entries can name a team by <code>team_name</code> (any name it has used, or its abbreviation) or by ESPN{' '}
          <code>team_id</code>.
        </p>
      </details>
    </section>
  )
}

function ImportPanel({ leagueId, onDone, replacing = false }: { leagueId: number; onDone: () => void; replacing?: boolean }) {
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; message?: string }>({ kind: 'idle' })
  const [confirmDelete, setConfirmDelete] = useState(false)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setStatus({ kind: 'busy', message: `Importing ${file.name}…` })
    let json: unknown
    try {
      json = JSON.parse(await file.text())
    } catch {
      setStatus({ kind: 'error', message: `${file.name} isn't valid JSON.` })
      return
    }
    try {
      const r = await importPowerRankings(leagueId, json)
      setStatus({ kind: 'ok', message: `Imported ${r.posts} posts (${r.rankings} with rankings) across ${r.seasons.length} seasons.` })
      onDone()
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message })
    }
  }

  return (
    <div className="pr-import">
      <label className="primary-btn pr-file-btn">
        {replacing ? 'Replace with a new file' : 'Import a file'}
        <input
          id={replacing ? 'pr-import-replace' : 'pr-import'}
          type="file"
          accept="application/json,.json"
          onChange={(e) => onFile(e.target.files?.[0])}
          disabled={status.kind === 'busy'}
        />
      </label>
      {replacing && !confirmDelete && (
        <button className="danger-btn" onClick={() => setConfirmDelete(true)}>
          Remove all power rankings
        </button>
      )}
      {replacing && confirmDelete && (
        <span className="pr-confirm">
          Remove every post for everyone in this league?{' '}
          <button
            className="danger-btn"
            onClick={async () => {
              await deletePowerRankings(leagueId)
              setConfirmDelete(false)
              onDone()
            }}
          >
            Remove
          </button>{' '}
          <button className="secondary-btn" onClick={() => setConfirmDelete(false)}>Keep them</button>
        </span>
      )}
      {replacing && <p className="subtitle">Importing replaces the whole archive for everyone who has added this league.</p>}
      {status.message && (
        <p className={status.kind === 'error' ? 'login-error inline' : 'subtitle'} role={status.kind === 'error' ? 'alert' : undefined}>
          {status.message}
        </p>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------- //
// Shared
// --------------------------------------------------------------------------- //

function Card({
  label,
  value,
  sub,
  accent,
  onClick,
}: {
  label: string
  value: string
  sub?: string
  accent?: 'pos' | 'neg'
  onClick?: () => void
}) {
  const cls = `record-card${accent ? ` ${accent}` : ''}${onClick ? ' clickable' : ''}`
  const inner = (
    <>
      <div className="record-label">{label}</div>
      <div className="record-value">{value}</div>
      {sub && <div className="record-sub">{sub}</div>}
    </>
  )
  return onClick ? (
    <button type="button" className={cls} onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

const fmt = (x: number | null, digits = 2) => (x == null ? '—' : x.toFixed(digits))

/** Sort with missing values always last, whichever the direction. */
function sortRows<T>(rows: T[], get: (r: T) => number | string | null, dir: SortDir): T[] {
  return [...rows].sort((a, b) => {
    const va = get(a)
    const vb = get(b)
    if (va == null || vb == null) return va === vb ? 0 : va == null ? 1 : -1
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
    return dir === 'asc' ? cmp : -cmp
  })
}

