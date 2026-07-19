export const fmt = (n) =>
  Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '')

export const todayStr = () => new Date().toISOString().slice(0, 10)

export const shortAddr = (a) => {
  if (!a) return ''
  const p = a.split(',')
  return p.length > 2 ? p[0].trim() + ', ' + p[p.length - 1].trim() : a
}

export const prMf = (v) =>
  'S$ ' + (parseFloat(v) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export const prFmtMonth = (raw) => {
  if (!raw) return '—'
  const parts = String(raw).trim().slice(0, 7).split('-')
  if (parts.length < 2) return '—'
  const yyyy = parseInt(parts[0]), mm = parseInt(parts[1])
  if (isNaN(yyyy) || isNaN(mm)) return '—'
  const d = new Date(Date.UTC(yyyy, mm - 1, 1))
  if (isNaN(d)) return '—'
  return d.toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export const getLineItemDate = (li) =>
  li.date || li.delivery_date || li.item_date || li.li_date || ''

export const getQty   = (li) => parseFloat(li.qty   || li.quantity || li.units || 1) || 1
export const getPrice = (li) => parseFloat(li.unit_price || li.price || li.rate || li.amount || 0)
export const getDesc  = (li) => li.description || li.desc || li.item || ''

export const sortLineItems = (items) => {
  if (!items || !items.length) return []
  return [...items].sort((a, b) => {
    const parseDate = (li) => {
      const raw = getLineItemDate(li)
      if (!raw) return 0
      const [dd, mm, yyyy] = raw.split(/[-\/]/)
      if (!dd || !mm || !yyyy) return 0
      return new Date(`${yyyy}-${mm}-${dd}`).getTime()
    }
    const diff = parseDate(a) - parseDate(b)
    if (diff !== 0) return diff
    return (a.id ?? 0) - (b.id ?? 0)
  })
}

export const loadImg = (src) =>
  new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const ext = src.toLowerCase().endsWith('.png') ? 'PNG' : 'JPEG'
      resolve({ d: c.toDataURL('image/' + ext.toLowerCase()), ext })
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
