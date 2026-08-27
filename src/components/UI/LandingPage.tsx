import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Map, 
  Calendar, 
  Search, 
  Navigation, 
  Compass, 
  Sparkles, 
  Clock, 
  ChevronRight, 
  ChevronDown,
  Moon, 
  Sun, 
  MapPin, 
  BookOpen, 
  ArrowRight,
  ShieldCheck,
  CheckCircle,
  TrendingUp,
  X,
  Footprints,
  HelpCircle,
  Layers,
  GraduationCap,
  Zap,
  Users,
  School,
  Route,
  Check,
  Eye,
  RotateCcw,
  Sliders,
  Car,
  Menu,
  Shield,
  FileText,
  Scale,
  Ticket,
  CheckCircle2,
  Award,
  Globe,
  Activity,
  Heart,
  Share2,
  Building2,
  Bookmark
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import L from 'leaflet';
import { createCustomIcon } from '../../lib/icons';
import { locations } from '../../data/locations';
import { campusEvents, CampusEvent } from '../../data/events';
import { Location, LocationType } from '../../types';
import { cn } from '../../lib/utils';

interface LandingPageProps {
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  onNavigateToMap: (initialLocation?: Location | null, openTimetable?: boolean, openEvents?: boolean, openMeetup?: boolean) => void;
  onOpenTerms?: () => void;
  onOpenPrivacy?: () => void;
}

interface SimStep {
  name: string;
  duration: string;
  distance: string;
  instruction: string;
  markerId: string;
}

const SIM_COORDS: Record<string, [number, number]> = {
  gate: [4.804043, 6.986824],
  chapel: [4.799828, 6.984681],
  center: [4.801372, 6.982447],
  senate: [4.799501, 6.982339]
};

const walkerIcon = typeof window !== 'undefined' ? L.divIcon({
  className: 'walker-marker-highlight',
  html: `
    <div class="relative flex items-center justify-center w-8 h-8">
      <div class="absolute w-12 h-12 bg-blue-500/20 rounded-full animate-ping" style="animation-duration: 2s;"></div>
      <div class="absolute w-8 h-8 bg-blue-600 rounded-full border-2 border-white flex items-center justify-center shadow-lg">
        <svg viewBox="0 0 24 24" class="w-4 h-4 fill-white animate-pulse" xmlns="http://www.w3.org/2000/svg">
          <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 21.5c-.1.5.3 1 1 1h.5c.4 0 .8-.3.9-.7l2.1-7.3 2.1 3.5c.3.5.8.8 1.4.8h1.5l-3.3-5.5.9-4.3c1.2 1.4 3 2.2 4.9 2.2V10c-1.5 0-2.9-.8-3.7-2.1L13 6.3c-.4-.6-1.1-1-1.8-1-.3 0-.5.1-.8.2L6 7.2V11h2V8.9l1.8-.7"/>
        </svg>
      </div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
}) : null;

const SIM_ROUTE: SimStep[] = [
  {
    name: "Main Gateway Entry",
    duration: "Start",
    distance: "0m",
    instruction: "Pass through the RSU Main Gate and proceed southwest.",
    markerId: "gate"
  },
  {
    name: "Chapel of Redemption Corner",
    duration: "1.8 mins",
    distance: "210m",
    instruction: "Continue straight on the main paved avenue, passing the Chapel.",
    markerId: "chapel"
  },
  {
    name: "Entrepreneurship Center",
    duration: "3.2 mins",
    distance: "390m",
    instruction: "Turn right at the Risi Water crossing and follow the direct walkway.",
    markerId: "center"
  },
  {
    name: "New Senate Building Plaza",
    duration: "4.1 mins",
    distance: "530m",
    instruction: "Arrive safely at the administrative main plaza entrance.",
    markerId: "senate"
  }
];

export function LandingPage({ 
  isDarkMode, 
  setIsDarkMode, 
  onNavigateToMap,
  onOpenTerms,
  onOpenPrivacy
}: LandingPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isExploreOpen, setIsExploreOpen] = useState(false);
  const exploreDropdownRef = useRef<HTMLDivElement>(null);

  // Close explore dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exploreDropdownRef.current && !exploreDropdownRef.current.contains(event.target as Node)) {
        setIsExploreOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExploreOpen(false);
      }
    };
    if (isExploreOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExploreOpen]);
  
  // Interactive features
  const [activeTab, setActiveTab] = useState<'all' | 'faculty' | 'admin' | 'facility' | 'gate'>('all');
  const [simStepIdx, setSimStepIdx] = useState(0);
  const [simProgress, setSimProgress] = useState(25);
  const [panelMode, setPanelMode] = useState<'map' | 'schedule' | 'events' | 'assistant' | 'calculator'>('map');
  const [is3dTilted, setIs3dTilted] = useState(true);

  // Events Showcase Filter & Search State
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const [eventCategoryFilter, setEventCategoryFilter] = useState<'all' | 'academic' | 'social' | 'sports' | 'conference'>('all');
  const [rsvpdEventIds, setRsvpdEventIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('rsu_event_rsvps');
        return saved ? JSON.parse(saved) : ['e1', 'e3'];
      } catch (e) {
        return ['e1', 'e3'];
      }
    }
    return ['e1', 'e3'];
  });

  const handleToggleRsvp = (eventId: string) => {
    setRsvpdEventIds(prev => {
      const next = prev.includes(eventId) ? prev.filter(id => id !== eventId) : [...prev, eventId];
      if (typeof window !== 'undefined') {
        localStorage.setItem('rsu_event_rsvps', JSON.stringify(next));
      }
      return next;
    });
  };

  // Quick Walk Time Estimator Widget State
  const [calcStartId, setCalcStartId] = useState<string>('main_gate');
  const [calcEndId, setCalcEndId] = useState<string>('senate_building');

  // FAQ accordion active state
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  // Live route progress simulation
  useEffect(() => {
    let intervalId: any;
    if (panelMode === 'map') {
      intervalId = setInterval(() => {
        setSimProgress((prev) => {
          if (prev >= 100) {
            return 0;
          }
          return prev + 4;
        });
      }, 180);
    }
    return () => clearInterval(intervalId);
  }, [panelMode]);

  useEffect(() => {
    if (simProgress === 0) {
      setSimStepIdx((curIdx) => (curIdx + 1) % SIM_ROUTE.length);
    }
  }, [simProgress]);

  // Handle live search
  const filteredSearch = searchQuery.trim()
    ? locations.filter(loc => 
        loc.officialName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        loc.aliases.some(alias => alias.toLowerCase().includes(searchQuery.toLowerCase())) ||
        loc.type.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 5)
    : [];

  const handleSearchResultClick = (loc: Location) => {
    onNavigateToMap(loc);
  };

  // Popular locations for direct pill selection
  const popularLocations = locations.slice(0, 6);

  // Grouped location categories
  const categoryFilteredLocations = (() => {
    const filtered = locations.filter(loc => loc.id !== 'catholic_church');
    return filtered.filter(loc => {
      if (activeTab === 'all') return true;
      return loc.type === activeTab;
    }).slice(0, 6);
  })();

  const currentCoords = SIM_COORDS[SIM_ROUTE[simStepIdx].markerId] || SIM_COORDS.gate;
  const nextCoords = SIM_COORDS[SIM_ROUTE[(simStepIdx + 1) % SIM_ROUTE.length].markerId] || SIM_COORDS.chapel;
  const fillFrac = simProgress / 100;
  
  const walkerCoords: [number, number] = [
    currentCoords[0] + (nextCoords[0] - currentCoords[0]) * fillFrac,
    currentCoords[1] + (nextCoords[1] - currentCoords[1]) * fillFrac
  ];

  // Calculate distance & time for mini walk estimator
  const calcStartLoc = locations.find(l => l.id === calcStartId) || locations[0];
  const calcEndLoc = locations.find(l => l.id === calcEndId) || locations[1] || locations[0];
  
  const calculateDistanceMeters = (locA: Location, locB: Location) => {
    if (!locA || !locB) return 350;
    const lat1 = locA.coordinates[0];
    const lon1 = locA.coordinates[1];
    const lat2 = locB.coordinates[0];
    const lon2 = locB.coordinates[1];
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return Math.round(R * c);
  };

  const estimatedMeters = calculateDistanceMeters(calcStartLoc, calcEndLoc);
  const estimatedWalkMins = Math.max(1, Math.ceil(estimatedMeters / 80));
  const estimatedCalories = Math.round(estimatedWalkMins * 4.2);

  // FAQ items
  const faqs = [
    {
      q: "How does CampusGryd simplify navigating Rivers State University (RSU)?",
      a: "CampusGryd maps official RSU pedestrian pathways, faculties, lecture theaters, administrative offices, and hostels. It provides step-by-step turn guidance and directly syncs with your course timetable so you never miss a lecture venue."
    },
    {
      q: "Can I use CampusGryd on my mobile phone while walking to class?",
      a: "Yes! CampusGryd is optimized for touch screens on all mobile browsers with responsive bottom drawers, walking time indicators, compass orientation, and fast search."
    },
    {
      q: "How does the Academic Class Timetable Integration work?",
      a: "Simply select or import your course schedule. The system links each course code (e.g. ENG 301, GST 111) directly to its venue on the campus map, allowing 1-tap route tracing before your lecture starts."
    },
    {
      q: "How do Campus Events and Attendance RSVP work?",
      a: "Students can browse upcoming campus symposiums, sports tournaments, departmental dinners, and matriculation events. Clicking 'RSVP' saves the event to your profile hub and provides instant directions to the venue when it's time to attend."
    },
    {
      q: "Are the campus coordinates accurate for RSU?",
      a: "Yes. All location nodes are geocoded based on verified geodetic coordinates across RSU campus, including New Senate, Convocation Arena, Law Faculty, Engineering Complex, and Main Gate."
    },
    {
      q: "What is the Navi-bot AI Campus Guide?",
      a: "An integrated AI guide that answers student queries about campus locations, department clearance procedures, exam halls, and walking times in natural conversational language."
    },
    {
      q: "What is CampusGryd's mission at Rivers State University?",
      a: "CampusGryd aims to eliminate orientation stress for over 30,000 students and visitors by uniting high-precision pedestrian wayfinding, academic schedules, events discovery, and Navi-bot AI assistance into one open, zero-telemetry campus platform."
    }
  ];

  const getTypeBadge = (type: LocationType) => {
    switch(type) {
      case 'faculty':
        return { label: 'Faculty', style: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800' };
      case 'admin':
        return { label: 'Senate & Admin', style: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
      case 'gate':
        return { label: 'Entrance', style: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800' };
      case 'library':
        return { label: 'Library & Resource', style: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800' };
      default:
        return { label: 'Facility', style: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' };
    }
  };

  return (
    <div className={cn(
      "min-h-screen w-full flex flex-col font-sans transition-colors duration-500 overflow-x-hidden selection:bg-slate-900 selection:text-white",
      isDarkMode ? "bg-slate-950 text-slate-100" : "bg-[#F8FAFC] text-slate-900"
    )}>
      {/* Top Navbar */}
      <nav className={cn(
        "sticky top-0 z-50 backdrop-blur-xl border-b transition-all duration-300 px-4 sm:px-6 lg:px-12 xl:px-16 py-3 flex items-center justify-between gap-4",
        isDarkMode 
          ? "bg-slate-950/90 border-slate-900 shadow-md shadow-slate-950/40" 
          : "bg-white/90 border-slate-200/90 shadow-sm shadow-slate-200/50"
      )}>
        {/* Brand Logo */}
        <div 
          className="flex items-center gap-3 cursor-pointer group shrink-0" 
          onClick={() => onNavigateToMap()}
          id="landing-nav-brand"
        >
          <div className="w-9 h-9 rounded-full bg-slate-950 text-white dark:bg-white dark:text-slate-950 flex items-center justify-center shadow-md transition-transform duration-300 group-hover:scale-105">
            <GraduationCap size={18} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base sm:text-lg font-display font-black tracking-tight leading-none uppercase text-slate-950 dark:text-white">
                Campus<span className="text-blue-600 dark:text-blue-400">Gryd</span>
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-200/60 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700">
                RSU
              </span>
            </div>
            <span className="hidden lg:block text-[8.5px] font-mono font-bold text-slate-500 uppercase tracking-wider leading-none mt-0.5">
              Rivers State University
            </span>
          </div>
        </div>

        {/* Central Segmented Pill Navigation Bar (Desktop & Tablet) */}
        <div 
          className="hidden md:flex items-center bg-slate-100/90 dark:bg-slate-900/90 p-1 rounded-full border border-slate-200/80 dark:border-slate-800 shadow-sm backdrop-blur-md"
          id="landing-nav-pill-menu"
        >
          {/* Campus Map */}
          <button 
            onClick={() => onNavigateToMap()} 
            className="px-3.5 py-1.5 rounded-full text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm hover:shadow"
            id="nav-map-btn"
          >
            <Map size={13} className="text-blue-500" />
            <span>Map</span>
          </button>

          {/* Class Schedule */}
          <button 
            onClick={() => onNavigateToMap(null, true)} 
            className="px-3.5 py-1.5 rounded-full text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm hover:shadow"
            id="nav-schedule-btn"
          >
            <Calendar size={13} className="text-emerald-500" />
            <span>Schedule</span>
          </button>

          {/* Events */}
          <a 
            href="#events-section" 
            className="px-3.5 py-1.5 rounded-full text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm hover:shadow"
            id="nav-events-link"
          >
            <Ticket size={13} className="text-rose-500" />
            <span>Events</span>
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
          </a>

          {/* About Link (on extra large screens) */}
          <a 
            href="#about-section" 
            className="hidden xl:flex px-3.5 py-1.5 rounded-full text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer items-center gap-1.5 shadow-sm hover:shadow"
            id="nav-about-link"
          >
            <GraduationCap size={13} className="text-blue-500" />
            <span>About</span>
          </a>

          {/* Explore Dropdown */}
          <div className="relative" ref={exploreDropdownRef}>
            <button
              onClick={() => setIsExploreOpen(!isExploreOpen)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-sm",
                isExploreOpen 
                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow" 
                  : "text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800"
              )}
              id="nav-explore-btn"
              aria-expanded={isExploreOpen}
            >
              <span>Explore</span>
              <ChevronDown size={13} className={cn("transition-transform duration-200", isExploreOpen && "rotate-180")} />
            </button>

            {/* Dropdown Menu Overlay */}
            <AnimatePresence>
              {isExploreOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    "absolute right-0 top-full mt-2 w-64 p-2 rounded-2xl border shadow-2xl backdrop-blur-xl z-50 flex flex-col gap-1",
                    isDarkMode 
                      ? "bg-slate-900/95 border-slate-800 shadow-slate-950/80" 
                      : "bg-white/95 border-slate-200 shadow-slate-200/80"
                  )}
                  id="nav-explore-dropdown"
                >
                  <a
                    href="#about-section"
                    onClick={() => setIsExploreOpen(false)}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                      <GraduationCap size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors">
                        About CampusGryd
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                        RSU mission, routing & platform
                      </div>
                    </div>
                  </a>

                  <a
                    href="#landmarks-section"
                    onClick={() => setIsExploreOpen(false)}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                      <MapPin size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-purple-600 transition-colors">
                        Key Landmarks
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                        Faculties, halls & senate complex
                      </div>
                    </div>
                  </a>

                  <a
                    href="#walk-estimator-section"
                    onClick={() => setIsExploreOpen(false)}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Footprints size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-amber-600 transition-colors">
                        Walk Estimator
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                        Calculate walking times & calories
                      </div>
                    </div>
                  </a>

                  <a
                    href="#faq-section"
                    onClick={() => setIsExploreOpen(false)}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                      <HelpCircle size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-sky-600 transition-colors">
                        Help & FAQ
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                        Answers to common student questions
                      </div>
                    </div>
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0" id="landing-nav-actions">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={cn(
              "p-2.5 rounded-full border transition-all cursor-pointer shadow-sm flex items-center justify-center",
              isDarkMode 
                ? "bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-850" 
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            )}
            title="Toggle Light/Dark Theme"
            id="nav-theme-toggle"
          >
            {isDarkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Primary Action Button */}
          <button
            onClick={() => onNavigateToMap()}
            className={cn(
              "hidden sm:flex px-4 lg:px-5 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all duration-300 hover:scale-[1.03] active:scale-95 cursor-pointer shadow-md border items-center gap-2",
              isDarkMode 
                ? "bg-white border-white text-slate-950 shadow-white/10 hover:bg-slate-100" 
                : "bg-slate-950 border-slate-950 text-white shadow-slate-950/20 hover:bg-slate-900"
            )}
            id="nav-launch-map-btn"
          >
            <Navigation size={13} className="transform rotate-45 text-blue-500" />
            <span>Launch Map</span>
          </button>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={cn(
              "md:hidden p-2.5 rounded-full border transition-all cursor-pointer shadow-sm flex items-center justify-center",
              isDarkMode 
                ? "bg-slate-900 border-slate-800 text-slate-100 hover:bg-slate-800" 
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
            )}
            aria-label="Toggle mobile menu"
            id="nav-mobile-toggle"
          >
            {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {/* Mobile Navigation Drawer Dropdown */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className={cn(
              "md:hidden sticky top-[73px] z-40 border-b overflow-hidden px-6 py-4 flex flex-col gap-3 shadow-xl backdrop-blur-xl",
              isDarkMode ? "bg-slate-950/95 border-slate-800" : "bg-white/95 border-slate-200"
            )}
          >
            <button 
              onClick={() => { setIsMobileMenuOpen(false); onNavigateToMap(); }} 
              className="flex items-center gap-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 hover:text-blue-600 cursor-pointer border-b border-slate-100 dark:border-slate-800/80"
            >
              <Map size={15} className="text-blue-500" />
              <span>Campus Map</span>
            </button>
            <a 
              href="#about-section" 
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 py-2 text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 hover:text-blue-700 cursor-pointer border-b border-slate-100 dark:border-slate-800/80"
            >
              <GraduationCap size={15} className="text-blue-500" />
              <span>About CampusGryd</span>
            </a>
            <button 
              onClick={() => { setIsMobileMenuOpen(false); onNavigateToMap(null, true); }} 
              className="flex items-center gap-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 hover:text-blue-600 cursor-pointer border-b border-slate-100 dark:border-slate-800/80"
            >
              <Calendar size={15} className="text-emerald-500" />
              <span>Class Schedule</span>
            </button>
            <a 
              href="#events-section" 
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 hover:text-rose-600 cursor-pointer border-b border-slate-100 dark:border-slate-800/80"
            >
              <Ticket size={15} className="text-rose-500" />
              <span>Campus Events & RSVP</span>
            </a>
            <a 
              href="#landmarks-section" 
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 hover:text-blue-600 cursor-pointer border-b border-slate-100 dark:border-slate-800/80"
            >
              <MapPin size={15} className="text-purple-500" />
              <span>Landmarks</span>
            </a>
            <a 
              href="#walk-estimator-section" 
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 hover:text-blue-600 cursor-pointer border-b border-slate-100 dark:border-slate-800/80"
            >
              <Footprints size={15} className="text-amber-500" />
              <span>Walk Estimator</span>
            </a>
            <a 
              href="#faq-section" 
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 hover:text-blue-600 cursor-pointer border-b border-slate-100 dark:border-slate-800/80"
            >
              <HelpCircle size={15} className="text-sky-500" />
              <span>Help & FAQ</span>
            </a>
            <a 
              href="/privacy.html"
              onClick={(e) => {
                if (onOpenPrivacy) {
                  e.preventDefault();
                  setIsMobileMenuOpen(false);
                  onOpenPrivacy();
                } else {
                  setIsMobileMenuOpen(false);
                }
              }}
              className="flex items-center gap-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 hover:text-emerald-600 cursor-pointer border-b border-slate-100 dark:border-slate-800/80"
            >
              <Shield size={15} className="text-emerald-500" />
              <span>Privacy Policy</span>
            </a>
            <a 
              href="/terms.html"
              onClick={(e) => {
                if (onOpenTerms) {
                  e.preventDefault();
                  setIsMobileMenuOpen(false);
                  onOpenTerms();
                } else {
                  setIsMobileMenuOpen(false);
                }
              }}
              className="flex items-center gap-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 hover:text-blue-600 cursor-pointer border-b border-slate-100 dark:border-slate-800/80"
            >
              <FileText size={15} className="text-blue-500" />
              <span>Terms of Service</span>
            </a>

            <button
              onClick={() => { setIsMobileMenuOpen(false); onNavigateToMap(); }}
              className="mt-2 w-full py-3 rounded-full text-xs font-black uppercase tracking-wider bg-blue-600 text-white shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
            >
              <Navigation size={14} className="transform rotate-45" />
              <span>Launch Interactive Map</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Section in Clean Urban 3D Aesthetic */}
      <section className="relative px-6 lg:px-16 pt-6 sm:pt-8 pb-12 max-w-7xl mx-auto w-full flex flex-col items-center text-center z-10">
        
        {/* Main Title & Headline */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl space-y-3.5"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            RSU CAMPUS NAVIGATION PLATFORM
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-black tracking-tight text-slate-950 dark:text-white uppercase leading-[1.05]">
            Go anywhere, <br className="hidden sm:inline" />
            <span className="text-slate-500 dark:text-slate-400">
              move the way you want
            </span>
          </h1>

          <p className={cn(
            "text-xs sm:text-sm max-w-xl mx-auto leading-relaxed font-medium transition-colors",
            isDarkMode ? "text-slate-400" : "text-slate-600"
          )}>
            Locate lecture halls in minutes, hop in, and get to your destination safely and seamlessly across Rivers State University with CampusGryd.
          </p>

          {/* Primary Sleek 3D Black Pill CTA */}
          <div className="pt-1 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => onNavigateToMap()}
              className={cn(
                "px-6 py-3 rounded-full text-xs font-black uppercase tracking-widest transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer shadow-xl border flex items-center gap-2.5 group font-mono",
                isDarkMode 
                  ? "bg-white border-white text-slate-950 shadow-white/20 hover:bg-slate-100" 
                  : "bg-slate-950 border-slate-950 text-white shadow-slate-950/30 hover:bg-slate-900"
              )}
            >
              <span>Explore Campus Map</span>
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </button>

            <button
              onClick={() => onNavigateToMap(null, true)}
              className={cn(
                "px-5 py-3 rounded-full text-xs font-black uppercase tracking-widest border transition-all duration-300 hover:bg-slate-200/50 dark:hover:bg-slate-900/50 cursor-pointer flex items-center gap-2 font-mono",
                isDarkMode ? "border-slate-800 text-slate-200" : "border-slate-300 text-slate-800"
              )}
            >
              <Calendar size={14} className="text-blue-500" />
              <span>Sync Schedule</span>
            </button>

            <button
              onClick={() => onNavigateToMap(null, false, false, true)}
              className={cn(
                "px-5 py-3 rounded-full text-xs font-black uppercase tracking-widest border transition-all duration-300 hover:bg-emerald-500/10 cursor-pointer flex items-center gap-2 font-mono",
                isDarkMode ? "border-emerald-500/30 text-emerald-300 hover:border-emerald-500/50" : "border-emerald-300 text-emerald-700 bg-emerald-50/50"
              )}
            >
              <Users size={14} className="text-emerald-500" />
              <span>Campus Meetups</span>
            </button>
          </div>

          {/* HUD Search Input Box */}
          <div className="relative max-w-xl mx-auto pt-4 z-30">
            <div className={cn(
              "flex items-center p-2.5 rounded-full border shadow-lg transition-all focus-within:ring-4 backdrop-blur-md",
              isDarkMode 
                ? "bg-slate-900/90 border-slate-800 focus-within:ring-white/10" 
                : "bg-white border-slate-200 focus-within:ring-slate-950/5 shadow-slate-200/80"
            )}>
              <Search className="text-slate-400 ml-4 shrink-0" size={18} />
              <input 
                type="text"
                placeholder="Search Law Faculty, New Senate, Convocation Arena..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowResults(true);
                }}
                onFocus={() => setShowResults(true)}
                className="w-full bg-transparent px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none placeholder:text-slate-400 font-semibold"
              />
              {searchQuery && (
                <button 
                  onClick={() => { setSearchQuery(''); setShowResults(false); }}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors mr-1"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Live Search Results Popover */}
            <AnimatePresence>
              {showResults && searchQuery && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className={cn(
                    "absolute top-full left-0 right-0 mt-2 p-3 border rounded-3xl shadow-2xl z-50 text-left max-h-80 overflow-y-auto backdrop-blur-xl transition-all",
                    isDarkMode 
                      ? "bg-slate-950/98 border-slate-800 shadow-slate-950" 
                      : "bg-white/98 border-slate-200 shadow-slate-200"
                  )}
                >
                  {filteredSearch.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest px-3 my-1">MATCHING RSU LANDMARKS</p>
                      {filteredSearch.map(loc => {
                        const badgeObj = getTypeBadge(loc.type);
                        return (
                          <button
                            id={`search-res-${loc.id}`}
                            key={loc.id}
                            onClick={() => handleSearchResultClick(loc)}
                            className={cn(
                              "flex items-center justify-between w-full p-3 rounded-2xl text-left transition-all cursor-pointer border border-transparent",
                              isDarkMode ? "hover:bg-slate-900" : "hover:bg-slate-100"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-200 shrink-0">
                                <MapPin size={15} />
                              </div>
                              <div className="min-w-0">
                                <p className="font-extrabold text-xs uppercase truncate text-slate-950 dark:text-white">{loc.officialName}</p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                  {loc.landmark}
                                </p>
                              </div>
                            </div>
                            <span className={cn("px-2.5 py-1 text-[8px] rounded-full font-bold border shrink-0 uppercase tracking-wider ml-2", badgeObj.style)}>
                              {badgeObj.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 text-center">
                      <p className="text-xs text-slate-500 font-bold">No exact location found. Explore the full map canvas.</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* HERO 3D ISOMETRIC PERSPECTIVE MAP STAGE (Directly styled like the user reference image!) */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="w-full max-w-5xl mt-12 relative"
        >
          {/* Controls Bar for 3D Angle & Mode Switch */}
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-xs font-mono font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                PERSPECTIVE CAMPUS CANVAS
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIs3dTilted(!is3dTilted)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 border cursor-pointer shadow-sm",
                  is3dTilted 
                    ? "bg-slate-950 border-slate-950 text-white dark:bg-white dark:text-slate-950" 
                    : "bg-white border-slate-300 text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300"
                )}
              >
                <Eye size={12} />
                <span>{is3dTilted ? "3D Tilt View" : "2D Flat View"}</span>
              </button>

              <div className="hidden sm:flex items-center gap-1 bg-slate-200/70 dark:bg-slate-900 p-1 rounded-full border border-slate-200 dark:border-slate-800">
                {(['map', 'schedule', 'events', 'assistant', 'calculator'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setPanelMode(mode)}
                    className={cn(
                      "px-3 py-1 rounded-full text-[9px] font-mono font-bold uppercase transition-all tracking-wider cursor-pointer",
                      panelMode === mode 
                        ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950 shadow-sm" 
                        : "text-slate-600 hover:text-slate-950 dark:hover:text-white"
                    )}
                  >
                    {mode === 'map' ? 'Live Route' : mode === 'schedule' ? 'Class Sync' : mode === 'events' ? 'Events & RSVP' : mode === 'assistant' ? 'Navi-bot' : 'Estimator'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3D Perspective Map Stage Container */}
          <div className="relative w-full rounded-[2.5rem] p-4 sm:p-8 overflow-hidden bg-gradient-to-b from-[#EAECEF] to-[#E2E4E8] dark:from-slate-900 dark:to-slate-950 border border-slate-300/80 dark:border-slate-800 shadow-2xl transition-all duration-700">
            
            {/* Background 3D Perspective Grid Canvas Wrapper */}
            <div 
              className={cn(
                "w-full h-[450px] sm:h-[520px] rounded-3xl relative overflow-hidden transition-all duration-700 bg-[#E8EAEF] dark:bg-slate-950 shadow-inner border border-white/60 dark:border-slate-800/60",
                is3dTilted ? "[transform:perspective(1200px)_rotateX(28deg)_rotateZ(-4deg)] origin-center scale-[0.98]" : "transform-none"
              )}
            >
              {/* Real Leaflet Map Rendered inside 3D Perspective Wrapper */}
              {typeof window !== 'undefined' && (
                <MapContainer
                  center={[4.8015, 6.9840]}
                  zoom={15}
                  zoomControl={false}
                  className="w-full h-full z-0 opacity-90"
                  dragging={false}
                  scrollWheelZoom={false}
                  doubleClickZoom={false}
                  touchZoom={false}
                >
                  <TileLayer
                    url={isDarkMode 
                      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" 
                      : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    }
                  />
                  
                  {/* Clean 3D Style Path Line */}
                  <Polyline 
                    positions={Object.values(SIM_COORDS)}
                    color="#0F172A" 
                    weight={6}
                    opacity={0.85}
                  />

                  {Object.entries(SIM_COORDS).map(([id, coords]) => {
                    const step = SIM_ROUTE.find(s => s.markerId === id);
                    return (
                      <Marker 
                        key={id} 
                        position={coords} 
                        icon={createCustomIcon(id === 'gate' ? 'gate' : id === 'senate' ? 'admin' : 'facility', simStepIdx === SIM_ROUTE.findIndex(s => s.markerId === id))}
                      >
                        <Popup className="rsu-popup">
                          <div className="p-2">
                            <h4 className="font-bold uppercase text-xs text-slate-900">{step?.name}</h4>
                            <p className="text-[10px] text-slate-600 mt-1">{step?.instruction}</p>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}

                  {walkerIcon && <Marker position={walkerCoords} icon={walkerIcon} />}
                </MapContainer>
              )}

              {/* Decorative 3D Campus Isometric Park Elements overlaying the map */}
              <div className="absolute top-12 left-16 w-32 h-20 bg-emerald-200/50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-300/40 pointer-events-none z-10 flex items-center justify-center">
                <span className="text-[9px] font-mono font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-widest">RSU LAW GARDENS</span>
              </div>
              <div className="absolute bottom-16 right-20 w-40 h-24 bg-emerald-200/50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-300/40 pointer-events-none z-10 flex items-center justify-center">
                <span className="text-[9px] font-mono font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-widest">CONVOCATION ARENA</span>
              </div>
            </div>

            {/* FLOATING 3D GLOSSY ROUTE CARD (Exact style matching the reference image floater!) */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className={cn(
                "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30 w-[88%] max-w-md p-6 rounded-3xl shadow-2xl backdrop-blur-2xl border transition-all duration-300",
                isDarkMode 
                  ? "bg-slate-900/95 border-slate-800/80 shadow-slate-950/80 text-white" 
                  : "bg-white/95 border-slate-200/80 shadow-slate-900/15 text-slate-900"
              )}
            >
              {panelMode === 'map' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div>
                      <p className="text-[9px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">YOUR ROUTE</p>
                      <h3 className="text-base font-black uppercase tracking-tight mt-0.5 text-slate-950 dark:text-white">{SIM_ROUTE[simStepIdx].name}</h3>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400 uppercase">ARRIVING IN</p>
                      <p className="text-xl font-black font-display leading-none mt-0.5 text-slate-950 dark:text-white">{SIM_ROUTE[simStepIdx].duration}</p>
                    </div>
                  </div>

                  {/* 3D Vehicle / Walker Visual Representation */}
                  <div className="py-3 px-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-950 text-white dark:bg-white dark:text-slate-950 flex items-center justify-center shadow-md">
                        <Footprints size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase text-slate-950 dark:text-white">RSU Pedestrian Walk</p>
                        <p className="text-[10px] text-slate-600 dark:text-slate-400 font-mono mt-0.5">{SIM_ROUTE[simStepIdx].distance} • Direct Pathway</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[9px] font-black rounded-full uppercase border border-emerald-500/20">
                      ON TRACK
                    </span>
                  </div>

                  {/* Live Slider Progress Stepper (Matched -> On the way -> Arriving) */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[9px] font-mono font-bold uppercase text-slate-500 dark:text-slate-400">
                      <span className={cn(simProgress >= 0 ? "text-slate-900 dark:text-white" : "")}>Gate</span>
                      <span className={cn(simProgress >= 40 ? "text-slate-900 dark:text-white" : "")}>On the way</span>
                      <span className={cn(simProgress >= 80 ? "text-slate-900 dark:text-white" : "")}>Arriving</span>
                    </div>

                    <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
                      <motion.div 
                        className="h-full bg-slate-950 dark:bg-white rounded-full"
                        style={{ width: `${simProgress}%` }}
                      />
                    </div>
                  </div>

                  {/* Action CTA */}
                  <button
                    onClick={() => onNavigateToMap()}
                    className="w-full py-3 bg-slate-950 dark:bg-white text-white dark:text-slate-950 font-mono text-xs font-black rounded-full uppercase tracking-widest shadow-md hover:scale-[1.01] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Trace Path On Live Map</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}

              {panelMode === 'schedule' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div>
                      <p className="text-[9px] font-mono font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">COURSE SCHEDULE SYNC</p>
                      <h3 className="text-base font-black uppercase tracking-tight mt-0.5 text-slate-950 dark:text-white">ENG 301 - FLUID MECHANICS</h3>
                    </div>
                    <span className="px-2.5 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono text-[9px] font-black rounded-full uppercase">
                      11:30 AM NEXT
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-xs">
                    <p className="font-bold text-slate-900 dark:text-slate-100 uppercase">Faculty of Engineering • Workshop B</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Est. Walk Time: 4 mins from Main Gate</p>
                  </div>

                  <button
                    onClick={() => onNavigateToMap(null, true)}
                    className="w-full py-3 bg-blue-600 text-white font-mono text-xs font-black rounded-full uppercase tracking-widest shadow-md hover:bg-blue-500 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Open Timetable Manager</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}

              {panelMode === 'events' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div>
                      <p className="text-[9px] font-mono font-bold text-rose-600 dark:text-rose-400 uppercase tracking-widest">RSU CAMPUS EVENTS & RSVP</p>
                      <h3 className="text-base font-black uppercase tracking-tight mt-0.5 text-slate-950 dark:text-white">Annual Tech & Innovation Expo</h3>
                    </div>
                    <span className="px-2.5 py-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-mono text-[9px] font-black rounded-full uppercase">
                      THIS SATURDAY
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-xs space-y-1">
                    <p className="font-bold text-slate-900 dark:text-slate-100 uppercase">Convocation Arena &amp; Amphitheatre</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-1">
                      <span>10:00 AM - 4:00 PM</span>
                      <span className="text-emerald-500 font-bold">142 Students Attending</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleToggleRsvp('e1')}
                      className={cn(
                        "py-3 font-mono text-xs font-black rounded-full uppercase tracking-widest shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5",
                        rsvpdEventIds.includes('e1')
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200 hover:bg-slate-300"
                      )}
                    >
                      {rsvpdEventIds.includes('e1') ? <CheckCircle2 size={14} /> : <Ticket size={14} />}
                      <span>{rsvpdEventIds.includes('e1') ? 'RSVP Confirmed' : 'RSVP Spot'}</span>
                    </button>
                    <button
                      onClick={() => onNavigateToMap(null, false, true)}
                      className="py-3 bg-rose-600 text-white font-mono text-xs font-black rounded-full uppercase tracking-widest shadow-md hover:bg-rose-500 transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      <span>All Events</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              )}

              {panelMode === 'assistant' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div>
                      <p className="text-[9px] font-mono font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest">RSU NAVI-BOT AI GUIDE</p>
                      <h3 className="text-sm font-black uppercase tracking-tight mt-0.5 text-slate-950 dark:text-white">&ldquo;Where is clearance held?&rdquo;</h3>
                    </div>
                    <Sparkles size={18} className="text-purple-500" />
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                    Clearance for new freshers is conducted at the New Senate Building Plaza, located 530m from the Main Gate (approx. 4 min walk).
                  </p>

                  <button
                    onClick={() => onNavigateToMap()}
                    className="w-full py-3 bg-purple-600 text-white font-mono text-xs font-black rounded-full uppercase tracking-widest shadow-md hover:bg-purple-500 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Ask Navi-bot</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}

              {panelMode === 'calculator' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div>
                      <p className="text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">WALK TIME CALCULATOR</p>
                      <h3 className="text-sm font-black uppercase tracking-tight mt-0.5 text-slate-950 dark:text-white">{calcStartLoc.officialName.split(' - ')[0]} &rarr; {calcEndLoc.officialName.split(' - ')[0]}</h3>
                    </div>
                    <Footprints size={18} className="text-emerald-500" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                    <div>
                      <p className="text-[8px] font-mono font-bold text-slate-400 uppercase">WALK TIME</p>
                      <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{estimatedWalkMins} mins</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-mono font-bold text-slate-400 uppercase">DISTANCE</p>
                      <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5">{estimatedMeters}m</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-mono font-bold text-slate-400 uppercase">CALORIES</p>
                      <p className="text-sm font-black text-amber-500 mt-0.5">{estimatedCalories} kcal</p>
                    </div>
                  </div>

                  <button
                    onClick={() => onNavigateToMap(calcStartLoc)}
                    className="w-full py-3 bg-emerald-600 text-white font-mono text-xs font-black rounded-full uppercase tracking-widest shadow-md hover:bg-emerald-500 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Calculate Direct Path</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        </motion.div>

        {/* Popular Locations Pill Row */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-10">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mr-2">
            POPULAR RSU DESTINATIONS:
          </span>
          {popularLocations.map(loc => (
            <button
              key={loc.id}
              onClick={() => onNavigateToMap(loc)}
              className={cn(
                "px-4 py-2 rounded-full border text-xs font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm",
                isDarkMode 
                  ? "bg-slate-900 border-slate-800 text-slate-200 hover:border-white" 
                  : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"
              )}
            >
              {loc.officialName.split(' - ')[0]}
            </button>
          ))}
        </div>
      </section>

      {/* 6-PILLAR COMPREHENSIVE CAPABILITIES SECTION */}
      <section className={cn(
        "py-20 px-6 lg:px-16 border-t transition-colors",
        isDarkMode ? "bg-slate-900/60 border-slate-900" : "bg-white border-slate-200"
      )}>
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
              ENGINEERED FOR RSU STUDENTS &amp; FACULTY
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-black uppercase text-slate-950 dark:text-white">
              Everything you need for campus mobility &amp; life
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
              CampusGryd integrates geodetic mapping, automated class timetables, live campus events with RSVP, and Gemini AI assistance into one seamless web platform.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {/* Capability Card 1 */}
            <div className={cn(
              "p-7 rounded-3xl border transition-all duration-300 hover:shadow-xl space-y-4 relative overflow-hidden group",
              isDarkMode ? "bg-slate-950 border-slate-850 hover:border-slate-700" : "bg-[#F8FAFC] border-slate-200 hover:border-slate-300"
            )}>
              <div className="w-12 h-12 rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950 flex items-center justify-center shadow-md">
                <Navigation size={22} className="transform rotate-45" />
              </div>
              <h3 className="text-lg font-display font-black uppercase text-slate-950 dark:text-white">
                Geodetic Turn Guidance
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                Step-by-step pedestrian routes mapped across RSU lecture theaters, Senate buildings, hostels, and sports arenas with precise walk time and distance estimates.
              </p>
              <button 
                onClick={() => onNavigateToMap()}
                className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 uppercase flex items-center gap-1 hover:gap-2 transition-all cursor-pointer pt-2"
              >
                <span>Launch Turn Guidance</span>
                <ArrowRight size={13} />
              </button>
            </div>

            {/* Capability Card 2 */}
            <div className={cn(
              "p-7 rounded-3xl border transition-all duration-300 hover:shadow-xl space-y-4 relative overflow-hidden group",
              isDarkMode ? "bg-slate-950 border-slate-850 hover:border-slate-700" : "bg-[#F8FAFC] border-slate-200 hover:border-slate-300"
            )}>
              <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md">
                <Calendar size={22} />
              </div>
              <h3 className="text-lg font-display font-black uppercase text-slate-950 dark:text-white">
                Course Timetable Sync
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                Sync your weekly lecture timetable. Get direct 1-tap navigation to your specific lecture hall, lab, or workshop before your class commences.
              </p>
              <button 
                onClick={() => onNavigateToMap(null, true)}
                className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 uppercase flex items-center gap-1 hover:gap-2 transition-all cursor-pointer pt-2"
              >
                <span>Open Timetable</span>
                <ArrowRight size={13} />
              </button>
            </div>

            {/* Capability Card 3 */}
            <div className={cn(
              "p-7 rounded-3xl border transition-all duration-300 hover:shadow-xl space-y-4 relative overflow-hidden group",
              isDarkMode ? "bg-slate-950 border-slate-850 hover:border-slate-700" : "bg-[#F8FAFC] border-slate-200 hover:border-slate-300"
            )}>
              <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md">
                <Ticket size={22} />
              </div>
              <h3 className="text-lg font-display font-black uppercase text-slate-950 dark:text-white">
                Campus Events &amp; RSVP
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                Discover university symposiums, matriculation, faculty dinners, tech expos, and sports matches with instant RSVP confirmation and venue directions.
              </p>
              <a 
                href="#events-section"
                className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400 uppercase flex items-center gap-1 hover:gap-2 transition-all cursor-pointer pt-2"
              >
                <span>Explore Events &amp; RSVP</span>
                <ArrowRight size={13} />
              </a>
            </div>

            {/* Capability Card 4 */}
            <div className={cn(
              "p-7 rounded-3xl border transition-all duration-300 hover:shadow-xl space-y-4 relative overflow-hidden group",
              isDarkMode ? "bg-slate-950 border-slate-850 hover:border-slate-700" : "bg-[#F8FAFC] border-slate-200 hover:border-slate-300"
            )}>
              <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-md">
                <Sparkles size={22} />
              </div>
              <h3 className="text-lg font-display font-black uppercase text-slate-950 dark:text-white">
                Navi-bot AI Assistant
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                Ask Navi-bot conversational questions about clearance procedures, faculty office hours, exam centers, syllabus details, and pedestrian shortcuts.
              </p>
              <button 
                onClick={() => onNavigateToMap()}
                className="text-xs font-mono font-bold text-purple-600 dark:text-purple-400 uppercase flex items-center gap-1 hover:gap-2 transition-all cursor-pointer pt-2"
              >
                <span>Chat with Navi-bot</span>
                <ArrowRight size={13} />
              </button>
            </div>

            {/* Capability Card 5 */}
            <div className={cn(
              "p-7 rounded-3xl border transition-all duration-300 hover:shadow-xl space-y-4 relative overflow-hidden group",
              isDarkMode ? "bg-slate-950 border-slate-850 hover:border-slate-700" : "bg-[#F8FAFC] border-slate-200 hover:border-slate-300"
            )}>
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
                <Users size={22} />
              </div>
              <h3 className="text-lg font-display font-black uppercase text-slate-950 dark:text-white">
                Opt-In Social Meetups
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                Share a temporary live location beacon with course mates via private share codes. Disconnect anytime with zero tracking telemetry.
              </p>
              <button 
                onClick={() => onNavigateToMap(null, false, false, true)}
                className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 uppercase flex items-center gap-1 hover:gap-2 transition-all cursor-pointer pt-2"
              >
                <span>Start Meetup Share</span>
                <ArrowRight size={13} />
              </button>
            </div>

            {/* Capability Card 6 */}
            <div className={cn(
              "p-7 rounded-3xl border transition-all duration-300 hover:shadow-xl space-y-4 relative overflow-hidden group",
              isDarkMode ? "bg-slate-950 border-slate-850 hover:border-slate-700" : "bg-[#F8FAFC] border-slate-200 hover:border-slate-300"
            )}>
              <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md">
                <MapPin size={22} />
              </div>
              <h3 className="text-lg font-display font-black uppercase text-slate-950 dark:text-white">
                Community Landmark Pinning
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                Pin custom department study spots, kiosk locations, or lecture annexes. Moderated by campus admins for verified accuracy.
              </p>
              <button 
                onClick={() => onNavigateToMap()}
                className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 uppercase flex items-center gap-1 hover:gap-2 transition-all cursor-pointer pt-2"
              >
                <span>Contribute Landmark</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* NEW: UPCOMING CAMPUS EVENTS & RSVP HUB SECTION */}
      <section id="events-section" className={cn(
        "py-20 px-6 lg:px-16 border-t transition-colors",
        isDarkMode ? "bg-slate-950 border-slate-900" : "bg-slate-50 border-slate-200"
      )}>
        <div className="max-w-7xl mx-auto space-y-10">
          
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-widest bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <Ticket size={12} className="text-rose-500" />
                <span>CAMPUS ACTIVITIES &amp; SYMPOSIUMS</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-display font-black uppercase text-slate-950 dark:text-white">
                RSU Campus Events &amp; RSVP
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xl font-medium">
                Stay updated with official academic summits, cultural festivals, sports matches, and career expos. Reserve your attendance and get instant turn-by-turn walking routes to the venue.
              </p>
            </div>

            <button
              onClick={() => onNavigateToMap(null, false, true)}
              className="px-5 py-3 rounded-full text-xs font-black uppercase tracking-widest bg-rose-600 text-white hover:bg-rose-500 transition-all duration-300 shadow-lg shadow-rose-600/20 flex items-center gap-2 cursor-pointer shrink-0 self-start md:self-auto font-mono"
            >
              <span>Open Events Hub</span>
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Search and Category Filter Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            
            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-2">
              {(['all', 'academic', 'social', 'sports', 'conference'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setEventCategoryFilter(cat)}
                  className={cn(
                    "px-4 py-2 rounded-full text-xs font-mono font-bold uppercase transition-all cursor-pointer border",
                    eventCategoryFilter === cat
                      ? "bg-rose-600 border-rose-600 text-white shadow-md shadow-rose-600/20"
                      : isDarkMode 
                        ? "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850" 
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                  )}
                >
                  {cat === 'all' ? 'All Events' : cat === 'academic' ? 'Academic' : cat === 'social' ? 'Social' : cat === 'sports' ? 'Sports' : 'Conferences'}
                </button>
              ))}
            </div>

            {/* Event Search Input */}
            <div className="relative max-w-md w-full">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search events by title, venue, or speaker..."
                value={eventSearchQuery}
                onChange={(e) => setEventSearchQuery(e.target.value)}
                className={cn(
                  "w-full pl-10 pr-9 py-2.5 rounded-full text-xs font-medium border focus:outline-none transition-all",
                  isDarkMode 
                    ? "bg-slate-900 border-slate-800 text-white placeholder:text-slate-500 focus:border-rose-500" 
                    : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-rose-500 shadow-sm"
                )}
              />
              {eventSearchQuery && (
                <button
                  onClick={() => setEventSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Events Grid */}
          {(() => {
            const filteredEvents = campusEvents.filter(ev => {
              const locName = locations.find(l => l.id === ev.locationId)?.officialName || '';
              const matchesSearch = !eventSearchQuery.trim() ||
                ev.title.toLowerCase().includes(eventSearchQuery.toLowerCase()) ||
                ev.description.toLowerCase().includes(eventSearchQuery.toLowerCase()) ||
                locName.toLowerCase().includes(eventSearchQuery.toLowerCase()) ||
                ev.organizer.toLowerCase().includes(eventSearchQuery.toLowerCase());
              const matchesCat = eventCategoryFilter === 'all' || ev.category === eventCategoryFilter;
              return matchesSearch && matchesCat;
            });

            if (filteredEvents.length === 0) {
              return (
                <div className={cn(
                  "p-12 text-center rounded-3xl border space-y-3",
                  isDarkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"
                )}>
                  <Ticket size={32} className="mx-auto text-slate-400 opacity-60" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">No campus events match your filter</h3>
                  <p className="text-xs text-slate-500">Try clearing the search query or switching categories.</p>
                  <button
                    onClick={() => { setEventSearchQuery(''); setEventCategoryFilter('all'); }}
                    className="px-4 py-2 bg-slate-200 dark:bg-slate-800 rounded-full text-xs font-bold uppercase tracking-wider cursor-pointer hover:opacity-80"
                  >
                    Reset Filters
                  </button>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredEvents.map(event => {
                  const isRsvpd = rsvpdEventIds.includes(event.id);
                  const matchedLoc = locations.find(l => l.id === event.locationId);
                  const venueName = matchedLoc ? matchedLoc.officialName : 'Campus Venue';

                  const categoryStyles: Record<string, string> = {
                    academic: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
                    social: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
                    sports: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                    conference: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                  };

                  return (
                    <div
                      key={event.id}
                      className={cn(
                        "p-6 rounded-3xl border transition-all duration-300 hover:shadow-xl flex flex-col justify-between space-y-4 group",
                        isDarkMode ? "bg-slate-900/90 border-slate-800 hover:border-slate-700" : "bg-white border-slate-200 hover:border-slate-300"
                      )}
                    >
                      <div className="space-y-3">
                        {/* Badges row */}
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn(
                            "px-2.5 py-1 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider border",
                            categoryStyles[event.category] || "bg-slate-500/10 text-slate-600 border-slate-500/20"
                          )}>
                            {event.category}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <Clock size={11} />
                            <span>{event.startTime} - {event.endTime}</span>
                          </span>
                        </div>

                        {/* Title */}
                        <h3 className="text-base font-display font-black uppercase text-slate-950 dark:text-white leading-snug group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                          {event.title}
                        </h3>

                        {/* Description */}
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
                          {event.description}
                        </p>

                        {/* Venue and Organizer */}
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-bold">
                            <MapPin size={13} className="text-rose-500 shrink-0" />
                            <span className="truncate">{venueName}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                            <span>By: {event.organizer}</span>
                            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{event.date}</span>
                          </div>
                        </div>
                      </div>

                      {/* Interactive Buttons */}
                      <div className="pt-2 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleToggleRsvp(event.id)}
                          className={cn(
                            "py-2.5 px-3 rounded-full text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm",
                            isRsvpd
                              ? "bg-emerald-600 text-white hover:bg-emerald-700"
                              : isDarkMode
                                ? "bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700"
                                : "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200"
                          )}
                        >
                          {isRsvpd ? (
                            <>
                              <CheckCircle2 size={13} />
                              <span>Attending</span>
                            </>
                          ) : (
                            <>
                              <Ticket size={13} className="text-rose-500" />
                              <span>RSVP Spot</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => onNavigateToMap(matchedLoc || null)}
                          className="py-2.5 px-3 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-slate-950 text-white dark:bg-white dark:text-slate-950 hover:bg-rose-600 dark:hover:bg-rose-600 dark:hover:text-white transition-all flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                          title="Calculate walking path to event venue"
                        >
                          <span>Venue Route</span>
                          <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </section>

      {/* NEW: COMPREHENSIVE ABOUT CAMPUSGRYD SECTION */}
      <section id="about-section" className={cn(
        "py-24 px-6 lg:px-16 border-t transition-colors relative overflow-hidden",
        isDarkMode ? "bg-slate-900/40 border-slate-900" : "bg-white border-slate-200"
      )}>
        <div className="max-w-7xl mx-auto space-y-16">
          
          {/* Main About Banner */}
          <div className="max-w-3xl mx-auto text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-widest bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              <GraduationCap size={14} />
              <span>ABOUT THE CAMPUSGRYD PLATFORM</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-black uppercase text-slate-950 dark:text-white tracking-tight">
              Empowering 30,000+ Students with Spatial Intelligence
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl mx-auto font-medium">
              CampusGryd is the dedicated geodetic navigation, course scheduling, and campus event ecosystem built specifically for Rivers State University (RSU), Port Harcourt.
            </p>
          </div>

          {/* 4 Core Pillars of CampusGryd */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Pillar 1 */}
            <div className={cn(
              "p-8 rounded-3xl border transition-all duration-300 space-y-4",
              isDarkMode ? "bg-slate-950 border-slate-850" : "bg-slate-50 border-slate-200"
            )}>
              <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/20">
                <Route size={22} />
              </div>
              <h3 className="text-xl font-display font-black uppercase text-slate-950 dark:text-white">
                1. Vector Pedestrian Navigation &amp; Routing
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                Traditional street mapping platforms fail within university campuses because they lack interior footpaths, lecture room alleys, and faculty gates. CampusGryd maps every pedestrian route across all faculties, halls, the Senate Complex, and hostels with sub-meter coordinate precision.
              </p>
              <ul className="space-y-2 pt-2 text-xs font-mono text-slate-700 dark:text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span>Real-time GPS user position lock and compass orientation</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span>Dynamic walking time, distance, and calorie expenditure</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span>Step-by-step turn guidance instructions</span>
                </li>
              </ul>
            </div>

            {/* Pillar 2 */}
            <div className={cn(
              "p-8 rounded-3xl border transition-all duration-300 space-y-4",
              isDarkMode ? "bg-slate-950 border-slate-850" : "bg-slate-50 border-slate-200"
            )}>
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20">
                <BookOpen size={22} />
              </div>
              <h3 className="text-xl font-display font-black uppercase text-slate-950 dark:text-white">
                2. Academic Timetable &amp; Lecture Venue Sync
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                Say goodbye to missed lectures and confusing venue codes like &ldquo;ETF Hall B&rdquo; or &ldquo;Faculty Workshop 3&rdquo;. CampusGryd links your department courses to physical buildings, enabling instant 1-tap route tracing straight to your seat before class commences.
              </p>
              <ul className="space-y-2 pt-2 text-xs font-mono text-slate-700 dark:text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span>GST, Departmental, and Faculty course schedule organizer</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span>Next-class notification alerts with remaining walking time</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span>Export class schedule directly to Google Calendar</span>
                </li>
              </ul>
            </div>

            {/* Pillar 3 */}
            <div className={cn(
              "p-8 rounded-3xl border transition-all duration-300 space-y-4",
              isDarkMode ? "bg-slate-950 border-slate-850" : "bg-slate-50 border-slate-200"
            )}>
              <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-lg shadow-rose-600/20">
                <Ticket size={22} />
              </div>
              <h3 className="text-xl font-display font-black uppercase text-slate-950 dark:text-white">
                3. Campus Events Hub &amp; Interactive RSVP
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                Stay tapped into university life. CampusGryd provides a centralized directory for all student union events, departmental dinners, matriculation rites, faculty summits, and sports rivalries with attendance RSVP tracking.
              </p>
              <ul className="space-y-2 pt-2 text-xs font-mono text-slate-700 dark:text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span>Live search, filter by category (Academic, Social, Sports)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span>Instant 1-click RSVP with Cloud sync to student profile</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span>Admin event publishing and verified moderator controls</span>
                </li>
              </ul>
            </div>

            {/* Pillar 4 */}
            <div className={cn(
              "p-8 rounded-3xl border transition-all duration-300 space-y-4",
              isDarkMode ? "bg-slate-950 border-slate-850" : "bg-slate-50 border-slate-200"
            )}>
              <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-600/20">
                <Sparkles size={22} />
              </div>
              <h3 className="text-xl font-display font-black uppercase text-slate-950 dark:text-white">
                4. Navi-bot AI Campus Helpdesk &amp; Guide
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                Integrated conversational intelligence grounded in Rivers State University context. Freshers can ask about clearance steps, faculty fees, hostel check-in rules, departmental offices, or optimal pathways across campus.
              </p>
              <ul className="space-y-2 pt-2 text-xs font-mono text-slate-700 dark:text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span>Grounded answers on RSU administrative procedures</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span>Direct links from AI suggestions to map markers</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span>Natural language query support in simple conversational tone</span>
                </li>
              </ul>
            </div>

            {/* Pillar 5 */}
            <div className={cn(
              "p-8 rounded-3xl border transition-all duration-300 space-y-4 md:col-span-2",
              isDarkMode ? "bg-slate-950 border-slate-850" : "bg-slate-50 border-slate-200"
            )}>
              <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-lg shadow-teal-600/20">
                <Users size={22} />
              </div>
              <h3 className="text-xl font-display font-black uppercase text-slate-950 dark:text-white">
                5. Zero-Telemetry Ephemeral Live Meetups &amp; Friend Beacons
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                Coordinate group project meetings, faculty study sessions, and campus hangouts effortlessly. Share a temporary beacon code with specific course mates that automatically self-destructs after your chosen duration (15m, 30m, 1h, 2h).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs font-mono text-slate-700 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span>Time-limited ephemeral beacon codes</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span>Zero background tracking or telemetry</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span>Instant 1-tap walking directions to friend</span>
                </div>
              </div>
            </div>
          </div>

          {/* User Archetypes Grid (Who is CampusGryd for?) */}
          <div className="space-y-8">
            <div className="text-center space-y-2">
              <span className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest">
                TAILORED CAMPUS EXPERIENCES
              </span>
              <h3 className="text-2xl sm:text-3xl font-display font-black uppercase text-slate-950 dark:text-white">
                Who Benefits from CampusGryd?
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className={cn(
                "p-6 rounded-3xl border space-y-3",
                isDarkMode ? "bg-slate-950/80 border-slate-850" : "bg-white border-slate-200"
              )}>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <School size={20} />
                </div>
                <h4 className="font-display font-black uppercase text-sm text-slate-950 dark:text-white">Freshers &amp; New Intakes</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Easily find Senate clearance centers, ICT centers, medical clinics, and bank branches without stress.
                </p>
              </div>

              <div className={cn(
                "p-6 rounded-3xl border space-y-3",
                isDarkMode ? "bg-slate-950/80 border-slate-850" : "bg-white border-slate-200"
              )}>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <Users size={20} />
                </div>
                <h4 className="font-display font-black uppercase text-sm text-slate-950 dark:text-white">Undergraduates</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Navigate shifting lecture halls, sync course timetables, discover campus tech events, and RSVP with friends.
                </p>
              </div>

              <div className={cn(
                "p-6 rounded-3xl border space-y-3",
                isDarkMode ? "bg-slate-950/80 border-slate-850" : "bg-white border-slate-200"
              )}>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                  <Building2 size={20} />
                </div>
                <h4 className="font-display font-black uppercase text-sm text-slate-950 dark:text-white">Faculty &amp; Staff</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Coordinate departmental meetings, find administrative offices, and publish verified academic conferences.
                </p>
              </div>

              <div className={cn(
                "p-6 rounded-3xl border space-y-3",
                isDarkMode ? "bg-slate-950/80 border-slate-850" : "bg-white border-slate-200"
              )}>
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                  <Award size={20} />
                </div>
                <h4 className="font-display font-black uppercase text-sm text-slate-950 dark:text-white">Visitors &amp; Guests</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Effortless parking and entrance navigation during matriculation, convocation ceremonies, and sports fixtures.
                </p>
              </div>
            </div>
          </div>

          {/* Key Metrics / Platform Standards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 text-center">
            <div className={cn(
              "p-6 rounded-2xl border",
              isDarkMode ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
            )}>
              <p className="text-3xl sm:text-4xl font-display font-black text-blue-600 dark:text-blue-400">50+</p>
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 mt-1">Geocoded Landmarks</p>
            </div>
            <div className={cn(
              "p-6 rounded-2xl border",
              isDarkMode ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
            )}>
              <p className="text-3xl sm:text-4xl font-display font-black text-emerald-600 dark:text-emerald-400">7+</p>
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 mt-1">Major Faculties</p>
            </div>
            <div className={cn(
              "p-6 rounded-2xl border",
              isDarkMode ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
            )}>
              <p className="text-3xl sm:text-4xl font-display font-black text-rose-600 dark:text-rose-400">100%</p>
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 mt-1">Pedestrian Path Coverage</p>
            </div>
            <div className={cn(
              "p-6 rounded-2xl border",
              isDarkMode ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
            )}>
              <p className="text-3xl sm:text-4xl font-display font-black text-purple-600 dark:text-purple-400">0</p>
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 mt-1">Telemetry / Tracking</p>
            </div>
          </div>
        </div>
      </section>

      {/* LANDMARK REGISTRY EXPLORER SECTION */}
      <section id="landmarks-section" className="py-20 px-6 lg:px-16 max-w-7xl mx-auto w-full space-y-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
              CAMPUS NODES & FACULTIES
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-black uppercase text-slate-950 dark:text-white">
              Explore RSU Landmarks
            </h2>
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap gap-2">
            {(['all', 'faculty', 'admin', 'facility', 'gate'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2 rounded-full text-xs font-mono font-bold uppercase transition-all cursor-pointer border",
                  activeTab === tab
                    ? "bg-slate-950 border-slate-950 text-white dark:bg-white dark:border-white dark:text-slate-950 shadow-md"
                    : "bg-white border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 hover:bg-slate-50"
                )}
              >
                {tab === 'all' ? 'All Locations' : tab === 'faculty' ? 'Faculties' : tab === 'admin' ? 'Senate / Admin' : tab === 'facility' ? 'Facilities' : 'Entrances'}
              </button>
            ))}
          </div>
        </div>

        {/* Landmarks Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categoryFilteredLocations.map(loc => {
            const badgeObj = getTypeBadge(loc.type);
            return (
              <div 
                key={loc.id}
                onClick={() => onNavigateToMap(loc)}
                className={cn(
                  "p-6 rounded-3xl border transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer flex flex-col justify-between group",
                  isDarkMode ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
                )}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={cn("px-3 py-1 rounded-full text-[9px] font-mono font-black uppercase tracking-wider border", badgeObj.style)}>
                      {badgeObj.label}
                    </span>
                    <MapPin size={16} className="text-slate-400 group-hover:text-blue-600 transition-colors" />
                  </div>

                  <div>
                    <h3 className="text-lg font-display font-black uppercase text-slate-950 dark:text-white group-hover:text-blue-600 transition-colors leading-tight">
                      {loc.officialName}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                      {loc.landmark}
                    </p>
                  </div>
                </div>

                <div className="pt-6 mt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-mono font-bold uppercase text-slate-900 dark:text-white">
                  <span>Trace Path &rarr;</span>
                  <span className="text-[10px] text-slate-400">{loc.coordinates[0].toFixed(3)}, {loc.coordinates[1].toFixed(3)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* WALK TIME ESTIMATOR SECTION */}
      <section id="walk-estimator-section" className={cn(
        "py-20 px-6 lg:px-16 border-t transition-colors",
        isDarkMode ? "bg-slate-900/40 border-slate-900" : "bg-[#F8FAFC] border-slate-200"
      )}>
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
              PEDESTRIAN DISTANCE CALCULATOR
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-black uppercase text-slate-950 dark:text-white">
              Instant Walk Time Estimator
            </h2>
          </div>

          <div className={cn(
            "p-8 rounded-[2rem] border shadow-xl space-y-6",
            isDarkMode ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"
          )}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-mono font-bold text-slate-500 uppercase">Starting Point:</label>
                <select 
                  value={calcStartId}
                  onChange={(e) => setCalcStartId(e.target.value)}
                  className="w-full mt-2 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-white focus:outline-none"
                >
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>{l.officialName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-mono font-bold text-slate-500 uppercase">Destination:</label>
                <select 
                  value={calcEndId}
                  onChange={(e) => setCalcEndId(e.target.value)}
                  className="w-full mt-2 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-white focus:outline-none"
                >
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>{l.officialName}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center p-6 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800">
              <div>
                <p className="text-[10px] font-mono font-bold text-slate-400 uppercase">WALKING TIME</p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{estimatedWalkMins} Mins</p>
              </div>
              <div>
                <p className="text-[10px] font-mono font-bold text-slate-400 uppercase">DISTANCE</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{estimatedMeters} Metres</p>
              </div>
              <div>
                <p className="text-[10px] font-mono font-bold text-slate-400 uppercase">EST. ENERGY</p>
                <p className="text-2xl font-black text-amber-500 mt-1">{estimatedCalories} kcal</p>
              </div>
            </div>

            <button
              onClick={() => onNavigateToMap(calcStartLoc)}
              className="w-full py-4 bg-slate-950 dark:bg-white text-white dark:text-slate-950 font-mono text-xs font-black rounded-full uppercase tracking-widest shadow-lg hover:scale-[1.01] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>View Interactive Route On Map</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>

      {/* FREQUENTLY ASKED QUESTIONS SECTION */}
      <section id="faq-section" className="py-20 px-6 lg:px-16 max-w-4xl mx-auto w-full space-y-10">
        <div className="text-center space-y-2">
          <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
            STUDENT ASSISTANCE
          </span>
          <h2 className="text-3xl sm:text-4xl font-display font-black uppercase text-slate-950 dark:text-white">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, idx) => (
            <div 
              key={idx}
              className={cn(
                "rounded-2xl border transition-all overflow-hidden",
                isDarkMode ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
              )}
            >
              <button
                onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                className="w-full p-6 text-left flex items-center justify-between gap-4 font-display font-black text-sm sm:text-base uppercase text-slate-950 dark:text-white cursor-pointer"
              >
                <span>{faq.q}</span>
                <ChevronRight size={18} className={cn("transition-transform duration-300 shrink-0 text-slate-400", expandedFaq === idx ? "transform rotate-90" : "")} />
              </button>
              {expandedFaq === idx && (
                <div className="px-6 pb-6 text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium border-t border-slate-100 dark:border-slate-800/80 pt-4">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className={cn(
        "py-12 px-6 lg:px-16 border-t mt-auto text-xs font-mono transition-colors",
        isDarkMode ? "bg-slate-950 border-slate-900 text-slate-400" : "bg-white border-slate-200 text-slate-500"
      )}>
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-slate-200/80 dark:border-slate-850">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-950 text-white dark:bg-white dark:text-slate-950 flex items-center justify-center font-black text-sm shadow-sm">
                G
              </div>
              <div>
                <span className="font-bold text-sm uppercase tracking-wider text-slate-950 dark:text-white block">
                  CampusGryd RSU
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Rivers State University, Port Harcourt
                </span>
              </div>
            </div>

            {/* Google API Limited Use / Compliance Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] text-slate-600 dark:text-slate-300">
              <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
              <span>Google API Services User Data Policy & Limited Use Compliant</span>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1 text-center md:text-left">
              <p className="text-[10px] uppercase text-slate-400">
                © {new Date().getFullYear()} CampusGryd. All rights reserved.
              </p>
              <p className="text-[9px] text-slate-400 dark:text-slate-500">
                Built for students, faculty, and campus visitors. No tracking cookies or persistent personal telemetry.
              </p>
            </div>

            {/* Footer Navigation & Legal Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 font-bold uppercase text-[11px] text-slate-500 dark:text-slate-400">
              <button 
                onClick={() => onNavigateToMap()} 
                className="hover:text-blue-600 dark:hover:text-white transition-colors cursor-pointer"
              >
                Map View
              </button>
              <a 
                href="#about-section" 
                className="hover:text-blue-600 dark:hover:text-white transition-colors cursor-pointer"
              >
                About Platform
              </a>
              <button 
                onClick={() => onNavigateToMap(null, true)} 
                className="hover:text-blue-600 dark:hover:text-white transition-colors cursor-pointer"
              >
                Class Schedule
              </button>
              <a 
                href="#events-section" 
                className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
              >
                Events &amp; RSVP
              </a>

              <a 
                href="/privacy.html"
                onClick={(e) => {
                  if (onOpenPrivacy) {
                    e.preventDefault();
                    onOpenPrivacy();
                  }
                }}
                className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer"
                title="View Privacy Policy and Google User Data Handling"
              >
                <Shield size={13} className="text-emerald-500" />
                <span>Privacy Policy</span>
              </a>

              <a 
                href="/terms.html"
                onClick={(e) => {
                  if (onOpenTerms) {
                    e.preventDefault();
                    onOpenTerms();
                  }
                }}
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer"
                title="View Terms of Service and Institutional Legal Guidelines"
              >
                <FileText size={13} className="text-blue-500" />
                <span>Terms of Service</span>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
