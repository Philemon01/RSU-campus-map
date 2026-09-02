import React from 'react';
import { motion } from 'motion/react';
import { 
  Layers, 
  LocateFixed, 
  BookOpen, 
  User as UserIcon,
  Sparkles,
  MapPin,
  Radio,
  Users
} from 'lucide-react';
import { User } from 'firebase/auth';
import { cn } from '../../lib/utils';

interface FloatingActionsProps {
  isSatelliteView: boolean;
  setIsSatelliteView: (s: boolean) => void;
  setNotification: (n: { message: string, type: 'info' | 'error' | 'success' }) => void;
  handleLocateMe: () => void;
  isFollowingUser: boolean;
  toggleTimetable: () => void;
  toggleProfile: () => void;
  isSignedIn: boolean;
  currentUser?: User | null;
  onAddLocationClick?: () => void;
  isLocating?: boolean;
  hasActiveSelection?: boolean;
  isPanelExpanded?: boolean;
  isTimetableOpen?: boolean;
  isProfileOpen?: boolean;
  isEventsPanelOpen?: boolean;
  isChatOpen?: boolean;
  onToggleChat?: () => void;
  isMeetupOpen?: boolean;
  toggleMeetup?: () => void;
  isLiveSharing?: boolean;
  activeFriendsCount?: number;
}

export const FloatingActions: React.FC<FloatingActionsProps> = ({
  isSatelliteView,
  setIsSatelliteView,
  setNotification,
  handleLocateMe,
  isFollowingUser,
  toggleTimetable,
  toggleProfile,
  isSignedIn,
  currentUser,
  hasActiveSelection = false,
  isPanelExpanded = false,
  isTimetableOpen = false,
  isProfileOpen = false,
  isEventsPanelOpen = false,
  isChatOpen = false,
  onToggleChat,
  isMeetupOpen = false,
  toggleMeetup,
  isLiveSharing = false,
  activeFriendsCount = 0
}) => {
  const isHidden = hasActiveSelection || isPanelExpanded;

  // Compute initials for user avatar fallback
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
    <motion.nav
      initial={{ y: 60, opacity: 0, scale: 0.95 }}
      animate={{ 
        y: isHidden ? 90 : 0, 
        opacity: isHidden ? 0 : 1, 
        scale: isHidden ? 0.9 : 1,
        pointerEvents: isHidden ? 'none' : 'auto'
      }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "fixed z-30 left-1/2 -translate-x-1/2 bottom-2.5 sm:bottom-6 transition-all duration-300 w-auto max-w-[98vw]",
        // Shift slightly on desktop if sidebar panels are open
        (isTimetableOpen || isEventsPanelOpen || isProfileOpen || isMeetupOpen) && "md:left-[calc(50%-200px)]"
      )}
      aria-label="Campus Navigation Bar"
      aria-hidden={isHidden}
    >
      <div className="flex items-center justify-center gap-0.5 xs:gap-1 sm:gap-2 px-1.5 py-1.5 xs:px-2 sm:px-3.5 sm:py-2 rounded-2xl sm:rounded-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-slate-200/90 dark:border-slate-800/80 shadow-[0_16px_40px_-10px_rgba(0,0,0,0.28)] ring-1 ring-black/5 dark:ring-white/10">
        
        {/* GPS Locate Me Button */}
        <button
          onClick={handleLocateMe}
          className={cn(
            "relative group flex flex-col items-center justify-center px-1.5 py-1 xs:px-2.5 sm:px-3 sm:py-2 rounded-xl sm:rounded-full transition-all duration-200 cursor-pointer min-w-[40px] xs:min-w-[44px] min-h-[44px] touch-manipulation",
            isFollowingUser
              ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-500/30"
              : "text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 dark:hover:text-blue-400"
          )}
          title={isFollowingUser ? "Live GPS Tracking Active" : "Center on My Location"}
          aria-label="Locate me"
        >
          {isFollowingUser && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          )}
          <LocateFixed size={18} className={cn("sm:w-5 sm:h-5", isFollowingUser && "animate-pulse")} />
          <span className="text-[8px] xs:text-[8.5px] sm:text-[9px] md:text-[10px] font-bold tracking-tight leading-none mt-1 whitespace-nowrap">
            {isFollowingUser ? "GPS On" : "Locate"}
          </span>
        </button>

        {/* Map / Satellite Layer Switcher */}
        <button
          onClick={() => {
            const nextMode = !isSatelliteView;
            setIsSatelliteView(nextMode);
            setNotification({ 
              message: `Switched to ${nextMode ? 'Satellite' : 'Map'} View`, 
              type: 'info' 
            });
          }}
          className={cn(
            "flex flex-col items-center justify-center px-1.5 py-1 xs:px-2.5 sm:px-3 sm:py-2 rounded-xl sm:rounded-full transition-all duration-200 cursor-pointer min-w-[40px] xs:min-w-[44px] min-h-[44px] touch-manipulation",
            isSatelliteView
              ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-500/30"
              : "text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 dark:hover:text-blue-400"
          )}
          title={isSatelliteView ? "Switch to 2D Map View" : "Switch to Satellite Imagery"}
          aria-label="Toggle map layer"
        >
          <Layers size={18} className={cn("sm:w-5 sm:h-5", isSatelliteView && "animate-pulse")} />
          <span className="text-[8px] xs:text-[8.5px] sm:text-[9px] md:text-[10px] font-bold tracking-tight leading-none mt-1 whitespace-nowrap">
            {isSatelliteView ? "Satellite" : "Layers"}
          </span>
        </button>

        {/* Meetup / Friend Location Sharing */}
        {toggleMeetup && (
          <button
            onClick={toggleMeetup}
            className={cn(
              "relative flex flex-col items-center justify-center px-1.5 py-1 xs:px-2.5 sm:px-3 sm:py-2 rounded-xl sm:rounded-full transition-all duration-200 cursor-pointer min-w-[40px] xs:min-w-[44px] min-h-[44px] touch-manipulation",
              isMeetupOpen
                ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-500/30"
                : isLiveSharing
                ? "bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-400/60"
                : "text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 dark:hover:text-blue-400"
            )}
            title="Opt-in Campus Meetups & Live Location"
            aria-label="Campus meetups and location sharing"
          >
            {isLiveSharing && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
              </span>
            )}
            {activeFriendsCount > 0 && !isLiveSharing && (
              <span className="absolute -top-0.5 -right-0.5 px-1 py-0.2 bg-blue-600 text-white rounded-full text-[8px] font-mono font-bold">
                {activeFriendsCount}
              </span>
            )}
            <Radio size={18} className={cn("sm:w-5 sm:h-5", isLiveSharing && "animate-pulse text-blue-600 dark:text-blue-400")} />
            <span className="text-[8px] xs:text-[8.5px] sm:text-[9px] md:text-[10px] font-bold tracking-tight leading-none mt-1 whitespace-nowrap">
              Meetups
            </span>
          </button>
        )}

        {/* Subtle Divider */}
        <div className="w-[1px] h-6 bg-slate-200 dark:bg-slate-800 mx-0.5 sm:mx-1" />

        {/* Timetable Sync Hub */}
        <button
          onClick={toggleTimetable}
          className={cn(
            "flex flex-col items-center justify-center px-1.5 py-1 xs:px-2.5 sm:px-3 sm:py-2 rounded-xl sm:rounded-full transition-all duration-200 cursor-pointer min-w-[40px] xs:min-w-[44px] min-h-[44px] touch-manipulation",
            isTimetableOpen
              ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-500/30"
              : "text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 dark:hover:text-blue-400"
          )}
          title="Smart Academic Timetable"
          aria-label="Timetable hub"
        >
          <BookOpen size={18} className="sm:w-5 sm:h-5" />
          <span className="text-[8px] xs:text-[8.5px] sm:text-[9px] md:text-[10px] font-bold tracking-tight leading-none mt-1 whitespace-nowrap">
            Timetable
          </span>
        </button>

        {/* Navi-bot AI Campus Guide */}
        {onToggleChat && (
          <button
            onClick={onToggleChat}
            className={cn(
              "flex flex-col items-center justify-center px-1.5 py-1 xs:px-2.5 sm:px-3 sm:py-2 rounded-xl sm:rounded-full transition-all duration-200 cursor-pointer min-w-[40px] xs:min-w-[44px] min-h-[44px] touch-manipulation",
              isChatOpen
                ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-500/30"
                : "text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 dark:hover:text-blue-400"
            )}
            title="RSU Navi-bot"
            aria-label="RSU Navi-bot AI Guide"
          >
            <Sparkles size={18} className={cn("sm:w-5 sm:h-5", isChatOpen && "animate-spin")} />
            <span className="text-[8px] xs:text-[8.5px] sm:text-[9px] md:text-[10px] font-bold tracking-tight leading-none mt-1 whitespace-nowrap">
              Navi-bot
            </span>
          </button>
        )}

        {/* Profile / Account Hub */}
        <button
          onClick={toggleProfile}
          className={cn(
            "flex flex-col items-center justify-center px-1.5 py-1 xs:px-2.5 sm:px-3 sm:py-2 rounded-xl sm:rounded-full transition-all duration-200 cursor-pointer min-w-[40px] xs:min-w-[44px] min-h-[44px] touch-manipulation",
            isProfileOpen
              ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-500/30"
              : "text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 dark:hover:text-blue-400"
          )}
          title={currentUser ? `Profile: ${currentUser.displayName || currentUser.email}` : "Campus Profile & Hub"}
          aria-label="Profile and events hub"
        >
          {currentUser ? (
            currentUser.photoURL ? (
              <div className="relative">
                <img 
                  src={currentUser.photoURL} 
                  alt={currentUser.displayName || 'Profile'}
                  referrerPolicy="no-referrer"
                  className={cn(
                    "w-4.5 h-4.5 sm:w-5 sm:h-5 rounded-full object-cover border",
                    isProfileOpen ? "border-white" : "border-blue-500"
                  )}
                />
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-blue-500 border border-white dark:border-slate-900 rounded-full" />
              </div>
            ) : (
              <div className={cn(
                "w-4.5 h-4.5 sm:w-5 sm:h-5 rounded-full font-black text-[8px] sm:text-[9px] flex items-center justify-center border",
                isProfileOpen ? "bg-white text-blue-700 border-white" : "bg-blue-600 text-white border-blue-500"
              )}>
                {getInitials(currentUser.displayName, currentUser.email)}
              </div>
            )
          ) : (
            <UserIcon size={18} className="sm:w-5 sm:h-5" />
          )}
          <span className="text-[8px] xs:text-[8.5px] sm:text-[9px] md:text-[10px] font-bold tracking-tight leading-none mt-1 whitespace-nowrap">
            Profile
          </span>
        </button>

      </div>
    </motion.nav>
  );
};

