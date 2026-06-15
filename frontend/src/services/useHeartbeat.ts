import { useEffect } from 'react';

const API = 'https://waheed-system-production.up.railway.app';
const RESTAURANT_ID = 1;
const INTERVAL_MS = 60_000; // 60 seconds — server timeout is 90 s

async function sendHeartbeat(): Promise<void> {
  if (!navigator.onLine) return;
  try {
    await fetch(`${API}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: RESTAURANT_ID }),
    });
  } catch {
    // Silent — network error means the device is offline anyway
  }
}

export function useHeartbeat(): void {
  useEffect(() => {
    sendHeartbeat(); // Fire immediately on mount
    const id = setInterval(sendHeartbeat, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
}
