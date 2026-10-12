import { useState, useRef, useEffect, useId } from 'react'

interface InfoTipProps {
  text: string
  label?: string
}

/**
 * Small (i) icon that explains a figure. Opens on hover or keyboard focus and
 * toggles on tap, so it works on touch screens. Closes on Escape or an outside tap.
 */
export default function InfoTip({ text, label = 'More info' }: InfoTipProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <span
      ref={ref}
      className="relative inline-flex align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="ml-1 inline-flex h-3.5 min-h-0! w-3.5 items-center justify-center rounded-full border border-gray-400 text-[9px] font-semibold leading-none text-gray-500 hover:border-gray-600 hover:text-gray-700 dark:border-gray-500 dark:text-gray-400 dark:hover:border-gray-300 dark:hover:text-gray-200"
      >
        i
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md bg-gray-900 px-2.5 py-1.5 text-[11px] font-normal normal-case leading-snug text-white shadow-lg dark:bg-gray-700"
        >
          {text}
        </span>
      )}
    </span>
  )
}
