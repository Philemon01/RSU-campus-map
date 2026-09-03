import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  MapPin, 
  Clock, 
  Filter, 
  X, 
  ChevronRight, 
  Search, 
  Plus, 
  Trash2, 
  ShieldCheck, 
  ShieldAlert, 
  Loader2, 
  CalendarPlus, 
  AlertCircle, 
  CheckCircle2, 
  ArrowLeft,
  BookmarkCheck,
  Bookmark,
  CalendarCheck,
  Check,
  Sparkles,
  CalendarDays
} from 'lucide-react';
import { User } from 'firebase/auth';
import { locations } from '../../data/locations';
import { useCampusEvents } from '../../hooks/useCampusEvents';
import { CampusEvent, isAppOwner } from '../../data/events';
import { cn } from '../../lib/utils';

interface EventsPanelProps {
  onClose: () => void;
  onNavigateTo: (locationId: string) => void;
  currentUser?: User | null;
  onSignIn?: () => void;
}

export const EventsPanel: React.FC<EventsPanelProps> = ({ 
  onClose, 
  onNavigateTo,
  currentUser = null,
  onSignIn
}) => {
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'all' | 'rsvped'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('');
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [togglingRsvpId, setTogglingRsvpId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [rsvpNotification, setRsvpNotification] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Event Form State
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    category: 'academic' as 'academic' | 'social' | 'sports' | 'conference' | 'other',
    locationId: locations[0]?.id || 'amphitheatre',
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
    isLoading,
    isAdmin,
    canDeleteEvent,
    addEvent,
    deleteEvent
  } = useCampusEvents(currentUser);

  // Filter events based on active tab, category, search query (name/description/organizer/venue/date), and explicit date filter
  const baseEventList = activeTab === 'rsvped' ? rsvpedEvents : events;

  const filteredEvents = baseEventList.filter(event => {
    // 1. Category Filter
    const matchesCategory = filterCategory === 'all' || event.category === filterCategory;

    // 2. Specific Date Picker Filter
    const matchesDateFilter = !selectedDateFilter || event.date === selectedDateFilter;

    // 3. Search query (matches title/name, description, organizer, venue, or formatted date string)
    const query = searchQuery.trim().toLowerCase();
    if (!query) return matchesCategory && matchesDateFilter;

    const matchedLocation = locations.find(l => l.id === event.locationId);
    const venueName = (matchedLocation?.officialName || '').toLowerCase();
    
    // Format event date into common representations for text search (e.g., "15 May", "May 15", "2026-05-15")
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

    return matchesCategory && matchesDateFilter && matchesSearch;
  });

  const getCategoryColor = (cat: string) => {
    switch(cat) {
      case 'academic': return 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800';
      case 'social': return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700';
      case 'sports': return 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800';
      case 'conference': return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700';
      default: return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700';
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!currentUser) {
      if (onSignIn) onSignIn();
      setFormError("Please sign in with your Google account to post events.");
      return;
    }

    if (!newEvent.title.trim()) {
      setFormError("Please provide an event title.");
      return;
    }

    if (!newEvent.description.trim()) {
      setFormError("Please provide a description.");
      return;
    }

    try {
      setIsSubmitting(true);
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

      setFormSuccess("Event published successfully!");
      setTimeout(() => {
        setIsAddingEvent(false);
        setFormSuccess(null);
        setNewEvent({
          title: '',
          description: '',
          category: 'academic',
          locationId: locations[0]?.id || 'amphitheatre',
          date: new Date().toISOString().split('T')[0],
          startTime: '10:00',
          endTime: '12:00',
          organizer: ''
        });
      }, 900);
    } catch (err: any) {
      setFormError(err?.message || "Failed to publish event.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (event: CampusEvent) => {
    const isOwn = currentUser?.uid === event.creatorId || (currentUser?.email && event.creatorEmail === currentUser.email);
    const isOwner = isAppOwner(currentUser);
    const confirmPrompt = isOwner && !isOwn
      ? `[APP OWNER PRIVILEGE] Remove "${event.title}" permanently for all campus users?`
      : isAdmin && !isOwn
      ? `[ADMIN PRIVILEGE] Remove "${event.title}" for all students and campus users?`
      : `Delete your event "${event.title}"?`;

    if (!window.confirm(confirmPrompt)) return;

    try {
      setDeletingEventId(event.id);
      await deleteEvent(event.id);
    } catch (err: any) {
      alert(err?.message || "Failed to delete event.");
    } finally {
      setDeletingEventId(null);
    }
  };

  const handleRsvpClick = async (event: CampusEvent) => {
    if (!currentUser) {
      if (onSignIn) onSignIn();
      setRsvpNotification("Please sign in to save events to your profile.");
      setTimeout(() => setRsvpNotification(null), 3500);
      return;
    }

    try {
      setTogglingRsvpId(event.id);
      const isNowRsvped = await toggleRsvp(event);
      setRsvpNotification(
        isNowRsvped 
          ? `RSVP saved! Added to your Profile Dashboard.` 
          : `Removed from your Saved RSVPs.`
      );
      setTimeout(() => setRsvpNotification(null), 3000);
    } catch (err: any) {
      setRsvpNotification(err?.message || "Failed to update RSVP.");
      setTimeout(() => setRsvpNotification(null), 3000);
    } finally {
      setTogglingRsvpId(null);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }}
      className="fixed inset-0 z-[100] bg-rsu-bg md:inset-auto md:right-4 md:bottom-4 md:w-96 md:h-[650px] md:max-h-[calc(100vh-32px)] md:rounded-3xl shadow-2xl flex flex-col border border-rsu-border overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-rsu-border/20 flex items-center justify-between bg-rsu-navy text-white md:rounded-t-3xl">
        <div className="flex items-center gap-2">
          {isAddingEvent && (
            <button
              onClick={() => setIsAddingEvent(false)}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors mr-1 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5 text-emerald-400" />
            </button>
          )}
          <div>
            <h2 className="text-lg font-black italic tracking-tighter flex items-center gap-2">
              {isAddingEvent ? 'POST CAMPUS EVENT' : 'RSU EVENTS'}
              {isAppOwner(currentUser) ? (
                <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[9px] font-black tracking-wider uppercase not-italic">
                  App Owner
                </span>
              ) : isAdmin ? (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-black tracking-wider uppercase not-italic">
                  Admin
                </span>
              ) : null}
            </h2>
            <p className="text-[10px] opacity-70 font-bold uppercase tracking-widest leading-none">
              {isAddingEvent ? 'Add lectures, matches & meetings' : 'Schedule, Search & RSVP Hub'}
            </p>
          </div>
        </div>

        <button 
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Toast Notification Banner */}
      <AnimatePresence>
        {rsvpNotification && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between shadow-inner"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-200" />
              <span className="text-[11px]">{rsvpNotification}</span>
            </div>
            <button 
              onClick={() => setRsvpNotification(null)}
              className="text-white/80 hover:text-white text-[10px] uppercase font-bold"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* App Owner & Admin Privileges Ribbon */}
      {isAppOwner(currentUser) && !isAddingEvent ? (
        <div className="px-4 py-2 bg-purple-500/10 border-b border-purple-500/20 flex items-center justify-between text-xs text-purple-900 dark:text-purple-200">
          <div className="flex items-center gap-1.5 text-[11px] font-bold">
            <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0" />
            <span>App Owner Active: Delete & Moderation Privileges</span>
          </div>
          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-purple-600 text-white shrink-0">
            App Owner
          </span>
        </div>
      ) : isAdmin && !isAddingEvent ? (
        <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-200">
          <div className="flex items-center gap-1.5 text-[11px] font-bold">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Admin Active: Delete & Moderation Privileges</span>
          </div>
          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500 text-white">
            Admin
          </span>
        </div>
      ) : null}

      {isAddingEvent ? (
        /* Event Creation Form */
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 no-scrollbar">
          <form onSubmit={handleCreateEvent} className="space-y-3 bg-rsu-card p-3.5 rounded-2xl border border-rsu-border">
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

            <div>
              <label className="block text-[10px] font-bold uppercase text-rsu-navy dark:text-white mb-1">
                Event Title *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. SUG Football Match Finals"
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                className="w-full px-3 py-2 bg-rsu-bg border border-rsu-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rsu-navy/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold uppercase text-rsu-navy dark:text-white mb-1">
                  Category *
                </label>
                <select
                  value={newEvent.category}
                  onChange={(e) => setNewEvent({ ...newEvent, category: e.target.value as any })}
                  className="w-full px-2.5 py-2 bg-rsu-bg border border-rsu-border rounded-xl text-xs focus:outline-none"
                >
                  <option value="academic">Academic</option>
                  <option value="sports">Sports</option>
                  <option value="social">Social</option>
                  <option value="conference">Conference</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-rsu-navy dark:text-white mb-1">
                  Venue *
                </label>
                <select
                  value={newEvent.locationId}
                  onChange={(e) => setNewEvent({ ...newEvent, locationId: e.target.value })}
                  className="w-full px-2.5 py-2 bg-rsu-bg border border-rsu-border rounded-xl text-xs focus:outline-none"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.officialName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-bold uppercase text-rsu-navy dark:text-white mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  required
                  value={newEvent.date}
                  onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                  className="w-full px-2 py-2 bg-rsu-bg border border-rsu-border rounded-xl text-[11px]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-rsu-navy dark:text-white mb-1">
                  Start *
                </label>
                <input
                  type="time"
                  required
                  value={newEvent.startTime}
                  onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                  className="w-full px-2 py-2 bg-rsu-bg border border-rsu-border rounded-xl text-[11px]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-rsu-navy dark:text-white mb-1">
                  End *
                </label>
                <input
                  type="time"
                  required
                  value={newEvent.endTime}
                  onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                  className="w-full px-2 py-2 bg-rsu-bg border border-rsu-border rounded-xl text-[11px]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-rsu-navy dark:text-white mb-1">
                Organizer / Host
              </label>
              <input
                type="text"
                placeholder="e.g. Faculty of Engineering / SUG"
                value={newEvent.organizer}
                onChange={(e) => setNewEvent({ ...newEvent, organizer: e.target.value })}
                className="w-full px-3 py-2 bg-rsu-bg border border-rsu-border rounded-xl text-xs focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-rsu-navy dark:text-white mb-1">
                Description *
              </label>
              <textarea
                rows={3}
                required
                placeholder="Event agenda, requirements, details..."
                value={newEvent.description}
                onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                className="w-full px-3 py-2 bg-rsu-bg border border-rsu-border rounded-xl text-xs focus:outline-none resize-none"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAddingEvent(false)}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 bg-rsu-navy text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Publishing...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>Publish Event</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Event List View */
        <>
          {/* Action & Filter Bar */}
          <div className="p-3.5 space-y-3 border-b border-rsu-border/10 bg-rsu-card/50">
            {/* Top Row: Tab Switcher & Post Event Action */}
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-rsu-border/15 p-1 rounded-xl flex items-center gap-1">
                <button
                  onClick={() => setActiveTab('all')}
                  className={cn(
                    "flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black transition-all cursor-pointer text-center",
                    activeTab === 'all'
                      ? "bg-rsu-navy text-white shadow-sm"
                      : "text-rsu-muted hover:text-rsu-text"
                  )}
                >
                  All Events ({events.length})
                </button>
                <button
                  onClick={() => setActiveTab('rsvped')}
                  className={cn(
                    "flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black transition-all cursor-pointer text-center flex items-center justify-center gap-1",
                    activeTab === 'rsvped'
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-rsu-muted hover:text-rsu-text"
                  )}
                >
                  <BookmarkCheck className="w-3.5 h-3.5" />
                  <span>My RSVPs ({rsvpedEventIds.length})</span>
                </button>
              </div>

              <button
                onClick={() => {
                  if (!currentUser && onSignIn) {
                    onSignIn();
                    return;
                  }
                  setIsAddingEvent(true);
                }}
                className="py-2 px-3 bg-rsu-orange hover:bg-rsu-navy text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-sm transition-colors cursor-pointer shrink-0"
                title="Post a new campus event"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Post</span>
              </button>
            </div>

            {/* Search Bar - Supports filtering by Event Name, Organizer, Venue or Date */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rsu-muted" />
                <input 
                  type="text"
                  placeholder="Search by event name, date, venue or host..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-rsu-border/10 border border-rsu-border/20 rounded-xl py-2 pl-9 pr-16 text-xs focus:ring-2 focus:ring-rsu-navy/20 outline-none transition-shadow placeholder:text-rsu-muted/70"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-black text-rsu-muted hover:text-rsu-navy dark:hover:text-white px-1.5 py-0.5 rounded bg-rsu-border/20"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Date Filter Quick Picker Row */}
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-1.5 bg-rsu-border/10 px-2.5 py-1.5 rounded-xl border border-rsu-border/20">
                  <CalendarDays className="w-3.5 h-3.5 text-rsu-orange shrink-0" />
                  <span className="text-[10px] font-bold text-rsu-muted uppercase tracking-wider shrink-0">
                    Filter Date:
                  </span>
                  <input
                    type="date"
                    value={selectedDateFilter}
                    onChange={(e) => setSelectedDateFilter(e.target.value)}
                    className="w-full bg-transparent text-[11px] font-semibold outline-none cursor-pointer text-rsu-navy dark:text-white"
                  />
                  {selectedDateFilter && (
                    <button
                      onClick={() => setSelectedDateFilter('')}
                      className="text-[9px] font-black uppercase text-red-500 hover:text-red-700 px-1"
                      title="Clear date filter"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Category Filter Badges */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
              {['all', 'academic', 'sports', 'social', 'conference', 'other'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer
                    ${filterCategory === cat 
                      ? 'bg-rsu-navy text-white shadow-sm' 
                      : 'bg-rsu-border/10 text-rsu-muted hover:bg-rsu-border/20'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Event List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 no-scrollbar">
            <AnimatePresence mode="popLayout">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-rsu-orange mb-2" />
                  <p className="text-xs font-bold text-rsu-muted">Loading campus events...</p>
                </div>
              ) : filteredEvents.length > 0 ? (
                filteredEvents.map((event) => {
                  const location = locations.find(l => l.id === event.locationId);
                  const canDelete = canDeleteEvent(event);
                  const isDeleting = deletingEventId === event.id;
                  const isToggling = togglingRsvpId === event.id;
                  const userHasRsvped = isRsvped(event.id);
                  const isOwn = currentUser?.uid === event.creatorId || (currentUser?.email && event.creatorEmail === currentUser.email);

                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      key={event.id}
                      className={cn(
                        "bg-white dark:bg-rsu-card rounded-2xl p-4 border transition-all group relative",
                        userHasRsvped
                          ? "border-emerald-400 dark:border-emerald-500/50 shadow-md ring-1 ring-emerald-400/30"
                          : "border-rsu-border/30 shadow-sm hover:shadow-md"
                      )}
                    >
                      {/* Top Badges */}
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tighter ${getCategoryColor(event.category)}`}>
                            {event.category}
                          </span>
                          {userHasRsvped && (
                            <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 flex items-center gap-1">
                              <Check className="w-2.5 h-2.5" />
                              RSVP'd
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1 text-[9px] font-bold text-rsu-muted bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                          <Calendar className="w-3 h-3 text-rsu-orange" />
                          {event.date ? new Date(event.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Upcoming'}
                        </div>
                      </div>

                      <h3 className="font-black text-rsu-navy dark:text-white text-sm mb-1 leading-tight">{event.title}</h3>
                      <p className="text-[10px] text-rsu-muted line-clamp-2 mb-3 leading-relaxed">
                        {event.description}
                      </p>

                      <div className="space-y-1.5 mb-3.5 bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-rsu-border/20">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-rsu-navy/80 dark:text-slate-300">
                          <Clock className="w-3.5 h-3.5 text-rsu-orange shrink-0" />
                          <span>{event.startTime} - {event.endTime}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-rsu-navy/80 dark:text-slate-300">
                          <MapPin className="w-3.5 h-3.5 text-rsu-orange shrink-0" />
                          <span className="truncate">{location?.officialName || 'RSU Campus Location'}</span>
                        </div>
                      </div>

                      {/* Organizer & Attribution */}
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-3 pt-1 border-t border-rsu-border/20">
                        <span className="font-semibold truncate max-w-[170px]">
                          Host: {event.organizer || 'RSU'}
                        </span>
                        {isOwn ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[9px]">
                            Posted by You
                          </span>
                        ) : event.creatorEmail ? (
                          <span className="opacity-70 text-[9px] truncate max-w-[120px]">
                            {event.creatorEmail.split('@')[0]}
                          </span>
                        ) : (
                          <span className="opacity-70 text-[9px]">Official</span>
                        )}
                      </div>

                      {/* Actions: RSVP, Directions, Delete */}
                      <div className="flex items-center gap-2 pt-1">
                        {/* RSVP Action Button */}
                        <button
                          onClick={() => handleRsvpClick(event)}
                          disabled={isToggling}
                          className={cn(
                            "flex-1 py-2 px-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95",
                            userHasRsvped
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                              : "bg-rsu-navy hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700"
                          )}
                          title={userHasRsvped ? "Remove RSVP from Profile" : "Save RSVP to Profile Dashboard"}
                        >
                          {isToggling ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : userHasRsvped ? (
                            <>
                              <BookmarkCheck className="w-3.5 h-3.5 text-emerald-200" />
                              <span>Attending</span>
                            </>
                          ) : (
                            <>
                              <Bookmark className="w-3.5 h-3.5" />
                              <span>RSVP</span>
                            </>
                          )}
                        </button>

                        {/* Directions / Locate Button */}
                        <button
                          onClick={() => onNavigateTo(event.locationId)}
                          className="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white transition-all rounded-xl flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-wider cursor-pointer shadow-sm active:scale-95"
                          title="Get directions to venue"
                        >
                          <span>Directions</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>

                        {/* Delete Button */}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(event)}
                            disabled={isDeleting}
                            title={
                              isAppOwner(currentUser) && !isOwn
                                ? "App Owner Delete Privilege (Delete any event)"
                                : isAdmin && !isOwn
                                ? "Admin Delete Privilege (Delete any event)"
                                : "Delete Event"
                            }
                            className={cn(
                              "p-2 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0",
                              isAppOwner(currentUser) && !isOwn
                                ? "bg-purple-500/10 text-purple-700 hover:bg-purple-600 hover:text-white border border-purple-500/25"
                                : isAdmin && !isOwn 
                                ? "bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white border border-red-500/20"
                                : "text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                            )}
                          >
                            {isDeleting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-center p-6 bg-slate-50/50 dark:bg-slate-900/30 rounded-2xl border border-dashed border-rsu-border/40 my-2">
                  <div className="w-12 h-12 rounded-2xl bg-rsu-orange/10 flex items-center justify-center mb-3">
                    <Calendar className="w-6 h-6 text-rsu-orange" />
                  </div>
                  <p className="text-sm font-black text-rsu-navy dark:text-white uppercase tracking-wider">
                    {activeTab === 'rsvped' ? 'No RSVPed Events' : searchQuery || selectedDateFilter ? 'No Matching Events' : 'No Events Scheduled'}
                  </p>
                  <p className="text-xs text-rsu-muted mt-1.5 max-w-[260px] leading-relaxed">
                    {activeTab === 'rsvped' 
                      ? 'Tap the "RSVP" button on any campus event to save it to your profile.' 
                      : searchQuery || selectedDateFilter
                        ? 'Try adjusting your search query or clear the date filter.'
                        : 'No campus events are currently scheduled. When a student, organizer, or the app owner creates an event, it will be saved to the database and appear here for everyone in real time.'}
                  </p>
                  {searchQuery || selectedDateFilter ? (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedDateFilter('');
                        setFilterCategory('all');
                      }}
                      className="mt-3.5 px-3.5 py-1.5 bg-rsu-navy text-white text-xs font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                    >
                      Reset Filters
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (!currentUser && onSignIn) {
                          onSignIn();
                          return;
                        }
                        setIsAddingEvent(true);
                      }}
                      className="mt-3.5 px-4 py-2 bg-rsu-orange hover:bg-rsu-navy text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Post An Event</span>
                    </button>
                  )}
                </div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </motion.div>
  );
};
