import { useEffect } from 'react';
import { getPendingSyncOrders, updateOrderSyncStatus, type LocalOrder } from './db';

const API = 'https://waheed-system-production.up.railway.app';

// Module-level mutex — one sync at a time across all hook instances
let isSyncing = false;

async function uploadOrder(order: LocalOrder): Promise<'synced' | 'failed_permanent' | 'failed_retry'> {
  const body = {
    table_number: order.table_number,
    items: order.items,
    cashier: order.cashier,
    notes: order.notes,
    payment_method: order.payment_method ?? null,
    client_id: order.local_uuid,
  };

  let response: Response;
  try {
    response = await fetch(`${API}/orders/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Network error — stop sync, retry on next online event
    return 'failed_retry';
  }

  if (response.ok) {
    const data = await response.json() as { order_id: number };
    await updateOrderSyncStatus(order.localId!, 'Synced', data.order_id);
    return 'synced';
  }

  if (response.status >= 400 && response.status < 500) {
    // Server rejected permanently (bad request, conflict, etc.) — don't retry
    await updateOrderSyncStatus(order.localId!, 'SyncFailed');
    return 'failed_permanent';
  }

  // 5xx — server error, retry later
  return 'failed_retry';
}

async function runSync(): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const pending = await getPendingSyncOrders();
    if (pending.length === 0) return;

    // Oldest first — localId is autoIncrement so ascending = chronological order
    const sorted = pending.slice().sort((a, b) => (a.localId ?? 0) - (b.localId ?? 0));

    for (const order of sorted) {
      const result = await uploadOrder(order);
      if (result === 'failed_retry') {
        // Connection lost mid-sync — stop and let the next online event retry
        break;
      }
      // 'synced' and 'failed_permanent' both continue to the next order
    }
  } finally {
    isSyncing = false;
  }
}

export function useSyncEngine(): void {
  useEffect(() => {
    const handleOnline = () => runSync();
    window.addEventListener('online', handleOnline);

    // Also attempt sync on mount — covers orders that failed in a previous session
    if (navigator.onLine) runSync();

    return () => window.removeEventListener('online', handleOnline);
  }, []);
}
