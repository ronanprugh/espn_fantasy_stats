/** Team Hub's loading placeholder. */
import { SkeletonBlock, SkeletonRegion } from '../../components/Loading'

/** Team Hub's shape while it loads: the name and headline, the tabs, and a
 * row of summary cards. */
export function HubSkeleton() {
  return (
    <SkeletonRegion className="hub-skeleton">
      <section className="hub-header">
        <div className="hub-header-main">
          <SkeletonBlock width="240px" height={26} />
          <SkeletonBlock width="320px" height={16} className="skeleton-gap" />
          <SkeletonBlock width="200px" height={13} className="skeleton-gap" />
        </div>
      </section>
      <nav className="hub-tabs">
        <SkeletonBlock width="260px" height={22} className="skeleton-tabs" />
      </nav>
      <section className="hub-summary">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="stat-card skeleton-card">
            <SkeletonBlock width="55%" height={11} />
            <SkeletonBlock width="40%" height={26} />
            <SkeletonBlock width="65%" height={11} />
          </div>
        ))}
      </section>
      <section className="hub-last-matchup">
        <SkeletonBlock width="200px" height={18} className="skeleton-heading" />
        <div className="scoreboard-card skeleton-card">
          <SkeletonBlock width="110px" height={11} />
          {[0, 1].map((row) => (
            <div key={row} className="card-row">
              <div className="team">
                <SkeletonBlock width="45%" height={15} />
                <SkeletonBlock width="25%" height={11} className="skeleton-sub" />
              </div>
              <SkeletonBlock width="48px" height={20} />
            </div>
          ))}
        </div>
      </section>
      <section className="hub-records">
        <SkeletonBlock width="160px" height={18} className="skeleton-heading" />
        <div className="records-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="record-card skeleton-card">
              <SkeletonBlock width="50%" height={11} />
              <SkeletonBlock width="35%" height={26} />
              <SkeletonBlock width="70%" height={11} />
            </div>
          ))}
        </div>
      </section>
    </SkeletonRegion>
  )
}
