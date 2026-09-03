import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  User as UserIcon, 
  Calendar, 
  MapPin, 
  BookOpen, 
  LogOut, 
  LogIn, 
  Sparkles, 
  Bookmark, 
  ShieldCheck, 
  ChevronRight,
  ArrowLeft,
  Search,
  Clock,
  Navigation,
  Info,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  ShieldAlert,
  Loader2,
  CalendarPlus,
  Building,
  BookmarkCheck,
  Check,
  CalendarDays,
  WifiOff,
  HardDrive,
  Database
} from 'lucide-react';
import { User } from 'firebase/auth';
import { cn } from '../../lib/utils';
import { locations } from '../../data/locations';
import { Location } from '../../types';
import { useCampusEvents } from '../../hooks/useCampusEvents';
import { CampusEvent, isAppOwner } from '../../data/events';

interface ProfilePanelProps {
  onClose: () => void;
  currentUser: User | null;
  onSignIn: () => void;
  onSignInRedirect?: () => void;
  onSignOut: () => void;
  onOpenTimetable: () => void;
  onAddLocationClick: () => void;
  onNavigateToLocation?: (locationId: string) => void;
  savedLocationsCount?: number;
  savedLocations?: Location[];
  onOpenTerms?: () => void;
  onOpenPrivacy?: () => void;
}

type ProfileSubView = 'main' | 'events' | 'add_event' | 'contribute' | 'saved' | 'rsvps';

export const ProfilePanel: React.FC<ProfilePanelProps> = ({
  onClose,
  currentUser,
  onSignIn,
  onSignInRedirect,
  onSignOut,
  onOpenTimetable,
  onAddLocationClick,
  onNavigateToLocation,
  savedLocationsCount = 0,
  savedLocations = [],
  onOpenTerms,
  onOpenPrivacy
}) => {
  const [currentView, setCurrentView] = useState<ProfileSubView>('main');
  const [eventCategory, setEventCategory] = useState<string>('all');
  const [eventsTab, setEventsTab] = useState<'all' | 'rsvped'>('all');
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const [eventDateFilter, setEventDateFilter] = useState('');
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [togglingRsvpId, setTogglingRsvpId] = useState<string | null>(null);
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [storageEstimate, setStorageEstimate] = useState<{ usageMB: string; quotaMB?: string } | null>(null);
  const [cacheClearedSuccess, setCacheClearedSuccess] = useState(false);

  // Read initial device storage estimate for cached assets & tiles
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((estimate) => {
        if (estimate.usage !== undefined) {
          const usageMB = (estimate.usage / (1024 * 1024)).toFixed(1);
          const quotaMB = estimate.quota ? (estimate.quota / (1024 * 1024)).toFixed(0) : undefined;
          setStorageEstimate({ usageMB, quotaMB });
        }
      }).catch(() => {});
    }
  }, []);

  const handleClearMapCache = async () => {
    setIsClearingCache(true);
    setCacheClearedSuccess(false);
    try {
      // 1. Clear CacheStorage API entries (map tiles, service worker asset caches)
      if (typeof window !== 'undefined' && 'caches' in window) {
        const cacheNames = await window.caches.keys();
        await Promise.all(
          cacheNames.map((name) => window.caches.delete(name))
        );
      }

      // 2. Clear IndexedDB tile/map storage if initialized
      if (typeof window !== 'undefined' && 'indexedDB' in window && indexedDB.databases) {
        try {
          const dbs = await indexedDB.databases();
          for (const dbInfo of dbs) {
            if (dbInfo.name && (
              dbInfo.name.toLowerCase().includes('tile') || 
              dbInfo.name.toLowerCase().includes('map') ||
              dbInfo.name.toLowerCase().includes('leaflet') ||
              dbInfo.name.toLowerCase().includes('cache')
            )) {
              indexedDB.deleteDatabase(dbInfo.name);
            }
          }
        } catch {}
      }

      // 3. Clear any offline map localStorage cached fragments
      if (typeof window !== 'undefined') {
        try {
          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (
              key.startsWith('rsu_tile_') || 
              key.startsWith('rsu_map_cache_') || 
              key.startsWith('map_tile_') || 
              key.startsWith('offline_tiles_')
            )) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(k => localStorage.removeItem(k));
        } catch {}
      }

      // Brief pause to allow browser storage garbage collection
      await new Promise(r => setTimeout(r, 450));

      // Refresh storage estimate
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        if (estimate.usage !== undefined) {
          const usageMB = (estimate.usage / (1024 * 1024)).toFixed(1);
          const quotaMB = estimate.quota ? (estimate.quota / (1024 * 1024)).toFixed(0) : undefined;
          setStorageEstimate({ usageMB, quotaMB });
        }
      }

      setCacheClearedSuccess(true);
      showToast("✓ Cached map data cleared! Storage space freed.");
      setTimeout(() => setCacheClearedSuccess(false), 5000);
    } catch (err: any) {
      showToast("Notice: " + (err?.message || "Could not clear all cache data"));
    } finally {
      setIsClearingCache(false);
    }
  };

  // New Event Form State
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    category: 'academic' as 'academic' | 'social' | 'sports' | 'conference' | 'other',
    locationId: locations[0]?.id || 'amphitheatre',
    customLocationName: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '10:00',
    endTime: '12:00',
    organizer: ''
  });

  const {
    events,
    rsvpedEvents,
    rsvpedEventIds,
    isRsvped,
    toggleRsvp,
    isLoading: isEventsLoading,
    isAdmin,
    canDeleteEvent,
    addEvent,
    deleteEvent
  } = useCampusEvents(currentUser);

  // Helper to extract initials
  const getInitials = (name?: string | null, email?: string | null) => {
    if (name && name.trim()) {
      const parts = name.trim().split(' ');
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }
    if (email && email.trim()) {
      return email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Base list for the events subview depending on tab
  const baseEventList = eventsTab === 'rsvped' ? rsvpedEvents : events;

  const filteredEvents = baseEventList.filter(event => {
    const matchesCategory = eventCategory === 'all' || event.category === eventCategory;
    const matchesDate = !eventDateFilter || event.date === eventDateFilter;

    const query = eventSearchQuery.trim().toLowerCase();
    if (!query) return matchesCategory && matchesDate;

    const matchedLocation = locations.find(l => l.id === event.locationId);
    const venueName = (matchedLocation?.officialName || '').toLowerCase();

    let formattedDate = '';
    try {
      if (event.date) {
        const d = new Date(event.date);
        formattedDate = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toLowerCase() + ' ' +
                        d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toLowerCase();
      }
    } catch {}

    const matchesSearch = 
      event.title.toLowerCase().includes(query) || 
      event.description.toLowerCase().includes(query) ||
      event.organizer.toLowerCase().includes(query) ||
      event.date.toLowerCase().includes(query) ||
      formattedDate.includes(query) ||
      venueName.includes(query);

    return matchesCategory && matchesDate && matchesSearch;
  });

  const getEventCategoryBadge = (category: string) => {
    switch (category) {
      case 'academic': return 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800';
      case 'sports': return 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800';
      case 'social': return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700';
      case 'conference': return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700';
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!currentUser) {
      onSignIn();
      setFormError("Please sign in with your Google account to post events.");
      return;
    }

    if (!newEvent.title.trim()) {
      setFormError("Please provide an event title.");
      return;
    }

    if (!newEvent.description.trim()) {
      setFormError("Please provide an event description.");
      return;
    }

    try {
      setIsSubmittingEvent(true);
      await addEvent({
        title: newEvent.title.trim(),
        description: newEvent.description.trim(),
        category: newEvent.category,
        locationId: newEvent.locationId,
        date: newEvent.date,
        startTime: newEvent.startTime,
        endTime: newEvent.endTime,
        organizer: newEvent.organizer.trim() || currentUser.displayName || 'Campus Organizer'
      });

      setFormSuccess("Event published successfully to RSU Campus Guide!");
      setTimeout(() => {
        setCurrentView('events');
        setFormSuccess(null);
        setNewEvent({
          title: '',
          description: '',
          category: 'academic',
          locationId: locations[0]?.id || 'amphitheatre',
          customLocationName: '',
          date: new Date().toISOString().split('T')[0],
          startTime: '10:00',
          endTime: '12:00',
          organizer: ''
        });
      }, 1000);
    } catch (err: any) {
      setFormError(err?.message || "Failed to publish event. Please check your network connection.");
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  const handleDeleteEvent = async (event: CampusEvent) => {
    const isOwn = currentUser?.uid === event.creatorId || (currentUser?.email && event.creatorEmail === currentUser.email);
    const isOwner = isAppOwner(currentUser);
    const confirmPrompt = isOwner && !isOwn
      ? `[APP OWNER PRIVILEGE] Remove "${event.title}" permanently for all campus users?`
      : isAdmin && !isOwn
      ? `[ADMIN PRIVILEGE] Remove "${event.title}" for all students and campus users?`
      : `Delete your event "${event.title}"?`;

    if (!window.confirm(confirmPrompt)) {
      return;
    }

    try {
      setDeletingEventId(event.id);
      await deleteEvent(event.id);
      showToast("Event deleted.");
    } catch (err: any) {
      alert(err?.message || "Could not delete event. Check network permissions.");
    } finally {
      setDeletingEventId(null);
    }
  };

  const handleRsvpToggle = async (event: CampusEvent) => {
    if (!currentUser) {
      onSignIn();
      showToast("Sign in to save events to your profile.");
      return;
    }

    try {
      setTogglingRsvpId(event.id);
      const isNowRsvped = await toggleRsvp(event);
      showToast(isNowRsvped ? `✓ RSVP saved to your Profile Dashboard!` : `RSVP removed.`);
    } catch (err: any) {
      showToast(err?.message || "Failed to update RSVP.");
    } finally {
      setTogglingRsvpId(null);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-[100] bg-rsu-bg md:inset-auto md:right-4 md:bottom-4 md:w-[440px] md:h-[700px] md:max-h-[calc(100vh-32px)] md:rounded-3xl shadow-2xl flex flex-col border border-rsu-border overflow-hidden"
    >
      {/* Dynamic Header */}
      <div className="p-4 sm:p-5 border-b border-rsu-border/20 flex items-center justify-between bg-rsu-navy text-white md:rounded-t-3xl transition-colors">
        <div className="flex items-center gap-2.5 min-w-0">
          {currentView !== 'main' && (
            <button 
              onClick={() => {
                if (currentView === 'add_event') {
                  setCurrentView('events');
                } else {
                  setCurrentView('main');
                }
              }}
              className="p-2 -ml-1 hover:bg-white/10 rounded-xl transition-all cursor-pointer flex items-center gap-1 group"
              title="Back"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-emerald-400 group-hover:-translate-x-0.5 transition-transform" />
              <span className="text-xs font-bold hidden sm:inline text-white/90">Back</span>
            </button>
          )}

          <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            {currentView === 'main' && <UserIcon className="w-4 h-4 text-emerald-400" />}
            {currentView === 'events' && <Calendar className="w-4 h-4 text-purple-400" />}
            {currentView === 'rsvps' && <BookmarkCheck className="w-4 h-4 text-emerald-400" />}
            {currentView === 'add_event' && <CalendarPlus className="w-4 h-4 text-emerald-400" />}
            {currentView === 'contribute' && <MapPin className="w-4 h-4 text-sky-400" />}
            {currentView === 'saved' && <Bookmark className="w-4 h-4 text-amber-400" />}
          </div>

          <div className="truncate">
            <h2 className="text-base sm:text-lg font-black tracking-tight leading-tight truncate flex items-center gap-2">
              {currentView === 'main' && 'CAMPUS PROFILE'}
              {currentView === 'events' && 'CAMPUS EVENTS'}
              {currentView === 'rsvps' && 'MY RSVP’D EVENTS'}
              {currentView === 'add_event' && 'POST NEW EVENT'}
              {currentView === 'contribute' && 'CONTRIBUTE TO MAP'}
              {currentView === 'saved' && 'SAVED PLACES'}
              {isAdmin && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-black tracking-wider uppercase">
                  Admin
                </span>
              )}
            </h2>
            <p className="text-[10px] opacity-70 font-bold uppercase tracking-widest leading-none mt-0.5 truncate">
              {currentView === 'main' && 'Rivers State University'}
              {currentView === 'events' && 'Schedule, Search & RSVP Hub'}
              {currentView === 'rsvps' && 'Your Bookmarked & Attending Events'}
              {currentView === 'add_event' && 'Publish Campus Lecture, Match or Meeting'}
              {currentView === 'contribute' && 'GPS Verified Campus Landmarks'}
              {currentView === 'saved' && 'Your Bookmarked Locations'}
            </p>
          </div>
        </div>

        <button 
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer shrink-0 ml-2"
          aria-label="Close Profile"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
              <span>{toastMessage}</span>
            </div>
            <button onClick={() => setToastMessage(null)} className="text-[10px] uppercase font-bold text-white/80">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Multi-View Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 no-scrollbar">
        <AnimatePresence mode="wait">
          
          {/* 1. MAIN PROFILE VIEW */}
          {currentView === 'main' && (
            <motion.div
              key="main-view"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* User Account Card */}
              <div className="p-4 sm:p-5 bg-rsu-card rounded-2xl border border-rsu-border shadow-sm">
                {currentUser ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="relative shrink-0">
                        {currentUser.photoURL ? (
                          <img 
                            src={currentUser.photoURL} 
                            alt={currentUser.displayName || 'User Profile'}
                            referrerPolicy="no-referrer"
                            className="w-14 h-14 rounded-full border-2 border-emerald-500 object-cover shadow-sm"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-emerald-600 text-white font-bold text-lg flex items-center justify-center shadow-sm border-2 border-emerald-500">
                            {getInitials(currentUser.displayName, currentUser.email)}
                          </div>
                        )}
                        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-black text-rsu-navy dark:text-white truncate">
                            {currentUser.displayName || 'Campus User'}
                          </span>
                          {isAdmin ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-black flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                              Site Owner & Admin
                            </span>
                          ) : (
                            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-rsu-muted truncate mt-0.5 font-medium">
                          {currentUser.email}
                        </p>
                        <div className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Google Account Connected
                        </div>
                      </div>
                    </div>

                    {/* Admin Banner if Admin is Signed In */}
                    {isAdmin && (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-2.5 text-xs text-emerald-900 dark:text-emerald-200">
                        <ShieldAlert className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="block font-black text-emerald-700 dark:text-emerald-300">Administrator Privileges Enabled</strong>
                          <span className="text-[11px] leading-tight opacity-90">
                            You have authority to add official campus events and delete any event or community landmark posted across RSU Campus Guide.
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="pt-3 border-t border-rsu-border/40 flex items-center justify-between">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                        Signed in across Map, Timetable & Events Hub
                      </p>
                      <button
                        onClick={onSignOut}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3.5 text-center py-2">
                    <div className="w-12 h-12 rounded-2xl bg-rsu-navy/10 dark:bg-slate-800 flex items-center justify-center mx-auto text-rsu-navy dark:text-emerald-400">
                      <UserIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-rsu-navy dark:text-white">
                        Connect Your Google Account
                      </h3>
                      <p className="text-xs text-rsu-muted mt-1 max-w-xs mx-auto">
                        Sign in to post and manage campus events, RSVP & save schedules, sync your academic timetable, and bookmark places.
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 pt-1">
                      <button
                        onClick={onSignIn}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-rsu-navy dark:bg-emerald-600 hover:opacity-90 text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-[0.98] cursor-pointer"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>Sign In with Google</span>
                      </button>

                      {onSignInRedirect && (
                        <button
                          onClick={onSignInRedirect}
                          className="text-[11px] font-bold text-rsu-muted hover:text-rsu-navy dark:hover:text-white transition-colors cursor-pointer py-1"
                        >
                          Having trouble? Try Sign In with Redirect &rarr;
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Hub Options */}
              <div className="space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-rsu-muted px-1">
                  Campus Actions & Features
                </p>

                {/* 1. Events Option -> Switches view to 'events' */}
                <button
                  onClick={() => setCurrentView('events')}
                  className="w-full p-3.5 bg-rsu-card hover:bg-purple-50/50 dark:hover:bg-purple-950/20 border border-rsu-border hover:border-purple-400/40 rounded-2xl flex items-center justify-between text-left transition-all active:scale-[0.99] group cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-black text-rsu-navy dark:text-white">
                          Campus Events Hub
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300">
                          {events.length} Events
                        </span>
                        {isAdmin && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                            Admin Moderation
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-rsu-muted mt-0.5">
                        Search by name/date, RSVP, post schedules & matches
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-rsu-muted group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all" />
                </button>

                {/* 2. My Saved RSVPs Dashboard Card */}
                <button
                  onClick={() => setCurrentView('rsvps')}
                  className="w-full p-3.5 bg-rsu-card hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 border border-rsu-border hover:border-emerald-400/40 rounded-2xl flex items-center justify-between text-left transition-all active:scale-[0.99] group cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <BookmarkCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-rsu-navy dark:text-white">
                          My RSVP'd Events
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                          {rsvpedEventIds.length} Saved
                        </span>
                      </div>
                      <p className="text-[11px] text-rsu-muted mt-0.5">
                        {rsvpedEventIds.length > 0
                          ? `You are attending ${rsvpedEventIds.length} campus event${rsvpedEventIds.length > 1 ? 's' : ''}`
                          : 'View and manage all events you have RSVP’d to'}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-rsu-muted group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all" />
                </button>

                {/* 3. Contribute Option */}
                <button
                  onClick={() => setCurrentView('contribute')}
                  className="w-full p-3.5 bg-rsu-card hover:bg-sky-50/50 dark:hover:bg-sky-950/20 border border-rsu-border hover:border-sky-400/40 rounded-2xl flex items-center justify-between text-left transition-all active:scale-[0.99] group cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-rsu-navy dark:text-white">
                          Contribute to Map
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300">
                          GPS
                        </span>
                      </div>
                      <p className="text-[11px] text-rsu-muted mt-0.5">
                        Add unmapped departments, food spots or offices
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-rsu-muted group-hover:text-sky-500 group-hover:translate-x-0.5 transition-all" />
                </button>

                {/* 4. Timetable Sync */}
                <button
                  onClick={() => {
                    onClose();
                    onOpenTimetable();
                  }}
                  className="w-full p-3.5 bg-rsu-card hover:bg-orange-50/50 dark:hover:bg-orange-950/20 border border-rsu-border hover:border-orange-400/40 rounded-2xl flex items-center justify-between text-left transition-all active:scale-[0.99] group cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-rsu-orange flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-rsu-navy dark:text-white">
                          Academic Timetable
                        </span>
                        {currentUser && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                            Auto-Synced
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-rsu-muted mt-0.5">
                        Lectures, venues and class directions
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-rsu-muted group-hover:text-rsu-orange group-hover:translate-x-0.5 transition-all" />
                </button>

                {/* 5. Saved Places */}
                {savedLocationsCount > 0 && (
                  <button
                    onClick={() => setCurrentView('saved')}
                    className="w-full p-3.5 bg-rsu-card hover:bg-amber-50/50 dark:hover:bg-amber-950/20 border border-rsu-border hover:border-amber-400/40 rounded-2xl flex items-center justify-between text-left transition-all active:scale-[0.99] group cursor-pointer shadow-sm"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <Bookmark className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-rsu-navy dark:text-white">
                            Saved Campus Places
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                            {savedLocationsCount} Saved
                          </span>
                        </div>
                        <p className="text-[11px] text-rsu-muted mt-0.5">
                          Quick access to your bookmarked campus spots
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-rsu-muted group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all" />
                  </button>
                )}
              </div>

              {/* Offline Section */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-rsu-muted">
                    Offline
                  </p>
                  {storageEstimate && (
                    <span className="text-[10px] font-medium text-rsu-muted">
                      Cache: <span className="font-mono font-bold text-rsu-navy dark:text-white">{storageEstimate.usageMB} MB</span>
                    </span>
                  )}
                </div>

                <div className="p-4 bg-rsu-card border border-rsu-border rounded-2xl shadow-sm space-y-3">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                      <WifiOff className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-black text-rsu-navy dark:text-white">
                          Map Tiles & Offline Data
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          Local Cache
                        </span>
                      </div>
                      <p className="text-[11px] text-rsu-muted mt-0.5 leading-relaxed">
                        Campus map tiles, building outlines, and navigation assets are saved locally for offline accessibility and fast loading.
                      </p>
                    </div>
                  </div>

                  {cacheClearedSuccess && (
                    <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>Cached map data cleared! Device storage freed.</span>
                    </div>
                  )}

                  <button
                    onClick={handleClearMapCache}
                    disabled={isClearingCache}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all active:scale-[0.99] cursor-pointer shadow-sm border",
                      isClearingCache
                        ? "bg-slate-100 text-slate-400 dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-not-allowed"
                        : "bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/20 dark:hover:bg-red-950/40 dark:text-red-400 border-red-200 dark:border-red-900/40"
                    )}
                  >
                    {isClearingCache ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Clearing Map Data...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear Cached Map Data</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Single Sign-On Notice */}
              <div className="p-3.5 bg-emerald-500/10 dark:bg-emerald-950/30 rounded-2xl border border-emerald-500/20 flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  <strong>Unified Profile & RSVPs:</strong> Any event you RSVP to is automatically preserved across all your devices and accessible anytime directly from this profile dashboard.
                </p>
              </div>

              {/* Footer Links */}
              <div className="pt-2 border-t border-rsu-border/20 flex items-center justify-between text-[11px] text-rsu-muted px-1">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={onOpenTerms}
                    className="hover:text-rsu-navy dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Terms of Use
                  </button>
                  <span>•</span>
                  <button 
                    onClick={onOpenPrivacy}
                    className="hover:text-rsu-navy dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Privacy Policy
                  </button>
                </div>
                <span className="text-[10px] opacity-70 font-mono font-bold">RSU v2.5</span>
              </div>
            </motion.div>
          )}

          {/* 2. CAMPUS EVENTS SUBVIEW */}
          {currentView === 'events' && (
            <motion.div
              key="events-view"
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Back to Options Bar */}
              <button
                onClick={() => setCurrentView('main')}
                className="w-full py-2 px-3 bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-between transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <ArrowLeft className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Back to Profile Options</span>
                </div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Switch Option</span>
              </button>

              {/* Tab Switcher: All Events vs My RSVPs */}
              <div className="bg-rsu-border/15 p-1 rounded-xl flex items-center gap-1">
                <button
                  onClick={() => setEventsTab('all')}
                  className={cn(
                    "flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black transition-all cursor-pointer text-center",
                    eventsTab === 'all'
                      ? "bg-purple-600 text-white shadow-sm"
                      : "text-rsu-muted hover:text-rsu-text"
                  )}
                >
                  All Events ({events.length})
                </button>
                <button
                  onClick={() => setEventsTab('rsvped')}
                  className={cn(
                    "flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black transition-all cursor-pointer text-center flex items-center justify-center gap-1",
                    eventsTab === 'rsvped'
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-rsu-muted hover:text-rsu-text"
                  )}
                >
                  <BookmarkCheck className="w-3.5 h-3.5" />
                  <span>My RSVPs ({rsvpedEventIds.length})</span>
                </button>
              </div>

              {/* Admin Banner in Events Subview */}
              {isAdmin && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-2 text-emerald-800 dark:text-emerald-200">
                  <div className="flex items-center gap-2 text-xs">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div>
                      <strong className="font-bold text-[11px]">Admin Moderation Mode</strong>
                      <p className="text-[10px] opacity-80">You can delete any event and post official announcements.</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-500 text-white text-[9px] font-black uppercase">
                    Admin
                  </span>
                </div>
              )}

              {/* Action: Post New Event Button */}
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    if (!currentUser) {
                      onSignIn();
                      return;
                    }
                    setCurrentView('add_event');
                  }}
                  className="flex-1 py-2.5 px-3.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-purple-600/20 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{currentUser ? '+ Post New Campus Event' : 'Sign in to Post Event'}</span>
                </button>
              </div>

              {/* Search & Date Filter */}
              <div className="space-y-2.5">
                {/* Search Bar - Name or Date */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rsu-muted" />
                  <input 
                    type="text"
                    placeholder="Search by event name, date, venue or host..."
                    value={eventSearchQuery}
                    onChange={(e) => setEventSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-16 py-2 bg-rsu-card border border-rsu-border rounded-xl text-xs text-rsu-text placeholder:text-rsu-muted focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  />
                  {eventSearchQuery && (
                    <button 
                      onClick={() => setEventSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-rsu-muted hover:text-rsu-text bg-rsu-border/20 px-1.5 py-0.5 rounded"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Date Picker Filter */}
                <div className="flex items-center gap-1.5 bg-rsu-card px-3 py-1.5 rounded-xl border border-rsu-border">
                  <CalendarDays className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                  <span className="text-[10px] font-bold text-rsu-muted uppercase tracking-wider shrink-0">
                    Filter Date:
                  </span>
                  <input
                    type="date"
                    value={eventDateFilter}
                    onChange={(e) => setEventDateFilter(e.target.value)}
                    className="w-full bg-transparent text-[11px] font-semibold outline-none cursor-pointer text-rsu-text"
                  />
                  {eventDateFilter && (
                    <button
                      onClick={() => setEventDateFilter('')}
                      className="text-[9px] font-black uppercase text-red-500 hover:text-red-700 px-1"
                      title="Clear date filter"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Category Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {['all', 'sports', 'academic', 'conference', 'social', 'other'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setEventCategory(cat)}
                      className={cn(
                        "px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer",
                        eventCategory === cat
                          ? "bg-purple-600 text-white shadow-sm"
                          : "bg-rsu-card border border-rsu-border text-rsu-muted hover:text-rsu-text"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Events List */}
              <div className="space-y-3">
                {isEventsLoading ? (
                  <div className="p-8 text-center bg-rsu-card rounded-2xl border border-rsu-border text-rsu-muted flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                    <span className="text-xs font-bold">Loading campus events...</span>
                  </div>
                ) : filteredEvents.length === 0 ? (
                  <div className="p-8 text-center bg-rsu-card rounded-2xl border border-rsu-border text-rsu-muted space-y-2">
                    <Calendar className="w-8 h-8 mx-auto opacity-40 text-purple-500" />
                    <p className="text-xs font-bold">
                      {eventsTab === 'rsvped' ? 'No RSVP’d events found' : (eventSearchQuery || eventDateFilter) ? 'No matching campus events found' : 'No Events Scheduled'}
                    </p>
                    <p className="text-[11px] text-rsu-muted">
                      {eventsTab === 'rsvped'
                        ? 'Tap the "RSVP" button on any event to save it here.'
                        : (eventSearchQuery || eventDateFilter)
                          ? 'Try adjusting your search query or reset the date filter.'
                          : 'No campus events are currently scheduled until an event is created.'}
                    </p>
                  </div>
                ) : (
                  filteredEvents.map((evt) => {
                    const matchedLoc = locations.find(l => l.id === evt.locationId);
                    const canDelete = canDeleteEvent(evt);
                    const isDeleting = deletingEventId === evt.id;
                    const isToggling = togglingRsvpId === evt.id;
                    const userHasRsvped = isRsvped(evt.id);
                    const isOwnEvent = currentUser?.uid === evt.creatorId || (currentUser?.email && evt.creatorEmail === currentUser.email);

                    return (
                      <div 
                        key={evt.id}
                        className={cn(
                          "p-4 bg-rsu-card rounded-2xl border shadow-sm space-y-2.5 transition-all relative group",
                          userHasRsvped
                            ? "border-emerald-400 dark:border-emerald-500/50 shadow-md ring-1 ring-emerald-400/20"
                            : "border-rsu-border hover:border-purple-300 dark:hover:border-purple-900/60"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={cn("px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider", getEventCategoryBadge(evt.category))}>
                              {evt.category}
                            </span>
                            {userHasRsvped && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 flex items-center gap-1">
                                <Check className="w-2.5 h-2.5" />
                                RSVP'd
                              </span>
                            )}
                            {evt.date && (
                              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                {new Date(evt.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 text-[11px] text-rsu-muted font-bold">
                            <Clock className="w-3 h-3 text-purple-500" />
                            <span>{evt.startTime} - {evt.endTime}</span>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-xs font-black text-rsu-navy dark:text-white leading-snug">
                            {evt.title}
                          </h4>
                          <p className="text-[11px] text-rsu-muted mt-1 leading-relaxed">
                            {evt.description}
                          </p>
                        </div>

                        {/* Attribution & Organizer */}
                        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                          <span className="font-semibold truncate max-w-[200px]">
                            Host: {evt.organizer || 'RSU Community'}
                          </span>
                          {isOwnEvent ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              Posted by You
                            </span>
                          ) : evt.creatorEmail ? (
                            <span className="opacity-70 truncate max-w-[130px]" title={evt.creatorEmail}>
                              {evt.creatorEmail.split('@')[0]}
                            </span>
                          ) : (
                            <span className="opacity-70">Official</span>
                          )}
                        </div>

                        {/* Action buttons (RSVP, Directions & Delete) */}
                        <div className="pt-2 border-t border-rsu-border/40 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate max-w-[170px]">
                            <MapPin className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                            <span className="truncate">{matchedLoc?.officialName || 'RSU Campus Venue'}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* RSVP Button */}
                            <button
                              onClick={() => handleRsvpToggle(evt)}
                              disabled={isToggling}
                              className={cn(
                                "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm active:scale-95",
                                userHasRsvped
                                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                  : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                              )}
                              title={userHasRsvped ? "Cancel RSVP" : "Save RSVP to Profile Dashboard"}
                            >
                              {isToggling ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : userHasRsvped ? (
                                <>
                                  <BookmarkCheck className="w-3 h-3 text-emerald-200" />
                                  <span>Attending</span>
                                </>
                              ) : (
                                <>
                                  <Bookmark className="w-3 h-3" />
                                  <span>RSVP</span>
                                </>
                              )}
                            </button>

                            {/* Delete Button */}
                            {canDelete && (
                              <button
                                onClick={() => handleDeleteEvent(evt)}
                                disabled={isDeleting}
                                title={
                                  isAppOwner(currentUser) && !isOwnEvent
                                    ? "App Owner Delete Privilege (Delete any event)"
                                    : isAdmin && !isOwnEvent
                                    ? "Admin Delete Privilege (Delete any event)"
                                    : "Delete your event"
                                }
                                className={cn(
                                  "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer",
                                  isAppOwner(currentUser) && !isOwnEvent
                                    ? "bg-purple-500/10 text-purple-700 hover:bg-purple-600 hover:text-white border border-purple-500/20"
                                    : isAdmin && !isOwnEvent
                                    ? "bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white border border-red-500/20"
                                    : "text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                                )}
                              >
                                {isDeleting ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3 h-3" />
                                )}
                              </button>
                            )}

                            {/* Locate / Directions */}
                            <button
                              onClick={() => {
                                onClose();
                                if (onNavigateToLocation) {
                                  onNavigateToLocation(evt.locationId);
                                }
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer shadow-sm active:scale-95"
                              title="Navigate to venue on map"
                            >
                              <Navigation className="w-3 h-3" />
                              <span>Locate</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}

          {/* 3. MY RSVPS DEDICATED SUBVIEW */}
          {currentView === 'rsvps' && (
            <motion.div
              key="rsvps-view"
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Back to Options Bar */}
              <button
                onClick={() => setCurrentView('main')}
                className="w-full py-2 px-3 bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-between transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <ArrowLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Back to Profile Options</span>
                </div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Switch Option</span>
              </button>

              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-200">
                <BookmarkCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  These campus events are saved to your personal profile. You can get instant turn-by-turn directions or manage your attendance here.
                </p>
              </div>

              {/* RSVP List */}
              <div className="space-y-3">
                {rsvpedEvents.length === 0 ? (
                  <div className="p-8 text-center bg-rsu-card rounded-2xl border border-rsu-border text-rsu-muted space-y-2">
                    <BookmarkCheck className="w-8 h-8 mx-auto opacity-30 text-emerald-500" />
                    <p className="text-xs font-bold">No Saved RSVPs Yet</p>
                    <p className="text-[11px] text-rsu-muted">
                      Browse the Campus Events Hub and click "RSVP" to bookmark events directly to your dashboard.
                    </p>
                    <button
                      onClick={() => setCurrentView('events')}
                      className="mt-2 text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline inline-block cursor-pointer"
                    >
                      Browse Campus Events &rarr;
                    </button>
                  </div>
                ) : (
                  rsvpedEvents.map((evt) => {
                    const matchedLoc = locations.find(l => l.id === evt.locationId);
                    const isToggling = togglingRsvpId === evt.id;

                    return (
                      <div 
                        key={evt.id}
                        className="p-4 bg-rsu-card rounded-2xl border border-emerald-400/40 shadow-sm space-y-2.5 hover:shadow-md transition-shadow relative"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider", getEventCategoryBadge(evt.category))}>
                              {evt.category}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                              ✓ Attending
                            </span>
                          </div>

                          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                            <Calendar className="w-3 h-3 text-rsu-orange" />
                            <span>{new Date(evt.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-xs font-black text-rsu-navy dark:text-white leading-snug">
                            {evt.title}
                          </h4>
                          <p className="text-[11px] text-rsu-muted mt-1 line-clamp-2">
                            {evt.description}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-purple-500" />
                            <span>{evt.startTime} - {evt.endTime}</span>
                          </div>
                          <div className="flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 text-rsu-orange shrink-0" />
                            <span className="truncate">{matchedLoc?.officialName || 'RSU Campus'}</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-rsu-border/40 flex items-center justify-between gap-2">
                          <button
                            onClick={() => handleRsvpToggle(evt)}
                            disabled={isToggling}
                            className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                          >
                            {isToggling ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Cancel RSVP'}
                          </button>

                          <button
                            onClick={() => {
                              onClose();
                              if (onNavigateToLocation) {
                                onNavigateToLocation(evt.locationId);
                              }
                            }}
                            className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer shadow-sm"
                          >
                            <Navigation className="w-3 h-3" />
                            <span>Get Directions</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}

          {/* 4. ADD EVENT SUBVIEW */}
          {currentView === 'add_event' && (
            <motion.div
              key="add-event-view"
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Back to Events Bar */}
              <button
                onClick={() => setCurrentView('events')}
                className="w-full py-2 px-3 bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-between transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <ArrowLeft className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Back to Events List</span>
                </div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Cancel</span>
              </button>

              <form onSubmit={handleCreateEvent} className="space-y-3.5 bg-rsu-card p-4 rounded-2xl border border-rsu-border shadow-sm">
                <div className="flex items-center justify-between border-b border-rsu-border/40 pb-2.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-rsu-navy dark:text-white flex items-center gap-1.5">
                    <CalendarPlus className="w-4 h-4 text-purple-500" />
                    New Event Details
                  </h3>
                  {isAdmin && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase border border-emerald-500/20">
                      Official Admin Post
                    </span>
                  )}
                </div>

                {formError && (
                  <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {formSuccess && (
                  <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{formSuccess}</span>
                  </div>
                )}

                {/* Event Title */}
                <div>
                  <label className="block text-[11px] font-bold text-rsu-navy dark:text-white mb-1">
                    Event Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SUG Football Match Finals"
                    value={newEvent.title}
                    onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                    className="w-full px-3 py-2 bg-rsu-bg border border-rsu-border rounded-xl text-xs text-rsu-text focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                  />
                </div>

                {/* Category & Location */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-rsu-navy dark:text-white mb-1">
                      Category *
                    </label>
                    <select
                      value={newEvent.category}
                      onChange={(e) => setNewEvent({ ...newEvent, category: e.target.value as any })}
                      className="w-full px-3 py-2 bg-rsu-bg border border-rsu-border rounded-xl text-xs text-rsu-text focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                    >
                      <option value="academic">Academic / Lecture</option>
                      <option value="sports">Sports / Match</option>
                      <option value="social">Social / Entertainment</option>
                      <option value="conference">Conference / Workshop</option>
                      <option value="other">Ceremony / Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-rsu-navy dark:text-white mb-1">
                      Venue / Location *
                    </label>
                    <select
                      value={newEvent.locationId}
                      onChange={(e) => setNewEvent({ ...newEvent, locationId: e.target.value })}
                      className="w-full px-3 py-2 bg-rsu-bg border border-rsu-border rounded-xl text-xs text-rsu-text focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                    >
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.officialName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Date & Times */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-rsu-navy dark:text-white mb-1">
                      Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={newEvent.date}
                      onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                      className="w-full px-2 py-2 bg-rsu-bg border border-rsu-border rounded-xl text-[11px] text-rsu-text focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-rsu-navy dark:text-white mb-1">
                      Start Time *
                    </label>
                    <input
                      type="time"
                      required
                      value={newEvent.startTime}
                      onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                      className="w-full px-2 py-2 bg-rsu-bg border border-rsu-border rounded-xl text-[11px] text-rsu-text focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-rsu-navy dark:text-white mb-1">
                      End Time *
                    </label>
                    <input
                      type="time"
                      required
                      value={newEvent.endTime}
                      onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                      className="w-full px-2 py-2 bg-rsu-bg border border-rsu-border rounded-xl text-[11px] text-rsu-text focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                    />
                  </div>
                </div>

                {/* Organizer */}
                <div>
                  <label className="block text-[11px] font-bold text-rsu-navy dark:text-white mb-1">
                    Organizer / Host
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Faculty of Engineering / SUG / Tech Club"
                    value={newEvent.organizer}
                    onChange={(e) => setNewEvent({ ...newEvent, organizer: e.target.value })}
                    className="w-full px-3 py-2 bg-rsu-bg border border-rsu-border rounded-xl text-xs text-rsu-text focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-[11px] font-bold text-rsu-navy dark:text-white mb-1">
                    Description *
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Provide details about the schedule, requirements, or agenda..."
                    value={newEvent.description}
                    onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                    className="w-full px-3 py-2 bg-rsu-bg border border-rsu-border rounded-xl text-xs text-rsu-text focus:outline-none focus:ring-2 focus:ring-purple-500/30 resize-none"
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmittingEvent}
                  className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-purple-600/20 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingEvent ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Publishing Event...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Publish Event to Campus</span>
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          )}

          {/* 5. CONTRIBUTE SUBVIEW */}
          {currentView === 'contribute' && (
            <motion.div
              key="contribute-view"
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Back to Options Bar */}
              <button
                onClick={() => setCurrentView('main')}
                className="w-full py-2 px-3 bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-between transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <ArrowLeft className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span>Back to Profile Options</span>
                </div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Switch Option</span>
              </button>

              {/* Contributor Guide Card */}
              <div className="p-4 bg-sky-500/10 dark:bg-sky-950/30 rounded-2xl border border-sky-500/20 space-y-3">
                <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300">
                  <MapPin className="w-5 h-5" />
                  <h3 className="text-xs font-black uppercase tracking-wider">How to Add Campus Landmarks</h3>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Help fellow RSU students and lecturers find new lecture halls, eateries, ATM points, or student centers by submitting GPS-verified location pins.
                </p>

                <div className="space-y-2 pt-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span><strong>1. Stand at the venue:</strong> Ensure your phone or laptop GPS is enabled and inside the campus.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span><strong>2. Tap 'Launch GPS Pin':</strong> The app will capture your geodetic coordinates automatically.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span><strong>3. Add details & category:</strong> Enter the official name, known aliases, and nearby landmark reference.</span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => {
                  onClose();
                  onAddLocationClick();
                }}
                className="w-full py-3.5 px-4 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
              >
                <MapPin className="w-4 h-4" />
                <span>Launch Contributor GPS Pin</span>
              </button>

              {!currentUser && (
                <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 flex items-start gap-2 text-amber-800 dark:text-amber-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-[11px]">
                    You need to be signed in to submit landmarks so contributions can be verified and attributed to your student account.
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* 6. SAVED PLACES SUBVIEW */}
          {currentView === 'saved' && (
            <motion.div
              key="saved-view"
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Back to Options Bar */}
              <button
                onClick={() => setCurrentView('main')}
                className="w-full py-2 px-3 bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-between transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <ArrowLeft className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Back to Profile Options</span>
                </div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Switch Option</span>
              </button>

              <div className="space-y-2.5">
                {savedLocations.length === 0 ? (
                  <div className="p-8 text-center bg-rsu-card rounded-2xl border border-rsu-border text-rsu-muted space-y-2">
                    <Bookmark className="w-8 h-8 mx-auto opacity-40 text-amber-500" />
                    <p className="text-xs font-bold">No saved locations yet.</p>
                    <p className="text-[11px] text-rsu-muted">Tap the bookmark or star icon on any campus building card to save it here.</p>
                  </div>
                ) : (
                  savedLocations.map((loc) => (
                    <div
                      key={loc.id}
                      className="p-3.5 bg-rsu-card rounded-2xl border border-rsu-border shadow-sm flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 font-bold text-xs">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-black text-rsu-navy dark:text-white truncate">
                            {loc.officialName}
                          </h4>
                          <p className="text-[10px] text-rsu-muted truncate mt-0.5">
                            {loc.landmark || loc.address || 'RSU Campus'}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          onClose();
                          if (onNavigateToLocation) {
                            onNavigateToLocation(loc.id);
                          }
                        }}
                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer shrink-0 shadow-sm"
                      >
                        View
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </motion.div>
  );
};
