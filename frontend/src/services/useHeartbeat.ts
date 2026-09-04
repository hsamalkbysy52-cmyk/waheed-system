import { useEffect } from 'react';
import { authFetch } from '@/lib/apiFetch';

const INTERVAL_MS = 60_000; // 60 seconds — server timeout is 90 s

async function sendHeartbeat(): Promise<void> {
  if (!navigator.onLine) return;
  if (!localStorage.getItem("token")) return; // no session — nothing to heartbeat
  try {
    // restaurant_id يأتي من JWT عبر authFetch — الباك إند ما عاد يقبله من الجسم
    await authFetch(`/heartbeat`, { method: 'POST' });
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
