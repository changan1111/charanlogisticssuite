import { useState, useEffect, useRef, useCallback } from 'react'
import RecurringReminderScheduler from './RecurringReminderScheduler'
import { STORAGE_KEY, SCHEDULES } from './RecurringReminderScheduler'

// ── Floating reminders bell ──────────────────────────────
// The old dark InvoiceManager bar is gone. Only the bell remains,
// pinned top-right (position:fixed) so it stays put while
// scrolling through invoices.
export default function Nav() {
  const [showReminders, setShowReminders] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  const dropdownRef = useRef(null)
  const bellRef = useRef(null)

  // ── Sync pending count from localStorage ──
  useEffect(() => {
    const read = () => {
      try {
        const statuses = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
        setPendingCount(
          SCHEDULES.filter(s => (statuses[s.client] || 'yet-to') !== 'completed').length
        )
      } catch {
        setPendingCount(0)
      }
    }
    read()
    // 'storage' fires on cross-tab changes AND on same-tab via dispatchEvent in saveStatuses
    window.addEventListener('storage', read)
    return () => window.removeEventListener('storage', read)
  }, [])

  // ── Close dropdown on outside click ──
  useEffect(() => {
    if (!showReminders) return
    const handler = e => {
      if (
        !dropdownRef.current?.contains(e.target) &&
        !bellRef.current?.contains(e.target)
      ) {
        setShowReminders(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showReminders])

  const toggleReminders = useCallback(() => setShowReminders(v => !v), [])

  return (
    <div className="float-bell-wrap" ref={dropdownRef}>
      <button
        ref={bellRef}
        className={`float-bell${showReminders ? ' active' : ''}`}
        onClick={toggleReminders}
        aria-label={`Reminders — ${pendingCount} pending`}
        aria-expanded={showReminders}
        aria-haspopup="true"
      >
        <span aria-hidden="true">&#x1F514;</span>
        {pendingCount > 0 && (
          <span className="float-bell-count" aria-hidden="true">{pendingCount}</span>
        )}
      </button>

      {showReminders && (
        <div className="float-bell-dropdown" role="dialog" aria-label="Recurring reminders">
          <RecurringReminderScheduler compact />
        </div>
      )}
    </div>
  )
}
