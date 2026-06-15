import { openDB, type IDBPDatabase } from 'idb';

// ── Types ────────────────────────────────────────────────────────────────────

export type SyncStatus = 'LocalOnly' | 'Synced' | 'SyncFailed';

export interface LocalOrderItem {
  name: string;
  price: number;
  category: string;
  modifiers?: { name: string }[];
}

export interface LocalOrder {
  /** Auto-incremented by IndexedDB. Undefined before first save. */
  localId?: number;
  /** Client-generated UUID — used as idempotency key when syncing to server. */
  local_uuid: string;
  table_number: number;
  total_price: number;
  items: LocalOrderItem[];
  cashier: string;
  notes: string;
  payment_method?: string | null;
  created_at: string;
  sync_status: SyncStatus;
  /** The id returned by the server after a successful sync. */
  server_id?: number;
}

// ── Schema ───────────────────────────────────────────────────────────────────

interface WaheedDB {
  orders: {
    key: number;
    value: LocalOrder;
    indexes: { by_sync_status: SyncStatus };
  };
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _db: IDBPDatabase<WaheedDB> | null = null;

async function getDB(): Promise<IDBPDatabase<WaheedDB>> {
  if (_db) return _db;

  _db = await openDB<WaheedDB>('waheed-db', 1, {
    upgrade(db) {
      const store = db.createObjectStore('orders', {
        keyPath: 'localId',
        autoIncrement: true,
      });
      store.createIndex('by_sync_status', 'sync_status');
    },
  });

  return _db;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Persist a new order locally. Returns the assigned localId. */
export async function saveLocalOrder(
  order: Omit<LocalOrder, 'localId' | 'sync_status'>
): Promise<number> {
  const db = await getDB();
  const record: LocalOrder = { ...order, sync_status: 'LocalOnly' };
  return db.add('orders', record) as Promise<number>;
}

/** Return all orders that have not yet been synced to the server. */
export async function getPendingSyncOrders(): Promise<LocalOrder[]> {
  const db = await getDB();
  return db.getAllFromIndex('orders', 'by_sync_status', 'LocalOnly');
}

/** Update the sync status (and optionally store the server-assigned id). */
export async function updateOrderSyncStatus(
  localId: number,
  status: SyncStatus,
  serverId?: number
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('orders', 'readwrite');
  const store = tx.objectStore('orders');

  const record = await store.get(localId);
  if (!record) {
    await tx.done;
    return;
  }

  record.sync_status = status;
  if (serverId !== undefined) record.server_id = serverId;

  await store.put(record);
  await tx.done;
}

/** Retrieve a single order by its local id. */
export async function getOrderByLocalId(
  localId: number
): Promise<LocalOrder | undefined> {
  const db = await getDB();
  return db.get('orders', localId);
}
