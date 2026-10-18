import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Receipt, Trash2, RefreshCw, MessageCircle, X, Filter, Download, Search } from 'lucide-react';
import './ExpensesPage.css';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const monthStart = () => `${today().slice(0, 7)}-01`;
const money = (amount) => `KSh ${Number(amount || 0).toLocaleString('en-KE')}`;
const formatTime = (value) => value ? new Date(value).toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' }) : '';
const BUSINESS_WHATSAPP = '254119444972';
const blankExpense = () => ({ description: '', category: 'Supplies', amount: '', expenseDate: today() });
const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [forms, setForms] = useState([blankExpense()]);
  const [creatorName, setCreatorName] = useState(() => {
    try { return localStorage.getItem('expense-created-by') || ''; } catch { return ''; }
  });
  const [customCreator, setCustomCreator] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filterDraft, setFilterDraft] = useState({ from: monthStart(), to: today() });
  const [activeFilter, setActiveFilter] = useState({ from: monthStart(), to: today() });
  const [categorySearch, setCategorySearch] = useState('');
  const [activeCategorySearch, setActiveCategorySearch] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/expenses');
      if (!res.ok) throw new Error('Could not load expenses. Check your connection and retry.');
      const loaded = await res.json();
      setExpenses(loaded);
      setCreatorName((current) => {
        if (current || !loaded[0]?.createdBy) return current;
        try { localStorage.setItem('expense-created-by', loaded[0].createdBy); } catch { /* Storage may be unavailable. */ }
        return loaded[0].createdBy;
      });
    } catch (e) { setError(e.message || 'Could not load expenses.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const monthTotal = useMemo(() => {
    const now = new Date();
    return expenses.filter((item) => {
      const date = new Date(item.expenseDate);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).reduce((total, item) => total + Number(item.amount || 0), 0);
  }, [expenses]);

  const dateFilteredExpenses = useMemo(() => expenses.filter((item) => {
    const expenseDate = localDate(new Date(item.expenseDate));
    return (!activeFilter.from || expenseDate >= activeFilter.from) && (!activeFilter.to || expenseDate <= activeFilter.to);
  }), [expenses, activeFilter]);

  const categorySummary = useMemo(() => {
    if (activeCategorySearch === null) return [];
    const query = activeCategorySearch.trim().toLowerCase();
    const groups = new Map();
    for (const expense of dateFilteredExpenses) {
      const category = expense.category || 'Other';
      if (query && !category.toLowerCase().includes(query)) continue;
      const group = groups.get(category) || { category, count: 0, amount: 0 };
      group.count += 1;
      group.amount += Number(expense.amount || 0);
      groups.set(category, group);
    }
    return [...groups.values()].sort((a, b) => a.category.localeCompare(b.category));
  }, [dateFilteredExpenses, activeCategorySearch]);

  const filteredExpenses = useMemo(() => dateFilteredExpenses.filter((item) => {
    if (activeCategorySearch === null || !activeCategorySearch.trim()) return true;
    return (item.category || 'Other').toLowerCase().includes(activeCategorySearch.trim().toLowerCase());
  }), [dateFilteredExpenses, activeCategorySearch]);

  async function downloadStatement() {
    const total = filteredExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 16;
    const pdfText = (value) => String(value ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, ' ');
    const rangeText = `${activeFilter.from || 'All dates'} to ${activeFilter.to || 'Present'}`;
    const drawTableHeader = (y) => {
      doc.setFillColor(237, 244, 249);
      doc.rect(margin, y - 6, pageWidth - margin * 2, 10, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(48, 76, 101);
      doc.text('DATE', margin + 2, y);
      doc.text('DESCRIPTION', margin + 30, y);
      doc.text('CATEGORY', margin + 84, y);
      doc.text('CREATED BY', margin + 112, y);
      doc.text('AMOUNT (KSH)', pageWidth - margin - 2, y, { align: 'right' });
      doc.setTextColor(20, 35, 52);
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(18, 58, 109);
    doc.text('Open Doors Laundromat', margin, 20);
    doc.setFontSize(15);
    doc.setTextColor(20, 35, 52);
    doc.text('Expense Statement', margin, 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(85, 101, 117);
    doc.text(`Period: ${pdfText(rangeText)}`, margin, 38);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-KE')}`, margin, 44);
    doc.text(`${filteredExpenses.length} expense${filteredExpenses.length === 1 ? '' : 's'}`, pageWidth - margin, 44, { align: 'right' });

    let y = 57;
    drawTableHeader(y);
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const item of filteredExpenses) {
      const descriptionLines = doc.splitTextToSize(pdfText(item.description), 50);
      const categoryLines = doc.splitTextToSize(pdfText(item.category), 24);
      const creatorLines = doc.splitTextToSize(pdfText(item.createdBy || 'Admin'), 32);
      const lineCount = Math.max(descriptionLines.length, categoryLines.length, creatorLines.length, 1);
      const rowHeight = Math.max(10, lineCount * 4.5 + 5);
      if (y + rowHeight > pageHeight - 25) {
        doc.addPage();
        y = 20;
        drawTableHeader(y);
        y += 10;
      }
      doc.setDrawColor(220, 228, 235);
      doc.line(margin, y + rowHeight - 4, pageWidth - margin, y + rowHeight - 4);
      doc.text(new Date(item.expenseDate).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }), margin + 2, y);
      doc.text(descriptionLines, margin + 30, y);
      doc.text(categoryLines, margin + 84, y);
      doc.text(creatorLines, margin + 112, y);
      doc.setFont('helvetica', 'bold');
      doc.text(Number(item.amount).toLocaleString('en-KE'), pageWidth - margin - 2, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += rowHeight;
    }
    if (y > pageHeight - 24) { doc.addPage(); y = 20; }
    doc.setFillColor(242, 246, 249);
    doc.roundedRect(margin, y + 2, pageWidth - margin * 2, 13, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(18, 58, 109);
    doc.text('TOTAL EXPENSES', margin + 4, y + 10.5);
    doc.text(`KSh ${total.toLocaleString('en-KE')}`, pageWidth - margin - 4, y + 10.5, { align: 'right' });
    doc.save(`expenses-statement-${activeFilter.from || 'start'}-to-${activeFilter.to || 'end'}.pdf`);
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/admin/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenses: forms.map((form) => ({ ...form, amount: Number(form.amount), createdBy: creatorName.trim() })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save these expenses.');
      setExpenses((items) => [...data, ...items]);
      setForms([blankExpense()]);
      setCustomCreator(false);
    } catch (e) { setError(e.message || 'Could not save these expenses.'); }
    finally { setSaving(false); }
  }

  function updateForm(index, field, value) {
    setForms((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  }

  function updateCreatorName(value) {
    setCreatorName(value);
    try { localStorage.setItem('expense-created-by', value); } catch { /* Storage may be unavailable. */ }
  }

  const creatorOptions = [...new Set([...expenses.map((item) => item.createdBy).filter(Boolean), creatorName].filter(Boolean))];

  function notifyLiz(item) {
    const message = `New expense recorded\nDescription: ${item.description}\nCategory: ${item.category}\nAmount: ${money(item.amount)}\nDate: ${new Date(item.expenseDate).toLocaleDateString('en-KE')}\nCreated by: ${item.createdBy || 'Admin'}`;
    const url = `https://wa.me/${BUSINESS_WHATSAPP}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function markNotified(item) {
    try {
      const res = await fetch(`/api/admin/expenses/${encodeURIComponent(item.id)}/notified`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update notification status.');
      setExpenses((items) => items.map((expense) => expense.id === item.id ? data : expense));
      setError('');
    } catch (e) { setError(e.message || 'Could not update notification status.'); }
  }

  async function removeExpense(item) {
    if (!window.confirm(`Delete “${item.description}”?`)) return;
    try {
      const res = await fetch(`/api/admin/expenses/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not delete expense.');
      setExpenses((items) => items.filter((expense) => expense.id !== item.id));
    } catch (e) { setError(e.message); }
  }

  return <section className="expenses-page">
    <header className="expenses-heading"><div><p className="expenses-eyebrow">Business costs</p><h1>Expenses</h1><p>Record and review your laundromat expenses.</p></div><Receipt size={28} aria-hidden="true" /></header>
    <div className="expenses-total"><div className="expenses-total-value"><span>This month</span><div className="expenses-total-amount"><strong>{money(monthTotal)}</strong></div></div><div className="expenses-total-meta"><small>{expenses.length} expense{expenses.length === 1 ? '' : 's'} recorded</small></div></div>
    <section className="expenses-panel">
      <div className="expenses-entry-heading"><h2><Plus size={19} /> Add expenses</h2><button className="expenses-add-row" type="button" onClick={() => setForms((items) => [...items, blankExpense()])}><Plus size={16} /> Add another row</button></div>
      <form className="expenses-batch-form" onSubmit={submit}>
        <div className="expenses-created-by"><label htmlFor="expense-created-by">Created by</label>{customCreator ? <div className="expenses-new-admin"><input id="expense-created-by" required autoFocus maxLength="80" value={creatorName} onChange={(e) => updateCreatorName(e.target.value)} placeholder="Type new admin name" /><button type="button" onClick={() => { setCustomCreator(false); updateCreatorName(creatorOptions[0] || ''); }}>Choose existing</button></div> : <select id="expense-created-by" required value={creatorName} onChange={(e) => { if (e.target.value === '__new_admin__') { setCustomCreator(true); updateCreatorName(''); } else updateCreatorName(e.target.value); }}>{!creatorName && <option value="" disabled>Select an admin</option>}{creatorOptions.map((name) => <option key={name} value={name}>{name}</option>)}<option value="__new_admin__">Add new admin…</option></select>}</div>
        {forms.map((form, index) => <div className="expenses-form" key={index}>
          <label>Category<input list={`expense-categories-${index}`} maxLength="60" value={form.category} onChange={(e) => updateForm(index, 'category', e.target.value)} placeholder="Choose or enter a category" /><datalist id={`expense-categories-${index}`}>{['Supplies', 'Rent', 'Utilities', 'Transport', 'Maintenance', 'Payroll', 'Other'].map((value) => <option key={value} value={value} />)}</datalist></label>
          <label>Description<input required maxLength="160" value={form.description} onChange={(e) => updateForm(index, 'description', e.target.value)} placeholder="e.g. Detergent purchase" /></label>
          <label>Amount (KSh)<input required type="number" min="1" step="1" value={form.amount} onChange={(e) => updateForm(index, 'amount', e.target.value)} placeholder="0" /></label>
          <label>Date<input required type="date" value={form.expenseDate} onChange={(e) => updateForm(index, 'expenseDate', e.target.value)} /></label>
          {forms.length > 1 && <button className="expenses-remove-row" type="button" aria-label={`Remove expense row ${index + 1}`} onClick={() => setForms((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X size={18} /></button>}
        </div>)}
        <button className="expenses-submit" type="submit" disabled={saving}><Plus size={17} />{saving ? 'Saving…' : `Save ${forms.length > 1 ? `${forms.length} expenses` : 'expense'}`}</button>
      </form>
    </section>
    {error && <div className="expenses-error" role="alert">{error}<button type="button" onClick={load}><RefreshCw size={15} /> Retry</button></div>}
    <section className="expenses-panel expenses-list-panel"><div className="expenses-list-head"><h2>Expense history</h2><span>{filteredExpenses.length} of {expenses.length} shown</span></div>
      <div className="expenses-tools"><div className="expenses-filter">
        <label>From Date<input type="date" value={filterDraft.from} onChange={(e) => setFilterDraft({ ...filterDraft, from: e.target.value })} /></label>
        <label>To Date<input type="date" value={filterDraft.to} onChange={(e) => setFilterDraft({ ...filterDraft, to: e.target.value })} /></label>
        <button type="button" className="expenses-tool-button" onClick={() => setActiveFilter(filterDraft)}><Filter size={16} /> Filter</button>
      </div><button type="button" className="expenses-tool-button expenses-download" onClick={downloadStatement}><Download size={16} /> Download PDF statement</button></div>
      <div className="expenses-category-search"><label>Search categories<input list="expense-category-search-options" value={categorySearch} onChange={(e) => setCategorySearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setActiveCategorySearch(categorySearch); } }} placeholder="Type a category or leave blank for all" /><datalist id="expense-category-search-options">{[...new Set(expenses.map((item) => item.category).filter(Boolean))].map((category) => <option key={category} value={category} />)}</datalist></label><button type="button" className="expenses-tool-button" onClick={() => setActiveCategorySearch(categorySearch)}><Search size={16} /> Search categories</button></div>
      {activeCategorySearch !== null && <div className="expenses-category-results" aria-live="polite"><div className="expenses-category-results-heading"><div><strong>Category totals</strong><small>{activeCategorySearch.trim() ? `Matching “${activeCategorySearch.trim()}”` : 'All categories'} · selected date range</small></div><button type="button" onClick={() => { setActiveCategorySearch(null); setCategorySearch(''); }}>Clear search</button></div>{categorySummary.length ? <div className="expenses-category-cards">{categorySummary.map((group) => <article className="expenses-category-card" key={group.category}><span>{group.category}</span><strong>{money(group.amount)}</strong><small>{group.count} expense{group.count === 1 ? '' : 's'}</small></article>)}</div> : <p className="expenses-empty">No categories match this search and date range.</p>}</div>}
      {loading ? <p className="expenses-empty">Loading expenses…</p> : expenses.length === 0 ? <p className="expenses-empty">No expenses recorded yet.</p> : filteredExpenses.length === 0 ? <p className="expenses-empty">No expenses match this filter.</p> : <div className="expenses-table-wrap"><table className="expenses-table"><thead><tr><th>Date &amp; time</th><th>Description</th><th>Category</th><th>Created by</th><th>Amount</th><th>Notify status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filteredExpenses.map((item) => <tr key={item.id}><td><span>{new Date(item.expenseDate).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</span><small className="expenses-row-time">Added {formatTime(item.createdAt)}</small></td><td className="expenses-description">{item.description}</td><td><span className="expenses-category">{item.category}</span></td><td>{item.createdBy || 'Admin'}</td><td className="expenses-amount">{money(item.amount)}</td><td><span className={`expenses-notify-status ${item.notifiedAt ? 'done' : 'pending'}`}>{item.notifiedAt ? 'Notified' : 'Pending'}</span><small className="expenses-row-time">{item.notifiedAt ? `Notified ${formatTime(item.notifiedAt)}` : 'Waiting for Liz'}</small></td><td className="expenses-actions"><button className="expenses-notify" type="button" onClick={() => notifyLiz(item)}><MessageCircle size={15} /> Notify Liz</button>{!item.notifiedAt && <button className="expenses-mark-notified" type="button" onClick={() => markNotified(item)}>Mark notified</button>}<button className="expenses-delete" type="button" aria-label={`Delete ${item.description}`} onClick={() => removeExpense(item)}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div>}
    </section>
  </section>;
}
