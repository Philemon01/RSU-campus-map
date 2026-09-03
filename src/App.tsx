import React, { useState, useEffect, useMemo, useRef } from 'react';
import Fuse from 'fuse.js';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  X, 
  Info
} from 'lucide-react';
import { locations } from './data/locations';
import { campusEvents } from './data/events';
import { useCampusEvents } from './hooks/useCampusEvents';
import mapFeaturesData from './data/rsu-map-features.json';
import { Location, Maneuver, RouteOption } from './types';
import { cn, triggerHaptic } from './lib/utils';
import { RSU_CENTER, DEFAULT_ZOOM } from './constants';
import { getCategoryIcon, createCustomIcon } from './lib/icons';

// Components
import { CampusMap } from './components/Map/CampusMap';
import { LandingPage } from './components/UI/LandingPage';
import { NavigationHUD } from './components/Navigation/NavigationHUD';
import { SearchOverlay } from './components/Navigation/SearchOverlay';
import { InfoPanel } from './components/Navigation/InfoPanel';
import { Header } from './components/UI/Header';
import { MenuDrawer } from './components/UI/MenuDrawer';
import { FloatingActions } from './components/UI/FloatingActions';
import { LegalPage } from './components/UI/LegalPage';
import { CompassControl } from './components/UI/CompassControl';
import { CustomCampusRouter, RoutingMode } from './services/router';
import { fetchOSRMRoute, OSRMRoute, OSRMStep } from './services/osrm';
import { GeminiChatService } from './services/geminiService';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs, doc, setDoc } from 'firebase/firestore';
import { db, auth, googleProvider, setCachedAccessToken, getCachedAccessToken } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signInAnonymously, signOut, User, getRedirectResult, GoogleAuthProvider } from 'firebase/auth';
import { FeatureCollection } from 'geojson';

// Lazy-loaded secondary components to speed up initial bundle load
const EventsPanel = React.lazy(() => import('./components/UI/EventsPanel').then(m => ({ default: m.EventsPanel })));
const TimetablePanel = React.lazy(() => import('./components/UI/TimetablePanel').then(m => ({ default: m.TimetablePanel })));
const ProfilePanel = React.lazy(() => import('./components/UI/ProfilePanel').then(m => ({ default: m.ProfilePanel })));
const ChatBot = React.lazy(() => import('./components/Chat/ChatBot').then(m => ({ default: m.ChatBot })));
const MeetupShareModal = React.lazy(() => import('./components/UI/MeetupShareModal').then(m => ({ default: m.MeetupShareModal })));
import { LiveShareSession, FriendBeacon } from './types';
import { 
  updateLiveLocation, 
  stopLiveShare, 
  subscribeToShare, 
  getSavedFriendCodes, 
  saveFriendCode, 
  removeFriendCode, 
  MEETUP_STORAGE_KEY,
  normalizeShareCode,
  fetchLiveShare
} from './services/liveMeetupService';

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
    console.warn(`Firestore operating in offline/cached mode during ${operationType} on ${path}.`);
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

const getDistanceInMeters = (coords1: [number, number], coords2: [number, number]) => {
  const R = 6371e3;
  const φ1 = coords1[0] * Math.PI/180;
  const φ2 = coords2[0] * Math.PI/180;
  const Δφ = (coords2[0]-coords1[0]) * Math.PI/180;
  const Δλ = (coords2[1]-coords1[1]) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

type Category = 'all' | 'nearby' | 'faculty' | 'college' | 'admin' | 'hostel' | 'food' | 'gate' | 'sports' | 'library' | 'facility' | 'landmark' | 'department';

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [startLocation, setStartLocation] = useState<Location | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category>('all');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchMode, setSearchMode] = useState<'destination' | 'start'>('destination');
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [navigationPath, setNavigationPath] = useState<[number, number][] | null>(null);
  const [osrmRoute, setOsrmRoute] = useState<OSRMRoute | null>(null);
  const [mapView, setMapView] = useState({ center: RSU_CENTER, zoom: DEFAULT_ZOOM });
  const [isNavigating, setIsNavigating] = useState(false);
  const [isSatelliteView, setIsSatelliteView] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [highlightedLocationId, setHighlightedLocationId] = useState<string | null>(null);
  const [unauthorizedDomain, setUnauthorizedDomain] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'error' | 'info' | 'success' } | null>(null);
  // Permanent light mode: ensure dark class is removed and localStorage is set to light
  useEffect(() => {
    if (typeof window === 'undefined') return;
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }, []);
  const [savedLocationIds, setSavedLocationIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('saved_locations');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEventsPanelOpen, setIsEventsPanelOpen] = useState(false);
  const [isTimetableOpen, setIsTimetableOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [openedFromProfile, setOpenedFromProfile] = useState(false);
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [mapRotation, setMapRotation] = useState(0);
  const [currentPath, setCurrentPath] = useState(() => {
    return typeof window !== 'undefined' ? window.location.pathname : '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState(null, '', path);
    setCurrentPath(path);
  };
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const { events: liveCampusEvents } = useCampusEvents(currentUser);
  const [userSlots, setUserSlots] = useState<any[]>([]);
  const [navSession, setNavSession] = useState<{
    phase: 'idle' | 'clarification' | 'selection' | 'guidance' | 'completion';
    destinationId: string | null;
    originId: string | null;
    mode: 'walk' | 'cab' | null;
    currentStepIndex: number;
  }>({
    phase: 'idle',
    destinationId: null,
    originId: null,
    mode: null,
    currentStepIndex: -1
  });
  const [isListening, setIsListening] = useState(false);
  const [maneuvers, setManeuvers] = useState<Maneuver[]>([]);
  const [currentManeuverIndex, setCurrentManeuverIndex] = useState(-1);
  const [isVoiceAssistEnabled, setIsVoiceAssistEnabled] = useState(true);
  const [plannedRoutes, setPlannedRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('osrm');
  const [recentLocationIds, setRecentLocationIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const recent = localStorage.getItem('recent_locations');
      return recent ? JSON.parse(recent) : [];
    }
    return [];
  });

  // Meetup & Live Location Sharing States:
  const [isMeetupOpen, setIsMeetupOpen] = useState(false);
  const [activeLiveShareSession, setActiveLiveShareSession] = useState<LiveShareSession | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(MEETUP_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as LiveShareSession;
          if (parsed.isActive && Date.now() < parsed.expiresAt) {
            return parsed;
          }
        }
      } catch {}
    }
    return null;
  });
  const [savedFriendCodes, setSavedFriendCodes] = useState<string[]>(() => getSavedFriendCodes());
  const [friendSessions, setFriendSessions] = useState<Record<string, LiveShareSession | null>>({});

  const friendBeacons: FriendBeacon[] = useMemo(() => {
    const beacons: FriendBeacon[] = [];
    Object.entries(friendSessions).forEach(([, session]) => {
      if (!session || !session.isActive || Date.now() > session.expiresAt) return;
      let distanceMeters: number | undefined = undefined;
      if (userLocation && session.coordinates) {
        distanceMeters = getDistanceInMeters(userLocation, session.coordinates);
      }
      beacons.push({
        session,
        distanceMeters,
      });
    });
    return beacons;
  }, [friendSessions, userLocation]);

  const [customLocations, setCustomLocations] = useState<Location[]>([]);

  // Add Landmark Form States:
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [newLocCoords, setNewLocCoords] = useState<[number, number] | null>(null);
  const [newLocName, setNewLocName] = useState('');
  const [newLocAliasString, setNewLocAliasString] = useState('');
  const [newLocType, setNewLocType] = useState<Category>('landmark');
  const [newLocDescription, setNewLocDescription] = useState('');

  // Fetch community-added locations upon mount and sync updates
  useEffect(() => {
    let unsubscribe = () => {};
    try {
      const q = collection(db, 'user_locations');
      unsubscribe = onSnapshot(q, (snapshot) => {
        const list: Location[] = [];
        snapshot.forEach((doc) => {
          const d = doc.data();
          if (d && d.id && Array.isArray(d.coordinates) && d.coordinates.length === 2) {
            list.push({
              id: d.id,
              officialName: d.officialName || 'Campus Landmark',
              aliases: d.aliases || [],
              coordinates: d.coordinates as [number, number],
              type: d.type || 'landmark',
              description: d.description || '',
              landmark: d.landmark || 'No',
            });
          }
        });
        setCustomLocations(list);
      }, (error) => {
        console.warn("User locations notice: ", error?.message || error);
      });
    } catch (err) {
      console.warn("Could not attach user locations listener:", err);
    }

    return () => unsubscribe();
  }, []);

  const allLocations = useMemo(() => {
    return [...locations, ...customLocations];
  }, [customLocations]);

  const campusRouter = useMemo(() => {
    return new CustomCampusRouter(mapFeaturesData as FeatureCollection);
  }, []);

  const chatService = useMemo(() => {
    return new GeminiChatService(allLocations);
  }, [allLocations]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setCachedAccessToken(null);
      }
    });

    // Capture the result of a signInWithRedirect redirect flow on mount
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential?.accessToken) {
            setCachedAccessToken(credential.accessToken);
          }
          setNotification({ message: `Successfully synced with Google: ${result.user.displayName}`, type: 'success' });
        }
      })
      .catch((error) => {
        console.error("Redirect login result failed:", error);
        if (error.code === 'auth/unauthorized-domain' || error.message?.includes('unauthorized-domain') || error.code?.includes('unauthorized')) {
          const domain = typeof window !== 'undefined' ? window.location.hostname : 'your-vercel-domain.vercel.app';
          setUnauthorizedDomain(domain);
        } else if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
          setNotification({ message: `Sign-in redirect failed: ${error.message || error}`, type: 'error' });
        }
      });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setUserSlots([]);
      return;
    }

    const qSync = query(
      collection(db, 'user_syncs'),
      where('userId', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(qSync, async (snapshot) => {
      try {
        const slotsList: any[] = [];
        const promises = snapshot.docs.map(async (docSnap) => {
          const syncData = docSnap.data();
          if (syncData.timetableId) {
            const qSlots = collection(db, 'timetables', syncData.timetableId, 'slots');
            const slotsSnap = await getDocs(qSlots);
            slotsSnap.forEach((slotDoc) => {
              slotsList.push({
                id: slotDoc.id,
                ...slotDoc.data(),
                timetableId: syncData.timetableId
              });
            });
          }
        });
        await Promise.all(promises);
        setUserSlots(slotsList);
      } catch (err) {
        console.error("Error fetching slots for chatbot context:", err);
      }
    }, (error) => {
      console.error("onSnapshot error for user_syncs:", error);
      handleFirestoreError(error, OperationType.GET, 'user_syncs');
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleSignIn = async (useRedirect: boolean = false) => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;

    if (useRedirect) {
      if (isIframe) {
        // Iframes cannot render Google OAuth / Firebase auth handlers due to X-Frame-Options
        const domain = typeof window !== 'undefined' ? window.location.hostname : 'rsu-campus-map.web.app';
        setUnauthorizedDomain(domain);
        setIsSigningIn(false);
        return;
      }
      try {
        setNotification({ message: "Redirecting to Google Sign-In...", type: 'info' });
        await signInWithRedirect(auth, googleProvider);
      } catch (error: any) {
        console.error("Firebase Redirect failed:", error);
        setNotification({ message: "Could not initialize redirect: " + error.message, type: 'error' });
        setIsSigningIn(false);
      }
      return;
    }

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setCachedAccessToken(credential.accessToken);
      }
      setNotification({ message: `Signed in successfully as ${result.user.displayName || result.user.email || 'Student'}!`, type: 'success' });
    } catch (error: any) {
      console.warn("Auth error:", error.code, error.message);
      if (
        error.code === 'auth/unauthorized-domain' || 
        error.message?.includes('unauthorized-domain') || 
        error.code?.includes('unauthorized') ||
        error.code === 'auth/operation-not-supported-in-this-environment'
      ) {
        const domain = typeof window !== 'undefined' ? window.location.hostname : 'your-domain.web.app';
        setUnauthorizedDomain(domain);
      } else if (error.code === 'auth/popup-blocked') {
        const domain = typeof window !== 'undefined' ? window.location.hostname : 'your-domain.web.app';
        setUnauthorizedDomain(domain);
      } else if (error.code === 'auth/cancelled-popup-request') {
        // User opened another popup or switched focus
      } else if (error.code !== 'auth/popup-closed-by-user') {
        const domain = typeof window !== 'undefined' ? window.location.hostname : 'your-domain.web.app';
        setUnauthorizedDomain(domain);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGuestSignIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      const cred = await signInAnonymously(auth);
      setNotification({ message: "✓ Signed in with Campus Guest Pass!", type: 'success' });
      setUnauthorizedDomain(null);
    } catch (err: any) {
      console.error("Guest sign-in notice:", err);
      setNotification({ message: "Guest sign-in initialized.", type: 'info' });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setCachedAccessToken(null);
      setNotification({ message: "Signed out safely.", type: 'info' });
    } catch (error: any) {
      setNotification({ message: "Sign out failed.", type: 'error' });
    }
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          // Only show if it's new (within last 5 mins to avoid old ones on login)
          const isRecent = data.createdAt && (Date.now() - data.createdAt.toMillis() < 300000);
          if (isRecent) {
            setNotification({ message: data.message, type: 'info' });
          }
        }
      });
    }, (error) => {
      console.error("onSnapshot error for notifications:", error);
      handleFirestoreError(error, OperationType.GET, `notifications?userId=${currentUser.uid}`);
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  const findClosestLocation = (lat: number, lng: number): Location | null => {
    let closest: Location | null = null;
    let minDist = Infinity;
    for (const loc of allLocations) {
      if (!loc.coordinates) continue;
      const R = 6371e3;
      const φ1 = lat * Math.PI/180;
      const φ2 = loc.coordinates[0] * Math.PI/180;
      const Δφ = (loc.coordinates[0] - lat) * Math.PI/180;
      const Δλ = (loc.coordinates[1] - lng) * Math.PI/180;
      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const dist = R * c;

      if (dist < minDist) {
        minDist = dist;
        closest = loc;
      }
    }
    if (minDist <= 20 && closest) {
      return closest;
    }
    return null;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const start_lat_str = urlParams.get('start_lat');
    const start_lng_str = urlParams.get('start_lng');
    const dest_lat_str = urlParams.get('dest_lat');
    const dest_lng_str = urlParams.get('dest_lng');
    
    if (dest_lat_str && dest_lng_str) {
      const dLat = parseFloat(dest_lat_str);
      const dLng = parseFloat(dest_lng_str);
      const dName = urlParams.get('dest_name') || 'Shared Destination';
      
      if (!isNaN(dLat) && !isNaN(dLng)) {
        const matchedDest = findClosestLocation(dLat, dLng) || {
          id: 'custom_dest_' + Date.now(),
          officialName: dName,
          aliases: [],
          coordinates: [dLat, dLng] as [number, number],
          type: 'landmark' as const,
          description: 'Destination shared via URL',
          landmark: 'Shared Destination',
          address: 'Rivers State University'
        };
        
        setSelectedLocation(matchedDest);
        setMapView({ center: [dLat, dLng], zoom: 18 });
        
        if (start_lat_str && start_lng_str) {
          const sLat = parseFloat(start_lat_str);
          const sLng = parseFloat(start_lng_str);
          const sName = urlParams.get('start_name') || 'Shared Starting Point';
          
          if (!isNaN(sLat) && !isNaN(sLng)) {
            const matchedStart = findClosestLocation(sLat, sLng) || {
              id: 'custom_start_' + Date.now(),
              officialName: sName,
              aliases: [],
              coordinates: [sLat, sLng] as [number, number],
              type: 'landmark' as const,
              description: 'Starting point shared via URL',
              landmark: 'Shared Origin',
              address: 'Rivers State University'
            };
            setStartLocation(matchedStart);
          }
        }
        
        setNotification({
          message: "Loaded shared campus route successfully!",
          type: 'success'
        });
      }
    }

    // Direct Meetup Sharing Link Support (?meetup=RSU-XXXX)
    const meetup_code = urlParams.get('meetup');
    if (meetup_code) {
      const formatted = meetup_code.trim().toUpperCase();
      const updated = saveFriendCode(formatted);
      setSavedFriendCodes(updated);
      setIsMeetupOpen(true);
      setIsTimetableOpen(false);
      setIsProfileOpen(false);
      setIsEventsPanelOpen(false);
      setIsChatOpen(false);
      setNotification({
        message: `Connected to friend beacon ${formatted}!`,
        type: 'success'
      });
    }
  }, []);

  // Broadcast own location updates when active live sharing session is on
  useEffect(() => {
    if (!activeLiveShareSession || !activeLiveShareSession.isActive || !userLocation) return;

    if (Date.now() > activeLiveShareSession.expiresAt) {
      setActiveLiveShareSession(null);
      return;
    }

    updateLiveLocation(activeLiveShareSession.id, userLocation).catch(err => {
      console.warn("Live location broadcast update error:", err);
    });
  }, [userLocation?.[0], userLocation?.[1], activeLiveShareSession?.id, activeLiveShareSession?.isActive]);

  // Subscribe to live updates for all connected friend beacons
  const savedFriendCodesKey = savedFriendCodes.join(',');
  useEffect(() => {
    if (savedFriendCodes.length === 0) {
      setFriendSessions(prev => Object.keys(prev).length === 0 ? prev : {});
      return;
    }

    const unsubs: (() => void)[] = [];

    savedFriendCodes.forEach((code) => {
      const unsub = subscribeToShare(code, (session) => {
        setFriendSessions(prev => {
          if (prev[code] === session) return prev;
          return { ...prev, [code]: session };
        });
      });
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach(u => u());
    };
  }, [savedFriendCodesKey]);

  const handleShareRoute = () => {
    if (!selectedLocation) {
      setNotification({
        message: "Please select a location first to share a route.",
        type: 'info'
      });
      return;
    }
    
    const destCoords = selectedLocation.coordinates;
    const destName = encodeURIComponent(selectedLocation.officialName);
    
    let startCoords: [number, number] | null = null;
    let startName = "";
    
    if (startLocation) {
      startCoords = startLocation.coordinates;
      startName = encodeURIComponent(startLocation.officialName);
    } else if (userLocation) {
      startCoords = userLocation;
      startName = encodeURIComponent("Current Location");
    }
    
    const baseUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
    let shareUrl = `${baseUrl}?dest_lat=${destCoords[0]}&dest_lng=${destCoords[1]}&dest_name=${destName}`;
    
    if (startCoords) {
      shareUrl += `&start_lat=${startCoords[0]}&start_lng=${startCoords[1]}&start_name=${startName}`;
    }
    
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        setNotification({
          message: "Campus route copied to clipboard! Share it with others.",
          type: "success"
        });
      })
      .catch((err) => {
        console.error("Failed to copy link:", err);
        setNotification({
          message: "Failed to copy link. Manual copy link:\n" + shareUrl,
          type: "error"
        });
      });
  };

  const lastRouteCoordsRef = useRef<{start: [number, number], end: [number, number]} | null>(null);

  useEffect(() => {
    const updateRoutes = async () => {
      if (selectedLocation) {
        const start = startLocation?.coordinates || userLocation || RSU_CENTER;
        const end = selectedLocation.coordinates;

        // Check if we already have a route for these approximate coordinates (within 5m)
        if (lastRouteCoordsRef.current) {
          const dStart = getDistanceInMeters(lastRouteCoordsRef.current.start, start);
          const dEnd = getDistanceInMeters(lastRouteCoordsRef.current.end, end);
          if (dStart < 5 && dEnd < 1) return;
        }
        
        const startName = startLocation?.officialName || (userLocation ? "Your Location" : "Campus Center");
        const endName = selectedLocation.officialName;
        
        const routes = await generateRouteOptions(
          start, 
          end, 
          startName, 
          endName
        );
        setPlannedRoutes(routes);
        lastRouteCoordsRef.current = { start, end };

        if (routes.length > 0) {
          const activeRoute = routes.find(r => r.id === selectedRouteId) || routes[0];
          setNavigationPath(activeRoute.path);
          setManeuvers(activeRoute.maneuvers);
        }
      } else {
        setPlannedRoutes(prev => prev.length === 0 ? prev : []);
        lastRouteCoordsRef.current = null;
        if (!isNavigating) {
          setNavigationPath(prev => prev === null ? prev : null);
          setManeuvers(prev => prev.length === 0 ? prev : []);
        }
      }
    };
    updateRoutes();
  }, [selectedLocation?.id, startLocation?.id, userLocation?.[0], userLocation?.[1], selectedRouteId, isNavigating]);

  // Handle position watch
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation(prev => {
          if (prev && prev[0] === latitude && prev[1] === longitude) return prev;
          return [latitude, longitude];
        });
      },
      (error) => console.warn("GPS Watch status:", error?.message || error),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Track last GPS position used for maneuver advancement to prevent rapid-fire cascades
  const lastManeuverAdvanceLocationRef = useRef<[number, number] | null>(null);

  // Handle navigation camera follow
  useEffect(() => {
    if (!userLocation) return;
    
    // Only force map center if we are following user or in navigation from current location
    if (isFollowingUser || (isNavigating && !startLocation)) {
      setMapView(prev => {
        const dist = getDistanceInMeters(prev.center, userLocation);
        if (dist < 1 && (isNavigating ? prev.zoom === 18 : true)) return prev;
        return { ...prev, center: userLocation, zoom: isNavigating ? 18 : prev.zoom };
      });
    }
  }, [userLocation?.[0], userLocation?.[1], isFollowingUser, isNavigating, startLocation?.id]);

  // Handle maneuver progression when physically reaching waypoints
  useEffect(() => {
    if (!isNavigating || !userLocation || maneuvers.length === 0 || currentManeuverIndex < 0) {
      lastManeuverAdvanceLocationRef.current = null;
      return;
    }

    // Step 0 represents initial orientation; only advance when moving towards step 1
    if (currentManeuverIndex === 0) {
      if (maneuvers.length > 1) {
        const nextCoords = maneuvers[1].coordinates;
        const distToNext = getDistanceInMeters(userLocation, nextCoords);
        if (distToNext < 15) {
          lastManeuverAdvanceLocationRef.current = userLocation;
          nextManeuver();
        }
      }
      return;
    }

    // For subsequent steps: user must have moved from the previous advance location
    if (lastManeuverAdvanceLocationRef.current) {
      const distFromLast = getDistanceInMeters(userLocation, lastManeuverAdvanceLocationRef.current);
      if (distFromLast < 8) return; // Prevent re-triggering while in the same vicinity
    }

    const currentManeuver = maneuvers[currentManeuverIndex];
    if (currentManeuver) {
      const dist = getDistanceInMeters(userLocation, currentManeuver.coordinates);
      if (dist < 15) {
        lastManeuverAdvanceLocationRef.current = userLocation;
        nextManeuver();
      }
    }
  }, [userLocation?.[0], userLocation?.[1], isNavigating, currentManeuverIndex, maneuvers.length]);

  const handleLocateMe = () => {
    if (userLocation) {
      setMapView({ center: userLocation, zoom: 17 });
      setIsFollowingUser(true);
    }
  };

  // Turn off following when user manually moves map
  const onMapMove = React.useCallback((center: [number, number], zoom: number) => {
    setMapView(prev => {
      // Only update if significantly changed to avoid jitter
      const dist = getDistanceInMeters(prev.center, center);
      if (dist < 0.1 && Math.abs(prev.zoom - zoom) < 0.01) return prev;
      return { center, zoom };
    });
    setIsFollowingUser(prev => prev ? false : false);
  }, []);

  useEffect(() => {
    localStorage.setItem('saved_locations', JSON.stringify(savedLocationIds));
  }, [savedLocationIds]);

  useEffect(() => {
    localStorage.setItem('recent_locations', JSON.stringify(recentLocationIds));
  }, [recentLocationIds]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const startListening = () => {
    if (isListening) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotification({ message: "Voice search is not supported in this browser.", type: 'error' });
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setSearchQuery(transcript);
      setIsSearchFocused(true);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const getAiInstance = React.useCallback(() => {
    const key = (typeof process !== "undefined" && process?.env?.VITE_GEMINI_API_KEY) ||
                (typeof process !== "undefined" && process?.env?.GEMINI_API_KEY) ||
                (import.meta.env?.VITE_GEMINI_API_KEY) ||
                (import.meta.env?.GEMINI_API_KEY);
    if (!key || key === 'undefined' || key === '') return null;
    try {
      return new GoogleGenAI({ apiKey: key });
    } catch (error) {
      console.error("Failed to create GoogleGenAI instance in App:", error);
      return null;
    }
  }, []);

  const playVoiceDirections = React.useCallback(async (text: string) => {
    if (isSpeaking) return;
    
    const ai = getAiInstance();
    setIsSpeaking(true);
    
    if (isOffline || !ai) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
      return;
    }
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: `Say clearly and helpfully: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Int16Array(len / 2);
        for (let i = 0; i < len; i += 2) {
          bytes[i / 2] = (binaryString.charCodeAt(i) & 0xFF) | ((binaryString.charCodeAt(i + 1) & 0xFF) << 8);
        }
        const float32Data = new Float32Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
          float32Data[i] = bytes[i] / 32768.0;
        }
        const buffer = audioContext.createBuffer(1, float32Data.length, 24000);
        buffer.getChannelData(0).set(float32Data);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.onended = () => {
          setIsSpeaking(false);
          audioContext.close();
        };
        source.start();
      } else {
        setIsSpeaking(false);
      }
    } catch (error) {
      setIsSpeaking(false);
    }
  }, [isSpeaking, isOffline, getAiInstance]);

  const fuse = useMemo(() => {
    return new Fuse(allLocations, {
      keys: ['officialName', 'aliases', 'type', 'description'],
      threshold: 0.4,
    });
  }, [allLocations]);

  const filteredLocations = useMemo(() => {
    if (activeCategory === 'all') return allLocations;

    if (activeCategory === 'nearby') {
      const origin = userLocation || RSU_CENTER;
      return allLocations.filter(loc => {
        const isFoodOrFacility = loc.type === 'food' || loc.type === 'facility' ||
          loc.officialName.toLowerCase().includes('food') ||
          loc.officialName.toLowerCase().includes('canteen') ||
          loc.officialName.toLowerCase().includes('cafeteria') ||
          loc.officialName.toLowerCase().includes('restaurant') ||
          loc.officialName.toLowerCase().includes('bukka') ||
          loc.officialName.toLowerCase().includes('shop') ||
          loc.officialName.toLowerCase().includes('facility') ||
          loc.officialName.toLowerCase().includes('centre') ||
          loc.officialName.toLowerCase().includes('center') ||
          loc.officialName.toLowerCase().includes('clinic') ||
          loc.officialName.toLowerCase().includes('park') ||
          loc.officialName.toLowerCase().includes('water');
        if (!isFoodOrFacility) return false;
        const dist = getDistanceInMeters(origin, loc.coordinates);
        return dist <= 500;
      }).sort((a, b) => {
        const distA = getDistanceInMeters(origin, a.coordinates);
        const distB = getDistanceInMeters(origin, b.coordinates);
        return distA - distB;
      });
    }

    if (activeCategory === 'department' as any) {
      return allLocations.filter(loc => 
        loc.officialName.toLowerCase().includes('dept') || 
        loc.officialName.toLowerCase().includes('department') ||
        loc.aliases.some(a => a.toLowerCase().includes('dept') || a.toLowerCase().includes('department'))
      );
    }
    return allLocations.filter(loc => loc.type === activeCategory);
  }, [activeCategory, allLocations, userLocation]);

  const searchResults = useMemo(() => {
    if (!searchQuery) {
      if (activeCategory === 'nearby') {
        return filteredLocations;
      }
      return [];
    }
    const results = fuse.search(searchQuery).map(result => result.item);
    if (activeCategory === 'nearby') {
      const nearbyIds = new Set(filteredLocations.map(l => l.id));
      return results.filter(r => nearbyIds.has(r.id));
    } else if (activeCategory !== 'all') {
      const catIds = new Set(filteredLocations.map(l => l.id));
      return results.filter(r => catIds.has(r.id));
    }
    return results;
  }, [searchQuery, fuse, activeCategory, filteredLocations]);

  const handleLocationSelect = React.useCallback(async (loc: Location | null) => {
    if (loc) {
      triggerHaptic(15);
      setRecentLocationIds(prev => {
        const filtered = prev.filter(id => id !== loc.id);
        return [loc.id, ...filtered].slice(0, 5);
      });
    }

    if (searchMode === 'destination') {
      setSelectedLocation(loc);
      setIsPanelExpanded(false);
      if (loc) {
        setMapView({ center: loc.coordinates, zoom: 18 });
      }
      setSearchQuery('');
    } else {
      setStartLocation(loc);
      if (!loc) {
        setIsFollowingUser(true);
        if (userLocation) {
          setMapView({ center: userLocation, zoom: 17 });
        }
      } else {
        setIsFollowingUser(false);
        setMapView({ center: loc.coordinates, zoom: 17 });
      }
      setSearchQuery('');
    }
    setIsSearchFocused(false);
  }, [searchMode, userLocation]);

  const handleEventNavigation = (locationId: string) => {
    const loc = allLocations.find(l => l.id === locationId);
    if (loc) {
      handleLocationSelect(loc);
      setIsEventsPanelOpen(false);
      setIsTimetableOpen(false);
      setIsProfileOpen(false);
    }
  };

  const handleGetDirections = () => {
    startNavigation();
    setIsPanelExpanded(false);
  };

  const endSession = () => {
    setIsNavigating(false);
    setIsFollowingUser(false);
    setNavigationPath(null);
    setManeuvers([]);
    setPlannedRoutes([]);
    setCurrentManeuverIndex(-1);
    setSelectedLocation(null);
    setStartLocation(null);
    setIsPanelExpanded(false);
    setSearchQuery('');
  };

  const toggleSaveLocation = (id: string) => {
    setSavedLocationIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const savedLocations = useMemo(() => allLocations.filter(loc => savedLocationIds.includes(loc.id)), [savedLocationIds, allLocations]);
  const recentLocations = useMemo(() => recentLocationIds.map(id => allLocations.find(loc => loc.id === id)).filter(Boolean) as Location[], [recentLocationIds, allLocations]);

  const totalRemainingDistance = useMemo(() => {
    if (!maneuvers || currentManeuverIndex < 0) return 0;
    return maneuvers.slice(currentManeuverIndex).reduce((acc, m) => acc + m.distance, 0);
  }, [maneuvers, currentManeuverIndex]);

  const calculateWalkingTime = (coords1: [number, number], coords2: [number, number]) => {
    const d = getDistanceInMeters(coords1, coords2);
    return Math.ceil(d / 80);
  };

  const getBearing = (start: [number, number], end: [number, number]) => {
    const lat1 = start[0] * Math.PI / 180;
    const lat2 = end[0] * Math.PI / 180;
    const dLon = (end[1] - start[1]) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    let brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
  };

  const getManeuverType = (prev: [number, number], curr: [number, number], next: [number, number]): 'straight' | 'left' | 'right' | 'slight-left' | 'slight-right' => {
    const b1 = getBearing(prev, curr);
    const b2 = getBearing(curr, next);
    let diff = b2 - b1;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    if (diff > 45) return 'right';
    if (diff > 10) return 'slight-right';
    if (diff < -45) return 'left';
    if (diff < -10) return 'slight-left';
    return 'straight';
  };

  const generatePathManeuvers = (path: [number, number][], startName: string, endName: string): Maneuver[] => {
    const rawManeuvers: Maneuver[] = [];
    for (let i = 0; i < path.length; i++) {
      const coord = path[i];
      if (i === path.length - 1) {
        rawManeuvers.push({ instruction: `Arriving at ${endName}.`, distance: 0, type: 'destination', coordinates: coord });
        continue;
      }
      
      const nextCoord = path[i+1];
      const distToNext = Math.floor(getDistanceInMeters(coord, nextCoord));
      let type: Maneuver['type'] = 'straight';
      let instruction = "";

      if (i === 0) {
        instruction = `Depart from ${startName} towards your destination.`;
      } else {
        type = getManeuverType(path[i-1], coord, nextCoord);
        if (type === 'straight') {
          instruction = `Proceed straight for ${distToNext}m.`;
        } else {
          const dir = type.includes('left') ? 'left' : 'right';
          instruction = `Turn ${type.includes('slight') ? 'slight ' : ''}${dir} and continue for ${distToNext}m.`;
        }
      }
      
      rawManeuvers.push({ instruction, distance: distToNext, type, coordinates: coord });
    }

    const groupedManeuvers: Maneuver[] = [];
    for (let i = 0; i < rawManeuvers.length; i++) {
      const m = rawManeuvers[i];
      if (groupedManeuvers.length > 0 && 
          groupedManeuvers[groupedManeuvers.length-1].type === 'straight' && 
          m.type === 'straight') {
        const last = groupedManeuvers[groupedManeuvers.length-1];
        last.distance += m.distance;
        last.instruction = `Continue straight for ${last.distance}m.`;
      } else {
        groupedManeuvers.push({ ...m });
      }
    }
    return groupedManeuvers;
  };

  const generateRouteOptions = async (
    start: [number, number], 
    end: [number, number], 
    startName: string, 
    endName: string
  ): Promise<RouteOption[]> => {
    const options: RouteOption[] = [];
    
    // 1. OSRM Walking Route (Live API)
    const osrmData = await fetchOSRMRoute(start, end);
    if (osrmData) {
      const path = osrmData.geometry.coordinates.map(c => [c[1], c[0]] as [number, number]);
      const steps = osrmData.legs[0].steps.map(s => ({
        instruction: s.maneuver.instruction,
        distance: s.distance,
        type: convertOSRMType(s.maneuver.type, s.maneuver.modifier),
        coordinates: [s.maneuver.location[1], s.maneuver.location[0]] as [number, number]
      }));

      options.push({
        id: 'osrm',
        name: 'Walking Directions (OSRM)',
        duration: Math.ceil(osrmData.duration / 60),
        distance: Math.floor(osrmData.distance),
        path,
        maneuvers: steps
      });
    }
    
    // 2. Shortcut Path (Local Campus Router)
    const shortcutPath = campusRouter.findRoute(start, end, 'shortest');
    if (shortcutPath) {
      const dist = shortcutPath.reduce((acc, curr, i) => i === 0 ? 0 : acc + getDistanceInMeters(shortcutPath[i-1], curr), 0);
      options.push({
        id: 'shortest',
        name: 'Campus Shortcut',
        duration: Math.ceil(dist / 75), 
        distance: Math.floor(dist),
        path: shortcutPath,
        maneuvers: generatePathManeuvers(shortcutPath, startName, endName)
      });
    }

    // 3. Accessible (Local Campus Router)
    const accessiblePath = campusRouter.findRoute(start, end, 'accessible');
    if (accessiblePath) {
      const dist = accessiblePath.reduce((acc, curr, i) => i === 0 ? 0 : acc + getDistanceInMeters(accessiblePath[i-1], curr), 0);
      options.push({
        id: 'accessible',
        name: 'Main Roads',
        duration: Math.ceil(dist / 85),
        distance: Math.floor(dist),
        path: accessiblePath,
        maneuvers: generatePathManeuvers(accessiblePath, startName, endName)
      });
    }

    return options;
  };

  const convertOSRMType = (type: string, modifier?: string): Maneuver['type'] => {
    if (type === 'depart') return 'straight';
    if (type === 'arrive') return 'destination';
    if (modifier?.includes('slight left')) return 'slight-left';
    if (modifier?.includes('slight right')) return 'slight-right';
    if (modifier?.includes('left')) return 'left';
    if (modifier?.includes('right')) return 'right';
    return 'straight';
  };

  const startNavigation = async (overrideDest?: Location) => {
    const dest = overrideDest || selectedLocation;
    if (!dest) return;
    const start = startLocation?.coordinates || userLocation || RSU_CENTER;
    const end = dest.coordinates;
    const startName = startLocation?.officialName || (userLocation ? "Your Location" : "Campus Center");
    const endName = dest.officialName;
    
    const routes = await generateRouteOptions(
      start, 
      end, 
      startName, 
      endName
    );
    
    setPlannedRoutes(routes);
    if (routes.length > 0) {
      const activeRoute = routes.find(r => r.id === selectedRouteId) || routes[0];
      setManeuvers(activeRoute.maneuvers);
      setCurrentManeuverIndex(0);
      setIsNavigating(true);
      triggerHaptic([40, 50, 40]);
      setNavigationPath(activeRoute.path);
      
      // Auto-follow user only if starting from current location
      if (!startLocation) {
        setIsFollowingUser(true);
      } else {
        setIsFollowingUser(false);
      }
      
      if (isVoiceAssistEnabled) {
        playVoiceDirections(`Routing to ${endName}. Choosing ${activeRoute.name}.`);
      }
      return activeRoute.maneuvers;
    }
    return [];
  };

  const handleChatMessage = async (text: string) => {
    const intent = await chatService.parseIntent(text, userSlots, liveCampusEvents);
    let calculatedDistance: number | undefined = undefined;
    let nextPhase = navSession.phase;
    let updatedSession = { ...navSession };

    // Handle session transitions
    if (navSession.phase === 'idle' || navSession.phase === 'completion') {
      if (intent.isVague) {
        nextPhase = 'clarification';
        updatedSession = { 
          phase: 'clarification', 
          destinationId: intent.destinationId || null, 
          originId: intent.originId || null, 
          mode: null, 
          currentStepIndex: -1 
        };
      } else if ((intent.type === 'navigate' || intent.type === 'query') && intent.destinationId) {
        const dest = allLocations.find(l => l.id === intent.destinationId);
        if (dest) {
          const origin = intent.originId ? allLocations.find(l => l.id === intent.originId) : null;
          const start = origin?.coordinates || userLocation || RSU_CENTER;
          calculatedDistance = Math.floor(getDistanceInMeters(start, dest.coordinates));
          
          if (intent.type === 'navigate') {
            nextPhase = 'selection';
            updatedSession = { 
              phase: 'selection', 
              destinationId: intent.destinationId, 
              originId: intent.originId || null, 
              mode: null, 
              currentStepIndex: -1 
            };
          }

          // Update map to show destinations
          setSelectedLocation(dest);
          if (origin) setStartLocation(origin);
          setMapView({ center: dest.coordinates, zoom: 17 });
        }
      }
    } else if (navSession.phase === 'clarification') {
      if (intent.type === 'navigate' && intent.destinationId && !intent.isVague) {
        const dest = allLocations.find(l => l.id === intent.destinationId);
        if (dest) {
          const origin = intent.originId ? allLocations.find(l => l.id === intent.originId) : (updatedSession.originId ? allLocations.find(l => l.id === updatedSession.originId) : null);
          const start = origin?.coordinates || userLocation || RSU_CENTER;
          calculatedDistance = Math.floor(getDistanceInMeters(start, dest.coordinates));
          nextPhase = 'selection';
          updatedSession = { 
            ...updatedSession, 
            phase: 'selection', 
            destinationId: intent.destinationId, 
            originId: intent.originId || updatedSession.originId 
          };
          setSelectedLocation(dest);
        }
      }
    } else if (navSession.phase === 'selection') {
      if (intent.type === 'choice' && intent.value) {
        nextPhase = 'guidance';
        const dest = allLocations.find(l => l.id === updatedSession.destinationId);
        if (dest) {
          const origin = updatedSession.originId ? allLocations.find(l => l.id === updatedSession.originId) : null;
          if (origin) setStartLocation(origin);
          
          const steps = await startNavigation(dest);
          updatedSession = { 
            ...updatedSession, 
            phase: 'guidance', 
            mode: intent.value as 'walk' | 'cab', 
            currentStepIndex: 0 
          };
          setCurrentManeuverIndex(0);
        }
      }
    } else if (navSession.phase === 'guidance') {
      if (intent.type === 'confirm') {
        const nextIndex = updatedSession.currentStepIndex + 1;
        if (nextIndex >= maneuvers.length) {
          nextPhase = 'completion';
          updatedSession = { ...updatedSession, phase: 'completion' };
          setIsNavigating(false);
          setCurrentManeuverIndex(-1);
        } else {
          updatedSession = { ...updatedSession, currentStepIndex: nextIndex };
          setCurrentManeuverIndex(nextIndex);
          setMapView(prev => ({ ...prev, center: maneuvers[nextIndex].coordinates, zoom: 19 }));
        }
      }
    }

    setNavSession(updatedSession);

    // Get the current progress text for Gemini to narrate
    const currentStepInstruction = updatedSession.currentStepIndex >= 0 && maneuvers[updatedSession.currentStepIndex] 
      ? maneuvers[updatedSession.currentStepIndex].instruction 
      : undefined;

    const response = await chatService.generateResponse(intent, {
      extraInfo: text,
      distance: calculatedDistance,
      currentStep: currentStepInstruction,
      isLastStep: updatedSession.currentStepIndex === maneuvers.length - 1 && maneuvers.length > 0,
      phase: updatedSession.phase,
      timetable: userSlots,
      events: liveCampusEvents,
    });

    if (isVoiceAssistEnabled && response) {
      playVoiceDirections(response);
    }

    return { 
      response, 
      destinationId: updatedSession.destinationId || undefined, 
      type: intent.type,
      quickActions: updatedSession.phase === 'selection' 
        ? [{ label: '🚶 Walk', value: 'Walk' }, { label: '🚖 Cab/Shuttle', value: 'Cab' }]
        : updatedSession.phase === 'guidance'
        ? [{ label: 'I have arrived', value: 'Next' }]
        : undefined
    };
  };

  const handleRecalculate = async () => {
    if (!selectedLocation) return;
    setNotification({ message: "Recalculating route...", type: 'info' });
    
    // Force start from current user location
    setStartLocation(null); 
    await startNavigation();
    setNotification({ message: "Route updated!", type: 'success' });
  };

  const nextManeuver = React.useCallback(() => {
    if (currentManeuverIndex < maneuvers.length - 1) {
      const nextIndex = currentManeuverIndex + 1;
      setCurrentManeuverIndex(nextIndex);
      setMapView(prev => ({ ...prev, center: maneuvers[nextIndex].coordinates, zoom: 19 }));
      if (isVoiceAssistEnabled) playVoiceDirections(maneuvers[nextIndex].instruction);
      
      if (maneuvers[nextIndex].type === 'destination') {
        triggerHaptic([100, 50, 100, 50, 200]);
      } else {
        triggerHaptic([40, 40, 40]);
      }
    } else {
      setIsNavigating(false);
      setManeuvers([]);
      setCurrentManeuverIndex(-1);
      triggerHaptic([100, 50, 100, 50, 200]);
    }
  }, [currentManeuverIndex, maneuvers, isVoiceAssistEnabled, playVoiceDirections]);

  const handleRequestAddLocation = () => {
    if (!currentUser) {
      setNotification({ message: 'Please sign in to add landmarks!', type: 'error' });
      return;
    }
    setIsLocating(true);
    setNotification({ message: 'Locating via GPS satellites...', type: 'info' });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const { latitude, longitude } = position.coords;
        setNewLocCoords([latitude, longitude]);
        setIsAddLocationOpen(true);
        setNotification({ message: 'GPS coordinate lock successful!', type: 'success' });
      },
      (error) => {
        setIsLocating(false);
        let errorMsg = 'Could not lock GPS. Please grant system access.';
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = 'GPS Access Denied. Make sure browser permissions are allowed.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMsg = 'Position unavailable. Try moving outdoors.';
        } else if (error.code === error.TIMEOUT) {
          errorMsg = 'GPS request timed out. Please try again.';
        }
        setNotification({ message: errorMsg, type: 'error' });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const handleSaveCustomLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setNotification({ message: 'You must be signed in to add locations!', type: 'error' });
      return;
    }
    if (!newLocCoords) {
      setNotification({ message: 'No GPS coordinate locked! Try again.', type: 'error' });
      return;
    }
    const trimmedName = newLocName.trim();
    if (!trimmedName) {
      setNotification({ message: 'Please provide a valid name.', type: 'error' });
      return;
    }

    const newId = `custom_${Date.now()}`;
    const aliasArray = newLocAliasString
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);

    const data = {
      id: newId,
      officialName: trimmedName,
      aliases: aliasArray,
      coordinates: [newLocCoords[0], newLocCoords[1]],
      type: newLocType,
      description: newLocDescription.trim() || `Community added landmark contributed by RSU student.`,
      landmark: 'Yes',
      ownerId: currentUser.uid,
      createdAt: new Date().toISOString()
    };

    try {
      const docRef = doc(db, 'user_locations', newId);
      await setDoc(docRef, data);
      setIsAddLocationOpen(false);
      
      // Clear fields
      setNewLocName('');
      setNewLocAliasString('');
      setNewLocCoords(null);
      setNewLocDescription('');
      setNewLocType('landmark');
      
      setNotification({ message: `Landmark "${trimmedName}" successfully saved to RSU campus!`, type: 'success' });
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, `user_locations/${newId}`);
    }
  };

  const isPrivacyPage = currentPath === '/privacy-policy' || currentPath === '/privacy';
  const isTermsPage = currentPath === '/terms-of-service' || currentPath === '/terms';

  if (isPrivacyPage || isTermsPage) {
    window.location.href = isTermsPage ? '/terms.html' : '/privacy.html';
    return null;
  }

  if (currentPath === '/') {
    return (
      <LandingPage 
        isDarkMode={false}
        events={liveCampusEvents}
        onOpenTerms={() => { window.location.href = '/terms.html'; }}
        onOpenPrivacy={() => { window.location.href = '/privacy.html'; }}
        onNavigateToMap={(initialLocation, openTimetable, openEvents) => {
          if (initialLocation) {
            handleLocationSelect(initialLocation);
          }
          setIsChatOpen(false);
          if (openTimetable) {
            setIsTimetableOpen(true);
            setIsProfileOpen(false);
            setIsEventsPanelOpen(false);
          } else if (openEvents) {
            setIsEventsPanelOpen(true);
            setIsProfileOpen(false);
            setIsTimetableOpen(false);
          } else {
            setIsTimetableOpen(false);
            setIsProfileOpen(false);
            setIsEventsPanelOpen(false);
          }
          navigate('/map');
        }}
      />
    );
  }

  // Mutually exclusive panel toggles
  const handleToggleTimetable = () => {
    setIsTimetableOpen(prev => {
      const willOpen = !prev;
      return willOpen;
    });
    setIsProfileOpen(false);
    setIsEventsPanelOpen(false);
    setIsChatOpen(false);
    setIsMenuOpen(false);
    setIsMeetupOpen(false);
    setOpenedFromProfile(false);
  };

  const handleToggleProfile = () => {
    setIsProfileOpen(prev => {
      const willOpen = !prev;
      return willOpen;
    });
    setIsTimetableOpen(false);
    setIsEventsPanelOpen(false);
    setIsChatOpen(false);
    setIsMenuOpen(false);
    setIsMeetupOpen(false);
    setOpenedFromProfile(false);
  };

  const handleToggleEvents = () => {
    setIsEventsPanelOpen(prev => {
      const willOpen = !prev;
      return willOpen;
    });
    setIsTimetableOpen(false);
    setIsProfileOpen(false);
    setIsChatOpen(false);
    setIsMenuOpen(false);
    setIsMeetupOpen(false);
  };

  const handleToggleChat = () => {
    setIsChatOpen(prev => {
      const willOpen = !prev;
      return willOpen;
    });
    setIsTimetableOpen(false);
    setIsProfileOpen(false);
    setIsEventsPanelOpen(false);
    setIsMenuOpen(false);
    setIsMeetupOpen(false);
  };

  const handleChatOpenChange = (open: boolean) => {
    if (open) {
      setIsTimetableOpen(false);
      setIsProfileOpen(false);
      setIsEventsPanelOpen(false);
      setIsMenuOpen(false);
      setIsMeetupOpen(false);
    }
    setIsChatOpen(open);
  };

  const handleToggleMeetup = () => {
    setIsMeetupOpen(prev => {
      const willOpen = !prev;
      return willOpen;
    });
    setIsTimetableOpen(false);
    setIsProfileOpen(false);
    setIsEventsPanelOpen(false);
    setIsChatOpen(false);
    setIsMenuOpen(false);
  };

  const handleAddFriendCode = async (code: string): Promise<boolean> => {
    const formatted = normalizeShareCode(code);
    if (!formatted) return false;
    
    // Check if session exists in Firestore for immediate feedback
    const session = await fetchLiveShare(formatted);
    const updated = saveFriendCode(formatted);
    setSavedFriendCodes(updated);

    if (session && session.isActive && Date.now() <= session.expiresAt) {
      setNotification({
        message: `Connected to ${session.userName}'s beacon (${formatted})!`,
        type: 'success'
      });
    } else if (session && (!session.isActive || Date.now() > session.expiresAt)) {
      setNotification({
        message: `Beacon (${formatted}) is currently inactive or expired.`,
        type: 'info'
      });
    } else {
      setNotification({
        message: `Beacon code ${formatted} connected! Listening for live broadcast...`,
        type: 'success'
      });
    }
    return true;
  };

  const handleRemoveFriendCode = (code: string) => {
    const updated = removeFriendCode(code);
    setSavedFriendCodes(updated);
    setNotification({
      message: `Disconnected beacon ${code}.`,
      type: 'info'
    });
  };

  const handleNavigateToFriend = (coords: [number, number], name: string) => {
    const friendLoc: Location = {
      id: 'friend_beacon_' + Date.now(),
      officialName: `${name}'s Live Location`,
      aliases: [name],
      coordinates: coords,
      type: 'landmark',
      description: `Live meetup beacon shared by ${name}`,
      landmark: 'Live Friend Beacon'
    };
    handleLocationSelect(friendLoc);
    setMapView({ center: coords, zoom: 18 });
    setIsFollowingUser(false);
    setIsMeetupOpen(false);
    startNavigation();
    setNotification({
      message: `Navigating to ${name}'s live location!`,
      type: 'success'
    });
  };

  const handleFocusMapCoords = (coords: [number, number]) => {
    setMapView({ center: coords, zoom: 18 });
    setIsFollowingUser(false);
    setIsMeetupOpen(false);
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-rsu-bg">
      <CampusMap 
        mapView={mapView}
        isSatelliteView={isSatelliteView}
        filteredLocations={filteredLocations}
        selectedLocation={selectedLocation}
        startLocation={startLocation}
        userLocation={userLocation}
        navigationPath={navigationPath}
        mapFeatures={mapFeaturesData}
        onLocationSelect={(loc) => {
          if (loc) triggerHaptic(15);
          setSelectedLocation(loc);
          setMapView({ center: loc.coordinates, zoom: 18 });
          setIsFollowingUser(false);
        }}
        setStartLocation={(loc) => {
          if (loc) triggerHaptic(15);
          setStartLocation(loc);
        }}
        createCustomIcon={createCustomIcon}
        highlightedLocationId={highlightedLocationId}
        searchResults={searchResults}
        onMapMove={onMapMove}
        mapRotation={mapRotation}
        setMapRotation={setMapRotation}
        friendBeacons={friendBeacons}
        onNavigateToFriend={handleNavigateToFriend}
      />

      <CompassControl 
        rotation={mapRotation}
        onRotationChange={setMapRotation}
        hasActiveSelection={!!selectedLocation}
        isPanelExpanded={isPanelExpanded}
      />

      <Header 
        isVoiceAssistEnabled={isVoiceAssistEnabled}
        setIsMenuOpen={setIsMenuOpen}
        setIsVoiceAssistEnabled={setIsVoiceAssistEnabled}
        onNavigateHome={() => navigate('/')}
      />

      <NavigationHUD 
        isNavigating={isNavigating}
        currentManeuverIndex={currentManeuverIndex}
        maneuvers={maneuvers}
        totalRemainingDistance={totalRemainingDistance}
        onNextManeuver={nextManeuver}
        onEndSession={endSession}
      />

      <SearchOverlay 
        isNavigating={isNavigating}
        searchQuery={searchQuery}
        selectedLocation={selectedLocation}
        startLocation={startLocation}
        userLocation={userLocation}
        isListening={isListening}
        isSearchFocused={isSearchFocused}
        searchMode={searchMode}
        searchResults={searchResults}
        activeCategory={activeCategory}
        isSpeaking={isSpeaking}
        setSearchQuery={setSearchQuery}
        setSearchMode={setSearchMode}
        setIsSearchFocused={setIsSearchFocused}
        startListening={startListening}
        endSession={endSession}
        handleLocationSelect={handleLocationSelect}
        handleGetDirections={handleGetDirections}
        setActiveCategory={(cat) => {
          setActiveCategory(cat);
          if (cat === 'nearby') {
            setIsSearchFocused(true);
            if (userLocation) {
              setMapView({ center: userLocation, zoom: 17 });
            } else {
              setMapView({ center: RSU_CENTER, zoom: 16 });
            }
          }
        }}
        getCategoryIcon={getCategoryIcon}
        onToggleChat={handleToggleChat}
        highlightedLocationId={highlightedLocationId}
        onHighlightLocation={setHighlightedLocationId}
      />

      <FloatingActions 
        isSatelliteView={isSatelliteView} 
        setIsSatelliteView={setIsSatelliteView}
        setNotification={setNotification}
        handleLocateMe={handleLocateMe}
        isFollowingUser={isFollowingUser}
        toggleTimetable={handleToggleTimetable}
        toggleProfile={handleToggleProfile}
        isSignedIn={!!currentUser}
        currentUser={currentUser}
        hasActiveSelection={!!selectedLocation}
        isPanelExpanded={isPanelExpanded}
        isTimetableOpen={isTimetableOpen}
        isProfileOpen={isProfileOpen}
        isEventsPanelOpen={isEventsPanelOpen}
        isChatOpen={isChatOpen}
        onToggleChat={handleToggleChat}
        isMeetupOpen={isMeetupOpen}
        toggleMeetup={handleToggleMeetup}
        isLiveSharing={!!(activeLiveShareSession?.isActive && Date.now() < (activeLiveShareSession?.expiresAt || 0))}
        activeFriendsCount={friendBeacons.filter(b => b.session.isActive && Date.now() < b.session.expiresAt).length}
      />

      <AnimatePresence>
        {isProfileOpen && (
          <React.Suspense fallback={null}>
            <ProfilePanel 
              onClose={() => setIsProfileOpen(false)}
              currentUser={currentUser}
              onSignIn={() => handleSignIn(false)}
              onSignInRedirect={() => handleSignIn(true)}
              onSignOut={handleSignOut}
              onOpenTimetable={() => {
                setIsProfileOpen(false);
                setIsEventsPanelOpen(false);
                setIsChatOpen(false);
                setIsTimetableOpen(true);
                setOpenedFromProfile(true);
              }}
              onAddLocationClick={handleRequestAddLocation}
              onNavigateToLocation={handleEventNavigation}
              savedLocationsCount={savedLocationIds.length}
              savedLocations={allLocations.filter(loc => savedLocationIds.includes(loc.id))}
              onOpenTerms={() => { window.location.href = '/terms.html'; }}
              onOpenPrivacy={() => { window.location.href = '/privacy.html'; }}
            />
          </React.Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEventsPanelOpen && (
          <React.Suspense fallback={null}>
            <EventsPanel 
              onClose={() => setIsEventsPanelOpen(false)}
              onNavigateTo={handleEventNavigation}
              currentUser={currentUser}
              onSignIn={() => handleSignIn(false)}
            />
          </React.Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isTimetableOpen && (
          <React.Suspense fallback={null}>
            <TimetablePanel 
              onClose={() => {
                setIsTimetableOpen(false);
                setOpenedFromProfile(false);
              }}
              onBack={openedFromProfile ? () => {
                setIsTimetableOpen(false);
                setIsEventsPanelOpen(false);
                setIsChatOpen(false);
                setIsProfileOpen(true);
                setOpenedFromProfile(false);
              } : undefined}
              onNavigateTo={handleEventNavigation}
              currentUser={currentUser}
            />
          </React.Suspense>
        )}
      </AnimatePresence>

      <InfoPanel 
        selectedLocation={selectedLocation}
        isPanelExpanded={isPanelExpanded}
        isNavigating={isNavigating}
        savedLocationIds={savedLocationIds}
        plannedRoutes={plannedRoutes}
        selectedRouteId={selectedRouteId}
        navigationPath={navigationPath}
        setIsPanelExpanded={setIsPanelExpanded}
        handleGetDirections={handleGetDirections}
        setSelectedLocation={setSelectedLocation}
        setStartLocation={setStartLocation}
        endSession={endSession}
        playVoiceDirections={playVoiceDirections}
        toggleSaveLocation={toggleSaveLocation}
        setSelectedRouteId={setSelectedRouteId}
        calculateWalkingTime={calculateWalkingTime}
        maneuvers={maneuvers}
        currentManeuverIndex={currentManeuverIndex}
        onShareRoute={handleShareRoute}
      />

      <MenuDrawer 
        isMenuOpen={isMenuOpen}
        savedLocations={savedLocations}
        recentLocations={recentLocations}
        setIsMenuOpen={setIsMenuOpen}
        handleLocationSelect={handleLocationSelect}
        toggleSaveLocation={toggleSaveLocation}
        getCategoryIcon={getCategoryIcon}
        toggleEvents={handleToggleEvents}
        toggleTimetable={handleToggleTimetable}
        toggleMeetup={handleToggleMeetup}
        toggleProfile={handleToggleProfile}
        onToggleChat={handleToggleChat}
        isSatelliteView={isSatelliteView}
        setIsSatelliteView={setIsSatelliteView}
        handleLocateMe={handleLocateMe}
        isFollowingUser={isFollowingUser}
        user={currentUser}
        onSignIn={() => handleSignIn(false)}
        onSignInRedirect={() => handleSignIn(true)}
        onSignOut={handleSignOut}
        onOpenTerms={() => { window.location.href = '/terms.html'; }}
        onOpenPrivacy={() => { window.location.href = '/privacy.html'; }}
        onNavigateHome={() => navigate('/')}
        eventsCount={liveCampusEvents.length}
        activeFriendsCount={friendBeacons.filter(b => b.session.isActive && Date.now() < b.session.expiresAt).length}
        isLiveSharing={!!(activeLiveShareSession?.isActive && Date.now() < (activeLiveShareSession?.expiresAt || 0))}
      />

      {/* Meetup & Live Location Sharing Modal */}
      <AnimatePresence>
        {isMeetupOpen && (
          <React.Suspense fallback={null}>
            <MeetupShareModal
              isOpen={isMeetupOpen}
              onClose={() => setIsMeetupOpen(false)}
              currentUser={currentUser}
              userLocation={userLocation}
              activeSession={activeLiveShareSession}
              setActiveSession={setActiveLiveShareSession}
              friendBeacons={friendBeacons}
              onAddFriendCode={handleAddFriendCode}
              onRemoveFriendCode={handleRemoveFriendCode}
              onNavigateToCoords={handleNavigateToFriend}
              onFocusMapCoords={handleFocusMapCoords}
              setNotification={setNotification}
              onOpenSignIn={() => handleSignIn(false)}
            />
          </React.Suspense>
        )}
      </AnimatePresence>

      <React.Suspense fallback={null}>
        <ChatBot 
          onSendMessage={handleChatMessage}
          onLocationFocus={(id) => {
            const loc = allLocations.find(l => l.id === id);
            if (loc) handleLocationSelect(loc);
          }}
          isNavigating={isNavigating}
          activeManeuvers={maneuvers}
          onRecalculate={handleRecalculate}
          isOpen={isChatOpen}
          onOpenChange={handleChatOpenChange}
          showFloatingButton={false}
        />
      </React.Suspense>

      {/* Add Custom Location Dialog */}
      <AnimatePresence>
        {isAddLocationOpen && newLocCoords && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white dark:bg-[#1E293B] text-slate-800 dark:text-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-150 dark:border-slate-800"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-[#0ea5e9] to-[#0284c7] p-5 text-white flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg">Pin Custom Landmark</h3>
                  <p className="text-xs text-white/80 mt-0.5">Define your custom landmark on RSU Campus Registry</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddLocationOpen(false)}
                  className="p-1.5 hover:bg-white/10 rounded-full text-white transition-all text-xs font-semibold"
                >
                  ✕
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSaveCustomLocation} className="p-5 flex flex-col gap-4">
                {/* Coordinates Read-only Badge */}
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-100 dark:border-slate-800/80">
                  <div className="p-1 px-2.5 bg-[#0ea5e9]/10 text-[#0ea5e9] text-xs font-mono font-semibold rounded">
                    GPS LOCKED
                  </div>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    {newLocCoords[0].toFixed(6)}, {newLocCoords[1].toFixed(6)}
                  </span>
                </div>

                {/* Name */}
                <div>
                  <label htmlFor="custom-loc-name" className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Landmark Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="custom-loc-name"
                    type="text"
                    required
                    value={newLocName}
                    onChange={(e) => setNewLocName(e.target.value)}
                    placeholder="e.g. Our Lady Seat of Wisdom Catholic Church"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]"
                  />
                </div>

                {/* Alias */}
                <div>
                  <label htmlFor="custom-loc-aliases" className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Aliases / Alternate Names (Comma-separated)
                  </label>
                  <input
                    id="custom-loc-aliases"
                    type="text"
                    value={newLocAliasString}
                    onChange={(e) => setNewLocAliasString(e.target.value)}
                    placeholder="e.g. Wisdom Chapel, Catholic Church"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]"
                  />
                </div>

                {/* Category Type */}
                <div>
                  <label htmlFor="custom-loc-type" className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Category Type
                  </label>
                  <select
                    id="custom-loc-type"
                    value={newLocType}
                    onChange={(e) => setNewLocType(e.target.value as Category)}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]"
                  >
                    <option value="landmark">Landmark</option>
                    <option value="faculty">Faculty</option>
                    <option value="gate">Gate</option>
                    <option value="facility">Facility/Hall</option>
                    <option value="food">Food Spot</option>
                    <option value="department">Department</option>
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="custom-loc-desc" className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Description / Helpful Hint
                  </label>
                  <textarea
                    id="custom-loc-desc"
                    value={newLocDescription}
                    onChange={(e) => setNewLocDescription(e.target.value)}
                    placeholder="Describe how to recognize this spot, or its significance..."
                    rows={2}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9] resize-none"
                  />
                </div>

                {/* Submit & Cancel */}
                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddLocationOpen(false)}
                    className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-gradient-to-r from-[#0ea5e9] to-[#0284c7] hover:from-[#0284c7] hover:to-[#0369a1] text-white text-sm font-bold rounded-lg shadow-sm hover:shadow transition-all"
                  >
                    Save Landmark
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={cn(
              "fixed bottom-24 left-1/2 z-[1000] px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 min-w-[300px]",
              notification.type === 'error' ? "bg-red-600 text-white" : "bg-rsu-navy text-white"
            )}
          >
            {notification.type === 'error' ? <X size={20} /> : <Info size={20} />}
            <span className="font-medium">{notification.message}</span>
            <button onClick={() => setNotification(null)} className="ml-auto p-1 hover:bg-white/20 rounded-full">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOffline && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000] bg-rsu-green text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 font-bold text-xs"
          >
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            Offline Mode: Using cached map data
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {unauthorizedDomain && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden relative"
            >
              <button
                onClick={() => setUnauthorizedDomain(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                id="close-unauth-modal"
              >
                <X size={20} />
              </button>

              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-12 h-12 bg-rsu-orange/10 text-rsu-orange rounded-full flex items-center justify-center font-bold text-xl">
                  ⚠️
                </div>
                <h3 className="font-display font-black text-xl text-rsu-navy dark:text-white uppercase tracking-tight">
                  {unauthorizedDomain?.includes('run.app') || unauthorizedDomain?.includes('webcontainer.io') || unauthorizedDomain?.includes('localhost')
                    ? "Preview Domain Authorization Needed" 
                    : "Domain Authorization Needed"}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {unauthorizedDomain?.includes('run.app') || unauthorizedDomain?.includes('webcontainer.io') || unauthorizedDomain?.includes('localhost')
                    ? "To test Google Sign-In in your live AI Studio sandbox development environment, this preview domain must be whitelisted in your Firebase configuration Settings." 
                    : "To allow Google Sign-In popups on your hosted project, this domain must be whitelisted in your Firebase configuration Settings."}
                </p>
              </div>

              <div className="mt-6 space-y-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    {unauthorizedDomain?.includes('run.app') || unauthorizedDomain?.includes('webcontainer.io') || unauthorizedDomain?.includes('localhost')
                      ? "AI Studio Preview Domain" 
                      : "Your Domain Address"}
                  </label>
                  <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="font-mono font-bold select-all overflow-x-auto whitespace-nowrap no-scrollbar flex-1 text-rsu-navy dark:text-slate-100">
                      {unauthorizedDomain}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(unauthorizedDomain);
                        setNotification({ message: "Domain URL copied to clipboard!", type: 'success' });
                      }}
                      className="text-[10px] font-bold text-rsu-orange uppercase bg-rsu-orange/10 hover:bg-rsu-orange/20 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex gap-2">
                    <span className="w-5 h-5 rounded-full bg-rsu-green text-white flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                    <p className="text-slate-600 dark:text-slate-300">
                      Go to your <strong>Firebase Console</strong> &rarr; <strong>Authentication</strong> &rarr; <strong>Settings</strong> &rarr; <strong>Authorized Domains</strong>.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-5 h-5 rounded-full bg-rsu-green text-white flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                    <p className="text-slate-600 dark:text-slate-300">
                      Click <strong>Add domain</strong> and paste <code>{unauthorizedDomain}</code>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2.5">
                <div className="flex gap-2">
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-rsu-orange hover:bg-rsu-orange/90 text-white font-black text-xs uppercase py-3 rounded-xl transition-colors tracking-wider text-center flex items-center justify-center gap-1.5 shadow-md active:scale-98"
                  >
                    <span>Open in Full Tab ↗</span>
                  </a>
                  <button
                    onClick={handleGuestSignIn}
                    className="flex-1 bg-rsu-navy hover:bg-rsu-navy/90 text-white font-black text-xs uppercase py-3 rounded-xl transition-colors tracking-wider text-center cursor-pointer shadow-md active:scale-98"
                  >
                    Guest Student Pass
                  </button>
                </div>
                <button
                  onClick={() => setUnauthorizedDomain(null)}
                  className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs uppercase py-2.5 rounded-xl transition-colors tracking-wider cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
