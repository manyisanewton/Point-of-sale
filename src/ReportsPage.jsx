import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  FileText,
  Eye,
  EyeOff,
  Download,
  Printer,
  RotateCcw,
  Users,
} from 'lucide-react';
import './ReportsPage.css';
import { useAmountVisibility } from './hooks/useAmountVisibility.js';

function toLocalISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: toLocalISODate(from), to: toLocalISODate(to) };
}

function itemQty(it) {
  return Number(it.kg ?? it.quantity ?? 1) || 1;
}

function normalizeTransactions(requests) {
  return (requests || []).map((req, idx) => {
    const rawItems = Array.isArray(req.items) && req.items.length
      ? req.items
      : [{
          service: req.service || 'Service',
          kg: req.quantity ?? 1,
          unitPrice: req.estimatedTotal ?? req.totalAmount ?? 0,
          subtotal: req.estimatedTotal ?? req.totalAmount ?? 0,
        }];
    const services = rawItems.map((it) => ({
      service: it.service || it.name || 'Service',
      qty: itemQty(it),
      color: String(it.color || '').trim(),
    }));
    const itemsSum = rawItems.reduce(
      (s, it) => s + (Number(it.subtotal ?? (Number(it.unitPrice ?? 0) * itemQty(it))) || 0),
      0
    );
    const amount = Number(req.estimatedTotal ?? req.totalAmount ?? itemsSum) || itemsSum;
    const date = req.createdAt || new Date().toISOString();
    return {
      id: req.id ?? req.clientId ?? `row-${idx}`,
      day: String(date).slice(0, 10),
      customer: (req.name || req.customerName || 'Walk-in').trim() || 'Walk-in',
      contact: req.phone || '—',
      servedBy: req.servedBy || '—',
      services,
      status: String(req.paymentStatus || 'pending').toLowerCase() === 'paid' ? 'paid' : 'pending',
      amount,
    };
  }).sort((a, b) => String(b.day).localeCompare(String(a.day)));
}

function StatusPill({ status }) {
  return status === 'paid'
    ? <span className="rpt-pill paid">Paid</span>
    : <span className="rpt-pill pending">Pending</span>;
}

function formatStatementDate(date) {
  return new Intl.DateTimeFormat('en-KE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(date);
}

export default function ReportsPage() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const defaults = useMemo(defaultRange, []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [dateWarning, setDateWarning] = useState('');
  const [businessInfo, setBusinessInfo] = useState(null);
  const [printedAt] = useState(() => new Date());
  const { amountsHidden, showAmounts, hideAmounts } = useAmountVisibility();
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [reportPin, setReportPin] = useState('');
  const [reportPinVisible, setReportPinVisible] = useState(false);
  const [pinError, setPinError] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadLocalFallback() {
      try {
        const { getAllOrders } = await import('./lib/db.js');
        const local = await getAllOrders();
        if (!cancelled) {
          setTransactions(normalizeTransactions(local.map((o) => ({
            id: o.id, name: o.customerName, phone: o.phone, servedBy: o.servedBy,
            paymentStatus: o.paymentStatus, items: o.items, service: o.service,
            estimatedTotal: o.totalAmount, quantity: o.quantity, createdAt: o.createdAt,
          }))));
        }
        return true;
      } catch {
        return false;
      }
    }
    async function load() {
      setLoading(true);
      setLoadError('');
      try {
        const res = await fetch('/api/admin/dashboard');
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();
        if (!cancelled) setTransactions(normalizeTransactions(data.requests || []));
      } catch {
        const ok = await loadLocalFallback();
        if (!cancelled && !ok) {
          setLoadError(
            navigator.onLine === false
              ? 'You are offline. Reports need a server connection — reconnect and retry.'
              : 'Cannot reach the server. Check the connection and retry.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    fetch('/api/site-settings')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data?.businessInfo) setBusinessInfo(data.businessInfo); })
      .catch(() => {});
  }, []);

  // Keep range valid: start after end swaps automatically with a notice.
  function changeFrom(value) {
    setDateWarning('');
    if (value && to && value > to) {
      setFrom(to);
      setTo(value);
      setDateWarning('Start date was after end date — swapped automatically.');
    } else {
      setFrom(value);
    }
  }
  function changeTo(value) {
    setDateWarning('');
    if (from && value && from > value) {
      setFrom(value);
      setTo(from);
      setDateWarning('End date was before start date — swapped automatically.');
    } else {
      setTo(value);
    }
  }
  function setToday() {
    const today = toLocalISODate(new Date());
    setFrom(today);
    setTo(today);
    setDateWarning('');
  }
  function clearRange() {
    setFrom(defaults.from);
    setTo(defaults.to);
    setDateWarning('');
  }

  const filtered = useMemo(() => transactions.filter((t) => {
    if (from && t.day < from) return false;
    if (to && t.day > to) return false;
    return true;
  }), [transactions, from, to]);

  const totalCustomers = useMemo(() => new Set(filtered.map((t) => t.customer)).size, [filtered]);
  const totalServices = useMemo(
    () => filtered.reduce((s, t) => s + t.services.reduce((x, sv) => x + sv.qty, 0), 0),
    [filtered]
  );
  const amountMade = useMemo(
    () => filtered.filter((t) => t.status === 'paid').reduce((s, t) => s + t.amount, 0),
    [filtered]
  );
  const displayAmount = (amount) => amountsHidden ? '••••••' : `KSh ${amount.toLocaleString()}`;

  function handleAmountVisibilityClick() {
    if (!amountsHidden) {
      hideAmounts();
      return;
    }
    setReportPin('');
    setReportPinVisible(false);
    setPinError('');
    setPinPromptOpen(true);
  }

  async function verifyReportPin(event) {
    event.preventDefault();
    if (!reportPin) {
      setPinError('Enter your PIN to show the amount.');
      return;
    }
    setVerifyingPin(true);
    setPinError('');
    try {
      const response = await fetch('/api/admin/verify-amount-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: reportPin }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not verify the PIN.');
      showAmounts();
      setPinPromptOpen(false);
      setReportPin('');
    } catch (error) {
      setPinError(error.message || 'Could not verify the PIN.');
    } finally {
      setVerifyingPin(false);
    }
  }

  const rangeLabel = from && to ? `${from} to ${to}` : 'all dates';

  async function downloadStatement() {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const columns = [
      { title: 'Date', x: 12, width: 25 },
      { title: 'Customer', x: 39, width: 43 },
      { title: 'Services', x: 84, width: 87 },
      { title: 'Contact', x: 173, width: 32 },
      { title: 'Served by', x: 207, width: 34 },
      { title: 'Status', x: 243, width: 22 },
      { title: 'Amount', x: 267, width: 18 },
    ];
    const pdfText = (value) => String(value ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, ' ');
    let y = 0;

    // Add the same compact business letterhead used by the printable statement.
    try {
      const logoResponse = await fetch('/assets/logo.jpg');
      if (logoResponse.ok) {
        const logoBlob = await logoResponse.blob();
        const logoData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(logoBlob);
        });
        doc.addImage(logoData, 'JPEG', margin, 9, 10, 10);
      }
    } catch {
      // A missing logo should not prevent the report from downloading.
    }

    doc.setTextColor(18, 58, 109);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(pdfText(businessInfo?.name || 'Open Doors Laundromat'), 28, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(80, 95, 112);
    doc.text(pdfText(businessInfo?.address || 'Chuna Mall, Ground Floor, Shop 10, Kitengela'), 28, 18);
    doc.text(pdfText([businessInfo?.phone || '011 944 4972', businessInfo?.email || 'opendoorslaundromat@gmail.com'].join(' | ')), 28, 22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(18, 58, 109);
    doc.text('BUSINESS STATEMENT', pageWidth - margin, 14, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(40, 55, 72);
    doc.text(`Printed ${pdfText(formatStatementDate(printedAt))}`, pageWidth - margin, 20, { align: 'right' });
    doc.setDrawColor(18, 58, 109);
    doc.setLineWidth(0.7);
    doc.line(margin, 27, pageWidth - margin, 27);

    // Center the official laundromat stamp on every statement page.
    function drawStamp(stampY, watermark = false) {
      const stampWidth = 38;
      const stampHeight = 19;
      const stampX = (pageWidth - stampWidth) / 2;
      const stampColor = watermark ? [34, 96, 168] : [23, 79, 145];
      doc.setLineWidth(watermark ? 0.8 : 0.8);
      doc.setDrawColor(...stampColor);
      doc.roundedRect(stampX, stampY, stampWidth, stampHeight, 1, 1, 'S');
      doc.setTextColor(...stampColor);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.text('OPEN DOORS', pageWidth / 2, stampY + 4, { align: 'center' });
      doc.setFontSize(7.5);
      doc.text('LAUNDROMAT', pageWidth / 2, stampY + 8, { align: 'center' });
      doc.setFontSize(5.3);
      doc.text('OFFICIAL COPY', pageWidth / 2, stampY + 12, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5);
      doc.text(pdfText(printedAt.toLocaleDateString('en-KE')), pageWidth / 2, stampY + 16, { align: 'center' });
    }
    drawStamp((pageHeight - 19) / 2, true);

    doc.setFontSize(6.5);
    doc.setTextColor(40, 55, 72);
    doc.text(`Statement period: ${pdfText(rangeLabel)}`, margin, 57);

    // Compact summary cards keep the exported statement close to the screen layout.
    const summaryY = 61;
    const summaryGap = 4;
    const summaryWidth = (pageWidth - margin * 2 - summaryGap * 2) / 3;
    const summaries = [
      { label: 'Total Customers', value: String(totalCustomers), color: [47, 128, 237], icon: 'U' },
      { label: 'Total Services', value: String(totalServices), color: [34, 197, 94], icon: 'S' },
      { label: 'Amount Made', value: amountsHidden ? '------' : `KSh ${amountMade.toLocaleString()}`, color: [139, 92, 246], icon: 'KSh' },
    ];
    summaries.forEach((summary, index) => {
      const x = margin + index * (summaryWidth + summaryGap);
      doc.setDrawColor(205, 219, 234);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, summaryY, summaryWidth, 15, 2, 2, 'FD');
      doc.setFillColor(...summary.color);
      doc.roundedRect(x + 2, summaryY + 2.5, 10, 10, 1.5, 1.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(summary.icon === 'KSh' ? 5.5 : 7);
      doc.text(summary.icon, x + 7, summaryY + 8.8, { align: 'center' });
      doc.setTextColor(47, 111, 225);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.text(summary.label, x + 15, summaryY + 5.5);
      doc.setTextColor(20, 38, 59);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(pdfText(summary.value), x + 15, summaryY + 11.5);
    });

    doc.setTextColor(18, 58, 109);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Transactions', margin, 82);

    function drawTableHeading(firstPage = false) {
      if (firstPage) y = 86;
      else {
        y = 16;
        doc.setTextColor(18, 58, 109);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Open Doors Laundromat - Business Statement (continued)', margin, y);
        doc.setDrawColor(18, 58, 109);
        doc.setLineWidth(0.5);
        doc.line(margin, 19, pageWidth - margin, 19);
        drawStamp((pageHeight - 19) / 2, true);
        y = 47;
      }
      doc.setFillColor(234, 240, 246);
      doc.rect(margin, y, pageWidth - margin * 2, 6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.3);
      doc.setTextColor(20, 38, 59);
      columns.forEach((column) => doc.text(column.title, column.x, y + 4));
      y += 8;
    }

    drawTableHeading(true);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    filtered.forEach((transaction, transactionIndex) => {
      const serviceLines = transaction.services.flatMap((service) =>
        doc.splitTextToSize(pdfText(`- ${service.service} x${service.qty}${service.color ? ` - ${service.color}` : ''}`), columns[2].width - 2)
      );
      const customerLines = doc.splitTextToSize(pdfText(transaction.customer), columns[1].width - 2);
      const servedByLines = doc.splitTextToSize(pdfText(transaction.servedBy), columns[4].width - 2);
      const lineHeight = 3.7;
      const rowHeight = Math.max(9, Math.max(serviceLines.length, customerLines.length, servedByLines.length) * lineHeight + 4);
      if (y + rowHeight > pageHeight - 18) {
        doc.addPage();
        drawTableHeading();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
      }
      const rowTop = y;
      if (transactionIndex % 2 === 1) {
        doc.setFillColor(248, 251, 254);
        doc.rect(margin, rowTop, pageWidth - margin * 2, rowHeight, 'F');
      }
      const baseline = rowTop + 4.5;
      const singleLineValues = [
        pdfText(transaction.day), null, null,
        pdfText(transaction.contact), null,
        transaction.status === 'paid' ? 'Paid' : 'Pending',
        `KSh ${transaction.amount.toLocaleString()}`,
      ];
      singleLineValues.forEach((value, index) => {
        if (value !== null) doc.text(value, columns[index].x, baseline);
      });
      [customerLines, serviceLines, servedByLines].forEach((lines, groupIndex) => {
        const columnIndex = [1, 2, 4][groupIndex];
        lines.forEach((line, lineIndex) => {
          doc.text(line, columns[columnIndex].x, baseline + lineIndex * lineHeight);
        });
      });
      y += rowHeight;
      doc.setDrawColor(220, 229, 238);
      doc.setLineWidth(0.25);
      doc.line(margin, y, pageWidth - margin, y);
    });

    if (y + 12 > pageHeight - 8) {
      doc.addPage();
      drawTableHeading();
    }
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80, 95, 112);
    doc.text(`Showing ${filtered.length} record${filtered.length === 1 ? '' : 's'} | ${pdfText(rangeLabel)}`, margin, y);
    const totalLabel = `Total Amount Made: KSh ${amountMade.toLocaleString()}`;
    const totalWidth = doc.getTextWidth(totalLabel) + 9;
    doc.setFillColor(234, 240, 246);
    doc.roundedRect(pageWidth - margin - totalWidth, y - 5, totalWidth, 8, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(18, 58, 109);
    doc.text(totalLabel, pageWidth - margin - 4, y, { align: 'right' });
    const filename = `open-doors-statement-${from || 'start'}-to-${to || 'end'}.pdf`;
    doc.save(filename);
  }

  if (loading) return <div className="rpt"><div className="rpt-loading" role="status">Loading reports…</div></div>;
  if (loadError && transactions.length === 0) {
    return (
      <div className="rpt">
        <div className="rpt-error" role="alert">
          <b>{loadError}</b>
          <button type="button" className="rpt-btn primary" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rpt">
      <header className="rpt-print-letterhead">
        <img src="/assets/logo.jpg" alt="Open Doors Laundromat logo" />
        <div>
          <h1>{businessInfo?.name || 'Open Doors Laundromat'}</h1>
          <p>{businessInfo?.address || 'Chuna Mall, Ground Floor, Shop 10, Kitengela'}</p>
          <p>{[businessInfo?.phone || '011 944 4972', businessInfo?.email || 'opendoorslaundromat@gmail.com'].join(' · ')}</p>
        </div>
        <div className="rpt-print-meta">
          <b>BUSINESS STATEMENT</b>
          <span>Printed {formatStatementDate(printedAt)}</span>
        </div>
      </header>
      <div className="rpt-print-stamp-row">
        <div className="rpt-print-stamp" aria-label="Statement printed and issued">
          <span className="rpt-stamp-top">OPEN DOORS</span>
          <b>STATEMENT</b>
          <span className="rpt-stamp-bottom">OFFICIAL COPY</span>
          <small>{printedAt.toLocaleDateString('en-KE')}</small>
        </div>
      </div>
      <div className="rpt-print-period">Statement period: <b>{rangeLabel}</b></div>
      {/* Header */}
      <div className="rpt-head">
        <span className="rpt-head-icon"><BarChart3 size={26} /></span>
        <div>
          <h1>Reports</h1>
          <p>View business analytics and download your statement</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rpt-filters">
        <div className="rpt-field">
          <label htmlFor="rpt-from">From Date</label>
          <input id="rpt-from" type="date" value={from} max={to || undefined} onChange={(e) => changeFrom(e.target.value)} />
        </div>
        <div className="rpt-field">
          <label htmlFor="rpt-to">To Date</label>
          <input id="rpt-to" type="date" value={to} min={from || undefined} onChange={(e) => changeTo(e.target.value)} />
        </div>
        <div className="rpt-quick">
          <button type="button" className="rpt-btn primary" onClick={setToday}><Calendar size={15} /> Today</button>
          <button type="button" className="rpt-btn outline" onClick={clearRange}><RotateCcw size={15} /> Clear</button>
        </div>
        <div className="rpt-print">
          <button type="button" className="rpt-btn outline" onClick={downloadStatement}><Download size={16} /> Download PDF</button>
          <button type="button" className="rpt-btn print" onClick={() => window.print()}><Printer size={16} /> Print Statement</button>
        </div>
      </div>
      {dateWarning && <p className="rpt-hint" role="status">{dateWarning}</p>}

      {/* KPI cards */}
      <div className="rpt-kpis">
        <div className="rpt-kpi">
          <span className="rpt-kpi-icon blue"><Users size={26} /></span>
          <div><small>Total Customers</small><b>{totalCustomers}</b></div>
        </div>
        <div className="rpt-kpi">
          <span className="rpt-kpi-icon green"><FileText size={26} /></span>
          <div><small>Total Services</small><b>{totalServices}</b></div>
        </div>
        <div className="rpt-kpi">
          <span className="rpt-kpi-icon purple rpt-currency-icon">KSh</span>
          <div>
            <span className="rpt-amount-heading">
              <small>Amount Made</small>
              <button
                type="button"
                className="rpt-amount-toggle"
                onClick={handleAmountVisibilityClick}
                aria-label={amountsHidden ? 'Show report amounts' : 'Hide report amounts'}
                aria-pressed={amountsHidden}
                title={amountsHidden ? 'Show report amounts' : 'Hide report amounts'}
              >
                {amountsHidden ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </span>
            <b>{displayAmount(amountMade)}</b>
          </div>
        </div>
      </div>

      {/* Transactions */}
      <h2 className="rpt-section-title">Transactions</h2>
      <div className="rpt-table-card">
        <div className="rpt-table-wrap">
          <table className="rpt-table">
            <thead>
              <tr>
                <th>Date</th><th>Customer</th><th>Services</th><th>Contact</th>
                <th>Served By</th><th>Payment Status</th><th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="rpt-empty">No transactions in this date range.</td></tr>
              )}
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td className="rpt-date">{t.day}</td>
                  <td className="rpt-customer">{t.customer}</td>
                  <td>
                    <ul className="rpt-services">
                      {t.services.map((s, i) => (
                        <li key={i}>{s.service} ×{s.qty}{s.color ? ` · ${s.color}` : ''}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="rpt-contact">{t.contact}</td>
                  <td>{t.servedBy}</td>
                  <td><StatusPill status={t.status} /></td>
                  <td className="num">KSh {t.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="rpt-cards">
          {filtered.length === 0 && <div className="rpt-empty">No transactions in this date range.</div>}
          {filtered.map((t) => (
            <section key={t.id} className="rpt-card">
              <header>
                <div><b>{t.customer}</b><span>{t.day}</span></div>
                <StatusPill status={t.status} />
              </header>
              <ul className="rpt-services">
                {t.services.map((s, i) => (
                  <li key={i}>{s.service} ×{s.qty}{s.color ? ` · ${s.color}` : ''}</li>
                ))}
              </ul>
              <footer>
                <span>{t.contact} · {t.servedBy}</span>
                <b>KSh {t.amount.toLocaleString()}</b>
              </footer>
            </section>
          ))}
        </div>

        <div className="rpt-foot">
          <span>Showing {filtered.length} record{filtered.length === 1 ? '' : 's'} from {rangeLabel}</span>
          <span className="rpt-total">Total Amount Made: <b>KSh {amountMade.toLocaleString()}</b></span>
        </div>
      </div>
      {pinPromptOpen && (
        <div className="booking-dialog-backdrop">
          <section className="booking-dialog rpt-pin-dialog" role="dialog" aria-modal="true" aria-labelledby="rpt-pin-title">
            <h2 id="rpt-pin-title">Show report amount</h2>
            <p>Enter your report PIN to reveal Amount Made, Total Collected, and Today’s revenue. If no report PIN is configured, use your admin password.</p>
            <form onSubmit={verifyReportPin}>
              <label className="rpt-pin-field" htmlFor="rpt-amount-pin">Report PIN
                <span className="rpt-pin-input-wrap">
                  <input
                    id="rpt-amount-pin"
                    type={reportPinVisible ? 'text' : 'password'}
                    autoComplete="current-password"
                    autoFocus
                    maxLength={128}
                    value={reportPin}
                    onChange={(event) => setReportPin(event.target.value)}
                    aria-describedby={pinError ? 'rpt-pin-error' : undefined}
                  />
                  <button
                    type="button"
                    className="rpt-pin-visibility-toggle"
                    onClick={() => setReportPinVisible((visible) => !visible)}
                    aria-label={reportPinVisible ? 'Hide PIN' : 'Show PIN'}
                    title={reportPinVisible ? 'Hide PIN' : 'Show PIN'}
                  >
                    {reportPinVisible ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>
              {pinError && <p id="rpt-pin-error" className="rpt-pin-error" role="alert">{pinError}</p>}
              <div className="booking-dialog-actions">
                <button className="booking-dialog-secondary" type="button" onClick={() => setPinPromptOpen(false)} disabled={verifyingPin}>Cancel</button>
                <button className="booking-dialog-primary" type="submit" disabled={verifyingPin}>
                  {verifyingPin ? 'Checking…' : 'Show amounts'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
