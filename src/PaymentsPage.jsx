import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Coins,
  CreditCard,
  Filter,
  RotateCcw,
  User,
  Users,
  Landmark,
  Smartphone,
  Wallet,
  Search,
} from 'lucide-react';
import './PaymentsPage.css';
import { useAmountVisibility } from './hooks/useAmountVisibility.js';

function normalizeMethod(raw) {
  const v = String(raw || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (['mpesa', 'm-pesa', 'mpesa'].includes(v) || v.includes('mpesa') || v.includes('pesa')) return 'M-PESA';
  if (v.includes('bank') || v.includes('transfer')) return 'Bank Transfer';
  if (v.includes('cash')) return 'Cash';
  if (!raw) return 'Cash';
  return String(raw);
}

function lineNote(order) {
  const ref = (order.reference || '').trim();
  const method = normalizeMethod(order.paymentMethod);
  if (method === 'M-PESA' && ref) return `M-PESA Code: ${ref}`;
  if (method === 'Bank Transfer') return ref ? `Bank Ref: ${ref}` : 'Bank transfer';
  if (order.paymentStatus === 'paid') return ref ? ref : 'Cash payment';
  return 'Awaiting payment';
}

function normalizeRequests(requests) {
  const lines = [];
  for (const req of requests || []) {
    const customer = (req.name || req.customerName || 'Walk-in').trim() || 'Walk-in';
    const orderDate = req.createdAt || new Date().toISOString();
    const paymentStatus = String(req.paymentStatus || 'pending').toLowerCase() === 'paid' ? 'paid' : 'pending';
    const paymentMethod = normalizeMethod(req.paymentMethod || 'Cash');
    const reference = req.paymentReference || req.mpesaCode || req.mpesaPhone || '';
    const rawItems = Array.isArray(req.items) && req.items.length
      ? req.items
      : [{
          service: req.service || 'Service',
          unitPrice: req.estimatedTotal ?? req.totalAmount ?? 0,
          kg: req.quantity ?? 1,
          originalSubtotal: req.estimatedTotal ?? req.totalAmount ?? 0,
          discountAmount: 0,
          subtotal: req.estimatedTotal ?? req.totalAmount ?? 0,
        }];
    rawItems.forEach((it, idx) => {
      const qty = Number(it.kg ?? it.quantity ?? 1) || 1;
      const unitPrice = Number(it.unitPrice ?? it.price ?? 0) || 0;
      const price = Number(it.originalSubtotal ?? unitPrice * qty) || unitPrice * qty;
      const discount = Number(it.discountAmount ?? 0) || 0;
      const amount = Number(it.subtotal ?? (price - discount)) || 0;
      lines.push({
        id: `${req.id ?? req.clientId ?? customer}-${idx}`,
        customer,
        phone: req.phone || '',
        service: it.service || it.name || 'Service',
        qty,
        unitPrice,
        discount,
        price,
        amount,
        paymentMethod,
        paymentStatus,
        date: it.createdAt || orderDate,
        notes: it.notes || lineNote({ paymentMethod, paymentStatus, reference }),
        receiptToken: req.receiptToken || null,
      });
    });
  }
  return lines;
}

function toLocalISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toLocalISODate(start), end: toLocalISODate(end) };
}

function formatToday() {
  const now = new Date();
  const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date}  ${time}`;
}

function customerGroupKey(customer) {
  const normalizedName = String(customer.customer || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  if (normalizedName) return `name:${normalizedName}`;
  const digits = String(customer.phone || '').replace(/\D/g, '');
  if (digits.length >= 9) {
    const normalizedPhone = digits.startsWith('0') && digits.length === 10 ? `254${digits.slice(1)}` : digits;
    return `phone:${normalizedPhone}`;
  }
  return 'name:unknown';
}

function MethodBadge({ method }) {
  const m = normalizeMethod(method);
  if (m === 'M-PESA') return <span className="payrep-method"><span className="payrep-micon mpesa"><Smartphone size={12} /></span> M-PESA</span>;
  if (m === 'Bank Transfer') return <span className="payrep-method"><span className="payrep-micon bank"><Landmark size={12} /></span> Bank Transfer</span>;
  return <span className="payrep-method"><span className="payrep-micon cash"><Wallet size={12} /></span> Cash</span>;
}

function PaymentStatusBadge({ status }) {
  const paid = status === 'paid';
  return (
    <span className={`payrep-status ${paid ? 'paid' : 'unpaid'}`}>
      {paid ? 'Paid' : 'Unpaid'}
    </span>
  );
}

export default function PaymentsPage() {
  const { amountsHidden } = useAmountVisibility();
  const navigate = useNavigate();
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [now, setNow] = useState(formatToday());
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [dateWarning, setDateWarning] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerMenuOpen, setCustomerMenuOpen] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false);

  const defaults = useMemo(monthRange, []);
  const [draft, setDraft] = useState({ start: defaults.start, end: defaults.end, customer: 'all', service: 'all', method: 'all', status: 'all' });
  const [applied, setApplied] = useState(draft);

  useEffect(() => {
    const t = setInterval(() => setNow(formatToday()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadLocalFallback() {
      try {
        const { getAllOrders } = await import('./lib/db.js');
        const local = await getAllOrders();
        if (!cancelled) setLines(normalizeRequests(local.map((o) => ({
          id: o.id, name: o.customerName, phone: o.phone,
          paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod,
          paymentReference: o.paymentReference, items: o.items,
          service: o.service, estimatedTotal: o.totalAmount,
          quantity: o.quantity, createdAt: o.createdAt,
          receiptToken: o.receiptToken,
        }))));
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
        if (!cancelled) setLines(normalizeRequests(data.requests || []));
      } catch (err) {
        // Online fetch failed (offline or server down) — fall back to local mirror.
        const ok = await loadLocalFallback();
        if (!cancelled && !ok) setLoadError('Could not load payments. Check your connection and retry.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const customers = useMemo(() => {
    const groups = new Map();
    for (const line of lines) {
      const key = customerGroupKey(line);
      const group = groups.get(key) || { key, label: line.customer, names: new Set(), phone: line.phone || '' };
      group.names.add(line.customer);
      // Prefer a normally capitalized version when source records differ only by letter case.
      if (group.label === group.label.toLowerCase() && line.customer !== line.customer.toLowerCase()) group.label = line.customer;
      if (!group.phone && line.phone) group.phone = line.phone;
      groups.set(key, group);
    }
    return [...groups.values()].map((group) => ({ ...group, names: [...group.names] })).sort((a, b) => a.label.localeCompare(b.label));
  }, [lines]);
  const matchingCustomers = useMemo(() => customers.filter((customer) => customer.names.some((name) => name.toLowerCase().includes(customerSearch.trim().toLowerCase())) || customer.phone.includes(customerSearch.trim())), [customers, customerSearch]);

  function chooseCustomer(value) {
    setDraft((current) => ({ ...current, customer: value }));
    setCustomerSearch(value === 'all' ? '' : customers.find((customer) => customer.key === value)?.label || '');
    setCustomerMenuOpen(false);
  }
  const services = useMemo(() => [...new Set(lines.map((l) => l.service))].sort(), [lines]);
  const matchingServices = useMemo(() => services.filter((service) => service.toLowerCase().includes(serviceSearch.trim().toLowerCase())), [services, serviceSearch]);

  function chooseService(value) {
    setDraft((current) => ({ ...current, service: value }));
    setServiceSearch(value === 'all' ? '' : value);
    setServiceMenuOpen(false);
  }

  const filtered = useMemo(() => lines.filter((l) => {
    if (applied.customer !== 'all' && customerGroupKey(l) !== applied.customer) return false;
    if (applied.service !== 'all' && l.service !== applied.service) return false;
    if (applied.method !== 'all' && normalizeMethod(l.paymentMethod) !== applied.method) return false;
    if (applied.status !== 'all' && l.paymentStatus !== applied.status) return false;
    // A selected customer view intentionally includes their full payment history.
    if (applied.customer === 'all') {
      const day = String(l.date || '').slice(0, 10);
      if (applied.start && day < applied.start) return false;
      if (applied.end && day > applied.end) return false;
    }
    return true;
  }), [lines, applied]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const l of filtered) {
      const key = customerGroupKey(l);
      if (!map.has(key)) map.set(key, { customer: customers.find((item) => item.key === key)?.label || l.customer, rows: [] });
      map.get(key).rows.push(l);
    }
    return [...map.values()]
      .sort((a, b) => a.customer.localeCompare(b.customer))
      .map(({ customer, rows }, i) => ({
        no: i + 1,
        customer,
        rows: rows.sort((a, b) => String(a.date).localeCompare(String(b.date))),
        qty: rows.reduce((s, r) => s + r.qty, 0),
        amount: rows.reduce((s, r) => s + r.amount, 0),
      }));
  }, [filtered, customers]);

  const totalCollected = filtered.filter((l) => l.paymentStatus === 'paid').reduce((s, l) => s + l.amount, 0);
  const totalPending = filtered.filter((l) => l.paymentStatus !== 'paid').reduce((s, l) => s + l.amount, 0);
  const totalQty = filtered.reduce((s, l) => s + l.qty, 0);
  const grandTotal = totalCollected + totalPending;
  const paidPct = grandTotal ? Math.round((totalCollected / grandTotal) * 100) : 0;

  const totalPages = Math.max(1, Math.ceil(groups.length / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const pageGroups = groups.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);
  const from = groups.length === 0 ? 0 : (safePage - 1) * rowsPerPage + 1;
  const to = Math.min(groups.length, safePage * rowsPerPage);

  function applyFilters() {
    let { start, end } = draft;
    setDateWarning('');
    if (start && end && start > end) {
      [start, end] = [end, start];
      setDraft((d) => ({ ...d, start, end }));
      setDateWarning('Start date was after end date — swapped automatically.');
    }
    setPage(1);
    setApplied({ ...draft, start, end });
  }
  function resetFilters() {
    const clean = { start: defaults.start, end: defaults.end, customer: 'all', service: 'all', method: 'all', status: 'all' };
    setDraft(clean); setApplied(clean); setPage(1); setDateWarning('');
  }
  function retryLoad() {
    window.location.reload();
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const activeChips = [];
  if (applied.customer !== 'all') activeChips.push({ key: 'customer', label: customers.find((customer) => customer.key === applied.customer)?.label || applied.customer });
  if (applied.service !== 'all') activeChips.push({ key: 'service', label: applied.service });
  if (applied.method !== 'all') activeChips.push({ key: 'method', label: applied.method });
  if (applied.status !== 'all') activeChips.push({ key: 'status', label: applied.status });
  if (applied.customer === 'all' && (applied.start || applied.end)) activeChips.push({ key: 'dates', label: `${applied.start || '…'} → ${applied.end || '…'}` });
  function clearChip(key) {
    const next = { ...applied, [key]: key === 'dates' ? undefined : 'all' };
    if (key === 'dates') { next.start = ''; next.end = ''; }
    setApplied(next); setDraft(next); setPage(1);
  }

  if (loading) return <div className="payrep"><div className="payrep-loading" role="status">Loading payments…</div></div>;
  if (loadError && lines.length === 0) {
    return (
      <div className="payrep">
        <div className="payrep-error" role="alert">
          <b>{loadError}</b>
          <button type="button" className="payrep-apply" onClick={retryLoad}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="payrep">
      {/* Header */}
      <div className="payrep-top">
        <div className="payrep-title">
          <span className="payrep-title-icon"><ClipboardList size={22} /></span>
          <div>
            <h1>Payment Report</h1>
            <p>View and manage all payments collected and pending.</p>
          </div>
        </div>
        <div className="payrep-meta">
          <span className="payrep-today"><Calendar size={15} /> Today: <b>{now}</b></span>
          <span className="payrep-divider" aria-hidden="true" />
          <span className="payrep-admin">
            <span className="payrep-avatar"><User size={16} /></span> Admin <ChevronDown size={14} />
          </span>
        </div>
      </div>

      {/* Filters */}
      <form className="payrep-filters" onSubmit={(e) => { e.preventDefault(); applyFilters(); }}>
        <div className="payrep-field payrep-dates">
          <label htmlFor="payrep-start">Date Range</label>
          <div className="payrep-date-inputs">
            <input id="payrep-start" type="date" value={draft.start} max={draft.end || undefined} onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))} aria-label="Start date" />
            <span aria-hidden="true">–</span>
            <input id="payrep-end" type="date" value={draft.end} min={draft.start || undefined} onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))} aria-label="End date" />
          </div>
        </div>
        <div className={`payrep-field payrep-customer-field ${customerMenuOpen ? 'open' : ''}`}>
          <label htmlFor="payrep-customer">Customer</label>
          <div className="payrep-customer-picker">
            <Search size={15} aria-hidden="true" />
            <input id="payrep-customer" type="search" role="combobox" aria-autocomplete="list" aria-expanded={customerMenuOpen} aria-controls="payrep-customer-options" autoComplete="off" placeholder="All Customers" value={customerMenuOpen ? customerSearch : draft.customer === 'all' ? '' : customers.find((customer) => customer.key === draft.customer)?.label || ''} onFocus={() => { setCustomerSearch(draft.customer === 'all' ? '' : customers.find((customer) => customer.key === draft.customer)?.label || ''); setCustomerMenuOpen(true); }} onChange={(e) => { setCustomerSearch(e.target.value); setCustomerMenuOpen(true); }} onBlur={() => window.setTimeout(() => setCustomerMenuOpen(false), 120)} />
            {customerMenuOpen && <div className="payrep-customer-options" id="payrep-customer-options" role="listbox"><button type="button" role="option" aria-selected={draft.customer === 'all'} onMouseDown={(e) => e.preventDefault()} onClick={() => chooseCustomer('all')}>All Customers</button>{matchingCustomers.map((customer) => <button type="button" role="option" aria-selected={draft.customer === customer.key} key={customer.key} onMouseDown={(e) => e.preventDefault()} onClick={() => chooseCustomer(customer.key)}>{customer.label}</button>)}{matchingCustomers.length === 0 && <span className="payrep-customer-no-match">No matching customers</span>}</div>}
          </div>
        </div>
        <div className={`payrep-field payrep-service-field ${serviceMenuOpen ? 'open' : ''}`}>
          <label htmlFor="payrep-service">Service</label>
          <div className="payrep-customer-picker">
            <Search size={15} aria-hidden="true" />
            <input id="payrep-service" type="search" role="combobox" aria-autocomplete="list" aria-expanded={serviceMenuOpen} aria-controls="payrep-service-options" autoComplete="off" placeholder="All Services" value={serviceMenuOpen ? serviceSearch : draft.service === 'all' ? '' : draft.service} onFocus={() => { setServiceSearch(draft.service === 'all' ? '' : draft.service); setServiceMenuOpen(true); }} onChange={(e) => { setServiceSearch(e.target.value); setServiceMenuOpen(true); }} onBlur={() => window.setTimeout(() => setServiceMenuOpen(false), 120)} />
            {serviceMenuOpen && <div className="payrep-customer-options" id="payrep-service-options" role="listbox"><button type="button" role="option" aria-selected={draft.service === 'all'} onMouseDown={(e) => e.preventDefault()} onClick={() => chooseService('all')}>All Services</button>{matchingServices.map((service) => <button type="button" role="option" aria-selected={draft.service === service} key={service} onMouseDown={(e) => e.preventDefault()} onClick={() => chooseService(service)}>{service}</button>)}{matchingServices.length === 0 && <span className="payrep-customer-no-match">No matching services</span>}</div>}
          </div>
        </div>
        <div className="payrep-field">
          <label htmlFor="payrep-method">Payment Method</label>
          <select id="payrep-method" value={draft.method} onChange={(e) => setDraft((d) => ({ ...d, method: e.target.value }))}>
            <option value="all">All Methods</option>
            <option value="M-PESA">M-PESA</option>
            <option value="Cash">Cash</option>
            <option value="Bank Transfer">Bank Transfer</option>
          </select>
        </div>
        <div className="payrep-field">
          <label htmlFor="payrep-status">Status</label>
          <select id="payrep-status" value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}>
            <option value="all">All Status</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div className="payrep-actions">
          <button type="submit" className="payrep-apply" disabled={!isDirty}><Filter size={14} /> Apply Filter</button>
          <button type="button" className="payrep-reset" onClick={resetFilters}><RotateCcw size={14} /> Reset</button>
        </div>
      </form>
      {dateWarning && <p className="payrep-hint" role="status">{dateWarning}</p>}
      {applied.customer !== 'all' && <p className="payrep-hint" role="status">Showing all payment records for this customer, across all dates.</p>}
      {activeChips.length > 0 && (
        <div className="payrep-chips" aria-live="polite">
          <span className="payrep-chips-label">Active:</span>
          {activeChips.map((c) => (
            <button key={c.key} type="button" className="payrep-chip" onClick={() => clearChip(c.key)} title={`Clear ${c.key} filter`}>
              {c.label} ✕
            </button>
          ))}
        </div>
      )}

      {/* KPI cards */}
      <div className="payrep-kpis">
        <div className="payrep-kpi">
          <span className="payrep-kpi-icon green"><Coins size={24} /></span>
          <div><small>Total Collected</small><b>{amountsHidden ? '••••••' : `KES ${totalCollected.toLocaleString()}`}</b><span className="payrep-delta"><i>↑</i> 12% <em>vs. last period</em></span></div>
        </div>
        <div className="payrep-kpi">
          <span className="payrep-kpi-icon blue"><Clock size={24} /></span>
          <div><small>Total Pending</small><b>KES {totalPending.toLocaleString()}</b><span className="payrep-delta"><i>↑</i> 5% <em>vs. last period</em></span></div>
        </div>
        <div className="payrep-kpi">
          <span className="payrep-kpi-icon purple"><Users size={24} /></span>
          <div><small>Total Transactions</small><b>{groups.length}</b><span className="payrep-delta"><i>↑</i> 14% <em>vs. last period</em></span></div>
        </div>
        <div className="payrep-kpi">
          <span className="payrep-kpi-icon teal"><CreditCard size={24} /></span>
          <div><small>Total Services</small><b>{totalQty}</b><span className="payrep-delta"><i>↑</i> 0% <em>vs. last period</em></span></div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="payrep-table-wrap">
        <table className="payrep-table">
          <thead>
            <tr>
              <th>No.</th><th>Customer Name</th><th>Service</th><th>Qty</th>
              <th>Unit Price (Ksh.)</th><th>Discount (Ksh.)</th><th>Price (Ksh.)</th>
              <th>Amount (Ksh.)</th><th>Payment Method</th><th>Payment Status</th><th>Date</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {pageGroups.length === 0 && (
              <tr><td colSpan={12} className="payrep-empty">No payments match the selected filters. <button type="button" className="payrep-receipt" onClick={resetFilters}>Clear filters</button></td></tr>
            )}
            {pageGroups.map((g) => (
              <Fragment key={g.customer}>
                {g.rows.map((r, ri) => (
                  <tr key={r.id}>
                    {ri === 0 && (
                      <td rowSpan={g.rows.length} className="payrep-no">{g.no}</td>
                    )}
                    {ri === 0 && (
                      <td rowSpan={g.rows.length} className="payrep-cust">
                        <span className="payrep-cust-pill"><User size={13} /> {g.customer}</span>
                      </td>
                    )}
                    <td>{r.service}</td>
                    <td className="num">{r.qty}</td>
                    <td className="num">{r.unitPrice.toLocaleString()}</td>
                    <td className="num">{r.discount.toLocaleString()}</td>
                    <td className="num">{r.price.toLocaleString()}</td>
                    <td className="num">{r.amount.toLocaleString()}</td>
                    <td><MethodBadge method={r.paymentMethod} /></td>
                    <td><PaymentStatusBadge status={r.paymentStatus} /></td>
                    <td className="payrep-date">{String(r.date).slice(0, 10)}</td>
                    <td className="payrep-notes">{r.notes}{r.receiptToken && (
                      <button type="button" className="payrep-receipt" onClick={() => navigate(`/receipt/${r.receiptToken}`)}>Receipt</button>
                    )}</td>
                  </tr>
                ))}
                <tr className="payrep-subtotal">
                  <td colSpan={2}>{g.customer} Total</td>
                  <td className="num">{g.qty}</td>
                  <td colSpan={4} />
                  <td className="num">{g.amount.toLocaleString()}</td>
                  <td colSpan={4} />
                </tr>
              </Fragment>
            ))}
          </tbody>
          {groups.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2}>Grand Total</td>
                <td className="num">{totalQty}</td>
                <td colSpan={4} />
                <td className="num">{grandTotal.toLocaleString()}</td>
                <td colSpan={2} className="payrep-share">✓ {paidPct}% Paid &nbsp;|&nbsp; {100 - paidPct}% Pending</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Mobile cards */}
      <div className="payrep-cards">
        {pageGroups.length === 0 && <div className="payrep-empty">No payments match the selected filters. <button type="button" className="payrep-receipt" onClick={resetFilters}>Clear filters</button></div>}
        {pageGroups.map((g) => (
          <section key={g.customer} className="payrep-card">
            <header>
              <span className="payrep-cust-pill"><User size={13} /> {g.customer}</span>
              <b>KES {g.amount.toLocaleString()}</b>
            </header>
            {g.rows.map((r) => (
              <div key={r.id} className="payrep-card-row">
                <div className="payrep-card-line">
                  <b>{r.service}</b>
                  <span>{r.qty} × {r.unitPrice.toLocaleString()} − {r.discount.toLocaleString()} = {r.amount.toLocaleString()}</span>
                </div>
                <div className="payrep-card-meta">
                  <MethodBadge method={r.paymentMethod} />
                  <PaymentStatusBadge status={r.paymentStatus} />
                  <span>{String(r.date).slice(0, 10)}</span>
                </div>
                <small>{r.notes}{r.receiptToken && (
                  <button type="button" className="payrep-receipt" onClick={() => navigate(`/receipt/${r.receiptToken}`)}>Receipt</button>
                )}</small>
              </div>
            ))}
            <footer>{g.customer} Total · {g.qty} items · KES {g.amount.toLocaleString()}</footer>
          </section>
        ))}
        {groups.length > 0 && (
          <div className="payrep-grand-mobile">
            Grand Total · {totalQty} items · KES {grandTotal.toLocaleString()} · {paidPct}% Paid
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="payrep-pager">
        <span>Showing {from} to {to} of {groups.length} customers</span>
        <div className="payrep-pager-controls">
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page"><ChevronLeft size={15} /></button>
          <span className="payrep-page-num" aria-current="page">{safePage} / {totalPages}</span>
          <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="Next page"><ChevronRight size={15} /></button>
          <label htmlFor="payrep-rpp">Rows per page:
            <select id="payrep-rpp" value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
