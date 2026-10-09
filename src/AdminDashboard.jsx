import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Banknote,
  Check,
  ClipboardList,
  Clock3,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import './ReportsPage.css';
import { useAmountVisibility } from './hooks/useAmountVisibility.js';

function normalizePriceGroups(groups = []) {
  return groups.map((group) => ({
    ...group,
    items: (group.items || []).map((item) => (
      Array.isArray(item)
        ? [String(item[0] ?? ''), String(item[1] ?? '')]
        : [String(item.name ?? item.serviceName ?? ''), String(item.price ?? item.unitPrice ?? '')]
    )),
  }));
}

export default function AdminDashboard() {
  const { amountsHidden } = useAmountVisibility();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [tab] = useState(location.state?.tab === 'pricing' ? 'pricing' : 'overview');
  const [loadError, setLoadError] = useState('');
  const [newServiceGroup, setNewServiceGroup] = useState(null);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [confirmingNewService, setConfirmingNewService] = useState(false);
  const [deletePriceTarget, setDeletePriceTarget] = useState(null);
  const [savingPriceAction, setSavingPriceAction] = useState(false);

  async function load() {
    setLoadError('');
    try {
      const response = await fetch('/api/admin/dashboard');
      if (response.ok) {
        const result = await response.json();
        setData({
          ...result,
          settings: {
            ...result.settings,
            priceGroups: normalizePriceGroups(result.settings?.priceGroups),
          },
        });
      } else if (response.status === 401) {
        // Session genuinely expired — re-authenticate.
        navigate('/login');
        return;
      } else {
        setLoadError(`Dashboard unavailable (HTTP ${response.status}). Please try again.`);
      }
    } catch {
      // Network failure (offline/backend down) is NOT an expired session:
      // stay in the POS and offer a retry instead of bouncing to login.
      setLoadError(
        navigator.onLine === false
          ? 'You are offline. Showing the last loaded data when available — reconnect and retry.'
          : 'Cannot reach the server. Check the connection and retry.'
      );
      return;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveProcess(e) {
    e.preventDefault();
    const response = await fetch('/api/admin/process', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps: data.process.steps }),
    });
    setMessage(response.ok ? 'Process saved successfully.' : (await response.json()).error);
    if (response.ok) load();
  }

  async function saveSettings(e) {
    e.preventDefault();
    const response = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data.settings),
    });
    setMessage(
      response.ok ? 'Website settings saved successfully.' : (await response.json()).error
    );
    if (response.ok) load();
  }

  async function savePriceGroups(priceGroups, successMessage) {
    setSavingPriceAction(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data.settings, priceGroups }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || 'Could not save pricing changes.');
        return false;
      }
      setData((current) => ({
        ...current,
        settings: {
          ...current.settings,
          priceGroups: normalizePriceGroups(result.priceGroups || priceGroups),
        },
      }));
      setMessage(successMessage);
      return true;
    } catch {
      setMessage('Could not save pricing changes. Check the server connection and try again.');
      return false;
    } finally {
      setSavingPriceAction(false);
    }
  }

  function openNewServiceForm(groupIndex) {
    setNewServiceGroup(groupIndex);
    setNewServiceName('');
    setNewServicePrice('');
    setConfirmingNewService(false);
  }

  async function confirmAddNewService() {
    if (newServiceGroup == null) return;
    const nextGroups = data.settings.priceGroups.map((group, index) => (
      index === newServiceGroup
        ? { ...group, items: [...group.items, [newServiceName.trim(), String(Number(newServicePrice))]] }
        : group
    ));
    const saved = await savePriceGroups(nextGroups, 'New service added.');
    if (saved) {
      setNewServiceGroup(null);
      setConfirmingNewService(false);
    }
  }

  async function confirmDeletePrice() {
    if (!deletePriceTarget) return;
    const { groupIndex, itemIndex } = deletePriceTarget;
    const nextGroups = data.settings.priceGroups.map((group, index) => (
      index === groupIndex
        ? { ...group, items: group.items.filter((_, item) => item !== itemIndex) }
        : group
    ));
    const saved = await savePriceGroups(nextGroups, 'Service deleted.');
    if (saved) setDeletePriceTarget(null);
  }

  async function status(id, status) {
    await fetch(`/api/admin/requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function removeRequest(id) {
    if (!window.confirm('Permanently remove this completed request? This cannot be undone.'))
      return;
    const response = await fetch(`/api/admin/requests/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      setMessage((await response.json()).error);
      return;
    }
    setMessage('Completed request removed.');
    load();
  }

  const update = (path, value) =>
    setData((current) => {
      const next = structuredClone(current);
      let target = next;
      path.slice(0, -1).forEach((key) => (target = target[key]));
      target[path.at(-1)] = value;
      return next;
    });

  if (loading) return <div className="admin-shell">Loading dashboard…</div>;
  if (loadError && !data) {
    return (
      <div className="pos-page">
        <header className="pos-page-header">
          <div>
            <p className="eyebrow">Business dashboard</p>
            <h2>Dashboard unavailable.</h2>
          </div>
        </header>
        <p className="sale-notice error" role="alert">{loadError}</p>
        <button className="btn-primary" onClick={load}>Retry</button>
      </div>
    );
  }
  if (!data) return null;

  const max = Math.max(1, ...data.daily.map((day) => day.count));
  const todayLabel = new Intl.DateTimeFormat('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Africa/Nairobi',
  }).format(new Date());
  const activeOrders = data.stats.active ?? data.requests.filter(
    (request) => !['completed', 'cancelled'].includes(request.status)
  ).length;
  const todayRevenue = data.stats.todayRevenue ?? data.requests
    .filter((request) => request.paymentStatus === 'paid')
    .reduce((sum, request) => sum + Number(request.estimatedTotal || 0), 0);
  return (
    <div className="dashboard">
      <div>
        <header className="dash-header">
          <div>
            <p className="eyebrow">{todayLabel}</p>
            <h1>{tab === 'overview' ? 'Good day, Open Doors' : tab[0].toUpperCase() + tab.slice(1)}</h1>
            {tab === 'overview' && <p className="dash-subtitle">Here is how your laundromat is doing today.</p>}
          </div>
          {tab === 'overview' && (
            <button className="dash-new-order" type="button" onClick={() => navigate('/new-order')}>
              <Plus size={18} /> New order
            </button>
          )}
        </header>
        {message && <p className="admin-message success">{message}</p>}
        {loadError && (
          <p className="sale-notice error" role="alert">
            {loadError} <button className="btn-secondary" onClick={load}>Retry</button>
          </p>
        )}
        {tab === 'overview' && (
          <>
            <section className="stat-grid">
              <article className="stat-card stat-card-blue">
                <span className="stat-icon"><Banknote size={22} /></span>
                <div>
                  <span>Today's revenue</span>
                  <b>{amountsHidden ? '••••••' : `KSh ${todayRevenue.toLocaleString()}`}</b>
                  <small>{data.stats.today} orders today</small>
                </div>
              </article>
              <article className="stat-card stat-card-amber">
                <span className="stat-icon"><Clock3 size={22} /></span>
                <div><span>Active orders</span><b>{activeOrders}</b><small>{data.stats.ready || 0} ready for collection</small></div>
              </article>
              <article className="stat-card stat-card-green">
                <span className="stat-icon"><Check size={22} /></span>
                <div><span>Completed</span><b>{data.stats.completed}</b><small>All-time finished orders</small></div>
              </article>
              <article className="stat-card stat-card-violet">
                <span className="stat-icon"><Users size={22} /></span>
                <div><span>Customers</span><b>{data.customers?.length || 0}</b><small>{data.stats.pendingPayments || 0} pending payments</small></div>
              </article>
            </section>
            <section className="dashboard-overview-grid">
              <div className="dash-box dashboard-chart-card">
                <div className="box-title">
                  <div>
                    <h2>Weekly orders</h2>
                    <p>Orders received over the last seven days</p>
                  </div>
                  <span className="dashboard-total-pill">{data.daily.reduce((sum, day) => sum + day.count, 0)} total</span>
                </div>
                <div className="bar-chart">
                  {data.daily.map((day) => (
                    <div className="bar-item" key={day.date}>
                      <b>{day.count}</b>
                      <span style={{ height: `${Math.max(8, (day.count / max) * 150)}px` }}></span>
                      <small>{day.label}</small>
                    </div>
                  ))}
                </div>
              </div>
              <div className="dash-box dashboard-quick-card">
                <div className="box-title"><div><h2>Quick actions</h2><p>Common daily tasks</p></div></div>
                <button onClick={() => navigate('/new-order')}><Plus size={18} /><span><b>Create an order</b><small>Start a new walk-in sale</small></span><ArrowUpRight size={17} /></button>
                <button onClick={() => navigate('/orders')}><ClipboardList size={18} /><span><b>Manage orders</b><small>Update laundry progress</small></span><ArrowUpRight size={17} /></button>
                <button onClick={() => navigate('/customers')}><Users size={18} /><span><b>Customer directory</b><small>Find and manage customers</small></span><ArrowUpRight size={17} /></button>
              </div>
            </section>
            <Recent
              requests={data.requests.slice(0, 5)}
              onStatus={status}
              onDelete={removeRequest}
            />
          </>
        )}
        {tab === 'requests' && (
          <Recent requests={data.requests} onStatus={status} onDelete={removeRequest} />
        )}
        {tab === 'process' && (
          <form className="dash-box editor" onSubmit={saveProcess}>
            <div className="box-title">
              <div>
                <h2>Care in every step</h2>
                <p>Edit the process displayed on the website.</p>
              </div>
            </div>
            {data.process.steps.map((step, i) => (
              <div className="step-input" key={i}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <input
                  value={step}
                  onChange={(e) => update(['process', 'steps', i], e.target.value)}
                />
                <button
                  type="button"
                  disabled={data.process.steps.length <= 2}
                  onClick={() =>
                    update(
                      ['process', 'steps'],
                      data.process.steps.filter((_, x) => x !== i)
                    )
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="add-step"
              onClick={() => update(['process', 'steps'], [...data.process.steps, 'New step'])}
            >
              + Add step
            </button>
            <button className="save-button" type="button" onClick={saveProcess}>
              Save process <Check size={18} />
            </button>
          </form>
        )}
        {tab === 'pricing' && (
          <form className="dash-box editor" onSubmit={saveSettings}>
            <div className="box-title">
              <div>
                <h2>Know before you load</h2>
                <p>Add, remove, or update services and prices in Kenyan shillings.</p>
              </div>
            </div>
            {data.settings.priceGroups.map((group, g) => (
              <fieldset className={`price-editor color-${g}`} key={g}>
                <input
                  className="group-name"
                  value={group.t}
                  onChange={(e) => update(['settings', 'priceGroups', g, 't'], e.target.value)}
                  aria-label={`Service category ${g + 1}`}
                />
                <div className="price-editor-labels" aria-hidden="true">
                  <span>Service</span>
                  <span>Price (KSh)</span>
                  <span>Save</span>
                  <span>Delete</span>
                </div>
                {group.items.map((item, i) => (
                  <div className="price-editor-row" key={`${g}-${i}`}>
                    <input
                      value={item[0]}
                      placeholder="Service or item"
                      aria-label={`Service name in ${group.t}, row ${i + 1}`}
                      onChange={(e) =>
                        update(['settings', 'priceGroups', g, 'items', i, 0], e.target.value)
                      }
                    />
                    <input
                      value={item[1]}
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      aria-label={`Price in KSh for ${item[0] || `service ${i + 1}`}`}
                      onChange={(e) =>
                        update(['settings', 'priceGroups', g, 'items', i, 1], e.target.value)
                      }
                    />
                    <button
                      className="save-price-button"
                      type="button"
                      disabled={savingPriceAction}
                      onClick={() => savePriceGroups(data.settings.priceGroups, 'Pricing updated.')}
                      aria-label={`Save ${item[0]}`}
                    >
                      <Check size={15} /> Save
                    </button>
                    <button
                      className="delete-price-button"
                      type="button"
                      disabled={group.items.length <= 1 || savingPriceAction}
                      onClick={() => setDeletePriceTarget({ groupIndex: g, itemIndex: i, name: item[0] })}
                      aria-label={`Delete ${item[0]}`}
                    >
                      <Trash2 size={15} /> Delete
                    </button>
                  </div>
                ))}
                <button
                  className="add-price"
                  type="button"
                  onClick={() => openNewServiceForm(g)}
                >
                  + Add New Service
                </button>
              </fieldset>
            ))}
            <button className="save-button" type="button" onClick={saveSettings}>
              Save pricing <Check size={18} />
            </button>
          </form>
        )}
        {tab === 'seo' && (
          <form className="dash-box editor seo-editor" onSubmit={saveSettings}>
            <div className="box-title">
              <div>
                <h2>Search engine settings</h2>
                <p>Control how the website appears in search results.</p>
              </div>
              <Search size={20} />
            </div>
            <label>
              Page title
              <input
                maxLength="70"
                value={data.settings.seo.title}
                onChange={(e) => update(['settings', 'seo', 'title'], e.target.value)}
              />
              <small>{data.settings.seo.title.length}/70</small>
            </label>
            <label>
              Meta description
              <textarea
                maxLength="170"
                rows="4"
                value={data.settings.seo.description}
                onChange={(e) => update(['settings', 'seo', 'description'], e.target.value)}
              />
              <small>{data.settings.seo.description.length}/170</small>
            </label>
            <div className="search-preview">
              <small>opendoorslaundromat.co.ke</small>
              <h3>{data.settings.seo.title}</h3>
              <p>{data.settings.seo.description}</p>
            </div>
            <button className="save-button" type="button" onClick={saveSettings}>
              Save SEO <Check size={18} />
            </button>
          </form>
        )}
      </div>
      {newServiceGroup != null && (
        <div className="price-dialog-backdrop">
          <section className="price-dialog" role="dialog" aria-modal="true" aria-labelledby="new-service-dialog-title">
            {confirmingNewService ? (
              <>
                <h2 id="new-service-dialog-title">Confirm new service</h2>
                <p>Are you sure you want to add <strong>{newServiceName}</strong> at <strong>KSh {Number(newServicePrice).toLocaleString()}</strong>?</p>
                <div className="price-dialog-actions">
                  <button className="price-dialog-secondary" type="button" onClick={() => setNewServiceGroup(null)} disabled={savingPriceAction}>Cancel</button>
                  <button className="price-dialog-primary" type="button" onClick={confirmAddNewService} disabled={savingPriceAction}>
                    {savingPriceAction ? 'Saving…' : 'Yes, Add Service'}
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={(event) => { event.preventDefault(); setConfirmingNewService(true); }}>
                <h2 id="new-service-dialog-title">Add New Service</h2>
                <p>Enter the service name and price before saving.</p>
                <label className="price-dialog-field">
                  Service name
                  <input autoFocus value={newServiceName} onChange={(event) => setNewServiceName(event.target.value)} required maxLength="100" />
                </label>
                <label className="price-dialog-field">
                  Price (KSh)
                  <input type="number" min="1" step="1" value={newServicePrice} onChange={(event) => setNewServicePrice(event.target.value)} required />
                </label>
                <div className="price-dialog-actions">
                  <button className="price-dialog-secondary" type="button" onClick={() => setNewServiceGroup(null)}>Cancel</button>
                  <button className="price-dialog-primary" type="submit">Review Service</button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
      {deletePriceTarget && (
        <div className="price-dialog-backdrop">
          <section className="price-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-service-dialog-title">
            <h2 id="delete-service-dialog-title">Delete service?</h2>
            <p>Are you sure you want to delete <strong>{deletePriceTarget.name}</strong>? This will remove it from the service list and save the change.</p>
            <div className="price-dialog-actions">
              <button className="price-dialog-secondary" type="button" onClick={() => setDeletePriceTarget(null)} disabled={savingPriceAction}>Cancel</button>
              <button className="price-dialog-danger" type="button" onClick={confirmDeletePrice} disabled={savingPriceAction}>
                {savingPriceAction ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Recent({ requests, onDelete }) {
  const [viewing, setViewing] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!viewing) return;
    function onKeyDown(event) {
      if (event.key === 'Escape') setViewing(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewing]);

  const reportRows = requests.map((item) => ({
    ...item,
    day: String(item.createdAt || '').slice(0, 10) || '—',
    services: item.items?.length
      ? item.items.map((service) => ({
          name: service.service || service.name || 'Service',
          quantity: Number(service.kg ?? service.quantity ?? 1) || 1,
        }))
      : [{ name: item.service || 'Service', quantity: 1 }],
    paymentState: String(item.paymentStatus || 'pending').toLowerCase() === 'paid'
      ? 'paid'
      : 'pending',
    amount: Number(item.estimatedTotal || 0),
  }));

  return (
    <section className="dash-box request-list">
      <div className="box-title">
        <div>
          <h2>Customer requests</h2>
          <p>Most recent pickup and service enquiries</p>
        </div>
      </div>
      {requests.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={28} />
          <h3>No requests yet</h3>
          <p>New customer submissions will appear here.</p>
        </div>
      ) : (
        <div className="rpt-table-card dashboard-request-report">
          <div className="rpt-table-wrap">
            <table className="rpt-table">
              <thead>
                <tr>
                  <th>Date</th><th>Customer</th><th>Services</th><th>Contact</th>
                  <th>Served By</th><th>Payment Status</th><th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map((item) => (
                  <tr key={item.id}>
                    <td className="rpt-date">{item.day}</td>
                    <td className="rpt-customer">
                      <button
                        className="report-view-button"
                        onClick={() => setViewing(item)}
                        aria-label={`View request for ${item.name}`}
                      >
                        {item.name || 'Walk-in'}
                      </button>
                    </td>
                    <td>
                      <ul className="rpt-services">
                        {item.services.map((service, index) => (
                          <li key={`${item.id}-${index}`}>{service.name} ×{service.quantity}{item.items?.[index]?.color ? ` · ${item.items[index].color}` : ''}</li>
                        ))}
                      </ul>
                    </td>
                    <td className="rpt-contact">{item.phone || '—'}</td>
                    <td>{item.servedBy || '—'}</td>
                    <td><span className={`rpt-pill ${item.paymentState}`}>{item.paymentState === 'paid' ? 'Paid' : 'Pending'}</span></td>
                    <td className="num">KSh {item.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {viewing && (
        <div
          className="request-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Request details"
          onClick={() => setViewing(null)}
        >
          <div onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setViewing(null)} aria-label="Close dialog">
              <X size={16} />
            </button>
            <p className="eyebrow">{viewing.receiptNumber || 'Customer request'}</p>
            <h2>{viewing.name}</h2>
            <div className="request-detail-grid">
              <span>
                <small>Phone</small>
                <b>{viewing.phone}</b>
              </span>
              <span>
                <small>Pickup area</small>
                <b>{viewing.location || 'Not provided'}</b>
              </span>
              <span>
                <small>Payment</small>
                <b>{viewing.paymentMethod || 'Not selected'}</b>
                {viewing.mpesaPhone && <em>{viewing.mpesaPhone}</em>}
              </span>
              <span>
                <small>Status</small>
                <b>{viewing.status}</b>
              </span>
            </div>
            {viewing.items?.length ? (
              <div className="modal-services">
                {viewing.items.map((service, index) => (
                  <div key={index}>
                    <span>
                      {service.service} × {service.kg}{service.color ? ` · ${service.color}` : ''}
                    </span>
                    <b>KSh {service.subtotal.toLocaleString()}</b>
                  </div>
                ))}
                <div className="modal-total">
                  <span>Estimated total</span>
                  <b>KSh {viewing.estimatedTotal.toLocaleString()}</b>
                </div>
              </div>
            ) : (
              <p>{viewing.service}</p>
            )}
            <div className="modal-notes">
              <small>Additional details</small>
              <p>{viewing.notes || 'No additional details provided.'}</p>
            </div>
            <div className="modal-actions">
              {viewing.receiptToken && (
                <button
                  onClick={() => navigate(`/receipt/${viewing.receiptToken}`)}
                  className="modal-receipt-link"
                >
                  Open receipt <ArrowUpRight size={18} />
                </button>
              )}
              {viewing.status === 'completed' && (
                <button
                  onClick={() => {
                    setViewing(null);
                    onDelete(viewing.id);
                  }}
                >
                  <Trash2 size={16} /> Remove completed request
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
