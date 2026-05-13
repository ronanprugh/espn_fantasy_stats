import type { ReactNode } from 'react'

export type SortDir = 'asc' | 'desc'

type Props<K extends string> = {
  sortKey: K
  activeKey: K
  dir: SortDir
  onClick: (key: K) => void
  title?: string
  children: ReactNode
}

export function SortableTh<K extends string>({
  sortKey,
  activeKey,
  dir,
  onClick,
  title,
  children,
}: Props<K>) {
  const isActive = activeKey === sortKey
  return (
    <th
      title={title}
      onClick={() => onClick(sortKey)}
      className={`sortable${isActive ? ' active' : ''}`}
    >
      {children}
      <span className="sort-arrow">{isActive ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
    </th>
  )
}
