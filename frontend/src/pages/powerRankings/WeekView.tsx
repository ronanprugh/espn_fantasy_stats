/** Power Rankings, Weekly: one week's ranks, movement and write-ups. */
import { Link } from 'react-router-dom'
import {
  powerRankingImageUrl,
  type PowerRankingPostSummary,
  type PowerRankings,
  type PowerRankingSeason,
} from '../../api'
import { isYours, useYourTeam } from '../../hooks/useYourTeam'
import { formatChange, isAssumed, ordinal, postIndex, sourceLabel, teamIn, weekLabel } from '../../lib/powerRankings'
import { type OpenPost, rankingsHref, Blurb, previewLabel, fmtDate } from './shared'

export function WeekView({
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
  const yourTeam = useYourTeam()

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
            <li
              key={e.team_id}
              className={`pr-row${isAssumed(w) ? ' assumed' : ''}${e.rank === 1 ? ' top' : ''}${
                isYours(yourTeam, t?.owner_id) ? ' your-team' : ''
              }`}
            >
              <div className="pr-rank">{e.rank}</div>
              <div className="pr-main">
                <div className="pr-team-line">
                  {t ? (
                    <Link className="pr-team" to={rankingsHref(t.owner_id, season.season)}>
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
