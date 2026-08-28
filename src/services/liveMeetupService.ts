import { doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { LiveShareSession } from '../types';

export const MEETUP_STORAGE_KEY = 'campusgryd_active_meetup_session';
export const SAVED_FRIENDS_KEY = 'campusgryd_saved_friend_codes';

// Helper to generate a clean, readable campus share code
export function generateMeetupCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let randomPart = '';
  for (let i = 0; i < 5; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `RSU-${randomPart}`;
}

export function normalizeShareCode(input: string): string {
  if (!input) return '';
  let cleaned = input.trim();
  if (cleaned.includes('meetup=')) {
    try {
      const url = new URL(cleaned);
      cleaned = url.searchParams.get('meetup') || cleaned;
    } catch {
      const match = cleaned.match(/meetup=([A-Za-z0-9_\-]+)/);
      if (match) cleaned = match[1];
    }
  }
  cleaned = cleaned.toUpperCase().replace(/\s+/g, '');
  if (!cleaned.startsWith('RSU-') && cleaned.length >= 4 && !cleaned.includes('-')) {
    cleaned = `RSU-${cleaned}`;
  }
  return cleaned;
}

export async function fetchLiveShare(shareId: string): Promise<LiveShareSession | null> {
  const code = normalizeShareCode(shareId);
  if (!code) return null;
  
  // 1. Try client Firestore first
  try {
    const docRef = doc(db, 'live_shares', code);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as LiveShareSession;
    }
  } catch (err) {
    console.warn(`Firestore read notice for ${code}, querying server cache:`, err);
  }

  // 2. Fallback to server API
  try {
    const resp = await fetch(`/api/live_share/${encodeURIComponent(code)}`);
    if (resp.ok) {
      const result = await resp.json();
      if (result && result.session) {
        return result.session as LiveShareSession;
      }
    }
  } catch (apiErr) {
    console.warn(`Server API live share fetch notice for ${code}:`, apiErr);
  }

  return null;
}

export interface StartShareParams {
  userId: string;
  userName: string;
  userPhoto?: string;
  userEmail?: string;
  coordinates: [number, number];
  durationMinutes: number;
  statusNote?: string;
}

export async function createLiveShare(params: StartShareParams): Promise<LiveShareSession> {
  const shareId = generateMeetupCode();
  const now = Date.now();
  const expiresAt = now + (params.durationMinutes * 60 * 1000);
  const nowIso = new Date(now).toISOString();

  const session: LiveShareSession = {
    id: shareId,
    userId: params.userId,
    userName: params.userName || 'RSU Student',
    userPhoto: params.userPhoto || '',
    userEmail: params.userEmail || '',
    coordinates: params.coordinates,
    statusNote: (params.statusNote || '').slice(0, 100),
    expiresAt,
    isActive: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // 1. Attempt client Firestore write
  let firestoreSaved = false;
  try {
    const docRef = doc(db, 'live_shares', shareId);
    await setDoc(docRef, session);
    firestoreSaved = true;
  } catch (fsErr: any) {
    console.warn("Client Firestore write notice, routing via server sync:", fsErr?.message || fsErr);
  }

  // 2. Broadcast to server API (ensures sync across clients even if direct rules/offline kick in)
  try {
    await fetch('/api/live_share/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session)
    });
  } catch (apiErr) {
    if (!firestoreSaved) {
      console.warn("Server API sync notice:", apiErr);
    }
  }

  // 3. Store in local storage to resume if browser refreshes
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(MEETUP_STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
      console.warn('Could not save meetup session locally:', e);
    }
  }

  return session;
}

export async function updateLiveLocation(shareId: string, coordinates: [number, number]): Promise<void> {
  if (!shareId) return;
  const isoTime = new Date().toISOString();

  // Try Firestore client
  try {
    const docRef = doc(db, 'live_shares', shareId);
    await updateDoc(docRef, {
      coordinates,
      updatedAt: isoTime,
    });
  } catch (fsErr) {
    // Silently route through server
  }

  // Sync to server API
  try {
    await fetch('/api/live_share/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: shareId, coordinates, updatedAt: isoTime })
    });
  } catch {}
}

export async function stopLiveShare(shareId: string): Promise<void> {
  if (!shareId) return;
  const isoTime = new Date().toISOString();
  
  try {
    const docRef = doc(db, 'live_shares', shareId);
    await updateDoc(docRef, {
      isActive: false,
      updatedAt: isoTime,
    });
  } catch (e) {
    // Silently route through server
  }

  try {
    await fetch('/api/live_share/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: shareId })
    });
  } catch {}

  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(MEETUP_STORAGE_KEY);
    } catch (err) {
      console.warn('Could not remove meetup storage item:', err);
    }
  }
}

export function subscribeToShare(
  shareId: string,
  onData: (session: LiveShareSession | null) => void,
  onError?: (err: any) => void
): () => void {
  if (!shareId) return () => {};
  const code = normalizeShareCode(shareId);
  const docRef = doc(db, 'live_shares', code);
  
  let pollingInterval: any = null;

  const startPollingFallback = () => {
    if (pollingInterval) return;
    pollingInterval = setInterval(async () => {
      const data = await fetchLiveShare(code);
      if (data) {
        if (!data.isActive || Date.now() > data.expiresAt) {
          onData({ ...data, isActive: false });
        } else {
          onData(data);
        }
      } else {
        onData(null);
      }
    }, 4000);
  };

  const unsubscribe = onSnapshot(
    docRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        // Double-check with server API before concluding not found
        fetchLiveShare(code).then(serverData => {
          if (serverData) {
            onData(serverData);
          } else {
            onData(null);
          }
        });
        return;
      }
      const data = snapshot.data() as LiveShareSession;
      // Check if session is expired or inactive
      if (!data.isActive || Date.now() > data.expiresAt) {
        onData({ ...data, isActive: false });
      } else {
        onData(data);
      }
    },
    (error) => {
      console.warn(`Firestore snapshot notice for ${code}, switching to resilient sync:`, error.message);
      startPollingFallback();
      // Fetch immediately once
      fetchLiveShare(code).then(serverData => {
        if (serverData) onData(serverData);
      });
    }
  );

  return () => {
    unsubscribe();
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
  };
}

export function getSavedFriendCodes(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(SAVED_FRIENDS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function saveFriendCode(code: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const current = getSavedFriendCodes();
    const formatted = code.trim().toUpperCase();
    if (formatted && !current.includes(formatted)) {
      const updated = [formatted, ...current].slice(0, 10);
      localStorage.setItem(SAVED_FRIENDS_KEY, JSON.stringify(updated));
      return updated;
    }
    return current;
  } catch {
    return [];
  }
}

export function removeFriendCode(code: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const current = getSavedFriendCodes();
    const updated = current.filter(c => c !== code.trim().toUpperCase());
    localStorage.setItem(SAVED_FRIENDS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function buildMeetupShareUrl(code: string): string {
  if (typeof window === 'undefined') return `https://campusgryd.rsu.edu.ng/?meetup=${code}`;
  const url = new URL(window.location.href);
  url.searchParams.set('meetup', code);
  return url.toString();
}
