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
  try {
    const docRef = doc(db, 'live_shares', code);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data() as LiveShareSession;
    return data;
  } catch (err) {
    console.warn(`Error fetching live share ${code}:`, err);
    return null;
  }
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

  const docRef = doc(db, 'live_shares', shareId);
  await setDoc(docRef, session);

  // Store in local storage to resume if browser refreshes
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
  const docRef = doc(db, 'live_shares', shareId);
  await updateDoc(docRef, {
    coordinates,
    updatedAt: new Date().toISOString(),
  });
}

export async function stopLiveShare(shareId: string): Promise<void> {
  if (!shareId) return;
  try {
    const docRef = doc(db, 'live_shares', shareId);
    await updateDoc(docRef, {
      isActive: false,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('Error updating live share stop state:', e);
  } finally {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(MEETUP_STORAGE_KEY);
      } catch (err) {
        console.warn('Could not remove meetup storage item:', err);
      }
    }
  }
}

export function subscribeToShare(
  shareId: string,
  onData: (session: LiveShareSession | null) => void,
  onError?: (err: any) => void
): () => void {
  if (!shareId) return () => {};
  const docRef = doc(db, 'live_shares', shareId);
  
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
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
      console.warn(`Live share snapshot error on ${shareId}:`, error);
      if (onError) onError(error);
    }
  );
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
