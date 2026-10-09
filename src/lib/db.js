import Dexie from 'dexie';

export class OpenDoorsDB extends Dexie {
  customers;
  orders;
  payments;
  products;
  outbox;
  syncLog;
  settings;
  receipts;

  constructor() {
    super('OpenDoorsPOS');
    this.version(2).stores({
      customers: '++id, externalId, clientId, name, phone, email, address, notes, createdAt, updatedAt, syncStatus, lastSyncedAt',
      orders: '++id, externalId, clientId, customerId, service, status, totalAmount, paidAmount, createdAt, updatedAt, syncStatus, lastSyncedAt, receiptNumber, receiptToken',
      payments: '++id, externalId, clientId, orderId, amount, method, reference, createdAt, updatedAt, syncStatus, lastSyncedAt',
      products: '++id, externalId, name, price, category, unit, createdAt, updatedAt, syncStatus, lastSyncedAt',
      outbox: '++id, entityType, entityId, clientId, action, payload, idempotencyKey, status, retryCount, createdAt, syncedAt, error',
      syncLog: '++id, entityType, entityId, action, status, timestamp, details',
      settings: 'key, value, updatedAt',
      receipts: '++id, orderId, receiptNumber, receiptToken, pdfData, createdAt, syncedAt',
    });
  }
}

export const db = new OpenDoorsDB();

export async function initDB() {
  await db.open();
}

export async function addToOutbox(entityType, entityId, action, payload, idempotencyKey = null) {
  const id = await db.outbox.add({
    entityType,
    entityId,
    clientId: `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    action,
    payload: JSON.stringify(payload),
    idempotencyKey,
    status: 'pending',
    retryCount: 0,
    createdAt: new Date().toISOString(),
    syncedAt: null,
    error: null,
  });
  return id;
}

export async function markOutboxSynced(outboxId) {
  await db.outbox.update(outboxId, {
    status: 'synced',
    syncedAt: new Date().toISOString(),
    error: null,
  });
}

/**
 * Record a failed sync attempt.
 * Transient failures keep the item `pending` (with an incremented retry
 * count) so automatic retry picks it up again. Only when attempts reach
 * `maxRetries`, or the failure is permanent (e.g. validation 4xx — passed
 * as `permanent: true` by the caller), does the item move to `failed`.
 */
export async function markOutboxFailed(outboxId, error, { maxRetries = 5, permanent = false } = {}) {
  const item = await db.outbox.get(outboxId);
  if (!item) return;
  const retryCount = (item.retryCount || 0) + 1;
  const exhausted = permanent || retryCount >= maxRetries;
  await db.outbox.update(outboxId, {
    status: exhausted ? 'failed' : 'pending',
    error: error.message || String(error),
    retryCount,
  });
}

export async function getPendingOutboxItems() {
  return db.outbox.where('status').equals('pending').sortBy('createdAt');
}

export async function getFailedOutboxItems() {
  return db.outbox.where('status').equals('failed').sortBy('createdAt');
}

export async function getOutboxStats() {
  const pending = await db.outbox.where('status').equals('pending').count();
  const synced = await db.outbox.where('status').equals('synced').count();
  const failed = await db.outbox.where('status').equals('failed').count();
  return { pending, synced, failed };
}

export async function setLocalSetting(key, value) {
  await db.settings.put({ key, value, updatedAt: new Date().toISOString() });
}

export async function getLocalSetting(key) {
  const record = await db.settings.get(key);
  return record ? record.value : null;
}

export async function setCustomerSyncStatus(externalId, syncStatus, lastSyncedAt = new Date().toISOString()) {
  const customer = await db.customers.get({ externalId });
  if (customer) {
    await db.customers.update(customer.id, { syncStatus, lastSyncedAt });
  }
}

export async function setOrderSyncStatus(externalId, syncStatus, lastSyncedAt = new Date().toISOString()) {
  const order = await db.orders.get({ externalId });
  if (order) {
    await db.orders.update(order.id, { syncStatus, lastSyncedAt });
  }
}

export async function getOfflineCustomers() {
  return db.customers.where('syncStatus').equals('pending').toArray();
}

export async function getOfflineOrders() {
  return db.orders.where('syncStatus').equals('pending').toArray();
}

export async function addLocalCustomer(customer) {
  const id = await db.customers.add({
    ...customer,
    clientId: customer.clientId || `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    syncStatus: 'pending',
    createdAt: customer.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSyncedAt: null,
  });
  return id;
}

export async function addLocalOrder(order) {
  const id = await db.orders.add({
    ...order,
    clientId: order.clientId || `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    syncStatus: 'pending',
    createdAt: order.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSyncedAt: null,
  });
  return id;
}

export async function addLocalPayment(payment) {
  const id = await db.payments.add({
    ...payment,
    clientId: payment.clientId || `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    syncStatus: 'pending',
    createdAt: payment.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSyncedAt: null,
  });
  return id;
}

/**
 * Atomically persist a complete POS sale: order + optional payment + their
 * outbox entries, in a single IndexedDB transaction. Either everything is
 * queued or nothing is — no orphan orders, no orphan outbox rows.
 */
export function newClientId(prefix = 'client') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function addOrderTransaction({ order, payment = null }) {
  const orderClientId = order.clientId || newClientId('client');
  const now = new Date().toISOString();
  const paymentClientId = payment ? payment.clientId || newClientId('client') : null;

  const result = await db.transaction('rw', db.orders, db.payments, db.outbox, async () => {
    const orderId = await db.orders.add({
      ...order,
      clientId: orderClientId,
      syncStatus: 'pending',
      createdAt: order.createdAt || now,
      updatedAt: now,
      lastSyncedAt: null,
    });

    const outboxIds = [];
    outboxIds.push(
      await db.outbox.add({
        entityType: 'order',
        entityId: orderClientId,
        clientId: orderClientId,
        action: 'create',
        payload: JSON.stringify(order),
        idempotencyKey: `order_${orderClientId}_create_${Date.now()}`,
        status: 'pending',
        retryCount: 0,
        createdAt: now,
        syncedAt: null,
        error: null,
      })
    );

    let paymentId = null;
    if (payment) {
      paymentId = await db.payments.add({
        ...payment,
        orderId,
        clientId: paymentClientId,
        syncStatus: 'pending',
        createdAt: payment.createdAt || now,
        updatedAt: now,
        lastSyncedAt: null,
      });
      outboxIds.push(
        await db.outbox.add({
          entityType: 'payment',
          entityId: paymentClientId,
          clientId: paymentClientId,
          action: 'create',
          payload: JSON.stringify({ ...payment, orderClientId }),
          idempotencyKey: `payment_${paymentClientId}_create_${Date.now()}`,
          status: 'pending',
          retryCount: 0,
          createdAt: now,
          syncedAt: null,
          error: null,
        })
      );
    }

    return { orderId, paymentId, outboxIds, orderClientId, paymentClientId };
  });

  return result;
}

export async function updateLocalOrder(orderId, updates, { markPending = true } = {}) {
  await db.orders.update(orderId, {
    ...updates,
    updatedAt: new Date().toISOString(),
    ...(markPending ? { syncStatus: 'pending' } : {}),
  });
}

export async function getOrderById(id) {
  return db.orders.get(id);
}

export async function getCustomerById(id) {
  return db.customers.get(id);
}

export async function getAllCustomers() {
  return db.customers.toArray();
}

export async function getAllOrders() {
  return db.orders.toArray();
}

export async function getAllPayments() {
  return db.payments.toArray();
}

export async function getOrdersByCustomer(customerId) {
  return db.orders.where('customerId').equals(customerId).toArray();
}

export async function getOrdersByStatus(status) {
  return db.orders.where('status').equals(status).toArray();
}

export async function getRevenueByDateRange(startDate, endDate) {
  const orders = await db.orders
    .where('createdAt')
    .between(startDate, endDate, true, true)
    .toArray();
  return orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
}

export async function getOrdersCount() {
  return db.orders.count();
}

export async function getCustomersCount() {
  return db.customers.count();
}

export async function getPaymentsCount() {
  return db.payments.count();
}

export async function saveReceiptToLocal(orderId, receiptNumber, receiptToken, pdfData) {
  await db.receipts.add({
    orderId,
    receiptNumber,
    receiptToken,
    pdfData,
    createdAt: new Date().toISOString(),
    syncedAt: null,
  });
}

export async function getReceiptByOrderId(orderId) {
  return db.receipts.where('orderId').equals(orderId).first();
}

export async function getPendingReceipts() {
  return db.receipts.where('syncedAt').equals(null).toArray();
}

export async function markReceiptSynced(receiptId) {
  await db.receipts.update(receiptId, { syncedAt: new Date().toISOString() });
}

export async function addSyncLogEntry(entityType, entityId, action, status, details = '') {
  await db.syncLog.add({
    entityType,
    entityId,
    action,
    status,
    timestamp: new Date().toISOString(),
    details,
  });
}

export async function getSyncLog(limit = 50) {
  return db.syncLog.orderBy('timestamp').reverse().limit(limit).toArray();
}

/**
 * Mirror server booking requests into Dexie so POS lists render instantly
 * and keep working offline. Server rows are keyed `server_<id>` and marked
 * synced; locally-created pending rows are never touched.
 */
export async function upsertServerOrders(serverRequests) {
  const now = new Date().toISOString();
  let mirrored = 0;
  const serverIds = new Set((serverRequests || []).map((req) => req?.id).filter(Boolean));
  for (const req of serverRequests || []) {
    if (!req || !req.id) continue;
    const clientId = `server_${req.id}`;
    const existing = await db.orders.where('clientId').equals(clientId).first();
    // Reconcile: this device may already hold this booking as the local row
    // created at sale time (patched with externalId on sync ack). Updating
    // that row in place — instead of adding a second server_ mirror — is
    // what keeps each order visible exactly once.
    const localRow = existing
      || await db.orders.where('externalId').equals(req.id).first();
    const row = {
      clientId,
      externalId: req.id,
      customerId: null,
      customerName: req.name || 'Walk-in',
      phone: req.phone || '',
      servedBy: req.servedBy || '',
      location: req.location || '',
      service: req.service || '',
      totalAmount: Number(req.estimatedTotal) || 0,
      paidAmount: null,
      quantity: (req.items || []).reduce((s, i) => s + (Number(i.kg) || 0), 0) || 1,
      status: req.status || 'new',
      paymentStatus: req.paymentStatus || 'pending',
      paymentMethod: req.paymentMethod || null,
      paymentReference: req.paymentReference || '',
      items: (req.items || []).map((i) => ({
        name: i.service,
        service: i.service,
        color: i.color || '',
        price: i.unitPrice,
        unitPrice: i.unitPrice,
        quantity: i.kg,
        kg: i.kg,
        originalSubtotal: i.originalSubtotal ?? Number(i.unitPrice) * Number(i.kg),
        discountAllowed: Boolean(i.discountAllowed),
        discountPercent: Number(i.discountPercent) || 0,
        discountAmount: Number(i.discountAmount) || 0,
        subtotal: i.subtotal,
      })),
      notes: req.notes || '',
      receiptNumber: req.receiptNumber || null,
      receiptToken: req.receiptToken || null,
      syncStatus: 'synced',
      createdAt: req.createdAt || now,
      updatedAt: now,
      lastSyncedAt: now,
    };
    if (localRow) {
      // Keep the row's original clientId so the sale-time row and the
      // server mirror never coexist as two visible orders.
      const { clientId: _ignored, ...patch } = row;
      await db.orders.update(localRow.id, { ...patch, externalId: req.id });
      // Drop a stray server_ mirror if the reconciled row is the local one.
      if (existing && existing.id !== localRow.id) {
        await db.orders.delete(existing.id);
      }
    } else {
      await db.orders.add(row);
    }
    mirrored += 1;
  }
  // Remove server-backed rows absent from the latest authoritative snapshot.
  const staleServerRows = await db.orders.toArray();
  for (const order of staleServerRows) {
    if (order.externalId && !serverIds.has(order.externalId)) {
      await db.orders.delete(order.id);
    }
  }
  // Sweep: no two rows may claim the same server booking. Prefer the
  // sale-time local row; drop redundant server_ mirrors.
  const allOrders = await db.orders.toArray();
  const seenExternal = new Map();
  for (const order of allOrders) {
    if (!order.externalId) continue;
    if (!seenExternal.has(order.externalId)) {
      seenExternal.set(order.externalId, order);
    } else {
      const keeper = seenExternal.get(order.externalId);
      const keeperIsMirror = String(keeper.clientId || '').startsWith('server_');
      const orderIsMirror = String(order.clientId || '').startsWith('server_');
      const keepLocal = (keeperIsMirror && !orderIsMirror) ? order : keeper;
      const dropRow = keepLocal === keeper ? order : keeper;
      seenExternal.set(order.externalId, keepLocal);
      await db.orders.delete(dropRow.id);
    }
  }
  return { mirrored };
}

/** Mirror server-known customers without deleting saved customers during sync. */
export async function upsertServerCustomers(serverRequests) {
  const now = new Date().toISOString();
  const normalizePhone = (value) => String(value || '').replace(/[\s-]/g, '');
  let mirrored = 0;
  const serverRows = (serverRequests || []).filter((req) => req?.phone);
  for (const req of serverRows) {
    const normalizedPhone = normalizePhone(req.phone);
    const customer = {
      clientId: req.clientId || `server_${normalizedPhone}`,
      externalId: req.id || null,
      name: req.name || 'Walk-in',
      phone: normalizedPhone,
      email: req.email || '',
      address: req.location || req.address || '',
      servedBy: req.servedBy || '',
      gender: req.gender || '',
      syncStatus: 'synced',
      createdAt: req.createdAt || now,
      updatedAt: req.updatedAt || now,
      lastSyncedAt: now,
    };
    const existing = (await db.customers.toArray()).find((c) => normalizePhone(c.phone) === normalizedPhone);
    if (existing?.syncStatus === 'pending') continue;
    if (existing) {
      await db.customers.update(existing.id, { ...customer, clientId: existing.clientId });
    } else {
      await db.customers.add(customer);
    }
    mirrored += 1;
  }
  return { mirrored };
}
