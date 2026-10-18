import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Receipt, Trash2, RefreshCw } from 'lucide-react';
import './ExpensesPage.css';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const money = (amount) => `KSh ${Number(amount || 0).toLocaleString('en-KE')}`;
const BUSINESS_WHATSAPP = '254119444972';

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState({ description: '', category: 'Supplies', amount: '', expenseDate: today() });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [whatsappLink, setWhatsappLink] = useState('');
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
    // Open synchronously from the submit gesture so the browser does not block the WhatsApp tab after the API call.
    const whatsappWindow = window.open('', '_blank');
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/admin/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save this expense.');
      setExpenses((items) => [data, ...items]);
      const message = `New expense recorded\nDescription: ${data.description}\nCategory: ${data.category}\nAmount: ${money(data.amount)}\nDate: ${new Date(data.expenseDate).toLocaleDateString('en-KE')}`;
      const url = `https://wa.me/${BUSINESS_WHATSAPP}?text=${encodeURIComponent(message)}`;
      setWhatsappLink(url);
      if (whatsappWindow) whatsappWindow.location.href = url;
      setForm({ description: '', category: 'Supplies', amount: '', expenseDate: today() });
    } catch (e) { if (whatsappWindow) whatsappWindow.close(); setError(e.message || 'Could not save this expense.'); }
    finally { setSaving(false); }
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
      <h2><Plus size={19} /> Add an expense</h2>
      <form className="expenses-form" onSubmit={submit}>
        <label>Description<input required maxLength="160" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Detergent purchase" /></label>
        <label>Category<input list="expense-categories" maxLength="60" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Choose or enter a category" /><datalist id="expense-categories">{['Supplies', 'Rent', 'Utilities', 'Transport', 'Maintenance', 'Payroll', 'Other'].map((value) => <option key={value} value={value} />)}</datalist></label>
        <label>Amount (KSh)<input required type="number" min="1" step="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" /></label>
        <label>Date<input required type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} /></label>
        <button className="expenses-submit" type="submit" disabled={saving}><Plus size={17} />{saving ? 'Saving…' : 'Add expense'}</button>
      </form>
    </section>
    {error && <div className="expenses-error" role="alert">{error}<button type="button" onClick={load}><RefreshCw size={15} /> Retry</button></div>}
    {whatsappLink && <p className="expenses-whatsapp-note" role="status">Expense saved. WhatsApp opened with the expense details ready to send. <a href={whatsappLink} target="_blank" rel="noreferrer">Open WhatsApp</a></p>}
    <section className="expenses-panel expenses-list-panel"><div className="expenses-list-head"><h2>Expense history</h2><span>{expenses.length} total</span></div>
      {loading ? <p className="expenses-empty">Loading expenses…</p> : expenses.length === 0 ? <p className="expenses-empty">No expenses recorded yet.</p> : <div className="expenses-table-wrap"><table className="expenses-table"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{expenses.map((item) => <tr key={item.id}><td>{new Date(item.expenseDate).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</td><td className="expenses-description">{item.description}</td><td><span className="expenses-category">{item.category}</span></td><td className="expenses-amount">{money(item.amount)}</td><td><button className="expenses-delete" type="button" aria-label={`Delete ${item.description}`} onClick={() => removeExpense(item)}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div>}
    </section>
  </section>;
}
