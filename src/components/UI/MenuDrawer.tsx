import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Bookmark, 
  Trash2, 
  History, 
  GraduationCap, 
  Calendar, 
  BookOpen, 
  Home, 
  Radio, 
  Sparkles, 
  User as UserIcon, 
  Layers, 
  LocateFixed, 
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { Location } from '../../types';
import { cn } from '../../lib/utils';

interface MenuDrawerProps {
  isMenuOpen: boolean;
  savedLocations: Location[];
  recentLocations: Location[];
  setIsMenuOpen: (o: boolean) => void;
  handleLocationSelect: (loc: Location) => void;
  toggleSaveLocation: (id: string) => void;
  getCategoryIcon: (type: string) => React.ReactNode;
  toggleEvents: () => void;
  toggleTimetable: () => void;
  toggleMeetup?: () => void;
  toggleProfile?: () => void;
  onToggleChat?: () => void;
  isSatelliteView?: boolean;
  setIsSatelliteView?: (s: boolean) => void;
  handleLocateMe?: () => void;
  isFollowingUser?: boolean;
  user: any;
  onSignIn: () => void;
  onSignInRedirect?: () => void;
  onSignOut: () => void;
  onOpenTerms?: () => void;
  onOpenPrivacy?: () => void;
  onNavigateHome?: () => void;
  eventsCount?: number;
  activeFriendsCount?: number;
  isLiveSharing?: boolean;
}

export const MenuDrawer: React.FC<MenuDrawerProps> = ({
  isMenuOpen,
  savedLocations,
  recentLocations,
  setIsMenuOpen,
  handleLocationSelect,
  toggleSaveLocation,
  getCategoryIcon,
  toggleEvents,
  toggleTimetable,
  toggleMeetup,
  toggleProfile,
  onToggleChat,
  isSatelliteView = false,
  setIsSatelliteView,
  handleLocateMe,
  isFollowingUser = false,
  user,
  onSignIn,
  onSignInRedirect,
  onSignOut,
  onOpenTerms,
  onOpenPrivacy,
  onNavigateHome,
  eventsCount = 0,
  activeFriendsCount = 0,
  isLiveSharing = false
}) => {
  // Helper for user avatar initials
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

  return (
    <AnimatePresence>
      {isMenuOpen && (
        <>
          {/* Backdrop overlay */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMenuOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          />

          {/* Drawer container - full height, responsive width on mobile and tablet */}
          <motion.div 
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="fixed top-0 left-0 bottom-0 w-[88vw] max-w-xs sm:max-w-sm md:max-w-md bg-white dark:bg-slate-900 z-[1001] shadow-2xl flex flex-col border-r border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100"
          >
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-rsu-navy text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/20 shadow-inner shrink-0">
                  <GraduationCap className="text-white" size={20} />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-display font-black uppercase tracking-tight leading-none">
                    CampusGryd Menu
                  </h2>
                  <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-0.5">
                    Rivers State University
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsMenuOpen(false)}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors active:scale-95 cursor-pointer text-white/80 hover:text-white"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-4 no-scrollbar">
              
              {/* Back to Homepage Button */}
              <button
                onClick={() => {
                  onNavigateHome?.();
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center p-3 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-2xl transition-all active:scale-98 group font-semibold cursor-pointer"
              >
                <div className="p-2 bg-emerald-600 text-white rounded-xl mr-3 group-hover:scale-105 transition-transform duration-200 flex items-center justify-center shrink-0 shadow-sm">
                  <Home size={18} />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="font-black text-xs uppercase tracking-wider">Back to Home Screen</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-tight mt-0.5">Return to the main campus portal</div>
                </div>
                <ChevronRight size={16} className="text-emerald-500 opacity-60 group-hover:translate-x-0.5 transition-transform" />
              </button>

              {/* User Account / Sign In Hub */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-inner">
                {user ? (
                  <div className="flex items-center gap-3">
                    {user.photoURL ? (
                      <img 
                        src={user.photoURL} 
                        alt="Avatar" 
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full border-2 border-rsu-orange object-cover shrink-0" 
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-rsu-navy text-white font-black text-xs flex items-center justify-center border-2 border-rsu-orange shrink-0">
                        {getInitials(user.displayName, user.email)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-slate-900 dark:text-white truncate">
                        {user.displayName || 'Campus Member'}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {user.email || 'Guest Student Pass'}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        {toggleProfile && (
                          <button
                            onClick={() => {
                              toggleProfile();
                              setIsMenuOpen(false);
                            }}
                            className="text-[10px] font-bold text-rsu-navy dark:text-emerald-400 uppercase tracking-wider hover:underline cursor-pointer"
                          >
                            View Profile
                          </button>
                        )}
                        <button 
                          onClick={onSignOut} 
                          className="text-[10px] font-bold text-red-500 uppercase tracking-wider hover:underline cursor-pointer"
                        >
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                        Student Account
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300 font-bold uppercase">
                        Guest Mode
                      </span>
                    </div>
                    <button 
                      onClick={() => {
                        onSignIn();
                        setIsMenuOpen(false);
                      }}
                      className="w-full py-2.5 bg-rsu-navy text-white hover:bg-rsu-navy/90 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                    >
                      <UserIcon size={14} />
                      <span>Sign In with Google</span>
                    </button>
                  </div>
                )}
              </div>

              {/* CAMPUS NAVIGATION TABS (The complete tab bar inside the hamburger menu) */}
              <div>
                <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2 px-1">
                  Campus Navigation & Hubs
                </div>

                <div className="grid grid-cols-1 gap-2">
                  
                  {/* 1. Timetable Hub */}
                  <button
                    onClick={() => {
                      toggleTimetable();
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center p-3 bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-98 group text-left cursor-pointer"
                  >
                    <div className="p-2.5 bg-white/20 rounded-xl mr-3 shadow-inner shrink-0 group-hover:scale-105 transition-transform">
                      <BookOpen size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-xs sm:text-sm tracking-tight uppercase leading-tight">
                        Academic Timetable
                      </div>
                      <div className="text-[10px] font-medium text-white/85 leading-tight mt-0.5">
                        Schedule, room radar & Google Calendar sync
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-white/70 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </button>

                  {/* 2. Campus Events Hub */}
                  <button
                    onClick={() => {
                      toggleEvents();
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center p-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-98 group text-left cursor-pointer"
                  >
                    <div className="p-2.5 bg-white/20 rounded-xl mr-3 shadow-inner shrink-0 group-hover:scale-105 transition-transform">
                      <Calendar size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-xs sm:text-sm tracking-tight uppercase leading-tight">
                          Campus Events
                        </span>
                        {eventsCount > 0 && (
                          <span className="px-1.5 py-0.2 bg-white text-blue-700 rounded-full text-[9px] font-bold">
                            {eventsCount}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-medium text-white/85 leading-tight mt-0.5">
                        Discover happenings, RSVPs & campus activities
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-white/70 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </button>

                  {/* 3. Meetups & Friend Radar */}
                  {toggleMeetup && (
                    <button
                      onClick={() => {
                        toggleMeetup();
                        setIsMenuOpen(false);
                      }}
                      className="w-full flex items-center p-3 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-98 group text-left cursor-pointer"
                    >
                      <div className="relative p-2.5 bg-white/20 rounded-xl mr-3 shadow-inner shrink-0 group-hover:scale-105 transition-transform">
                        <Radio size={20} className={cn(isLiveSharing && "animate-pulse")} />
                        {isLiveSharing && (
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-300 rounded-full animate-ping" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-xs sm:text-sm tracking-tight uppercase leading-tight">
                            Campus Meetups
                          </span>
                          {isLiveSharing && (
                            <span className="px-1.5 py-0.2 bg-white text-emerald-700 rounded-full text-[8px] font-extrabold uppercase animate-pulse">
                              LIVE
                            </span>
                          )}
                          {activeFriendsCount > 0 && !isLiveSharing && (
                            <span className="px-1.5 py-0.2 bg-white text-teal-700 rounded-full text-[9px] font-bold">
                              {activeFriendsCount} Friends
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-medium text-white/85 leading-tight mt-0.5">
                          Opt-in real-time friend beacon & meetups
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-white/70 group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </button>
                  )}

                  {/* 4. RSU Navi-bot AI Guide */}
                  {onToggleChat && (
                    <button
                      onClick={() => {
                        onToggleChat();
                        setIsMenuOpen(false);
                      }}
                      className="w-full flex items-center p-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-98 group text-left cursor-pointer"
                    >
                      <div className="p-2.5 bg-white/20 rounded-xl mr-3 shadow-inner shrink-0 group-hover:scale-105 transition-transform">
                        <Sparkles size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-xs sm:text-sm tracking-tight uppercase leading-tight">
                          RSU Navi-bot AI
                        </div>
                        <div className="text-[10px] font-medium text-white/85 leading-tight mt-0.5">
                          Ask campus questions, directions & info
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-white/70 group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </button>
                  )}

                  {/* 5. Campus Profile & Settings */}
                  {toggleProfile && (
                    <button
                      onClick={() => {
                        toggleProfile();
                        setIsMenuOpen(false);
                      }}
                      className="w-full flex items-center p-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 rounded-2xl transition-all active:scale-98 group text-left cursor-pointer text-slate-800 dark:text-white"
                    >
                      <div className="p-2.5 bg-emerald-600 text-white rounded-xl mr-3 shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                        <UserIcon size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-xs sm:text-sm tracking-tight uppercase leading-tight">
                          Profile & Offline Hub
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-tight mt-0.5">
                          Offline map cache, bookmarks & preferences
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </button>
                  )}

                </div>
              </div>

              {/* MAP SENSORS & VIEW CONTROLS */}
              <div>
                <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2 px-1">
                  Map View & GPS Controls
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Layer Switcher */}
                  {setIsSatelliteView && (
                    <button
                      onClick={() => {
                        setIsSatelliteView(!isSatelliteView);
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95 cursor-pointer text-center",
                        isSatelliteView
                          ? "bg-blue-500/15 border-blue-500/40 text-blue-600 dark:text-blue-400"
                          : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                      )}
                    >
                      <Layers size={20} className="mb-1.5" />
                      <span className="text-[11px] font-black uppercase tracking-wider">
                        {isSatelliteView ? "Satellite 3D" : "Vector 2D"}
                      </span>
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                        {isSatelliteView ? "Active" : "Switch Mode"}
                      </span>
                    </button>
                  )}

                  {/* Locate GPS */}
                  {handleLocateMe && (
                    <button
                      onClick={() => {
                        handleLocateMe();
                        setIsMenuOpen(false);
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-95 cursor-pointer text-center",
                        isFollowingUser
                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                          : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                      )}
                    >
                      <LocateFixed size={20} className={cn("mb-1.5", isFollowingUser && "animate-pulse")} />
                      <span className="text-[11px] font-black uppercase tracking-wider">
                        {isFollowingUser ? "GPS Active" : "Locate Me"}
                      </span>
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                        {isFollowingUser ? "Tracking" : "Center Map"}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* SAVED LOCATIONS */}
              <div>
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-1.5">
                    <Bookmark className="text-rsu-navy dark:text-emerald-400" size={15} />
                    <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Saved Locations
                    </h3>
                  </div>
                  {savedLocations.length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full">
                      {savedLocations.length}
                    </span>
                  )}
                </div>
                
                {savedLocations.length > 0 ? (
                  <div className="space-y-1.5">
                    {savedLocations.map(loc => (
                      <div key={loc.id} className="group relative">
                        <button
                          onClick={() => {
                            handleLocationSelect(loc);
                            setIsMenuOpen(false);
                          }}
                          className="w-full flex items-center p-2.5 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all text-left border border-slate-200 dark:border-slate-700/60 pr-9 cursor-pointer"
                        >
                          <div className="p-1.5 bg-white dark:bg-slate-700 rounded-lg mr-2.5 text-rsu-navy dark:text-white shadow-xs shrink-0">
                            {getCategoryIcon(loc.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                              {loc.officialName}
                            </div>
                            <div className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-semibold">
                              {loc.type}
                            </div>
                          </div>
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSaveLocation(loc.id);
                          }}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-all cursor-pointer"
                          title="Remove bookmark"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-5 px-3 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700/80">
                    <Bookmark className="mx-auto text-slate-400 dark:text-slate-600 mb-1.5 opacity-40" size={24} />
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      No saved locations yet
                    </p>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
                      Tap the bookmark icon on any building to save it here.
                    </p>
                  </div>
                )}
              </div>

              {/* RECENT VISITS */}
              <div>
                <div className="flex items-center gap-1.5 mb-2 px-1">
                  <History className="text-rsu-navy dark:text-emerald-400" size={15} />
                  <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Recent Visits
                  </h3>
                </div>
                
                {recentLocations.length > 0 ? (
                  <div className="space-y-1.5">
                    {recentLocations.slice(0, 5).map(loc => (
                      <button
                        key={loc.id}
                        onClick={() => {
                          handleLocationSelect(loc);
                          setIsMenuOpen(false);
                        }}
                        className="w-full flex items-center p-2.5 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all text-left border border-slate-200 dark:border-slate-700/60 cursor-pointer"
                      >
                        <div className="p-1.5 bg-white dark:bg-slate-700 rounded-lg mr-2.5 text-slate-500 dark:text-slate-300 shadow-xs shrink-0">
                          {getCategoryIcon(loc.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                            {loc.officialName}
                          </div>
                          <div className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-semibold">
                            {loc.type}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-3 text-slate-400 dark:text-slate-500">
                    <p className="text-[10px] font-bold uppercase tracking-widest italic">
                      No recent visits recorded
                    </p>
                  </div>
                )}
              </div>

            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-rsu-navy rounded-lg flex items-center justify-center text-white">
                    <GraduationCap size={14} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">
                      CampusGryd
                    </p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                      v1.2.0 Stable
                    </p>
                  </div>
                </div>
                <p className="text-[8px] font-mono text-slate-500 dark:text-slate-400 uppercase">
                  RSU Tech
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-2 text-[9px] font-bold text-slate-500 dark:text-slate-400">
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      onOpenTerms?.();
                      setIsMenuOpen(false);
                    }}
                    className="hover:text-rsu-orange transition-colors cursor-pointer"
                  >
                    Terms
                  </button>
                  <span>•</span>
                  <button 
                    onClick={() => {
                      onOpenPrivacy?.();
                      setIsMenuOpen(false);
                    }}
                    className="hover:text-rsu-orange transition-colors cursor-pointer"
                  >
                    Privacy
                  </button>
                </div>
                <span>Philemon Progress</span>
              </div>
            </div>

          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
