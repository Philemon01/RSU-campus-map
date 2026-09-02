import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { CampusEvent, campusEvents as initialDefaultEvents, isUserAdmin } from '../data/events';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errCode = (error as any)?.code;

  if (errCode === 'unavailable' || errMsg.includes('unavailable') || errMsg.includes('Could not reach Cloud Firestore backend')) {
    console.warn(`Firestore operating in offline mode during ${operationType} on ${path}.`);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

export function useCampusEvents(currentUser: User | null) {
  const [firestoreEvents, setFirestoreEvents] = useState<CampusEvent[]>([]);
  const [deletedEventIds, setDeletedEventIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('rsu_deleted_event_ids');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // User RSVP'd event IDs
  const [rsvpedEventIds, setRsvpedEventIds] = useState<string[]>(() => {
    if (!currentUser?.uid) return [];
    try {
      const stored = localStorage.getItem(`rsu_user_rsvps_${currentUser.uid}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to real-time events from Firestore
  useEffect(() => {
    let unsubscribeEvents: (() => void) | undefined;
    let unsubscribeDeleted: (() => void) | undefined;

    try {
      const eventsRef = collection(db, 'events');
      unsubscribeEvents = onSnapshot(
        eventsRef,
        (snapshot) => {
          const loaded: CampusEvent[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as any;
            loaded.push({
              id: docSnap.id,
              title: data.title || '',
              description: data.description || '',
              date: data.date || '',
              category: data.category || 'other',
              locationId: data.locationId || 'amphitheatre',
              startTime: data.startTime || '',
              endTime: data.endTime || '',
              organizer: data.organizer || '',
              creatorId: data.creatorId,
              creatorEmail: data.creatorEmail,
              createdAt: data.createdAt,
              isCustom: true
            });
          });
          setFirestoreEvents(loaded);
          setIsLoading(false);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'events');
          setIsLoading(false);
        }
      );

      const deletedRef = collection(db, 'deleted_events');
      unsubscribeDeleted = onSnapshot(
        deletedRef,
        (snapshot) => {
          const deleted: string[] = [];
          snapshot.forEach((docSnap) => {
            deleted.push(docSnap.id);
          });
          setDeletedEventIds(prev => {
            const combined = Array.from(new Set([...prev, ...deleted]));
            if (combined.length === prev.length && combined.every((id, idx) => id === prev[idx])) {
              return prev;
            }
            try {
              localStorage.setItem('rsu_deleted_event_ids', JSON.stringify(combined));
            } catch {}
            return combined;
          });
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'deleted_events');
        }
      );
    } catch (err) {
      console.warn("Could not attach Firestore listeners for events:", err);
      setIsLoading(false);
    }

    return () => {
      if (unsubscribeEvents) unsubscribeEvents();
      if (unsubscribeDeleted) unsubscribeDeleted();
    };
  }, []);

  // Subscribe to user RSVP collection
  useEffect(() => {
    if (!currentUser?.uid) {
      setRsvpedEventIds(prev => prev.length === 0 ? prev : []);
      return;
    }

    // Initialize from localStorage first
    try {
      const stored = localStorage.getItem(`rsu_user_rsvps_${currentUser.uid}`);
      if (stored) {
        setRsvpedEventIds(JSON.parse(stored));
      }
    } catch {}

    let unsubscribeRsvps: (() => void) | undefined;
    try {
      const rsvpRef = collection(db, 'users', currentUser.uid, 'rsvps');
      unsubscribeRsvps = onSnapshot(
        rsvpRef,
        (snapshot) => {
          const rsvps: string[] = [];
          snapshot.forEach((docSnap) => {
            rsvps.push(docSnap.id);
          });
          setRsvpedEventIds(prev => {
            if (rsvps.length === prev.length && rsvps.every((id, idx) => id === prev[idx])) {
              return prev;
            }
            return rsvps;
          });
          try {
            localStorage.setItem(`rsu_user_rsvps_${currentUser.uid}`, JSON.stringify(rsvps));
          } catch {}
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, `users/${currentUser.uid}/rsvps`);
        }
      );
    } catch (err) {
      console.warn("Could not attach RSVP listener:", err);
    }

    return () => {
      if (unsubscribeRsvps) unsubscribeRsvps();
    };
  }, [currentUser?.uid]);

  // Compute merged events list
  const allEvents: CampusEvent[] = useMemo(() => [
    // Include default events that have not been deleted
    ...initialDefaultEvents.filter(e => !deletedEventIds.includes(e.id)),
    // Include user and admin events from Firestore that have not been deleted
    ...firestoreEvents.filter(e => !deletedEventIds.includes(e.id))
  ].sort((a, b) => {
    // Sort by date then time
    const dateComp = (a.date || '').localeCompare(b.date || '');
    if (dateComp !== 0) return dateComp;
    return (a.startTime || '').localeCompare(b.startTime || '');
  }), [deletedEventIds, firestoreEvents]);

  const isAdmin = isUserAdmin(currentUser);

  // Check if current user can delete a specific event
  const canDeleteEvent = useCallback((event: CampusEvent): boolean => {
    if (!currentUser) return false;
    if (isAdmin) return true; // Admin can delete ANY event
    if (event.creatorId && event.creatorId === currentUser.uid) return true;
    if (event.creatorEmail && currentUser.email && event.creatorEmail.toLowerCase() === currentUser.email.toLowerCase()) return true;
    return false;
  }, [currentUser, isAdmin]);

  // Check if user has RSVPed to an event
  const isRsvped = useCallback((eventId: string): boolean => {
    return rsvpedEventIds.includes(eventId);
  }, [rsvpedEventIds]);

  // Toggle RSVP for an event
  const toggleRsvp = useCallback(async (event: CampusEvent): Promise<boolean> => {
    if (!currentUser) {
      throw new Error("You must be signed in with your Google account to RSVP to events.");
    }

    const currentlyRsvped = rsvpedEventIds.includes(event.id);
    const nextState = !currentlyRsvped;

    // Optimistically update local state & localStorage
    const updated = nextState 
      ? Array.from(new Set([...rsvpedEventIds, event.id]))
      : rsvpedEventIds.filter(id => id !== event.id);

    setRsvpedEventIds(updated);
    try {
      localStorage.setItem(`rsu_user_rsvps_${currentUser.uid}`, JSON.stringify(updated));
    } catch {}

    try {
      const rsvpDocRef = doc(db, 'users', currentUser.uid, 'rsvps', event.id);
      if (nextState) {
        await setDoc(rsvpDocRef, {
          id: event.id,
          userId: currentUser.uid,
          eventId: event.id,
          eventTitle: event.title,
          eventDate: event.date,
          eventLocationId: event.locationId,
          eventStartTime: event.startTime,
          eventEndTime: event.endTime,
          createdAt: new Date().toISOString()
        });
      } else {
        await deleteDoc(rsvpDocRef);
      }
      return nextState;
    } catch (err) {
      handleFirestoreError(err, nextState ? OperationType.CREATE : OperationType.DELETE, `users/${currentUser.uid}/rsvps/${event.id}`);
      return nextState;
    }
  }, [currentUser, rsvpedEventIds]);

  // Filtered list of events the user RSVPed to
  const rsvpedEvents: CampusEvent[] = useMemo(() => allEvents.filter(e => rsvpedEventIds.includes(e.id)), [allEvents, rsvpedEventIds]);

  // Add a new event
  const addEvent = useCallback(async (eventData: Omit<CampusEvent, 'id' | 'createdAt' | 'creatorId' | 'creatorEmail' | 'isCustom'>): Promise<CampusEvent> => {
    if (!currentUser) {
      throw new Error("You must be signed in to post an event.");
    }

    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newEvent: CampusEvent = {
      ...eventData,
      id: eventId,
      creatorId: currentUser.uid,
      creatorEmail: currentUser.email || 'campus_user@rsu.edu.ng',
      createdAt: new Date().toISOString(),
      isCustom: true
    };

    try {
      await setDoc(doc(db, 'events', eventId), {
        id: newEvent.id,
        title: newEvent.title,
        description: newEvent.description,
        date: newEvent.date,
        category: newEvent.category,
        locationId: newEvent.locationId,
        startTime: newEvent.startTime,
        endTime: newEvent.endTime,
        organizer: newEvent.organizer,
        creatorId: newEvent.creatorId,
        creatorEmail: newEvent.creatorEmail,
        createdAt: newEvent.createdAt
      });
      
      setFirestoreEvents(prev => [...prev.filter(e => e.id !== eventId), newEvent]);
      return newEvent;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `events/${eventId}`);
      // Optimistic local update fallback
      setFirestoreEvents(prev => [...prev.filter(e => e.id !== eventId), newEvent]);
      return newEvent;
    }
  }, [currentUser]);

  // Delete an event (Admin can delete ANY event; creator can delete their own)
  const deleteEvent = useCallback(async (eventId: string): Promise<void> => {
    if (!currentUser) {
      throw new Error("You must be signed in to delete an event.");
    }

    const targetEvent = allEvents.find(e => e.id === eventId);
    if (!targetEvent) {
      throw new Error("Event not found.");
    }

    if (!canDeleteEvent(targetEvent)) {
      throw new Error("You do not have permission to delete this event. Only the event creator or the campus Administrator can delete it.");
    }

    // Update local state immediately
    setDeletedEventIds(prev => {
      const updated = Array.from(new Set([...prev, eventId]));
      try {
        localStorage.setItem('rsu_deleted_event_ids', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setFirestoreEvents(prev => prev.filter(e => e.id !== eventId));

    try {
      // 1. If it exists in Firestore events collection, delete the doc
      const isFirestoreDoc = firestoreEvents.some(e => e.id === eventId);
      if (isFirestoreDoc) {
        await deleteDoc(doc(db, 'events', eventId));
      }

      // 2. Also record in deleted_events so it stays deleted across sessions even for static events
      await setDoc(doc(db, 'deleted_events', eventId), {
        deletedAt: new Date().toISOString(),
        deletedByUid: currentUser.uid,
        deletedByEmail: currentUser.email || 'unknown',
        isAdminAction: isAdmin
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `events/${eventId}`);
    }
  }, [currentUser, allEvents, canDeleteEvent, firestoreEvents, isAdmin]);

  return {
    events: allEvents,
    rsvpedEvents,
    rsvpedEventIds,
    isRsvped,
    toggleRsvp,
    isLoading,
    error,
    isAdmin,
    canDeleteEvent,
    addEvent,
    deleteEvent
  };
}
