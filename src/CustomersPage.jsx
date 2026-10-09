import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  Search,
  UserPlus,
  Plus,
  Trash2,
  X,
  MessageCircle,
} from 'lucide-react';
import { useOffline, useOfflineCustomers } from './hooks/useOffline.js';
import { upsertServerCustomers } from './lib/db.js';

const EMPTY_CUSTOMER = {
  name: '',
  phone: '',
  email: '',
  servedBy: '',
};

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits.slice(3);
  if (digits.startsWith('0') && digits.length === 10) return digits.slice(1);
  return digits;
}

function whatsappPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : '';
}

export default function CustomersPage() {
  const navigate = useNavigate();
  const { customers, loading, refresh } = useOfflineCustomers();
  const { createCustomerOffline, deleteCustomerOffline } = useOffline();
  const [search, setSearch] = useState('');
  const [serverKnown, setServerKnown] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER);
  const [matchedExistingCustomer, setMatchedExistingCustomer] = useState(null);
  const [formError, setFormError] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [notice, setNotice] = useState('');
  const [deletingCustomerId, setDeletingCustomerId] = useState(null);
  const [showWhatsAppComposer, setShowWhatsAppComposer] = useState(false);
  const [outreachStaff, setOutreachStaff] = useState('');
  const [outreachAllCustomers, setOutreachAllCustomers] = useState(false);
  const [outreachMessage, setOutreachMessage] = useState('');
  const [confirmedOutreachOptIn, setConfirmedOutreachOptIn] = useState(false);
  const [sendingOutreach, setSendingOutreach] = useState(false);
  const [outreachError, setOutreachError] = useState('');
  const [outreachResult, setOutreachResult] = useState(null);
  const [manualWhatsAppMode, setManualWhatsAppMode] = useState(false);
  const [manualWhatsAppIndex, setManualWhatsAppIndex] = useState(0);

  // Local-first: Dexie renders immediately; server refreshes the mirror
  // when online (by phone, without touching pending local rows).
  useEffect(() => {
    let cancelled = false;
    if (!navigator.onLine) {
      setServerKnown(false);
      return;
    }
    fetch('/api/admin/dashboard')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(async (data) => {
        const serverCustomers = Array.isArray(data.customers) ? data.customers : data.requests || [];
        await upsertServerCustomers(serverCustomers);
        if (!cancelled) {
          refresh();
          setServerKnown(true);
        }
      })
      .catch(() => {
        if (!cancelled) setServerKnown(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!showCreateForm) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeCreateForm();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCreateForm]);

  async function handleCreateCustomer(event) {
    event.preventDefault();
    if (matchedExistingCustomer) {
      setShowCreateForm(false);
      setNotice(`Existing customer details loaded for ${matchedExistingCustomer.name}.`);
      setMatchedExistingCustomer(null);
      setCustomerForm(EMPTY_CUSTOMER);
      return;
    }
    const customer = {
      ...customerForm,
      name: customerForm.name.trim(),
      phone: customerForm.phone.trim(),
      email: customerForm.email.trim(),
    };
    if (!customer.name || !customer.phone) {
      setFormError('Customer name and phone number are required.');
      return;
    }

    setSavingCustomer(true);
    setFormError('');
    try {
      await createCustomerOffline(customer);
      refresh();
      setCustomerForm(EMPTY_CUSTOMER);
      setShowCreateForm(false);
      setNotice(`${customer.name} was added to the customer directory.`);
    } catch {
      setFormError('Could not create the customer. Please try again.');
    } finally {
      setSavingCustomer(false);
    }
  }

  function closeCreateForm() {
    setShowCreateForm(false);
    setFormError('');
    setMatchedExistingCustomer(null);
    setCustomerForm(EMPTY_CUSTOMER);
  }

  function handlePhoneChange(phone) {
    const normalizedPhone = normalizePhone(phone);
    const matched = normalizedPhone.length >= 9
      ? customers.find((customer) => normalizePhone(customer.phone) === normalizedPhone)
      : null;
    setMatchedExistingCustomer(matched || null);
    setCustomerForm((current) => ({
      ...current,
      phone,
      name: matched ? (matched.name || '') : (matchedExistingCustomer ? '' : current.name),
      email: matched ? (matched.email || '') : (matchedExistingCustomer ? '' : current.email),
      servedBy: matchedExistingCustomer && !matched ? '' : current.servedBy,
    }));
  }

  async function handleDeleteCustomer(customer) {
    if (!window.confirm(`Delete ${customer.name} from the customer directory?`)) return;
    setDeletingCustomerId(customer.id);
    try {
      await deleteCustomerOffline(customer);
      refresh();
      setNotice(`${customer.name} was deleted from the customer directory.`);
    } catch {
      setNotice(`Could not delete ${customer.name}. Please try again.`);
    } finally {
      setDeletingCustomerId(null);
    }
  }

  const filtered = customers
    .filter(
        (c) =>
          (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
          (c.phone || '').includes(search) ||
          (c.email || '').toLowerCase().includes(search.toLowerCase())
      )
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const staffNames = [...new Set(customers.map((customer) => String(customer.servedBy || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const outreachRecipients = [...new Map(customers
    .filter((customer) => outreachAllCustomers || (outreachStaff && String(customer.servedBy || '').trim() === outreachStaff))
    .map((customer) => [whatsappPhone(customer.phone), { ...customer, whatsappPhone: whatsappPhone(customer.phone) }])
    .filter(([phone]) => Boolean(phone))).values()];

  async function sendWhatsAppCampaign() {
    if ((!outreachAllCustomers && !outreachStaff) || !outreachMessage.trim() || !confirmedOutreachOptIn || outreachRecipients.length === 0) return;
    setSendingOutreach(true);
    setOutreachError('');
    setOutreachResult(null);
    try {
      const response = await fetch('/api/admin/whatsapp-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          servedBy: outreachStaff,
          allCustomers: outreachAllCustomers,
          message: outreachMessage.trim(),
          confirmedOptIn: confirmedOutreachOptIn,
        }),
      });
      const result = await response.json();
      if (response.status === 503) {
        setManualWhatsAppMode(true);
        setManualWhatsAppIndex(0);
        setOutreachError('Automatic sending is not configured. Open each WhatsApp chat below and press Send to deliver the message.');
        return;
      }
      if (!response.ok) throw new Error(result.error || 'Could not send the WhatsApp campaign.');
      setOutreachResult(result);
    } catch (error) {
      setOutreachError(error.message || 'Could not send the WhatsApp campaign.');
    } finally {
      setSendingOutreach(false);
    }
  }

  function openNextWhatsAppChat() {
    const customer = outreachRecipients[manualWhatsAppIndex];
    if (!customer || !outreachMessage.trim()) return;
    const chatUrl = `https://wa.me/${customer.whatsappPhone}?text=${encodeURIComponent(outreachMessage.trim())}`;
    window.open(chatUrl, '_blank', 'noopener,noreferrer');
    setManualWhatsAppIndex((index) => index + 1);
  }

  if (loading) return <div className="pos-page"><h2>Customers</h2><p>Loading customers…</p></div>;

  return (
    <div className="pos-page">
      <header className="pos-page-header">
        <div>
          <p className="eyebrow">Customers</p>
          <h2>Customer directory.</h2>
        </div>
        <div className="customer-directory-actions">
          <div className="pos-search">
            <Search size={18} />
            <input
              type="search"
              placeholder="Search by name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search customers by name or phone"
            />
          </div>
          <button className="customer-create-button" onClick={() => setShowCreateForm(true)}>
            <UserPlus size={17} /> Create Customer
          </button>
          <button className="customer-whatsapp-button" type="button" onClick={() => setShowWhatsAppComposer(true)}>
            <MessageCircle size={17} /> WhatsApp customers
          </button>
        </div>
      </header>
      {notice && <p className="sale-notice customer-success-notice" role="status">{notice}</p>}
      {!serverKnown && (
        <p className="sale-notice offline" role="status">
          Showing {customers.length} customer(s) saved on this device. Connect to see the latest server directory.
        </p>
      )}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={28} />
          <h3>No customers found</h3>
          <p>{customers.length === 0 ? 'New customers are saved automatically with each sale.' : 'No customers match this search.'}</p>
        </div>
      ) : (
        <div className="customers-table-wrap" role="region" aria-label="Customer directory" tabIndex="0">
          <table className="customers-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Contact Number</th>
                <th scope="col">Email</th>
                <th scope="col">Served By</th>
                <th scope="col">Time</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => {
                const customerTime = customer.createdAt ? new Date(customer.createdAt) : null;
                const formattedTime = customerTime && !Number.isNaN(customerTime.getTime())
                  ? customerTime.toLocaleString()
                  : '—';
                return (
                  <tr key={customer.id}>
                    <td className="customer-table-name">{customer.name || '—'}</td>
                    <td><a href={`tel:${customer.phone}`}>{customer.phone || '—'}</a></td>
                    <td>{customer.email || '—'}</td>
                    <td>{customer.servedBy || '—'}</td>
                    <td><time dateTime={customer.createdAt || undefined}>{formattedTime}</time></td>
                    <td>
                      <div className="customer-table-actions">
                        <button
                          className="customer-booking-button"
                          type="button"
                          onClick={() => navigate('/new-order', {
                            state: {
                              customerName: customer.name,
                              customerPhone: customer.phone,
                              servedBy: customer.servedBy,
                            },
                          })}
                        >
                          <Plus size={15} /> New Booking
                        </button>
                        <button
                          className="customer-delete-button"
                          type="button"
                          aria-label={`Delete ${customer.name}`}
                          title="Delete customer"
                          disabled={deletingCustomerId === customer.id}
                          onClick={() => handleDeleteCustomer(customer)}
                        >
                          <Trash2 size={15} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {showWhatsAppComposer && (
        <div className="customer-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowWhatsAppComposer(false);
        }}>
          <section className="customer-modal customer-whatsapp-modal" role="dialog" aria-modal="true" aria-labelledby="customer-whatsapp-title">
            <header className="customer-modal-header">
              <div>
                <p className="eyebrow">Customer outreach</p>
                <h3 id="customer-whatsapp-title">WhatsApp customers</h3>
              </div>
              <button className="customer-modal-close" type="button" onClick={() => setShowWhatsAppComposer(false)} aria-label="Close WhatsApp outreach">
                <X size={19} />
              </button>
            </header>
            <div className="customer-whatsapp-compose">
              <div className="customer-whatsapp-mode" role="group" aria-label="Choose WhatsApp recipients">
                <button
                  className={!outreachAllCustomers ? 'active' : ''}
                  type="button"
                  aria-pressed={!outreachAllCustomers}
                  disabled={sendingOutreach}
                  onClick={() => {
                    setOutreachAllCustomers(false);
                    setOutreachResult(null);
                    setConfirmedOutreachOptIn(false);
                    setManualWhatsAppMode(false);
                    setManualWhatsAppIndex(0);
                  }}
                >By staff member</button>
                <button
                  className={outreachAllCustomers ? 'active' : ''}
                  type="button"
                  aria-pressed={outreachAllCustomers}
                  disabled={sendingOutreach}
                  onClick={() => {
                    setOutreachAllCustomers(true);
                    setOutreachStaff('');
                    setOutreachResult(null);
                    setConfirmedOutreachOptIn(false);
                    setManualWhatsAppMode(false);
                    setManualWhatsAppIndex(0);
                  }}
                >All customers</button>
              </div>
              {outreachAllCustomers ? (
                <p className="customer-whatsapp-all-note">The Served By filter is off. All customers with a valid phone number are included.</p>
              ) : (
                <label className="customer-form-field">
                  Served by
                  <select value={outreachStaff} onChange={(event) => {
                    setOutreachStaff(event.target.value);
                    setOutreachResult(null);
                    setConfirmedOutreachOptIn(false);
                    setManualWhatsAppMode(false);
                    setManualWhatsAppIndex(0);
                  }} required disabled={sendingOutreach}>
                    <option value="">Choose your name</option>
                    {staffNames.map((staff) => <option key={staff} value={staff}>{staff}</option>)}
                  </select>
                </label>
              )}
              <label className="customer-form-field">
                Message
                <textarea
                  rows={4}
                  value={outreachMessage}
                  onChange={(event) => {
                    setOutreachMessage(event.target.value);
                    setOutreachResult(null);
                    setManualWhatsAppMode(false);
                    setManualWhatsAppIndex(0);
                  }}
                  placeholder="Write the message to send to these customers…"
                  maxLength={1024}
                  required
                  disabled={sendingOutreach}
                />
              </label>
            </div>
            <div className="customer-whatsapp-recipients">
              <b>Recipients ({outreachRecipients.length})</b>
              {!outreachAllCustomers && !outreachStaff ? (
                <p>Choose the staff name recorded under Served By to see their customers.</p>
              ) : outreachRecipients.length === 0 ? (
                <p>{outreachAllCustomers ? 'No customers with a valid phone number were found.' : `No customers with a valid phone number were found for ${outreachStaff}.`}</p>
              ) : (
                <ul>
                  {outreachRecipients.map((customer) => (
                    <li key={customer.whatsappPhone}>
                      <span><b>{customer.name || 'Customer'}</b><small>{customer.phone}</small></span>
                      <span className="customer-whatsapp-status">
                        {outreachResult?.results?.find((result) => result.phone === customer.whatsappPhone)
                          ? outreachResult.results.find((result) => result.phone === customer.whatsappPhone).accepted
                            ? 'Accepted for delivery'
                            : 'Failed'
                          : manualWhatsAppMode && outreachRecipients.indexOf(customer) < manualWhatsAppIndex
                            ? 'Chat opened'
                            : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <label className="customer-whatsapp-consent">
              <input
                type="checkbox"
                checked={confirmedOutreachOptIn}
                onChange={(event) => setConfirmedOutreachOptIn(event.target.checked)}
                disabled={sendingOutreach || Boolean(outreachResult)}
              />
              I confirm these customers agreed to receive WhatsApp messages.
            </label>
            {outreachError && <p className="customer-whatsapp-error" role="alert">{outreachError}</p>}
            {manualWhatsAppMode && manualWhatsAppIndex >= outreachRecipients.length && (
              <p className="customer-whatsapp-result" role="status">All customer chats have been opened. Send the prefilled message in each WhatsApp chat to complete the campaign.</p>
            )}
            {outreachResult && (
              <p className="customer-whatsapp-result" role="status">
                WhatsApp accepted {outreachResult.accepted} of {outreachResult.total} messages for delivery. {outreachResult.failed > 0 && `${outreachResult.failed} failed.`}
              </p>
            )}
            <div className="customer-modal-actions">
              <button className="customer-cancel-button" type="button" onClick={() => setShowWhatsAppComposer(false)}>Close</button>
              {outreachResult && (
                <button className="customer-cancel-button" type="button" onClick={() => {
                  setOutreachMessage('');
                  setConfirmedOutreachOptIn(false);
                  setOutreachResult(null);
                  setOutreachError('');
                }}>New campaign</button>
              )}
              {manualWhatsAppMode ? (
                <button
                  className="customer-whatsapp-button"
                  type="button"
                  onClick={openNextWhatsAppChat}
                  disabled={manualWhatsAppIndex >= outreachRecipients.length || !outreachMessage.trim()}
                >
                  <MessageCircle size={17} />
                  {manualWhatsAppIndex >= outreachRecipients.length
                    ? 'Chats opened'
                    : `Open WhatsApp for ${outreachRecipients[manualWhatsAppIndex]?.name || 'next customer'} (${manualWhatsAppIndex + 1}/${outreachRecipients.length})`}
                </button>
              ) : (
                <button
                  className="customer-whatsapp-button"
                  type="button"
                  onClick={sendWhatsAppCampaign}
                  disabled={sendingOutreach || (!outreachAllCustomers && !outreachStaff) || !outreachMessage.trim() || !confirmedOutreachOptIn || outreachRecipients.length === 0 || Boolean(outreachResult)}
                >
                  <MessageCircle size={17} />
                  {sendingOutreach ? 'Sending…' : outreachResult ? 'Campaign submitted' : `Send to ${outreachRecipients.length} customers`}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      {showCreateForm && (
        <div
          className="customer-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCreateForm();
          }}
        >
          <section className="customer-modal" role="dialog" aria-modal="true" aria-labelledby="create-customer-title">
            <header className="customer-modal-header">
              <div>
                <p className="eyebrow">Customer directory</p>
                <h3 id="create-customer-title">Create customer</h3>
              </div>
              <button className="customer-modal-close" type="button" onClick={closeCreateForm} aria-label="Close dialog">
                <X size={19} />
              </button>
            </header>
            <form onSubmit={handleCreateCustomer}>
              <div className="customer-form-grid">
                <label className="customer-form-field">
                  Phone number
                  <input
                    autoFocus
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    value={customerForm.phone}
                    onChange={(event) => handlePhoneChange(event.target.value)}
                    required
                  />
                  {matchedExistingCustomer && <small className="customer-existing-match" role="status">Existing customer found. Details filled in.</small>}
                </label>
                <label className="customer-form-field">
                  Customer Name
                  <input
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={customerForm.name}
                    onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })}
                    disabled={Boolean(matchedExistingCustomer)}
                    required
                  />
                </label>
                <label className="customer-form-field">
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={customerForm.email}
                    onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })}
                    disabled={Boolean(matchedExistingCustomer)}
                  />
                </label>
                <label className="customer-form-field">
                  Served By
                  <input
                    name="servedBy"
                    type="text"
                    autoComplete="name"
                    value={customerForm.servedBy}
                    onChange={(event) => setCustomerForm({ ...customerForm, servedBy: event.target.value })}
                    required
                  />
                </label>
              </div>
              {formError && <p className="customer-form-error" role="alert">{formError}</p>}
              <div className="customer-modal-actions">
                <button className="customer-cancel-button" type="button" onClick={closeCreateForm}>Cancel</button>
                <button className="customer-submit-button" type="submit" disabled={savingCustomer}>
                  {savingCustomer ? 'Saving…' : matchedExistingCustomer ? 'Use Existing Customer' : 'Save Customer'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
