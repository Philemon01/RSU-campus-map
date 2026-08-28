import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Radio, 
  Clock, 
  MapPin, 
  Copy, 
  Check, 
  Share2, 
  X, 
  ShieldCheck, 
  Navigation2, 
  AlertCircle, 
  Trash2, 
  ExternalLink,
  MessageCircle,
  Eye,
  RefreshCw
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { LiveShareSession, FriendBeacon, Location } from '../../types';
import { 
  createLiveShare, 
  stopLiveShare, 
  buildMeetupShareUrl, 
  saveFriendCode, 
  removeFriendCode, 
  getSavedFriendCodes,
  normalizeShareCode,
  MEETUP_STORAGE_KEY
} from '../../services/liveMeetupService';
import { User } from 'firebase/auth';

interface MeetupShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  userLocation: [number, number] | null;
  activeSession: LiveShareSession | null;
  setActiveSession: (session: LiveShareSession | null) => void;
  friendBeacons: FriendBeacon[];
  onAddFriendCode: (code: string) => Promise<boolean>;
  onRemoveFriendCode: (code: string) => void;
  onNavigateToCoords: (coords: [number, number], name: string) => void;
  onFocusMapCoords: (coords: [number, number]) => void;
  setNotification: (notif: { message: string; type: 'success' | 'error' | 'info' }) => void;
  onOpenSignIn: () => void;
}

const DURATION_OPTIONS = [
  { label: '15 Min', value: 15 },
  { label: '30 Min', value: 30 },
  { label: '1 Hour', value: 60 },
  { label: '2 Hours', value: 120 },
];

const PRESET_NOTES = [
  "📍 Outside New Senate Building",
  "☕ At Engineering Canteen",
  "🏛️ Faculty of Law Annex",
  "🏟️ Convocation Arena Pavilion",
  "📚 University Main Library",
  "🚪 Main Gate Waiting Area",
];

export const MeetupShareModal: React.FC<MeetupShareModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  userLocation,
  activeSession,
  setActiveSession,
  friendBeacons,
  onAddFriendCode,
  onRemoveFriendCode,
  onNavigateToCoords,
  onFocusMapCoords,
  setNotification,
  onOpenSignIn,
}) => {
  const [activeTab, setActiveTab] = useState<'share' | 'friends'>('share');
  const [selectedDuration, setSelectedDuration] = useState<number>(30);
  const [statusNote, setStatusNote] = useState<string>('');
  const [isStarting, setIsStarting] = useState(false);
  const [friendCodeInput, setFriendCodeInput] = useState('');
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [timeLeftStr, setTimeLeftStr] = useState<string>('');

  // Update remaining time ticker for active broadcast
  useEffect(() => {
    if (!activeSession || !activeSession.isActive) {
      setTimeLeftStr(prev => prev === '' ? prev : '');
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const diff = activeSession.expiresAt - now;
      if (diff <= 0) {
        setTimeLeftStr(prev => prev === 'Expired' ? prev : 'Expired');
        if (activeSession.isActive) {
          setActiveSession(null);
        }
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        const newStr = `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
        setTimeLeftStr(prev => prev === newStr ? prev : newStr);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeSession?.id, activeSession?.expiresAt, activeSession?.isActive]);

  if (!isOpen) return null;

  const handleStartSharing = async (customCoords?: [number, number]) => {
    const coordsToUse = customCoords || userLocation || [4.8005, 6.9830];

    setIsStarting(true);
    try {
      const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'RSU Student';
      const session = await createLiveShare({
        userId: currentUser?.uid || 'guest_' + Math.random().toString(36).substring(2, 9),
        userName: displayName,
        userPhoto: currentUser?.photoURL || '',
        userEmail: currentUser?.email || '',
        coordinates: coordsToUse,
        durationMinutes: selectedDuration,
        statusNote: statusNote.trim() || undefined,
      });

      setActiveSession(session);
      setNotification({
        message: userLocation 
          ? `Live GPS beacon active (${session.id})! Share your code with friends.`
          : `Live beacon active (${session.id}) at RSU Campus Center.`,
        type: 'success'
      });
    } catch (err: any) {
      console.error("Failed to start live share:", err);
      setNotification({
        message: "Could not start live sharing: " + (err?.message || "Check network connection"),
        type: 'error'
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopSharing = async () => {
    if (!activeSession) return;
    try {
      await stopLiveShare(activeSession.id);
      setActiveSession(null);
      setNotification({
        message: "Live location sharing stopped.",
        type: 'info'
      });
    } catch (err) {
      console.error("Failed to stop live share:", err);
      setActiveSession(null);
    }
  };

  const handleCopyCode = () => {
    if (!activeSession) return;
    navigator.clipboard.writeText(activeSession.id);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    setNotification({ message: `Share code ${activeSession.id} copied!`, type: 'success' });
  };

  const handleCopyLink = () => {
    if (!activeSession) return;
    const link = buildMeetupShareUrl(activeSession.id);
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    setNotification({ message: "Direct meetup link copied!", type: 'success' });
  };

  const handleNativeShare = async () => {
    if (!activeSession) return;
    const link = buildMeetupShareUrl(activeSession.id);
    const text = `Meet me on RSU campus! Track my live location here: ${activeSession.statusNote ? `"${activeSession.statusNote}" - ` : ''}${link} (Code: ${activeSession.id})`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "RSU Campus Meetup Live Beacon",
          text,
          url: link,
        });
      } catch {
        handleCopyLink();
      }
    } else {
      // Fallback: WhatsApp share URL
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(waUrl, '_blank');
    }
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendCodeInput.trim()) return;

    const code = normalizeShareCode(friendCodeInput);
    if (!code) return;

    setIsAddingFriend(true);
    const success = await onAddFriendCode(code);
    setIsAddingFriend(false);
    if (success) {
      setFriendCodeInput('');
      setActiveTab('friends');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-md shadow-inner">
              <Radio size={24} className={cn(activeSession?.isActive && "animate-pulse text-emerald-200")} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-display font-black tracking-tight uppercase">Campus Meetups</h2>
                <span className="text-[9px] font-mono font-bold bg-white/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Real-Time
                </span>
              </div>
              <p className="text-xs text-white/80 mt-0.5 font-medium">
                Temporarily share your location for easy campus rendezvous
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 mt-5 bg-black/20 p-1 rounded-2xl backdrop-blur-sm">
            <button
              onClick={() => setActiveTab('share')}
              className={cn(
                "flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                activeTab === 'share'
                  ? "bg-white text-emerald-800 shadow-md"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              )}
            >
              <Radio size={14} className={cn(activeSession?.isActive && "text-emerald-500 animate-spin")} />
              <span>Share Location</span>
              {activeSession?.isActive && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('friends')}
              className={cn(
                "flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                activeTab === 'friends'
                  ? "bg-white text-emerald-800 shadow-md"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              )}
            >
              <Users size={14} />
              <span>Friends on Campus</span>
              {friendBeacons.length > 0 && (
                <span className="px-1.5 py-0.2 bg-emerald-500 text-white rounded-full text-[10px] font-mono ml-1 font-black">
                  {friendBeacons.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content Container */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {activeTab === 'share' ? (
            <div>
              {activeSession && activeSession.isActive ? (
                /* Active Broadcast Card */
                <div className="space-y-4">
                  <div className="p-5 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 relative overflow-hidden">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-black text-sm shadow-md">
                            {activeSession.userName.charAt(0).toUpperCase()}
                          </div>
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 border-2 border-white dark:border-slate-900 rounded-full animate-ping" />
                        </div>
                        <div>
                          <span className="text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-widest flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Live Beacon Active
                          </span>
                          <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                            {activeSession.userName}
                          </h4>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 block">Remaining</span>
                        <span className="text-xs font-mono font-black text-emerald-700 dark:text-emerald-300 flex items-center gap-1 justify-end">
                          <Clock size={12} />
                          {timeLeftStr}
                        </span>
                      </div>
                    </div>

                    {activeSession.statusNote && (
                      <div className="mt-3 p-2.5 bg-white dark:bg-slate-900/80 rounded-xl text-xs text-slate-700 dark:text-slate-200 border border-emerald-100 dark:border-emerald-900 font-medium">
                        {activeSession.statusNote}
                      </div>
                    )}

                    {/* Share Code & Link Block */}
                    <div className="mt-4 pt-3 border-t border-emerald-200/60 dark:border-emerald-800/40 space-y-3">
                      <div>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                          Your Unique Meetup Code:
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 py-2 px-3 bg-white dark:bg-slate-900 rounded-xl font-mono font-black text-slate-900 dark:text-white text-base tracking-wider border border-emerald-200 dark:border-emerald-800">
                            {activeSession.id}
                          </div>
                          <button
                            onClick={handleCopyCode}
                            className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                            title="Copy Code"
                          >
                            {copiedCode ? <Check size={16} /> : <Copy size={16} />}
                            <span className="hidden sm:inline">Copy</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCopyLink}
                          className="flex-1 py-2.5 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {copiedLink ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                          <span>{copiedLink ? "Link Copied!" : "Copy Direct Link"}</span>
                        </button>
                        <button
                          onClick={handleNativeShare}
                          className="py-2.5 px-4 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-colors text-xs font-bold flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                        >
                          <Share2 size={14} />
                          <span>Share</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Stop Sharing Button */}
                  <button
                    onClick={handleStopSharing}
                    className="w-full py-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <X size={16} />
                    <span>Stop Sharing Location</span>
                  </button>
                </div>
              ) : (
                /* Configure & Start Live Sharing */
                <div className="space-y-4">
                  {/* Duration Selector */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
                      Sharing Duration (Auto-Expires)
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {DURATION_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSelectedDuration(opt.value)}
                          className={cn(
                            "py-2.5 px-2 rounded-xl text-xs font-mono font-bold transition-all border cursor-pointer text-center",
                            selectedDuration === opt.value
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                              : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rendezvous Note */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                      Rendezvous Note / Where to Meet (Optional)
                    </label>
                    <input
                      type="text"
                      value={statusNote}
                      onChange={(e) => setStatusNote(e.target.value)}
                      placeholder="e.g. Waiting outside Law Faculty canteen..."
                      maxLength={100}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />

                    {/* Quick suggestion pills */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {PRESET_NOTES.map((note, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setStatusNote(note)}
                          className="text-[10px] px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                        >
                          {note}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* GPS Position Status */}
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className={userLocation ? "text-emerald-500" : "text-amber-500 animate-pulse"} />
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {userLocation ? "Live GPS Coordinates Locked" : "Using RSU Campus Center (Indoor default)"}
                      </span>
                    </div>
                    <span className={cn(
                      "text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase",
                      userLocation ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    )}>
                      {userLocation ? "GPS Active" : "Default Point"}
                    </span>
                  </div>

                  {/* Start Button */}
                  <button
                    onClick={() => handleStartSharing()}
                    disabled={isStarting}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isStarting ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <Radio size={16} />
                    )}
                    <span>{isStarting ? "Initializing Beacon..." : "Start Live Location Sharing"}</span>
                  </button>

                  {/* Privacy & Safety Guarantee */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                      <ShieldCheck size={16} />
                      <span>Privacy &amp; Security Assurance</span>
                    </div>
                    <ul className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 pl-4 list-disc">
                      <li><strong>100% Opt-In:</strong> Only active when you explicitly turn it on.</li>
                      <li><strong>Private Code:</strong> Only friends with your secret meetup code or link can view your beacon.</li>
                      <li><strong>Ephemeral:</strong> Automatically stops and deletes coordinates when time expires.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Friends on Campus Tab */
            <div className="space-y-4">
              {/* Add Friend Code Form */}
              <form onSubmit={handleAddFriend} className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Connect to a Friend's Beacon
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={friendCodeInput}
                    onChange={(e) => setFriendCodeInput(e.target.value)}
                    placeholder="Enter code (e.g. RSU-8W2K9) or paste link"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white uppercase font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={isAddingFriend || !friendCodeInput.trim()}
                    className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-500 transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    {isAddingFriend ? <RefreshCw size={14} className="animate-spin" /> : <Navigation2 size={14} />}
                    <span>Connect</span>
                  </button>
                </div>
              </form>

              {/* Connected Friends List */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                  <span>Connected Friends ({friendBeacons.length})</span>
                </div>

                {friendBeacons.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                    <Users size={32} className="mx-auto text-slate-400 mb-2 opacity-50" />
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No active friend beacons connected</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Ask your friend on campus to tap "Share Location" and give you their 6-character meetup code.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {friendBeacons.map(({ session, distanceMeters, lastSeenText }) => {
                      const isExpired = !session.isActive || Date.now() > session.expiresAt;
                      
                      return (
                        <div
                          key={session.id}
                          className={cn(
                            "p-3.5 rounded-2xl border transition-all space-y-2",
                            isExpired
                              ? "bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 opacity-60"
                              : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm hover:border-emerald-400"
                          )}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white font-black text-xs shadow-sm">
                                {session.userName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                                    {session.userName}
                                  </h4>
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 bg-slate-100 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300">
                                    {session.id}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                  {isExpired ? (
                                    <span className="text-rose-500 font-bold">Beacon Expired</span>
                                  ) : (
                                    <>
                                      <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        Live
                                      </span>
                                      {distanceMeters !== undefined && (
                                        <span>• {distanceMeters < 1000 ? `${Math.round(distanceMeters)}m away` : `${(distanceMeters/1000).toFixed(1)}km away`}</span>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={() => onRemoveFriendCode(session.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                              title="Disconnect"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          {session.statusNote && (
                            <p className="text-[11px] bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-800">
                              {session.statusNote}
                            </p>
                          )}

                          {!isExpired && (
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={() => {
                                  onNavigateToCoords(session.coordinates, session.userName);
                                  onClose();
                                }}
                                className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                              >
                                <Navigation2 size={13} />
                                <span>Walk to {session.userName.split(' ')[0]}</span>
                              </button>
                              <button
                                onClick={() => {
                                  onFocusMapCoords(session.coordinates);
                                  onClose();
                                }}
                                className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-xs font-bold cursor-pointer"
                                title="Center on Map"
                              >
                                <Eye size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
