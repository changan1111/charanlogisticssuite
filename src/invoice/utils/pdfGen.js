import jsPDF from 'jspdf'
import autoTablePkg from 'jspdf-autotable'
const autoTable = autoTablePkg.default || autoTablePkg
import { fmt, prMf, prFmtMonth, sortLineItems, getQty, getPrice, getDesc, getLineItemDate, loadImg } from './helpers'

const BASE = import.meta.env.BASE_URL || '/'
const FOOTER = {
  bankName:    'OCBC Bank Ltd.',
  bankAddr:    '65 Chulia Street, OCBC Singapore Centre, Singapore 049513',
  companyName: 'Charan Logistics Ptd Ltd.',
  accountNo:   '604233585001',
  payNowUEN:   '202502540D',
}

async function loadImages() {
  const [hdr, ftr, qr] = await Promise.all([
    loadImg(BASE + 'header.png'),
    loadImg(BASE + 'footer.png'),
    loadImg(BASE + 'QRCode.jpeg'),
  ])
  return { hdr, ftr, qr }
}

function drawHeaderFooterSync(doc, cfg, imgs, W = 210, HEADER_H = 35, FOOTER_H = 62) {
  const { hdr, ftr, qr } = imgs

  if (hdr) doc.addImage(hdr.d, hdr.ext, 0, 0, W, HEADER_H, '', 'NONE')
  else {
    doc.setFillColor(11, 29, 58); doc.rect(0, 0, W, HEADER_H, 'F')
    doc.setFillColor(59, 130, 196); doc.rect(0, HEADER_H, W, 2, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255)
    doc.text(cfg.name, 8 + 28, 14)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(160, 195, 230)
    doc.text(cfg.addr, 8 + 28, 20)
  }

  const fy = 297 - FOOTER_H
  const M = 8, valX = 52, col2x = 108
  doc.setFillColor(255, 255, 255); doc.rect(0, fy, W, FOOTER_H - 18, 'F')
  doc.setDrawColor(210, 225, 245); doc.setLineWidth(0.5); doc.line(0, fy, W, fy)
  let ty = fy + 7
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(11, 29, 58)
  doc.text('Account Details:', M, ty); ty += 5.5
  const accRows = [
    ['Bank Name',    FOOTER.bankName],
    ['Bank Address', FOOTER.bankAddr],
    ['Company Name', FOOTER.companyName],
    ['Account No.',  FOOTER.accountNo],
    ['PayNow UEN',   FOOTER.payNowUEN],
  ]
  doc.setFontSize(8.5)
  accRows.forEach(([lbl, val]) => {
    doc.setFont('helvetica', 'bold'); doc.setTextColor(70, 95, 130); doc.text(lbl + ' :', M, ty)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(11, 29, 58)
    const maxW = col2x - valX - 6
    const lines = doc.splitTextToSize(val, maxW)
    doc.text(lines[0], valX, ty)
    if (lines[1]) { ty += 4.3; doc.text(lines[1], valX, ty) }
    ty += 5.0
  })

  const imgStripY = 297 - 22
  if (ftr) doc.addImage(ftr.d, ftr.ext, 0, imgStripY, W, 22, '', 'NONE')
  else {
    doc.setFillColor(19, 48, 94); doc.rect(0, imgStripY, W, 22, 'F')
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(180, 200, 240)
    doc.text('CHARAN LOGISTICS PTE. LTD  ·  101 Kitchener Road #03-14  ·  Singapore 208511  ·  Reg No: 202502540D', W / 2, imgStripY + 11 + 1.5, { align: 'center' })
  }

  if (qr) {
    const qsz = 28, qx = W - 8 - qsz, qy = 297 - FOOTER_H + 3
    doc.addImage(qr.d, qr.ext, qx, qy, qsz, qsz, '', 'NONE')
  }
}

async function drawHeaderFooter(doc, cfg, W = 210, HEADER_H = 35, FOOTER_H = 62) {
  const imgs = await loadImages()
  drawHeaderFooterSync(doc, cfg, imgs, W, HEADER_H, FOOTER_H)
}

export async function makeInvoicePDF(inv, cfg) {
  const cur = 'S$'
  const W = 210, M = 8, HEADER_H = 35, FOOTER_H = 62
  const CONTENT_TOP = HEADER_H + 4
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  // Calculate display total from line items, fallback to inv.total
  const itemsTotal = (inv.items || []).reduce((s, li) => s + (parseFloat(li.qty ?? li.quantity ?? 1) || 1) * (parseFloat(li.price ?? li.rate ?? 0) || 0), 0)
  const displayTotal = itemsTotal > 0 ? itemsTotal : (parseFloat(inv.total) || 0)

  // Preload images BEFORE rendering so didDrawPage can use sync draw
  const imgs = await loadImages()
  drawHeaderFooterSync(doc, cfg, imgs, W, HEADER_H, FOOTER_H)

  const metaY = CONTENT_TOP + 4
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
  const numStr = '#' + inv.number
  const numW   = doc.getTextWidth(numStr)
  const labelW = doc.getTextWidth('INVOICE ')
  doc.setTextColor(130, 150, 180); doc.text('INVOICE', W - M - numW - labelW, metaY)
  doc.setTextColor(11, 29, 58);    doc.text(numStr, W - M, metaY, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(14); doc.setTextColor(11, 29, 58)
  if (inv.billingDate) doc.text('Billing Date: ' + inv.billingDate, W - M, metaY + 8, { align: 'right' })
  if (inv.due)         doc.text('Due: '          + inv.due,         W - M, metaY + 14, { align: 'right' })

  const partyY = CONTENT_TOP + 4
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(59, 130, 196)
  doc.text('BILLED TO', M, partyY)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(11, 29, 58)
  doc.text(inv.name || '—', M, partyY + 6)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(11, 29, 58)
  const aLines = (inv.addr || '').split(/,|\n/).map(s => s.trim()).filter(Boolean)
  aLines.forEach((l, i) => doc.text(l, M, partyY + 12 + i * 5))

  const attnOffset = inv.attn ? 8 : 0
  if (inv.attn) {
    const attnY = partyY + 12 + aLines.length * 5 + 3
    doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(11, 29, 58)
    doc.text('ATTN: ' + inv.attn, M, attnY)
  }

  const hasLineItemDates = (inv.items || []).some(li => getLineItemDate(li))
  const tableY = partyY + 14 + aLines.length * 5.5 + 3 + attnOffset

  const tableHead = hasLineItemDates
    ? [['Date', 'Description', 'Qty', 'Rate', 'Amount']]
    : [['Description', 'Qty', 'Rate', 'Amount']]

  const allRows = sortLineItems(inv.items || []).map(li => {
    const q = getQty(li), p = getPrice(li), d = getDesc(li), liDate = getLineItemDate(li)
    if (hasLineItemDates) return [liDate || '—', d.toUpperCase(), String(q), cur + ' ' + fmt(p), cur + ' ' + fmt(q * p)]
    return [d.toUpperCase(), String(q), cur + ' ' + fmt(p), cur + ' ' + fmt(q * p)]
  })
  if (!allRows.length) {
    if (hasLineItemDates) allRows.push(['—', 'Invoice total (no line item breakdown)', '—', '—', cur + ' ' + fmt(inv.total)])
    else allRows.push(['Invoice total (no line item breakdown)', '—', '—', cur + ' ' + fmt(inv.total)])
  }

  const bx = W - M - 75, bw = 75, bh = 36  // total box dimensions

  const colStyles = hasLineItemDates
    ? { 0: { cellWidth: 28, halign: 'left' }, 1: { cellWidth: 'auto' }, 2: { halign: 'center', cellWidth: 18 }, 3: { halign: 'right', cellWidth: 36 }, 4: { halign: 'right', cellWidth: 36, fontStyle: 'bold' } }
    : { 0: { cellWidth: 'auto' }, 1: { halign: 'center', cellWidth: 18 }, 2: { halign: 'right', cellWidth: 36 }, 3: { halign: 'right', cellWidth: 36, fontStyle: 'bold' } }

  autoTable(doc, {
    startY: tableY, head: tableHead, body: allRows,
    margin: { left: M, right: M, top: CONTENT_TOP, bottom: FOOTER_H + 6 },
    rowPageBreak: 'avoid',
    headStyles: { fillColor: [11, 29, 58], textColor: [175, 205, 240], fontSize: 10, fontStyle: 'bold', cellPadding: 4.5 },
    bodyStyles: { fontSize: 10, textColor: [25, 45, 80], cellPadding: 4.5 },
    alternateRowStyles: { fillColor: [245, 249, 255] },
    columnStyles: colStyles,
    styles: { lineColor: [220, 232, 248], lineWidth: 0.3 },
    didDrawPage: () => { drawHeaderFooterSync(doc, cfg, imgs, W, HEADER_H, FOOTER_H) },
    pageBreak: 'auto',
  })

  // Page numbers
  const pageCount = doc.internal.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(130, 150, 180)
    doc.text(`Page ${p} of ${pageCount}`, W / 2, 290, { align: 'center' })
  }

  const finalY = doc.lastAutoTable.finalY
  const maxY = 297 - FOOTER_H - bh - 6  // max Y before footer overlap
  let by = finalY + 8
  if (by > maxY) {
    doc.addPage()
    drawHeaderFooterSync(doc, cfg, imgs, W, HEADER_H, FOOTER_H)
    by = CONTENT_TOP + 8
  }
  doc.setFillColor(245, 249, 255); doc.roundedRect(bx, by, bw, bh, 3, 3, 'F')
  doc.setDrawColor(210, 225, 245); doc.setLineWidth(0.4); doc.roundedRect(bx, by, bw, bh, 3, 3, 'S')
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110, 130, 160)
  doc.text('Subtotal', bx + 8, by + 10); doc.text('Tax (0%)', bx + 8, by + 19)
  doc.setTextColor(11, 29, 58)
  doc.text(cur + ' ' + fmt(displayTotal), bx + bw - 6, by + 10, { align: 'right' })
  doc.text(cur + ' 0.00', bx + bw - 6, by + 19, { align: 'right' })
  doc.setDrawColor(200, 218, 242); doc.line(bx + 5, by + 23, bx + bw - 5, by + 23)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(11, 29, 58)
  doc.text('TOTAL', bx + 8, by + 31)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(19, 48, 94)
  doc.text(cur + ' ' + fmt(displayTotal), bx + bw - 6, by + 31, { align: 'right' })

  const blob = doc.output('blob')
  return blob
}

export async function makePayrollPDF(r) {
  function words(n) {
    const O = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
    const T = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
    if (!n) return 'Zero Dollars Only'
    const iv = Math.floor(n), cv = Math.round((n - iv) * 100)
    let w = ''
    if (iv >= 1000) w += O[Math.floor(iv / 1000)] + ' Thousand '
    const h = Math.floor((iv % 1000) / 100); if (h) w += O[h] + ' Hundred '
    const rr = iv % 100
    if (rr >= 20) w += T[Math.floor(rr / 10)] + ' ' + (O[rr % 10] || ''); else if (rr) w += O[rr]
    w = w.trim() + ' Dollars'
    if (cv > 0) { const cc = cv > 19 ? T[Math.floor(cv / 10)] + ' ' + (O[cv % 10] || '') : O[cv]; w += ' and ' + cc.trim() + ' Cents' }
    return w.trim() + ' Only'
  }

  const earn = +r.earn, ded = +r.ded, net = +r.net
  const ml = prFmtMonth(r.month || '')
  const doc = new jsPDF({ format: 'a4', unit: 'mm' })
  doc.setFillColor(250, 247, 240); doc.rect(0, 0, 210, 297, 'F')

  const [prHdr, prFtr, prQr] = await Promise.all([
    loadImg(BASE + 'header.png'), loadImg(BASE + 'footer.png'), loadImg(BASE + 'QRCode.jpeg'),
  ])

  const hH = 35
  if (prHdr) doc.addImage(prHdr.d, prHdr.ext, 0, 0, 210, hH, '', 'NONE')
  else {
    doc.setFillColor(26, 26, 46); doc.rect(0, 0, 210, 36, 'F')
    doc.setFillColor(201, 168, 76); doc.rect(0, 36, 210, 2, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(255, 255, 255)
    doc.text('CHARAN LOGISTICS PTE LTD', 105, 13, { align: 'center' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(200, 190, 160)
    doc.text('101 Kitchener Road #03-14, Singapore 208511  |  HP: 91858511  |  charanlogistics@gmail.com', 105, 20, { align: 'center' })
    doc.text('Reg No: 202502540D', 105, 27, { align: 'center' })
  }

  if (prFtr) doc.addImage(prFtr.d, prFtr.ext, 0, 297 - 22, 210, 22, '', 'NONE')
  else {
    doc.setFillColor(19, 48, 94); doc.rect(0, 297 - 22, 210, 22, 'F')
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(180, 200, 240)
    doc.text('CHARAN LOGISTICS PTE LTD  ·  101 Kitchener Road #03-14, Singapore 208511  ·  Reg No: 202502540D', 105, 297 - 11, { align: 'center' })
  }

  // Title
  const cY = hH + 8
  doc.setFillColor(11, 29, 58); doc.rect(8, cY, 194, 10, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(201, 168, 76)
  doc.text('PAYSLIP — ' + ml.toUpperCase(), 105, cY + 7, { align: 'center' })

  // Employee details
  let y = cY + 17
  const infoRows = [
    ['Employee Name', r.name || '—'],   ['NRIC / FIN', r.nric || '—'],
    ['Designation',   r.desig || '—'],  ['Reference No.', r.ref || '—'],
    ['Salary Month',  ml],              ['Payment Date', r.paydate ? new Date(r.paydate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'],
  ]
  doc.setFontSize(9)
  infoRows.forEach(([lbl, val], i) => {
    const col = i % 2; const row = Math.floor(i / 2)
    const x = col === 0 ? 8 : 110; const ry = y + row * 8
    doc.setFont('helvetica', 'bold'); doc.setTextColor(74, 103, 65)
    doc.text(lbl + ' :', x, ry)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(11, 29, 58)
    doc.text(String(val), x + 38, ry)
  })

  y += Math.ceil(infoRows.length / 2) * 8 + 6
  doc.setDrawColor(212, 201, 168); doc.setLineWidth(0.5); doc.line(8, y, 202, y); y += 6

  // Earnings / Deductions table
  const tRows = [
    ['Basic Pay',          prMf(r.basic || 0), 'CPF Deduction',   prMf(r.cpf || 0)],
    ['Overtime Pay',       prMf(r.ot || 0),    'SDL',              prMf(r.sdl || 0)],
    ['Commission',         prMf(r.comm || 0),  'Other Deductions', prMf(r.od || 0)],
    ['Allowance',          prMf(r.allow || 0), '', ''],
    ['Other Earnings',     prMf(r.oe || 0),    '', ''],
    ['Total Earnings',     prMf(earn),          'Total Deductions', prMf(ded)],
  ]

  autoTable(doc, {
    startY: y,
    margin: { left: 8, right: 8 },
    head: [['Earnings', 'Amount', 'Deductions', 'Amount']],
    body: tRows,
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [11, 29, 58], textColor: [201, 168, 76], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 42, halign: 'right' }, 2: { cellWidth: 55 }, 3: { cellWidth: 42, halign: 'right' } },
    didParseCell: (d) => {
      if (d.row.index === tRows.length - 1) {
        d.cell.styles.fontStyle = 'bold'
        d.cell.styles.fillColor = [240, 245, 250]
      }
    },
  })

  const netY = doc.lastAutoTable.finalY + 8
  doc.setFillColor(11, 29, 58); doc.rect(8, netY, 194, 14, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(201, 168, 76)
  doc.text('NET PAY', 16, netY + 9)
  doc.setFontSize(14)
  doc.text(prMf(net), 202, netY + 9, { align: 'right' })

  const wordsY = netY + 21
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(100, 90, 70)
  doc.text(words(net), 105, wordsY, { align: 'center' })

  return doc.output('blob')
}

// ─── DROP-IN REPLACEMENT for makeQuotationPDF in your existing pdfGen.js ───
// Replace ONLY the makeQuotationPDF export at the bottom of pdfGen.js with this.
// All imports, loadImages, drawHeaderFooterSync, makeInvoicePDF, makePayrollPDF stay unchanged.

// ─── DROP-IN REPLACEMENT for makeQuotationPDF in your existing pdfGen.js ───
// Replace ONLY the makeQuotationPDF export at the bottom of pdfGen.js with this.
// All imports, loadImages, drawHeaderFooterSync, makeInvoicePDF, makePayrollPDF stay unchanged.

// ─── DROP-IN REPLACEMENT for makeQuotationPDF in your existing pdfGen.js ───
// Replace ONLY the makeQuotationPDF export at the bottom of pdfGen.js with this.
// All imports, loadImages, drawHeaderFooterSync, makeInvoicePDF, makePayrollPDF stay unchanged.

// ─── DROP-IN REPLACEMENT for makeQuotationPDF in your existing pdfGen.js ───
// Replace ONLY the makeQuotationPDF export at the bottom of pdfGen.js with this.
// All imports, loadImages, drawHeaderFooterSync, makeInvoicePDF, makePayrollPDF stay unchanged.

// ─── DROP-IN REPLACEMENT for makeQuotationPDF in your existing pdfGen.js ───
// Replace ONLY the makeQuotationPDF export at the bottom of pdfGen.js with this.
// All imports, loadImages, drawHeaderFooterSync, makeInvoicePDF, makePayrollPDF stay unchanged.

export async function makeQuotationPDF(qdata) {
  const {
    qNum, qDate,
    qClient, qTitle = '', qCompany = '', qAddr, qPhone = '', qEmail = '',
    qNotes, items,
  } = qdata

  const cur = 'S$'
  const doc = new jsPDF({ format: 'a4', unit: 'mm' })
  const W = 210, M = 8, HEADER_H = 35, FOOTER_H = 22
  const CONTENT_TOP = HEADER_H + 4

  // ── Reuse your existing image loader ──────────────────────────────────────
  const imgs = await loadImages()
  const { hdr, ftr } = imgs

  function drawQtHdrFtr() {
    if (hdr) doc.addImage(hdr.d, hdr.ext, 0, 0, W, HEADER_H, '', 'NONE')
    else {
      doc.setFillColor(11, 29, 58); doc.rect(0, 0, W, HEADER_H, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(255, 255, 255)
      doc.text('CHARAN LOGISTICS PTE LTD', 105, 20, { align: 'center' })
    }
    if (ftr) doc.addImage(ftr.d, ftr.ext, 0, 297 - FOOTER_H, W, FOOTER_H, '', 'NONE')
    else {
      doc.setFillColor(19, 48, 94); doc.rect(0, 297 - FOOTER_H, W, FOOTER_H, 'F')
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(180, 200, 240)
      doc.text('CHARAN LOGISTICS PTE LTD  ·  101 Kitchener Road  ·  Singapore 208511', 105, 297 - 11, { align: 'center' })
    }
  }

  drawQtHdrFtr()

  // ── QUOTATION title bar ───────────────────────────────────────────────────
  let y = CONTENT_TOP + 2
  doc.setFillColor(11, 29, 58); doc.rect(M, y, W - M * 2, 10, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(201, 168, 76)
  doc.text('QUOTATION', 105, y + 7, { align: 'center' })
  y += 14

  // ── Meta row: Quotation No / Date / Valid Until ───────────────────────────
  const validUntil = (() => {
    const d = new Date(qDate); d.setDate(d.getDate() + 30)
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  })()
  const fmtDate = (ds) => new Date(ds).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  doc.setFontSize(8.5); doc.setTextColor(11, 29, 58)
  const metaLeft = [
    ['Quotation No.', qNum || '—'],
    ['Date',          fmtDate(qDate)],
    ['Valid Until',   validUntil],
  ]
  const metaRight = [
    ['Currency',    'S$ (Singapore Dollar)'],
    ['Prepared By', 'Venkat Kumar | +65 91858511'],
  ]

  metaLeft.forEach(([lbl, val], i) => {
    const ry = y + i * 5.5
    doc.setFont('helvetica', 'bold'); doc.setTextColor(70, 95, 130); doc.text(lbl + ' :', M, ry)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(11, 29, 58); doc.text(val, M + 34, ry)
  })
  metaRight.forEach(([lbl, val], i) => {
    const ry = y + i * 5.5
    doc.setFont('helvetica', 'bold'); doc.setTextColor(70, 95, 130); doc.text(lbl + ' :', 115, ry)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(11, 29, 58); doc.text(val, 115 + 26, ry)
  })

  y += metaLeft.length * 5.5 + 5
  doc.setDrawColor(210, 225, 245); doc.setLineWidth(0.4); doc.line(M, y, W - M, y)
  y += 5

  // ── PARTIES: FROM (left) | BILL TO (right) ───────────────────────────────
  const colW  = (W - M * 2 - 6) / 2
  const colRX = M + colW + 6

  // FROM header
  doc.setFillColor(11, 29, 58); doc.rect(M, y, colW, 7, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255)
  doc.text('FROM – SERVICE PROVIDER', M + 3, y + 4.8)

  // BILL TO header
  doc.setFillColor(23, 162, 184); doc.rect(colRX, y, colW, 7, 'F')
  doc.text('BILL TO – CLIENT', colRX + 3, y + 4.8)
  y += 7

  // FROM body
  const fromRows = [
    ['',        'Charan Logistics Pte Ltd', true],  // company name bold
    ['Reg No.', '202502540D'],
    ['Address', '101 Kitchener Road\n#03-14 Jalan Besar Plaza\nSingapore 208511'],
    ['Phone',   '+65 91858511'],
    ['Email',   'venkat@charanlogistics.com'],
    ['Web',     'www.charanlogistics.com'],
  ]

  // BILL TO body — only show rows with values
  const toRows = [
    ['',         qClient || '—', true],
    ...(qTitle   ? [['Title',   qTitle]]   : []),
    ...(qCompany ? [['Company', qCompany]] : []),
    ['Address',  qAddr || '—'],
    ...(qPhone   ? [['Phone',   qPhone]]   : []),
    ...(qEmail   ? [['Email',   qEmail]]   : []),
  ]

  // Split address into multiple rows so each line aligns correctly
  const expandRows = (rows) => {
    const out = []
    rows.forEach(([lbl, val, bold]) => {
      if (lbl === 'Address') {
        const addrLines = (val || '').split(/\n|,/).map(s => s.trim()).filter(Boolean)
        addrLines.forEach((line, i) => out.push([i === 0 ? 'Address' : '', line, false]))
      } else {
        out.push([lbl, val, bold])
      }
    })
    return out
  }

  const fromRowsExp = expandRows(fromRows)
  const toRowsExp   = expandRows(toRows)

  const ROW_H  = 6.5   // taller rows for readability
  const maxRows = Math.max(fromRowsExp.length, toRowsExp.length)
  const bodyH   = maxRows * ROW_H + 6

  doc.setFillColor(245, 249, 255); doc.rect(M,     y, colW, bodyH, 'F')
  doc.setFillColor(245, 249, 255); doc.rect(colRX, y, colW, bodyH, 'F')

  const LBL_X  = 3   // padding from box edge
  const VAL_X  = 22  // fixed value column offset — keeps all values aligned

  const drawPartyRows = (rows, startX) => {
    rows.forEach(([lbl, val, bold], i) => {
      const ry = y + 5 + i * ROW_H
      if (lbl) {
        // Label
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(100, 120, 160)
        doc.text(lbl, startX + LBL_X, ry)
        // Value — always at fixed VAL_X regardless of label length
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(11, 29, 58)
        doc.text(val, startX + VAL_X, ry)
      } else if (bold) {
        // Client / company name — full width bold, no indent
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9.5); doc.setTextColor(11, 29, 58)
        doc.text(val, startX + LBL_X, ry)
      } else {
        // Address continuation — indent to VAL_X to align with first address line
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5); doc.setTextColor(11, 29, 58)
        doc.text(val, startX + VAL_X, ry)
      }
    })
  }

  drawPartyRows(fromRowsExp, M)
  drawPartyRows(toRowsExp,   colRX)

  doc.setDrawColor(210, 225, 245); doc.setLineWidth(0.2)
  doc.rect(M,     y, colW, bodyH, 'S')
  doc.rect(colRX, y, colW, bodyH, 'S')

  y += bodyH + 6

  // ── SCOPE OF SERVICES TABLE ───────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(23, 162, 184)
  doc.text('SCOPE OF SERVICES & PRICING', M, y)
  doc.setDrawColor(210, 225, 245); doc.line(M, y + 1.5, W - M, y + 1.5)
  y += 5

  const validItems = (items || []).filter(it => it.desc?.trim())
  const tRows = validItems.map(it => [
    it.desc || '',
    it.rateType || '/Trip',
    '1',
    cur + ' ' + fmt(it.price || 0),
    cur + ' ' + fmt(it.price || 0),
  ])

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, top: CONTENT_TOP, bottom: FOOTER_H + 8 },
    rowPageBreak: 'avoid',
    head: [[
      { content: 'DESCRIPTION & SCOPE',  styles: { halign: 'left'   } },
      { content: 'RATE TYPE',             styles: { halign: 'center' } },
      { content: 'QTY',                   styles: { halign: 'center' } },
      { content: 'UNIT PRICE (S$)',        styles: { halign: 'right'  } },
      { content: 'TOTAL (S$)',             styles: { halign: 'right'  } },
    ]],
    body: tRows,
    headStyles: {
      fillColor:  [11, 29, 58],
      textColor:  [175, 205, 240],
      fontSize:   8,
      fontStyle:  'bold',
      cellPadding: 3,
    },
    bodyStyles:  { fontSize: 8.5, textColor: [25, 45, 80], cellPadding: 3 },
    alternateRowStyles: { fillColor: [245, 249, 255] },
columnStyles: {
  0: { cellWidth: 'auto', halign: 'left',   fontStyle: 'bold' },
  1: { cellWidth: 22,     halign: 'center' },
  2: { cellWidth: 12,     halign: 'center' },
  3: { cellWidth: 28,     halign: 'right'  },
  4: { cellWidth: 28,     halign: 'right',  fontStyle: 'bold' },
},
    styles: { lineColor: [220, 232, 248], lineWidth: 0.25 },
    didDrawPage: () => { drawQtHdrFtr() },
  })

  y = doc.lastAutoTable.finalY + 4

  // ── TOTALS ────────────────────────────────────────────────────────────────
  const subtotal = validItems.reduce((s, it) => s + (it.price || 0), 0)
  const totW = 80, totX = W - M - totW

  const totRows = [
    ['Subtotal',                  cur + ' ' + fmt(subtotal), false],
    ['GRAND TOTAL',               cur + ' ' + fmt(subtotal), true ],
  ]

  let ty = y
  totRows.forEach(([lbl, val, bold], i) => {
    if (bold) {
      doc.setFillColor(11, 29, 58); doc.rect(totX, ty, totW, 7, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255)
    } else {
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(8.5); doc.setTextColor(11, 29, 58)
    }
    doc.text(lbl, totX + 4, ty + 5)
    doc.text(val, totX + totW - 4, ty + 5, { align: 'right' })
    if (i < totRows.length - 1) {
      doc.setDrawColor(210, 225, 245); doc.setLineWidth(0.2); doc.line(totX, ty + 7, totX + totW, ty + 7)
    }
    ty += 7
  })

  y = ty + 6

  // ── NOTES ─────────────────────────────────────────────────────────────────
  if (qNotes?.trim()) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(23, 162, 184)
    doc.text('NOTES / WORKING HOURS', M, y)
    doc.setDrawColor(210, 225, 245); doc.line(M, y + 1.5, W - M, y + 1.5)
    y += 5
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(60, 60, 60)
    const nlines = doc.splitTextToSize(qNotes, W - M * 2)
    doc.text(nlines, M, y)
    y += nlines.length * 4.5 + 5
  }

  // ── TERMS & CONDITIONS ────────────────────────────────────────────────────
  const TERMS = [
    'This quotation is valid for 30 days from the date of issue.',
    'Payment Terms: 50% advance upon acceptance of quotation; remaining 50% upon commencement of service.',
    'Working Hours: Monday to Saturday, 8 AM – 6 PM. Overtime or Sunday deployment subject to additional charges.',
    'All prices are in Singapore Dollars (S$). Charan Logistics Pte Ltd is not GST registered.',
    'Fuel surcharge, ERP, and parking costs are included unless otherwise stated.',
    'Additional stops beyond the agreed scope will be charged at prevailing rates.',
    'Charan Logistics Pte Ltd reserves the right to substitute vehicles of equivalent capacity if required.',
    'Cancellation policy: 48 hours\' notice required; cancellations within 24 hours may attract a cancellation fee.',
    'This quotation supersedes all previous verbal or written communications on the same subject.',
  ]

  const SAFE_BOTTOM = 297 - FOOTER_H - 10

  const ensureSpace = (needed) => {
    if (y + needed > SAFE_BOTTOM) {
      doc.addPage(); drawQtHdrFtr(); y = CONTENT_TOP + 4
    }
  }

  ensureSpace(10)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(23, 162, 184)
  doc.text('TERMS & CONDITIONS', M, y)
  doc.setDrawColor(210, 225, 245); doc.line(M, y + 1.5, W - M, y + 1.5)
  y += 5

  TERMS.forEach((term, i) => {
    const wrapped = doc.splitTextToSize(term, W - M * 2 - 10)
    const rowH    = wrapped.length * 4 + 3
    ensureSpace(rowH)
    if (i % 2 === 0) {
      doc.setFillColor(245, 249, 255); doc.rect(M, y - 2, W - M * 2, rowH, 'F')
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(23, 162, 184)
    doc.text(String(i + 1), M + 2, y + 2)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40)
    doc.text(wrapped, M + 8, y + 2)
    y += rowH + 1
  })

  y += 4

  // ── ACCEPTANCE ────────────────────────────────────────────────────────────
  ensureSpace(40)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(23, 162, 184)
  doc.text('ACCEPTANCE', M, y)
  doc.setDrawColor(210, 225, 245); doc.line(M, y + 1.5, W - M, y + 1.5)
  y += 5

  doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(100, 100, 100)
  const acceptTxt = 'By signing below, the client confirms acceptance of this quotation, agrees to the terms and conditions stated herein, and authorises Charan Logistics Pte Ltd to proceed with the agreed services.'
  doc.text(doc.splitTextToSize(acceptTxt, W - M * 2), M, y)
  y += 10

  const sigW = (W - M * 2 - 8) / 2
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(11, 29, 58)
  doc.text('For Charan Logistics Pte Ltd', M, y)
  doc.text('Client Authorisation', M + sigW + 8, y)
  y += 12

  doc.setDrawColor(60, 60, 60); doc.setLineWidth(0.3)
  doc.line(M, y, M + sigW, y)
  doc.line(M + sigW + 8, y, M + sigW * 2 + 8, y)
  y += 4

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 120, 120)
  doc.text('Authorised Signatory | Date: ___________', M, y)
  doc.text('Name: _______________ | Date: ___________', M + sigW + 8, y)
  y += 5
  doc.text('Stamp (if applicable):', M, y)
  doc.text('Designation: ___________________________', M + sigW + 8, y)

  return doc.output('blob')
}

