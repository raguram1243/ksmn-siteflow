import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { navItemsForRole } from '../constants/navigation'

const RESULT_LIMIT = 6

interface DataResult {
  id: string
  type: string
  title: string
  subtitle?: string
  path: string
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// Strip characters that would break the PostgREST .or() filter syntax
function escapeLike(s: string) {
  return s.replace(/[,%()]/g, ' ')
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DataResult[]>([])
  const [searching, setSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const isAdmin = profile?.role === 'admin'
  const debouncedQuery = useDebouncedValue(query.trim(), 250)

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setResults([])
    setActiveIndex(0)
    const t = setTimeout(() => {
      document.getElementById('command-palette-input')?.focus()
    }, 30)
    return () => clearTimeout(t)
  }, [isOpen])

  // Page commands (role-filtered, shared with the sidebar)
  const pages = useMemo(() => {
    const items = navItemsForRole(profile?.role)
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      i => i.label.toLowerCase().includes(q) || (i.keywords || '').toLowerCase().includes(q)
    )
  }, [query, profile?.role])

  useEffect(() => {
    if (!isOpen) return
    const q = escapeLike(debouncedQuery)
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)
    const like = `%${q}%`
    // Supabase query builders are thenable but not real Promises, so wrap
    // them for Promise.all.
    const requests: PromiseLike<any>[] = [
      supabase.from('contacts').select('id, name, phone, site_location, lead_status').or(`name.ilike.${like},phone.ilike.${like},site_location.ilike.${like}`).limit(RESULT_LIMIT),
      supabase.from('projects').select('id, status, contacts!projects_contact_id_fkey(name)').limit(RESULT_LIMIT),
      supabase.from('quotations').select('id, option_label, total_value, contacts!quotations_contact_id_fkey(name)').limit(RESULT_LIMIT),
    ]
    if (isAdmin) {
      requests.push(supabase.from('catalog_items').select('id, name, unit, standard_rate').ilike('name', like).limit(RESULT_LIMIT))
    }

    Promise.all(requests)
      .then(([contactsRes, projectsRes, quotesRes, catalogRes]) => {
        if (cancelled) return
        const out: DataResult[] = []
        for (const c of (contactsRes?.data || []) as any[]) {
          out.push({
            id: `c-${c.id}`,
            type: c.lead_status ? 'Lead' : 'Contact',
            title: c.name,
            subtitle: [c.phone, c.site_location].filter(Boolean).join(' · '),
            path: '/contacts',
          })
        }
        for (const p of (projectsRes?.data || []) as any[]) {
          out.push({
            id: `p-${p.id}`,
            type: 'Project',
            title: p.contacts?.name || 'Project',
            subtitle: String(p.status || '').replace('_', ' '),
            path: '/projects',
          })
        }
        for (const qr of (quotesRes?.data || []) as any[]) {
          out.push({
            id: `q-${qr.id}`,
            type: 'Quotation',
            title: `${qr.option_label} — ${qr.contacts?.name || ''}`.trim(),
            subtitle: `₹${Number(qr.total_value || 0).toLocaleString()}`,
            path: '/quotations',
          })
        }
        for (const it of ((catalogRes?.data || []) as any[])) {
          out.push({
            id: `cat-${it.id}`,
            type: 'Catalog',
            title: it.name,
            subtitle: `₹${Number(it.standard_rate || 0).toLocaleString()} / ${it.unit}`,
            path: '/catalog',
          })
        }
        setResults(out)
        setActiveIndex(0)
      })
      .catch(() => { if (!cancelled) setResults([]) })
      .finally(() => { if (!cancelled) setSearching(false) })

    return () => { cancelled = true }
  }, [debouncedQuery, isOpen, isAdmin])

  const flat = useMemo(
    () => [
      ...pages.map(p => ({ path: p.path, label: p.label, icon: p.icon(false) as any })),
      ...results.map(r => ({ path: r.path, label: r.title, icon: null })),
    ],
    [pages, results]
  )

  const go = useCallback((path: string) => {
    onClose()
    navigate(path)
  }, [navigate, onClose])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => (flat.length === 0 ? 0 : (i + 1) % flat.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => (flat.length === 0 ? 0 : (i - 1 + flat.length) % flat.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = flat[activeIndex]
      if (target) go(target.path)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isOpen])

  if (!isOpen) return null
  const hasQuery = query.trim().length > 0
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-[60] p-4 pt-[10vh]"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[70vh] border border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-center gap-3 px-4 border-b border-gray-200 dark:border-gray-700">
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            id="command-palette-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, contacts, projects, quotations…"
            className="flex-1 py-4 text-sm bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
            aria-label="Search"
          />
          {searching && <span className="text-xs text-gray-400">Searching…</span>}
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {flat.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {hasQuery ? 'No matches found' : 'Start typing to search'}
            </div>
          ) : (
            <>
              {pages.length > 0 && (
                <div className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Pages</div>
              )}
              {pages.map((p, i) => (
                <button
                  key={`page-${p.path}`}
                  onClick={() => go(p.path)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${i === activeIndex ? 'bg-brand-50 dark:bg-brand-950/50' : ''}`}
                >
                  <span className="text-gray-400 flex-shrink-0 w-5 h-5">{p.icon(false)}</span>
                  <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">{p.label}</span>
                  <span className="text-xs text-gray-400">Go to page</span>
                </button>
              ))}

              {results.length > 0 && (
                <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Results</div>
              )}
              {results.map((r, idx) => {
                const i = pages.length + idx
                return (
                  <button
                    key={r.id}
                    onClick={() => go(r.path)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${i === activeIndex ? 'bg-brand-50 dark:bg-brand-950/50' : ''}`}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{r.title}</span>
                      {r.subtitle && (
                        <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{r.subtitle}</span>
                      )}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex-shrink-0">
                      {r.type}
                    </span>
                  </button>
                )
              })}
            </>
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center gap-4 text-[11px] text-gray-400">
          <span>↑↓ navigate</span>
          <span>Enter open</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  )
}