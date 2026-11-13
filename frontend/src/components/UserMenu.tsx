import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { SETTINGS_DESTINATIONS } from './navDestinations'

const ITEM = '[role="menuitem"]'

/**
 * The sidebar footer's settings menu: your username as a button that opens
 * Leagues, Account, Dark mode and Sign out.
 *
 * Keyboard: Enter, Space or ↓ on the button opens it on the first item (↑ on
 * the last); ↑/↓, Home and End move between items; Esc closes it and returns
 * focus to the button; Tab closes it and moves on as usual. A click outside
 * closes it too. It opens upward, since it sits at the bottom of the sidebar.
 */
export function UserMenu() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // Which item to focus once the menu has rendered: 'first', 'last' or none.
  const focusOnOpen = useRef<'first' | 'last' | null>(null)
  const menuId = useId()

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])

  const openMenu = (focus: 'first' | 'last') => {
    focusOnOpen.current = focus
    setOpen(true)
  }

  const close = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) buttonRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const list = items()
    if (focusOnOpen.current === 'first') list[0]?.focus()
    if (focusOnOpen.current === 'last') list[list.length - 1]?.focus()
    focusOnOpen.current = null

    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // Following a link closes the menu. If it was followed from the keyboard,
  // focus goes back to the button rather than dropping to <body>.
  useEffect(() => {
    if (menuRef.current?.contains(document.activeElement)) buttonRef.current?.focus()
    setOpen(false)
  }, [location.pathname])

  const onButtonKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openMenu(e.key === 'ArrowDown' ? 'first' : 'last')
    }
  }

  const onMenuKeyDown = (e: KeyboardEvent) => {
    const list = items()
    const i = list.indexOf(document.activeElement as HTMLElement)
    const move = (to: number) => {
      e.preventDefault()
      list[(to + list.length) % list.length]?.focus()
    }
    if (e.key === 'ArrowDown') move(i + 1)
    else if (e.key === 'ArrowUp') move(i - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(list.length - 1)
    else if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
    } else if (e.key === 'Tab') close(false)
  }

  const handleLogout = async () => {
    setOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="user-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        // Enter and Space arrive as a click on a native button.
        onClick={() => (open ? close(false) : openMenu('first'))}
        onKeyDown={onButtonKeyDown}
      >
        <span className="user-menu-name">{user?.username}</span>
        <span className="user-menu-caret" aria-hidden>
          ▴
        </span>
      </button>
      {open && (
        <div
          id={menuId}
          ref={menuRef}
          className="user-menu-list"
          role="menu"
          aria-label="Settings"
          onKeyDown={onMenuKeyDown}
        >
          {SETTINGS_DESTINATIONS.map((d) => (
            <NavLink key={d.path} to={d.path} role="menuitem" tabIndex={-1} className="user-menu-item">
              {d.label}
            </NavLink>
          ))}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="user-menu-item"
            onClick={toggle}
          >
            <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
            <span className="theme-icon" aria-hidden>
              {theme === 'light' ? '🌙' : '☀️'}
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="user-menu-item user-menu-logout"
            onClick={handleLogout}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
