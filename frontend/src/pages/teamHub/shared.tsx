/** Types the Team Hub tabs share. */
import { type ReactNode } from 'react'
import { useFromHere } from '../../hooks/useFromHere'

export type Opponent = (year: number, teamId: number | null, name: ReactNode) => ReactNode
export type FromHere = ReturnType<typeof useFromHere>
