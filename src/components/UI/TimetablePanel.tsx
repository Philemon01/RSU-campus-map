import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  MapPin, 
  Clock, 
  X, 
  ChevronRight, 
  Upload, 
  Check, 
  AlertCircle, 
  FileText,
  Save,
  Trash2,
  ExternalLink,
  BookOpen,
  Loader2,
  ArrowLeft
} from 'lucide-react';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { signInWithPopup, signInAnonymously, GoogleAuthProvider, User } from 'firebase/auth';
import { db, auth, googleProvider, getCachedAccessToken, setCachedAccessToken } from '../../lib/firebase';
import { locations } from '../../data/locations';
import { cn } from '../../lib/utils';
import { parseTimetableOnClient } from '../../services/client/geminiParser';

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

function getFriendlyErrorMessage(error: any): string {
  try {
    const parsed = JSON.parse(error.message);
    if (parsed && parsed.error) {
      if (parsed.error.toLowerCase().includes("permission") || parsed.error.toLowerCase().includes("insufficient")) {
        return "Permission denied: Ensure you have authorization and all required fields match campus standards.";
      }
      return parsed.error;
    }
  } catch (e) {
    // ignore
  }
  const original = error.message || String(error);
  if (original.toLowerCase().includes("permission") || original.toLowerCase().includes("insufficient")) {
    return "Permission denied: Ensure you have authorization and all required fields match campus standards.";
  }
  return original;
}

interface Slot {
  id?: string;
  courseCode: string;
  courseTitle: string;
  lecturer: string;
  day: string;
  startTime: string;
  endTime: string;
  venue: string;
  locationId?: string;
}

interface Timetable {
  id: string;
  faculty: string;
  department: string;
  level: string;
  semester: string;
  status: 'published' | 'draft';
  creatorId: string;
}

interface TimetablePanelProps {
  onClose: () => void;
  onNavigateTo: (locationId: string) => void;
  currentUser: User | null;
  onBack?: () => void;
}

const RSU_FACULTIES = [
  "Agriculture", "Basic Medical Sciences", "Education", "Engineering", 
  "Environmental Sciences", "Humanities", "Law", "Management Sciences", 
  "Science", "Social Sciences", "Computing"
];

const RSU_DEPARTMENTS: Record<string, string[]> = {
  "Engineering": ["Mechanical", "Civil", "Electrical", "Chemical", "Petroleum", "Marine"],
  "Computing": ["Computer Science", "Information Technology", "Cyber Security", "Software Engineering"],
  "Science": ["Physics", "Geology", "Microbiology", "Biochemistry", "Mathematics"],
  "Management Sciences": ["Accountancy", "Banking & Finance", "Management", "Marketing"],
  "Law": ["Public Law", "Private Law", "Commercial Law"],
};

export const TimetablePanel: React.FC<TimetablePanelProps> = ({ onClose, onNavigateTo, currentUser, onBack }) => {
  const [view, setView] = useState<'browse' | 'setup' | 'entry_mode' | 'create' | 'manual' | 'review'>('browse');
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [selectedTimetable, setSelectedTimetable] = useState<Timetable | null>(null);
  const [currentSync, setCurrentSync] = useState<{ id: string, eventIds: string[] } | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; action: () => void } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(prev => prev?.message === message ? null : prev);
    }, 6000);
  };

  const showConfirm = (message: string, action: () => void) => {
    setConfirmDialog({ message, action });
  };

  // Search and Filter states for Browse View
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFaculty, setFilterFaculty] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');

  const [metadata, setMetadata] = useState({
    faculty: "",
    department: "",
    level: "",
    semester: "1st"
  });
  const [isOtherSelected, setIsOtherSelected] = useState(false);

  const [manualSlot, setManualSlot] = useState<Slot>({
    courseCode: "",
    courseTitle: "",
    lecturer: "",
    day: "Monday",
    startTime: "08:00",
    endTime: "10:00",
    venue: ""
  });

  useEffect(() => {
    if (currentUser) {
      fetchTimetables().catch(err => {
        console.error("Mount fetchTimetables error:", err);
      });
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    const checkSync = async () => {
      if (selectedTimetable && currentUser) {
        const path = 'user_syncs';
        try {
          const q = query(
            collection(db, path),
            where('userId', '==', currentUser.uid),
            where('timetableId', '==', selectedTimetable.id)
          );
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            setCurrentSync({ 
              id: snapshot.docs[0].id, 
              eventIds: data.eventIds || [] 
            });
          } else {
            setCurrentSync(null);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, path);
        }
      }
    };
    checkSync().catch(err => console.error("checkSync failed:", err));
  }, [selectedTimetable?.id, currentUser?.uid]);

  const filteredTimetables = timetables.filter(t => {
    const matchesSearch = searchQuery.trim() === "" || 
      t.department.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (t.faculty && t.faculty.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.level && t.level.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesFaculty = !filterFaculty || t.faculty === filterFaculty;
    const matchesDept = !filterDepartment || (t.department === filterDepartment || (filterDepartment === 'Other' && !RSU_DEPARTMENTS[filterFaculty]?.includes(t.department)));
    
    return matchesSearch && matchesFaculty && matchesDept;
  });

  const handleStartCreation = async () => {
    if (isSigningIn) return;
    if (!currentUser) {
      setIsSigningIn(true);
      try {
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          setCachedAccessToken(credential.accessToken);
        }
      } catch (error: any) {
        if (error.code === 'auth/popup-blocked') {
          showToast("error", "Sign-in popup blocked. Please allow popups for this site.");
        }
        return;
      } finally {
        setIsSigningIn(false);
      }
    }
    // Initialize/clear creation state when starting a new entry
    setMetadata({
      faculty: "",
      department: "",
      level: "",
      semester: "1st"
    });
    setIsOtherSelected(false);
    setSlots([]);
    setSelectedTimetable(null);
    setView('setup');
  };

  const fetchTimetables = async () => {
    setIsLoading(true);
    const path = 'timetables';
    try {
      const q = query(collection(db, path), where('status', '==', 'published'));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        const creatorId = data.creatorId || data.ownerId || "";
        const ownerId = data.ownerId || data.creatorId || "";
        return { 
          id: docSnap.id, 
          ...data,
          creatorId,
          ownerId
        } as any as Timetable;
      });
      
      const sortedList = list.sort((a: any, b: any) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      
      setTimetables(sortedList);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSlots = async (timetableId: string) => {
    setIsLoading(true);
    const path = `timetables/${timetableId}/slots`;
    try {
      const q = collection(db, 'timetables', timetableId, 'slots');
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Slot));
      setSlots(list);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileAndParse = async (selectedFile: File) => {
    try {
      setIsUploading(true);
      setIsLoading(true);
      
      // 1. Parse image locally via Gemini in the browser window
      const aiExtractedData = await parseTimetableOnClient(selectedFile);
      
      // 2. Pass the clean JSON output straight into your Firestore save pipeline
      await saveTimetable(aiExtractedData); 
      
    } catch (err: any) {
       console.error("Sync Failed:", err);
       showToast("error", "Sync Failed: " + (err.message || err));
    } finally {
       setIsUploading(false);
       setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleFileAndParse(file);
  };

  const saveTimetable = async (aiStudioData?: any) => {
    if (!currentUser) {
      showToast("error", "Please sign in to publish.");
      return;
    }
    
    // Use data passed directly from your AI parser response
    let extractedSlots = aiStudioData?.schedule;
    if (!extractedSlots && slots && slots.length > 0) {
      extractedSlots = slots.map(s => ({
        day: s.day,
        time: `${s.startTime} - ${s.endTime}`,
        course: s.courseCode,
        venue: s.venue
      }));
    }

    if (!extractedSlots || extractedSlots.length === 0) {
      showToast("error", "Please add at least one class.");
      return;
    }

    setIsLoading(true);
    let createdTimetableId: string | null = null;
    
    try {
      if (!metadata.faculty || !metadata.department || !metadata.level) {
        throw new Error("Please complete the faculty, department, and level fields.");
      }

      // A. Add main reference record to /timetables 
      // FIXED: Set both creatorId and ownerId to satisfy both security rules paths
      const tRef = await addDoc(collection(db, 'timetables'), {
        faculty: metadata.faculty,
        department: metadata.department,
        level: metadata.level,
        semester: metadata.semester || "1st",
        creatorId: currentUser.uid, // Required for isValidAppTimetable validation and legacy ownership logic
        ownerId: currentUser.uid,   // Option for legacy/alternative blueprint rules compliance
        creatorEmail: currentUser.email || 'anonymous',
        status: 'published',
        createdAt: new Date().toISOString()
      });
      createdTimetableId = tRef.id;

      // B. Map child slots from AI Studio structure to your database slots format
      const slotPromises = extractedSlots.map(async (slot: any) => {
        let rawDay = (slot.day || "Monday").trim();
        let cleanDay = rawDay.charAt(0).toUpperCase() + rawDay.slice(1).toLowerCase();
        
        // AI Studio provides "HH:MM - HH:MM". Let's split it into startTime and endTime safely.
        let startTime = "08:00";
        let endTime = "10:00";
        if (slot.time && slot.time.includes("-")) {
          const parts = slot.time.split("-");
          startTime = parts[0].trim();
          endTime = parts[1].trim();
        }
        
        return await addDoc(collection(db, 'timetables', tRef.id, 'slots'), {
          courseCode: (slot.course || "N/A").trim(), // <-- FIXED: Mapped from 'course'
          courseTitle: "", 
          lecturer: "",
          day: cleanDay,
          startTime: startTime,                      // <-- FIXED: Split from 'time'
          endTime: endTime,                          // <-- FIXED: Split from 'time'
          venue: (slot.venue || "TBA").trim(),       // <-- FIXED: Mapped from 'venue'
          locationId: null,
          createdAt: new Date().toISOString()
        });
      });

      await Promise.all(slotPromises);
      
      setTimeout(() => {
        if (typeof fetchTimetables === 'function') {
          fetchTimetables().catch(err => console.error(err));
        }
      }, 1000);

      const publishedTimetable: Timetable = {
        id: tRef.id,
        faculty: metadata.faculty,
        department: metadata.department,
        level: metadata.level,
        semester: metadata.semester || "1st",
        status: 'published',
        creatorId: currentUser.uid
      };

      setSelectedTimetable(publishedTimetable);
      await fetchSlots(tRef.id);

      showToast("success", "🎉 Timetable published successfully! You can now Sync to Calendar.");
      setView('review');
    } catch (error: any) {
      console.error("Save error:", error);
      if (createdTimetableId) {
        deleteDoc(doc(db, 'timetables', createdTimetableId)).catch(e => console.error(e));
      }
      showToast("error", "Failed to publish: " + getFriendlyErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncToCalendar = async () => {
    if (isSigningIn || !currentUser) return;
    try {
      let accessToken = getCachedAccessToken();
      
      if (!accessToken) {
        setIsSigningIn(true);
        const result = await signInWithPopup(auth, googleProvider);
        setIsSigningIn(false);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        accessToken = credential?.accessToken || null;
        if (accessToken) {
          setCachedAccessToken(accessToken);
        }
      }
      
      if (!accessToken) {
        throw new Error('Could not obtain authorization. Please sign in using "Sync with Redirect" in the side-menu first.');
      }
      
      setSyncStatus('syncing');
      
      const res = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, slots })
      });
      
      if (!res.ok) throw new Error("Sync API failed");
 
      const data = await res.json();
      if (data.success) {
        setSyncStatus('success');
        if (selectedTimetable && currentUser) {
          try {
            const eventIds = data.events?.map((e: any) => e.id) || [];
            const q = query(
              collection(db, 'user_syncs'),
              where('userId', '==', currentUser.uid),
              where('timetableId', '==', selectedTimetable.id)
            );
            const snap = await getDocs(q);
            let syncDocId = "";
            if (!snap.empty) {
              syncDocId = snap.docs[0].id;
              await updateDoc(doc(db, 'user_syncs', syncDocId), { eventIds, lastSyncedAt: new Date().toISOString() });
            } else {
              const newDoc = await addDoc(collection(db, 'user_syncs'), {
                userId: currentUser.uid,
                timetableId: selectedTimetable.id,
                eventIds,
                lastSyncedAt: new Date().toISOString()
              });
              syncDocId = newDoc.id;
            }
            setCurrentSync({ id: syncDocId, eventIds });
          } catch (firestoreError: any) {
            console.error("Non-blocking Firestore sync logging failed:", firestoreError);
          }
        }
        showToast("success", "🎉 Lectures synced to your Google Calendar!");
        setTimeout(() => setSyncStatus('idle'), 3000);
      }
    } catch (error: any) {
      setIsSigningIn(false);
      setSyncStatus('error');
      if (error.code !== 'auth/cancelled-popup-request' && error.code !== 'auth/popup-closed-by-user') {
        showToast("error", "Sync Failed: " + (error.message || "Please try again."));
      }
      setTimeout(() => setSyncStatus('idle'), 3000);
    }
  };
 
  const handleRemoveSync = async () => {
    if (isSigningIn || !currentUser || !currentSync) return;
    
    showConfirm("Remove synced entries from your Google Calendar?", async () => {
      try {
        let accessToken = getCachedAccessToken();
        
        if (!accessToken) {
          setIsSigningIn(true);
          const authResult = await signInWithPopup(auth, googleProvider);
          setIsSigningIn(false);
          const credential = GoogleAuthProvider.credentialFromResult(authResult);
          accessToken = credential?.accessToken || null;
          if (accessToken) {
            setCachedAccessToken(accessToken);
          }
        }
        
        if (!accessToken) {
          throw new Error('Could not obtain authorization. Please sign in using "Sync with Redirect" in the side-menu first.');
        }
        
        setSyncStatus('syncing');
        
        await fetch('/api/calendar/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken, eventIds: currentSync.eventIds })
        });

        const path = `user_syncs/${currentSync.id}`;
        try {
          await deleteDoc(doc(db, 'user_syncs', currentSync.id));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, path);
        }
        setCurrentSync(null);
        setSyncStatus('idle');
        showToast("success", "Successfully removed from calendar.");
      } catch (error: any) {
        setIsSigningIn(false);
        setSyncStatus('error');
        showToast("error", "Failed to remove entries: " + getFriendlyErrorMessage(error));
        setTimeout(() => setSyncStatus('idle'), 3000);
      }
    });
  };

  const handleDeleteTimetable = async (t: Timetable) => {
    showConfirm("Permanently delete this timetable?", async () => {
      const path = `timetables/${t.id}`;
      try {
        setIsLoading(true);
        await deleteDoc(doc(db, 'timetables', t.id));
        showToast("success", "Timetable deleted successfully.");
        fetchTimetables().catch(err => console.error(err));
      } catch (err: any) {
        handleFirestoreError(err, OperationType.DELETE, path);
      } finally {
        setIsLoading(false);
      }
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '100%' }}
      className="fixed inset-0 z-[100] bg-rsu-bg md:inset-auto md:right-4 md:bottom-4 md:w-96 md:h-[700px] md:max-h-[calc(100vh-32px)] md:rounded-3xl shadow-2xl flex flex-col border border-rsu-border/20"
    >
      <div className="p-5 sm:p-6 border-b border-rsu-border/20 flex items-center justify-between bg-rsu-navy text-white md:rounded-t-3xl shadow-lg">
        <div className="flex items-center gap-2.5">
          {onBack && (
            <button 
              onClick={onBack}
              className="p-1.5 -ml-1 hover:bg-white/10 rounded-xl transition-all cursor-pointer flex items-center gap-1 group"
              title="Back to Profile"
              aria-label="Back to Profile"
            >
              <ArrowLeft className="w-5 h-5 text-rsu-orange group-hover:-translate-x-0.5 transition-transform" />
              <span className="text-xs font-bold hidden sm:inline text-white/90">Back</span>
            </button>
          )}
          <BookOpen className="w-6 h-6 text-rsu-orange" />
          <div>
            <h2 className="text-xl font-black italic tracking-tighter uppercase">Timetables</h2>
            <p className="text-[10px] opacity-70 font-bold uppercase tracking-widest leading-none">Smart Academic Sync</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer" aria-label="Close Timetable"><X className="w-6 h-6" /></button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {!currentUser ? (
          <div className="p-6 flex flex-col items-center justify-center text-center h-64 space-y-6 pt-12">
            <div className="p-4 bg-rsu-orange/10 text-rsu-orange rounded-full animate-bounce">
              <Calendar className="w-12 h-12" />
            </div>
            <div>
              <h3 className="text-xl font-bold font-sans text-rsu-text uppercase tracking-tight">Access Academic Timetables</h3>
              <p className="text-sm text-rsu-muted mt-2 font-sans px-4 leading-relaxed">
                Please sign in with your student Google account to view and search schedules for your department.
              </p>
            </div>
            
            <div className="w-full max-w-xs mx-auto space-y-3">
              <button 
                onClick={async () => {
                  setIsSigningIn(true);
                  try {
                    const result = await signInWithPopup(auth, googleProvider);
                    const credential = GoogleAuthProvider.credentialFromResult(result);
                    if (credential?.accessToken) {
                      setCachedAccessToken(credential.accessToken);
                    }
                    showToast("success", `Signed in as ${result.user.displayName || 'Student'}!`);
                  } catch (error: any) {
                    if (error.code === 'auth/unauthorized-domain' || error.code === 'auth/popup-blocked') {
                      showToast("info", "Please open the app in a new tab or continue with Guest Pass below.");
                    } else if (error.code !== 'auth/popup-closed-by-user') {
                      showToast("error", "Sign-in notice: " + error.message);
                    }
                  } finally {
                    setIsSigningIn(false);
                  }
                }}
                disabled={isSigningIn}
                className="w-full bg-rsu-navy text-white py-3.5 px-4 rounded-xl font-black uppercase text-xs tracking-wider flex items-center justify-center gap-2.5 active:scale-95 transition-all shadow-md hover:bg-rsu-navy/90 cursor-pointer"
              >
                {isSigningIn ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                      <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.7 0 3.3.61 4.5 1.74l2.42-2.42C17.345 1.517 14.93 1 12.24 1c-6.075 0-11 4.925-11 11s4.925 11 11 11c5.96 0 10.74-4.8 10.74-11 0-.756-.095-1.3-.23-1.715h-10.51z" />
                    </svg>
                    <span>Sign In with Google</span>
                  </>
                )}
              </button>

              <button
                onClick={async () => {
                  setIsSigningIn(true);
                  try {
                    await signInAnonymously(auth);
                    showToast("success", "✓ Signed in with Campus Guest Pass!");
                  } catch (err: any) {
                    showToast("error", "Guest pass initialization notice: " + err.message);
                  } finally {
                    setIsSigningIn(false);
                  }
                }}
                disabled={isSigningIn}
                className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-rsu-navy dark:text-white py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                <span>Continue as Guest Student</span>
              </button>

              {typeof window !== 'undefined' && window.self !== window.top && (
                <a 
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-full py-2.5 px-4 bg-rsu-orange/10 hover:bg-rsu-orange/20 text-rsu-orange rounded-xl font-bold text-[11px] uppercase tracking-wider transition-all border border-rsu-orange/30 active:scale-95 cursor-pointer text-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in Dedicated Tab</span>
                </a>
              )}
            </div>
            <p className="text-[10px] text-rsu-muted opacity-80 uppercase tracking-widest leading-normal">
              SECURED BY FIREBASE AUTH
            </p>
          </div>
        ) : (
          <>
            {view === 'browse' && (
              <div className="p-4 space-y-4">
                <button 
                  onClick={handleStartCreation}
                  className="w-full bg-rsu-orange text-white rounded-2xl p-6 flex items-center justify-between shadow-lg active:scale-95 transition-all group"
                >
                  <div className="text-left">
                    <p className="text-lg font-black italic uppercase tracking-tighter">Add New Entry</p>
                    <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Select Dept • Create Level</p>
                  </div>
                  <Upload className="w-6 h-6" />
                </button>

                {/* Filter and Selection Section */}
                <div className="bg-rsu-card border border-rsu-border/20 rounded-2xl p-4 shadow-sm space-y-3">
                  <h3 className="text-[10px] font-black text-rsu-navy/60 uppercase tracking-widest px-1">Filter Academic Timetables</h3>
                  
                  {/* Search Bar */}
                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="Search Faculty, Dept, Level..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-rsu-bg border-2 border-rsu-border rounded-xl px-4 py-3 text-xs font-bold text-rsu-text outline-none focus:border-rsu-orange transition-all placeholder:text-rsu-muted/40"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-rsu-muted hover:text-rsu-orange text-xs font-bold">Clear</button>
                    )}
                  </div>

                  {/* Dropdowns */}
                  <div className="grid grid-cols-2 gap-2">
                    <select 
                      className="bg-rsu-bg border-2 border-rsu-border rounded-xl p-3 text-xs font-bold text-rsu-text outline-none focus:border-rsu-orange transition-all cursor-pointer"
                      value={filterFaculty}
                      onChange={(e) => {
                        setFilterFaculty(e.target.value);
                        setFilterDepartment('');
                      }}
                    >
                      <option value="">All Faculties</option>
                      {RSU_FACULTIES.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>

                    <select 
                      className="bg-rsu-bg border-2 border-rsu-border rounded-xl p-3 text-xs font-bold text-rsu-text outline-none focus:border-rsu-orange transition-all cursor-pointer disabled:opacity-50"
                      value={filterDepartment}
                      disabled={!filterFaculty}
                      onChange={(e) => setFilterDepartment(e.target.value)}
                    >
                      <option value="">All Depts</option>
                      {(filterFaculty && RSU_DEPARTMENTS[filterFaculty] || []).map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                      {filterFaculty && <option value="Other">Other</option>}
                    </select>
                  </div>

                  {(searchQuery || filterFaculty || filterDepartment) && (
                    <button 
                      onClick={() => {
                        setSearchQuery('');
                        setFilterFaculty('');
                        setFilterDepartment('');
                      }}
                      className="w-full text-center text-xs text-rsu-orange font-bold uppercase tracking-widest pt-1 hover:underline"
                    >
                      Clear All Filters
                    </button>
                  )}
                </div>

                <div className="pt-2">
                  <h3 className="text-[10px] font-black text-rsu-navy/40 uppercase tracking-widest mb-3 px-1">Schedules found</h3>
                  {isLoading ? (
                    <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-rsu-orange border-t-transparent rounded-full animate-spin" /></div>
                  ) : filteredTimetables.length > 0 ? (
                    filteredTimetables.map(t => (
                      <div key={t.id} className="relative group">
                        <button 
                          onClick={() => { setSelectedTimetable(t); fetchSlots(t.id); setView('review'); }}
                          className="w-full text-left bg-rsu-card rounded-2xl p-4 mb-3 border border-rsu-border/5 shadow-sm hover:shadow-md transition-all flex items-center justify-between"
                        >
                          <div>
                            <h4 className="font-black text-rsu-text text-sm uppercase">{t.faculty}</h4>
                            <p className="text-[11px] text-rsu-muted font-bold">{t.department} • {t.level}</p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-rsu-orange" />
                        </button>
                        {currentUser?.uid === t.creatorId && (
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteTimetable(t); }} className="absolute right-12 top-1/2 -translate-y-1/2 p-2 bg-red-50 text-red-500 rounded-xl opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-10 opacity-30 bg-rsu-card rounded-2xl border border-dashed border-rsu-border p-6">
                      <FileText className="w-10 h-10 mx-auto mb-2 text-rsu-muted" />
                      <p className="text-[10px] font-black uppercase">No timetables fit the filter</p>
                    </div>
                  )}
                </div>
              </div>
            )}

        {view === 'setup' && (
          <div className="p-6 space-y-6">
            <button 
              onClick={() => setView('browse')} 
              className="text-xs font-black text-rsu-orange flex items-center gap-1 hover:underline mb-2 cursor-pointer"
            >
              ← Back to Browse
            </button>
            <h3 className="text-2xl font-black italic text-rsu-text uppercase tracking-tighter">Create Entry</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-black text-rsu-muted uppercase tracking-widest block mb-1">Faculty</label>
                <select 
                  className="w-full bg-rsu-card border-2 border-rsu-border rounded-2xl p-4 font-bold text-rsu-text outline-none focus:border-rsu-orange transition-all appearance-none cursor-pointer"
                  value={metadata.faculty}
                  onChange={(e) => {
                    setMetadata({...metadata, faculty: e.target.value, department: ""});
                    setIsOtherSelected(false);
                  }}
                >
                  <option value="">Select Faculty...</option>
                  {RSU_FACULTIES.map(f => <option key={f} value={f} className="text-rsu-text bg-rsu-card">{f}</option>)}
                </select>
              </div>
              {metadata.faculty && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[11px] font-black text-rsu-muted uppercase tracking-widest block mb-1">Department</label>
                    <select 
                      className="w-full bg-rsu-card border-2 border-rsu-border rounded-2xl p-4 font-bold text-rsu-text outline-none focus:border-rsu-orange transition-all appearance-none cursor-pointer"
                      value={isOtherSelected ? "Other" : metadata.department}
                      onChange={(e) => {
                        if (e.target.value === "Other") {
                          setIsOtherSelected(true);
                          setMetadata({...metadata, department: ""});
                        } else {
                          setIsOtherSelected(false);
                          setMetadata({...metadata, department: e.target.value});
                        }
                      }}
                    >
                      <option value="">Select Department...</option>
                      {(RSU_DEPARTMENTS[metadata.faculty] || []).map(d => <option key={d} value={d} className="text-rsu-text bg-rsu-card">{d}</option>)}
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  
                  {isOtherSelected && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                      <label className="text-[11px] font-black text-rsu-orange uppercase tracking-widest block mb-1 font-mono">Type in your Department</label>
                      <input 
                        type="text"
                        className="w-full bg-rsu-card border-2 border-rsu-border rounded-2xl p-4 font-bold text-rsu-text outline-none focus:border-rsu-orange transition-all placeholder:text-rsu-muted/40"
                        placeholder="Enter custom department name..."
                        value={metadata.department}
                        onChange={(e) => setMetadata({...metadata, department: e.target.value})}
                      />
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="text-[11px] font-black text-rsu-muted uppercase tracking-widest block mb-1">Level</label>
                <input 
                  className="w-full bg-rsu-card border-2 border-rsu-border rounded-2xl p-4 font-bold text-rsu-text outline-none focus:border-rsu-orange tracking-widest uppercase transition-all"
                  placeholder="EX: 300L"
                  value={metadata.level}
                  onChange={(e) => setMetadata({...metadata, level: e.target.value})}
                />
              </div>
            </div>
            <button 
              disabled={!metadata.faculty || !metadata.level}
              onClick={() => setView('entry_mode')}
              className="w-full bg-rsu-navy text-white py-5 rounded-2xl font-black uppercase tracking-widest disabled:opacity-30 cursor-pointer"
            >Next Step</button>
          </div>
        )}

        {view === 'entry_mode' && (
          <div className="p-6 space-y-6">
            <button 
              onClick={() => setView('setup')} 
              className="text-xs font-black text-rsu-orange flex items-center gap-1 hover:underline mb-2 cursor-pointer"
            >
              ← Back to Setup
            </button>
            <h3 className="text-xl font-black italic text-rsu-text uppercase tracking-tighter">Choose Entry Method</h3>
            <div className="space-y-4">
              <button onClick={() => setView('create')} className="w-full bg-rsu-card border-2 border-rsu-orange/20 p-6 rounded-3xl flex items-center gap-6 group hover:border-rsu-orange cursor-pointer">
                <div className="p-4 bg-rsu-orange text-white rounded-2xl"><BookOpen size={30} /></div>
                <div className="text-left"><p className="text-lg font-black text-rsu-text uppercase italic">AI Vision</p></div>
              </button>
              <button onClick={() => setView('manual')} className="w-full bg-rsu-card border-2 border-rsu-navy/10 p-6 rounded-3xl flex items-center gap-6 group hover:border-rsu-navy cursor-pointer">
                <div className="p-4 bg-rsu-navy text-white rounded-2xl"><FileText size={30} /></div>
                <div className="text-left"><p className="text-lg font-black text-rsu-text uppercase italic">Manual entry</p></div>
              </button>
            </div>
          </div>
        )}

        {view === 'review' && (
          <div className="flex flex-col h-full bg-rsu-bg">
            <div className="p-6 bg-rsu-card border-b border-rsu-border shadow-sm">
              <button 
                onClick={() => {
                  if (selectedTimetable) {
                    setSelectedTimetable(null);
                    setView('browse');
                  } else {
                    setView(slots.length > 0 ? 'manual' : 'entry_mode');
                  }
                }} 
                className="text-xs font-black text-rsu-orange mb-4 hover:underline cursor-pointer"
              >
                ← Back
              </button>
              <h3 className="text-xl font-black italic text-rsu-text uppercase">{metadata.department || selectedTimetable?.department}</h3>
              <p className="text-[10px] font-bold text-rsu-muted uppercase">{metadata.level || selectedTimetable?.level}</p>
              <button 
                onClick={currentSync ? handleRemoveSync : handleSyncToCalendar}
                disabled={syncStatus !== 'idle'}
                className={cn(
                  "w-full mt-6 py-4 px-6 rounded-2xl font-black tracking-wider text-xs flex items-center justify-center gap-3 border-2 transition-all duration-300 relative overflow-hidden group hover:-translate-y-0.5 active:translate-y-0 cursor-pointer shadow-md active:scale-[0.99]",
                  syncStatus === 'syncing' && "bg-blue-600 border-blue-600 text-white cursor-not-allowed animate-pulse shadow-md",
                  syncStatus === 'success' && "bg-green-600 border-green-600 text-white shadow-lg",
                  syncStatus === 'error' && "bg-red-600 border-red-600 text-white shadow-lg",
                  syncStatus === 'idle' && (
                    currentSync 
                      ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100/80 hover:border-red-300 shadow-sm" 
                      : "bg-blue-600 border-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg"
                  )
                )}
              >
                {syncStatus === 'syncing' && (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Syncing your lectures...</span>
                  </>
                )}
                {syncStatus === 'success' && (
                  <>
                    <Check className="w-4 h-4 animate-bounce text-white" />
                    <span>Lectures synced!</span>
                  </>
                )}
                {syncStatus === 'error' && (
                  <>
                    <AlertCircle className="w-4 h-4 text-white animate-pulse" />
                    <span>Sync Failed - try again</span>
                  </>
                )}
                {syncStatus === 'idle' && (
                  currentSync ? (
                    <>
                      <Trash2 className="w-4 h-4 group-hover:-rotate-6 transition-transform text-red-600" />
                      <span>Remove from Google Calendar</span>
                    </>
                  ) : (
                    <>
                      <Calendar className="w-4 h-4 group-hover:scale-110 transition-transform text-white" />
                      <span>Sync to Google Calendar</span>
                    </>
                  )
                )}
              </button>
              <p className="text-[10px] text-center text-rsu-muted italic mt-2.5">
                Lectures repeat weekly on Google Calendar for the semester duration.
              </p>
            </div>
            <div className="flex-1 p-4 space-y-4">
              {slots.map((slot, idx) => (
                <div key={idx} className="bg-rsu-card rounded-3xl p-5 border border-rsu-border shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div className="bg-rsu-orange text-white px-3 py-1 rounded-full text-[9px] font-black uppercase">{slot.day}</div>
                    <div className="text-[11px] font-black text-rsu-text flex items-center gap-1.5"><Clock size={14} className="text-rsu-orange" />{slot.startTime} - {slot.endTime}</div>
                  </div>
                  <h4 className="font-black text-rsu-text text-base uppercase mb-1">{slot.courseCode}</h4>
                  <p className="text-[11px] font-bold text-rsu-muted uppercase truncate mb-4">{slot.courseTitle}</p>
                  <div className="flex items-center justify-between border-t border-rsu-border pt-4">
                    <div className="flex items-center gap-1.5 text-[10px] font-black text-rsu-text/60 uppercase"><MapPin size={14} className="text-rsu-orange" />{slot.venue}</div>
                    <div className="flex gap-2">
                       <button onClick={() => {
                        const v = slot.venue || "";
                        const l = locations.find(loc => loc.officialName.toLowerCase().includes(v.toLowerCase()) || loc.aliases.some(a => a.toLowerCase().includes(v.toLowerCase())));
                        if (l) onNavigateTo(l.id); else showToast("error", "Loc not found: " + v);
                      }} className="p-2 bg-rsu-bg rounded-xl"><MapPin className="text-rsu-orange w-4 h-4" /></button>
                      {(!selectedTimetable || selectedTimetable.creatorId === currentUser?.uid) && (
                        <button onClick={() => setSlots(slots.filter((_, i) => i !== idx))} className="p-2 bg-red-50 text-red-500 rounded-xl"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {!selectedTimetable && (
              <div className="p-6 bg-rsu-card border-t border-rsu-border">
                <button onClick={saveTimetable} disabled={isLoading} className="w-full bg-rsu-orange text-white py-5 rounded-2xl font-black uppercase cursor-pointer">
                  {isLoading ? 'Publishing...' : 'Finalize & Publish'}
                </button>
              </div>
            )}
          </div>
        )}

        {view === 'create' && (
          <div className="p-6 space-y-6">
            <button 
              onClick={() => setView('entry_mode')} 
              className="text-xs font-black text-rsu-orange flex items-center gap-1 hover:underline mb-2 cursor-pointer"
            >
              ← Back to Selection
            </button>
            <div className="flex flex-col items-center justify-center text-center space-y-6 pt-4">
              <Upload className="w-12 h-12 text-rsu-orange animate-bounce" />
              <h3 className="text-2xl font-black italic text-rsu-text uppercase text-sans tracking-tight">AI Vision Sync</h3>
              <div className="space-y-4 w-full">
                <label className="w-full bg-rsu-orange text-white py-5 rounded-2xl flex items-center justify-center gap-3 text-sm font-black uppercase cursor-pointer hover:bg-rsu-orange/90 transition-colors shadow-lg shadow-rsu-orange/20">
                  {isUploading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Upload className="w-5 h-5" /> Scan Timetable Image</>}
                  <input type="file" className="hidden" accept="image/jpeg,image/png,application/pdf" onChange={handleFileUpload} disabled={isUploading} />
                </label>
                <p className="text-[10px] font-bold text-rsu-muted uppercase tracking-widest">Supports: JPG, PNG, PDF (Max 5MB)</p>
              </div>
            </div>
          </div>
        )}

        {view === 'manual' && (
          <div className="p-6 space-y-4">
            <button 
              onClick={() => setView('entry_mode')} 
              className="text-xs font-black text-rsu-orange flex items-center gap-1 hover:underline mb-2 cursor-pointer"
            >
              ← Back to Selection
            </button>
            <h3 className="text-xl font-black italic text-rsu-text uppercase">Add Slot</h3>
            <div className="space-y-4">
              <input className="w-full bg-rsu-card border-2 border-rsu-border rounded-xl p-4 font-bold text-rsu-text" placeholder="COURSE CODE" value={manualSlot.courseCode} onChange={e => setManualSlot({...manualSlot, courseCode: e.target.value.toUpperCase()})} />
              <input className="w-full bg-rsu-card border-2 border-rsu-border rounded-xl p-4 font-bold text-rsu-text" placeholder="COURSE TITLE" value={manualSlot.courseTitle} onChange={e => setManualSlot({...manualSlot, courseTitle: e.target.value})} />
              <div className="grid grid-cols-2 gap-3">
                <select className="bg-rsu-card border-2 border-rsu-border rounded-xl p-4 font-bold text-rsu-text" value={manualSlot.day} onChange={e => setManualSlot({...manualSlot, day: e.target.value})}>
                  {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(d => <option key={d} value={d} className="bg-rsu-card text-rsu-text">{d}</option>)}
                </select>
                <input className="bg-rsu-card border-2 border-rsu-border rounded-xl p-4 font-bold text-rsu-text" placeholder="VENUE" value={manualSlot.venue} onChange={e => setManualSlot({...manualSlot, venue: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="time" className="bg-rsu-card border-2 border-rsu-border rounded-xl p-4 font-bold text-rsu-text" value={manualSlot.startTime} onChange={e => setManualSlot({...manualSlot, startTime: e.target.value})} />
                <input type="time" className="bg-rsu-card border-2 border-rsu-border rounded-xl p-4 font-bold text-rsu-text" value={manualSlot.endTime} onChange={e => setManualSlot({...manualSlot, endTime: e.target.value})} />
              </div>
            </div>
            <button onClick={() => { if(!manualSlot.courseCode) return; setSlots([...slots, manualSlot]); setManualSlot({...manualSlot, courseCode: "", courseTitle: "", venue: ""}); }} className="w-full bg-rsu-navy text-white py-4 rounded-xl font-black">Add Slot</button>
            <button disabled={slots.length === 0} onClick={() => setView('review')} className="w-full bg-rsu-orange text-white py-4 rounded-xl font-black">Review & Map</button>
          </div>
        )}
          </>
        )}
      </div>

      {/* Toast Alert overlay */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="absolute top-4 left-4 right-4 z-[120] p-4 rounded-2xl shadow-2xl flex items-start gap-3 border backdrop-blur-md transition-all"
            style={{
              backgroundColor: toast.type === 'error' ? 'rgba(239, 68, 68, 0.95)' : toast.type === 'success' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(13, 138, 188, 0.95)',
              borderColor: toast.type === 'error' ? '#ef4444' : toast.type === 'success' ? '#10b981' : '#0d8abc',
              color: '#ffffff'
            }}
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-left">
              <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">
                {toast.type === 'error' ? 'Error' : toast.type === 'success' ? 'Success' : 'Notice'}
              </p>
              <div className="text-xs font-bold leading-normal">{toast.message}</div>
            </div>
            <button 
              onClick={() => setToast(null)}
              className="p-1 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog overlay */}
      <AnimatePresence>
        {confirmDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[110] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-rsu-bg border border-rsu-border/30 rounded-3xl p-6 shadow-2xl max-w-[320px] w-full text-center space-y-6"
            >
              <div className="w-12 h-12 bg-rsu-orange/15 rounded-full flex items-center justify-center mx-auto text-rsu-orange">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h4 className="font-display font-black text-lg text-rsu-text uppercase tracking-tight">Are you sure?</h4>
                <p className="text-[11px] text-rsu-muted font-bold leading-normal uppercase tracking-wide">
                  {confirmDialog.message}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="flex-1 py-3 bg-white dark:bg-rsu-card border border-rsu-border rounded-xl font-black text-[10px] text-rsu-navy dark:text-white uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer select-none"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const act = confirmDialog.action;
                    setConfirmDialog(null);
                    act();
                  }}
                  className="flex-1 py-3 bg-rsu-orange text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rsu-orange/90 transition-all shadow-md shadow-rsu-orange/20 cursor-pointer select-none"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
