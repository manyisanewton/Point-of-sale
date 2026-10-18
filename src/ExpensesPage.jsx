import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Receipt, Trash2, RefreshCw, MessageCircle, X } from 'lucide-react';
import './ExpensesPage.css';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const money = (amount) => `KSh ${Number(amount || 0).toLocaleString('en-KE')}`;
const BUSINESS_WHATSAPP = '254119444972';
const blankExpense = () => ({ description: '', category: 'Supplies', amount: '', expenseDate: today() });

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [forms, setForms] = useState([blankExpense()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/expenses');
      if (!res.ok) throw new Error('Could not load expenses. Check your connection and retry.');
      setExpenses(await res.json());
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

  async function submit(event) {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/admin/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenses: forms.map((form) => ({ ...form, amount: Number(form.amount) })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save these expenses.');
      setExpenses((items) => [...data, ...items]);
      setForms([blankExpense()]);
    } catch (e) { setError(e.message || 'Could not save these expenses.'); }
    finally { setSaving(false); }
  }

  function updateForm(index, field, value) {
    setForms((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  }

  function notifyLiz(item) {
    const message = `New expense recorded\nDescription: ${item.description}\nCategory: ${item.category}\nAmount: ${money(item.amount)}\nDate: ${new Date(item.expenseDate).toLocaleDateString('en-KE')}`;
    const url = `https://wa.me/${BUSINESS_WHATSAPP}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
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
    <div className="expenses-total"><span>This month</span><strong>{money(monthTotal)}</strong><small>{expenses.length} expense{expenses.length === 1 ? '' : 's'} recorded</small></div>
    <section className="expenses-panel">
      <div className="expenses-entry-heading"><h2><Plus size={19} /> Add expenses</h2><button className="expenses-add-row" type="button" onClick={() => setForms((items) => [...items, blankExpense()])}><Plus size={16} /> Add another row</button></div>
      <form className="expenses-batch-form" onSubmit={submit}>
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
    <section className="expenses-panel expenses-list-panel"><div className="expenses-list-head"><h2>Expense history</h2><span>{expenses.length} total</span></div>
      {loading ? <p className="expenses-empty">Loading expenses…</p> : expenses.length === 0 ? <p className="expenses-empty">No expenses recorded yet.</p> : <div className="expenses-table-wrap"><table className="expenses-table"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{expenses.map((item) => <tr key={item.id}><td>{new Date(item.expenseDate).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</td><td className="expenses-description">{item.description}</td><td><span className="expenses-category">{item.category}</span></td><td className="expenses-amount">{money(item.amount)}</td><td className="expenses-actions"><button className="expenses-notify" type="button" onClick={() => notifyLiz(item)}><MessageCircle size={15} /> Notify Liz</button><button className="expenses-delete" type="button" aria-label={`Delete ${item.description}`} onClick={() => removeExpense(item)}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div>}
    </section>
  </section>;
}
