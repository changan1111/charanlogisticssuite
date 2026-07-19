import { useState, useCallback } from 'react'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const STORAGE_KEY = 'regular-invoice-reminder-statuses'

export const SCHEDULES = [
  {
    client: 'Kaira',
    cadence: 'Every month on the 1st and 16th',
    details: 'Two invoices due on the 1st and 16th.',
    type: 'monthly-days',
    days: [1, 16],
  },
  {
    client: 'JIT',
    cadence: 'Every month on the 1st',
    details: 'One invoice due on the 1st.',
    type: 'monthly-days',
    days: [1],
  },
  {
    client: 'Travelsupplies',
    cadence: 'Every Monday and Thursday',
    details: 'Reminder on each Monday and Thursday.',
    type: 'weekly-days',
    days: [1, 4],
  },
  {
    client: 'Sunday Morning Orchard hotel',
    cadence: 'Every Sunday',
    details: 'Weekly Sunday reminder.',
    type: 'weekly-days',
    days: [0],
  },
  {
    client: 'Sunday Evening event',
    cadence: 'Every Sunday',
    details: 'Weekly Sunday reminder.',
    type: 'weekly-days',
    days: [0],
  },
  {
    client: 'Frozon 4invoices',
    cadence: 'Every Sunday',
    details: 'Weekly Sunday reminder.',
    type: 'weekly-days',
    days: [0],
  },
]

function getDayName(day) {
  return DAY_NAMES[day] || 'Day'
}

function formatDate(date) {
  return date.toLocaleDateString('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getNextOccurrence(schedule, today) {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  if (schedule.type === 'monthly-days') {
    const days = schedule.days.slice().sort((a, b) => a - b)
    for (let monthOffset = 0; monthOffset < 2; monthOffset += 1) {
      const monthDate = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1)
      for (const day of days) {
        const candidate = new Date(monthDate.getFullYear(), monthDate.getMonth(), day)
        if (candidate >= base) return formatDate(candidate)
      }
    }
  }

  if (schedule.type === 'weekly-days') {
    const days = schedule.days.slice().sort((a, b) => a - b)
    for (let offset = 0; offset < 14; offset += 1) {
      const candidate = new Date(base)
      candidate.setDate(base.getDate() + offset)
      if (days.includes(candidate.getDay())) return formatDate(candidate)
    }
  }

  return null
}

export function loadStatuses() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : {}
  } catch {
    return {}
  }
}

export function saveStatuses(statuses) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(statuses))
    // Fire storage event so Nav listener picks it up immediately (same-tab)
    window.dispatchEvent(new Event('storage'))
  } catch {
    // localStorage unavailable (sandboxed iframe etc.) — in-memory state still works
  }
}

export default function RecurringReminderScheduler({ compact = false }) {
  const [statuses, setStatuses] = useState(loadStatuses)
  const [justCompleted, setJustCompleted] = useState(null)

  const today = new Date()

  const updateStatus = useCallback((client, value) => {
    setStatuses(prev => {
      const next = { ...prev, [client]: value }
      saveStatuses(next)
      return next
    })
    if (value === 'completed') {
      setJustCompleted(client)
      setTimeout(() => setJustCompleted(null), 1200)
    }
  }, [])

  const resetAll = useCallback(() => {
    setStatuses({})
    saveStatuses({})
  }, [])

  const completedCount = SCHEDULES.filter(
    item => (statuses[item.client] || 'yet-to') === 'completed'
  ).length

  // Pending = not completed, OR just-completed (shown briefly with tick before hiding)
  const visibleSchedules = SCHEDULES.filter(
    item =>
      (statuses[item.client] || 'yet-to') !== 'completed' ||
      justCompleted === item.client
  )

  const allDone = visibleSchedules.filter(s => justCompleted !== s.client).length === 0

  return (
    <div
      className="pr-card"
      style={{
        marginBottom: compact ? 0 : 18,
        border: compact ? '1px solid #e2e8f0' : undefined,
        boxShadow: compact ? '0 8px 24px rgba(11,29,58,.12)' : undefined,
        background: compact ? 'white' : undefined,
        padding: compact ? '14px 16px' : undefined,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            className="pr-card-title"
            style={{
              marginBottom: compact ? 0 : 4,
              paddingBottom: compact ? 0 : undefined,
              borderBottom: compact ? 'none' : undefined,
              fontSize: compact ? '.75rem' : undefined,
            }}
          >
            {compact ? 'Reminder Notifications' : 'Regular Invoice Scheduler'}
          </div>
          {!compact && (
            <div style={{ color: 'var(--muted)', fontSize: '.9rem' }}>
              Reminder plan for recurring invoices and their schedule details.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {completedCount > 0 && (
            <button
              onClick={resetAll}
              title="Reset all to pending"
              style={{
                background: 'none',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: '.7rem',
                color: '#718096',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ↺ Reset
            </button>
          )}
          <div style={{ fontSize: '.78rem', color: '#2b6cb0', fontWeight: 700, whiteSpace: 'nowrap' }}>
            {SCHEDULES.length - completedCount} pending
            {completedCount > 0 && (
              <span style={{ color: '#0a7a4b', marginLeft: 6 }}>• {completedCount} done</span>
            )}
          </div>
        </div>
      </div>

      {/* ── All done ── */}
      {allDone ? (
        <div
          style={{
            color: '#0a7a4b',
            background: '#e4f7ee',
            border: '1px solid #0a7a4b',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: '.84rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>✓ All reminders completed</span>
          <button
            onClick={resetAll}
            style={{
              background: 'none',
              border: '1px solid #0a7a4b',
              borderRadius: 6,
              padding: '3px 10px',
              fontSize: '.74rem',
              color: '#0a7a4b',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Reset
          </button>
        </div>
      ) : (
        /* ── Reminder list ── */
        <div style={{ display: 'grid', gap: compact ? 7 : 10 }}>
          {visibleSchedules.map(item => {
            const isJustDone = justCompleted === item.client
            const next = getNextOccurrence(item, today)
            const nextLabel = next ? `Next: ${next}` : 'Next: soon'

            return (
              <div
                key={item.client}
                style={{
                  border: `1px solid ${isJustDone ? '#0a7a4b' : '#e2e8f0'}`,
                  borderRadius: 10,
                  padding: compact ? '9px 12px' : '12px 14px',
                  background: isJustDone ? '#e4f7ee' : '#fbfdff',
                  transition: 'background .3s, border-color .3s',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  {/* Left: client info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        color: '#1f2937',
                        fontSize: compact ? '.82rem' : '.88rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.client}
                    </div>
                    <div style={{ color: '#4a5568', fontSize: compact ? '.76rem' : '.84rem', marginTop: 1 }}>
                      {item.cadence}
                    </div>
                    {!compact && (
                      <div style={{ color: '#718096', fontSize: '.78rem', marginTop: 2 }}>
                        {item.details}
                      </div>
                    )}
                  </div>

                  {/* Right: next date + status */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: 4,
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ fontSize: '.74rem', color: '#2b6cb0', fontWeight: 700 }}>
                      {nextLabel}
                    </div>
                    {!compact && (
                      <div style={{ color: '#718096', fontSize: '.72rem' }}>
                        {item.type === 'weekly-days'
                          ? `Runs on ${item.days.map(getDayName).join(' & ')}`
                          : `Runs on day ${item.days.join(', ')}`}
                      </div>
                    )}
                    {isJustDone ? (
                      <div style={{ fontSize: '.76rem', color: '#0a7a4b', fontWeight: 700 }}>
                        ✓ Marked done
                      </div>
                    ) : (
                      <select
                        value={statuses[item.client] || 'yet-to'}
                        onChange={e => updateStatus(item.client, e.target.value)}
                        style={{
                          border: '1px solid #cbd5e0',
                          borderRadius: 6,
                          padding: compact ? '3px 6px' : '4px 8px',
                          fontSize: '.76rem',
                          background: 'white',
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="yet-to">Yet to</option>
                        <option value="completed">Completed</option>
                      </select>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
