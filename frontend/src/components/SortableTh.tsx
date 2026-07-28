import type { ReactNode } from 'react'

export type SortDir = 'asc' | 'desc'

type Props<K extends string> = {
  sortKey: K
  activeKey: K
  dir: SortDir
  onClick: (key: K) => void
  title?: string
  /** Marks a statistical column: applies tabular numerals and right alignment
   * to the header so it sits over its own digits rather than beside them. */
  numeric?: boolean
  children: ReactNode
}

export function SortableTh<K extends string>({
  sortKey,
  activeKey,
  dir,
  onClick,
  title,
  numeric,
  children,
}: Props<K>) {
  const isActive = activeKey === sortKey
  return (
    <th
      title={title}
      onClick={() => onClick(sortKey)}
      className={`sortable${isActive ? ' active' : ''}${numeric ? ' num' : ''}`}
    >
      {children}
      <span className="sort-arrow">{isActive ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
    </th>
  )
}
