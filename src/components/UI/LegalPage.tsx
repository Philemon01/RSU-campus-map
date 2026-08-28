import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Search, ChevronDown, ChevronUp, FileText, 
  Shield, Landmark, Scale, Info, EyeOff, Check, AlertCircle 
} from 'lucide-react';

interface LegalPageProps {
  initialTab?: 'terms' | 'privacy';
  onBack: () => void;
}

// Structured document data to allow easy indexing & searching
interface DocSection {
  id: string;
  num?: string;
  title: string;
  content: string[];
  bullets?: { bold: string; normal: string }[];
  infoBox?: { type: 'attention' | 'info'; title: string; text: string };
}

const TERMS_SECTIONS: DocSection[] = [
  {
    id: 'intro',
    title: 'Introduction',
    content: [
      'Welcome to the Rivers State University (RSU) Campus Map & Timetable System (referred to as "the System," "the Application," or "the Service"). By accessing, installing, or interacting with this digital mapping, schedule, and synchronization utility, you agree to comply with and be bound by the following Terms of Service ("Terms"). If you do not agree to these terms, please do not use the application.'
    ],
    infoBox: {
      type: 'attention',
      title: 'Important Service Integration Note',
      text: 'While basic campus layout navigation and spatial mapping remain accessible anonymously, accessing personalized institutional lecture timetables and using the automated Google Calendar synchronization feature requires users to securely authenticate via their personal Gmail accounts.'
    }
  },
  {
    id: 'scope',
    num: '1',
    title: 'Scope of Service',
    content: [
      'The Application provides users with an interactive spatial map of the Rivers State University campus layout, utilizing customized geolocations, official building footprints, and localized student landmarks/aliases (e.g., "Back of Senate"). Additionally, the System includes an advanced scheduling module that aggregates lecture timetable workflows and allows authenticated users to synchronize these schedules directly into their personal Google Calendars.'
    ]
  },
  {
    id: 'auth',
    num: '2',
    title: 'Authentication and Account Integration',
    content: [
      'To access the timetable features and activate calendar export synchronization, you must sign in securely using a valid Google (Gmail) account via standard secure OAuth channels.'
    ],
    bullets: [
      {
        bold: 'Credential Security:',
        normal: 'The Application integrates directly with Google OAuth services. We do not view, harvest, or store your Google account password. Authentication is securely managed by Google.'
      },
      {
        bold: 'Authorized Access:',
        normal: 'You are responsible for maintaining the confidentiality of your active device sessions and Google credentials. You agree that you are solely responsible for all actions or calendar sync updates initiated through your account session.'
      },
      {
        bold: 'Data Purpose:',
        normal: 'Your Gmail identity is verified solely to provide authorization to sync your respective faculty or departmental lectures into your Google Calendar. This process operates without persistent user profiling or unauthorized data sharing.'
      }
    ]
  },
  {
    id: 'use',
    num: '3',
    title: 'Permitted Use & Structural Limitations',
    content: [
      'Users are granted a non-exclusive, non-transferable, revocable license to utilize the system for personal academic preparation, navigation assistance, and schedule planning. You explicitly agree not to:'
    ],
    bullets: [
      {
        bold: 'Automated Scraping Prohibition:',
        normal: 'Use automated scripts, bots, or scraping tools to harvest database assets, map coordinates, or compiled department schedules.'
      },
      {
        bold: 'Infrastructure Protection:',
        normal: 'Interfere with, manipulate, or degrade the performance of the synchronization gateways linking the Application to Google Calendar infrastructures.'
      },
      {
        bold: 'API Exploitation:',
        normal: 'Exploit or modify the backend API pathways used to serve map layers, localized landmarks, or dynamic timetable datasets.'
      }
    ]
  },
  {
    id: 'dev-team',
    num: '4',
    title: 'Data Accuracy, Sync Deficiencies & Disclaimer',
    content: [
      'We make every reasonable effort to keep campus landmark markers, route paths, and official lecture timetables accurate according to the latest administrative updates at Rivers State University. However, please note the following limitations:'
    ],
    bullets: [
      {
        bold: 'As-Is Framework:',
        normal: 'The maps, spatial layouts, dynamic timetables, and synchronization utilities are provided "as is" and "as available."'
      },
      {
        bold: 'Calendar Discrepancies:',
        normal: 'Lecture venues, class timelines, or invigilation dates can shift rapidly due to campus operational changes. The System is an informational assistance tool; official departmental and faculty notice boards remain the ultimate authority for academic requirements.'
      },
      {
        bold: 'Limitation of Liability:',
        normal: 'The development team and associated campus contributors shall not be held liable for any missed lectures, calendar scheduling conflicts, sync delays, or mapping discrepancies that result in personal or academic inconveniences.'
      }
    ]
  },
  {
    id: 'infra',
    num: '5',
    title: 'Technical Infrastructure & Connectivity Costs',
    content: [
      'To parse updated master timetable schemas, load localized spatial maps, and broadcast events to your personal Google Calendar, your device requires an active connection to the internet. You acknowledge that all data expenses, cellular provider billing, or network data usage charges incurred while using this system are entirely your responsibility.'
    ]
  },
  {
    id: 'revisions',
    num: '6',
    title: 'Revisions to the Terms',
    content: [
      'The operational framework of the system may iterate over time as new features are added or calendar sync functionalities expand. When updates occur, the revised Terms will be posted within this interface along with an updated "Last Updated" date. Your continued interaction with the application constitutes formal acceptance of the modified terms.'
    ]
  },
  {
    id: 'law',
    num: '7',
    title: 'Governing Law',
    content: [
      'These terms and any administrative issues arising from the usage of this digital campus utility shall be interpreted under the rules and regulations governing student conduct at Rivers State University and the legal frameworks of the Federal Republic of Nigeria.'
    ]
  }
];

const PRIVACY_SECTIONS: DocSection[] = [
  {
    id: 'intro',
    title: 'Scope Policy Introduction',
    content: [
      'This Privacy Policy describes how the Rivers State University (RSU) Campus Map & Timetable System (referred to as "the System," "the Application," "CampusGryd," "we," "us," or "our") handles user data. We are fully committed to protecting your privacy and providing a secure, transparent utility for navigating the Rivers State University campus and accessing lecture schedules.'
    ],
    infoBox: {
      type: 'info',
      title: 'Core Privacy Guarantee',
      text: 'The RSU Campus Map & Timetable System is built on a "Privacy by Design" architecture. We do not collect, capture, process, upload, or store any personal data or persistent identifiers from our users on external servers. Your usage of the application is completely secure and transparent.'
    }
  },
  {
    id: 'no-collect',
    num: '1',
    title: 'Information We Do Not Collect',
    content: [
      'Unlike services that track user profiles, this System explicitly operates without requesting or processing unnecessary personal data. We do not collect:'
    ],
    bullets: [
      {
        bold: 'Personal Identifiers:',
        normal: 'We do not collect personal names, phone numbers, student registration numbers, department information, or faculty details for tracking.'
      },
      {
        bold: 'Account Passwords:',
        normal: 'There is no password creation required. Google authentication is handled directly through secure Google OAuth 2.0 servers.'
      },
      {
        bold: 'Persistent Device Tracking:',
        normal: 'We do not harvest unique hardware identifiers such as IMEI numbers, MAC addresses, Android IDs, or Advertising IDs.'
      },
      {
        bold: 'Server-Side Search History:',
        normal: 'Your search queries (e.g., search strings for localized landmarks or student aliases like "Back of Senate") and timetable lookups are processed strictly on your device. They are never tied to an individual or stored in an external persistent database.'
      }
    ]
  },
  {
    id: 'location',
    num: '2',
    title: 'Real-Time Location Data Handling',
    content: [
      'To provide real-time campus navigation, route visualization, and localized landmark orientation, the Application utilizes your device’s Global Positioning System (GPS) or location services.'
    ],
    bullets: [
      {
        bold: 'On-Device Processing:',
        normal: 'Your precise geographic coordinates are processed locally on your device to display your position relative to the campus map.'
      },
      {
        bold: 'No Location Logging:',
        normal: 'This location data is utilized strictly in real-time. We do not transmit, log, cache, or store your historical coordinates or movement paths on any external server. Once you close the application, all real-time positioning information is immediately flushed from active memory.'
      }
    ]
  },
  {
    id: 'google-user-data',
    num: '3',
    title: 'Google User Data Handling & OAuth Integration',
    content: [
      'When you use the automated lecture timetable synchronization feature, CampusGryd interacts with Google APIs (Google OAuth 2.0 and Google Calendar API) upon your explicit request.'
    ],
    bullets: [
      {
        bold: 'Sharing, Transfer, and Disclosure of Google User Data:',
        normal: 'CampusGryd does NOT share, transfer, disclose, or sell Google user data—including email addresses, profile details, or Google Calendar event data—to any third parties, external databases, marketing entities, advertising partners, AI model trainers, or data brokers. All Google user data accessed via Google APIs is processed exclusively on your client device to create and synchronize RSU lecture timetable events directly into your personal Google Calendar.'
      },
      {
        bold: 'Google User Data Retention:',
        normal: 'We do not store or retain Google user data on any persistent server or external database. OAuth authentication tokens and calendar sync metadata are stored exclusively in your browser\'s local storage on your device for as long as you maintain an active session. Upon signing out or un-syncing your calendar, authentication tokens are immediately purged and discarded from local storage.'
      },
      {
        bold: 'Data Deletion & Access Revocation Procedures:',
        normal: 'Users have full control over their data and can delete or remove all Google user data and access permissions at any time through the following procedures:\n' +
          '1. In-App Disconnect: Click "Unsync Calendar" or "Sign Out" in the application\'s Timetable Sync settings to instantly delete all cached sync tokens and session data from your device.\n' +
          '2. Clear Local Storage: Clear your web browser\'s cache and local storage to erase any stored session data.\n' +
          '3. Google Account Revocation: Revoke CampusGryd\'s access to your Google account at any time via your Google Account Security Settings at https://myaccount.google.com/permissions.\n' +
          '4. Deletion Support Request: Contact our support team directly via email at progressphilemon@gmail.com for assistance or confirmation of data removal.'
      }
    ]
  },
  {
    id: 'limited-use',
    num: '4',
    title: 'Google API Limited Use Compliance Statement',
    content: [
      'CampusGryd strictly adheres to Google\'s API Services User Data Policy regarding data accessed through Google APIs.',
      'Limited Use Disclosure: CampusGryd\'s use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy (https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.'
    ],
    infoBox: {
      type: 'info',
      title: 'Google API Limited Use Compliance',
      text: 'CampusGryd\'s use and transfer to any other app of information received from Google APIs will adhere to Google API Services User Data Policy, including the Limited Use requirements.'
    }
  },
  {
    id: 'ai-integrations',
    num: '5',
    title: 'AI & Third-Party Processing Declaration (Data Isolation & Zero Retention)',
    content: [
      'CampusGryd incorporates artificial intelligence tools strictly for optical character recognition (OCR) of university timetable documents and conversational campus navigation assistance.'
    ],
    bullets: [
      {
        bold: 'AI Provider & Model:',
        normal: 'Google Gemini API (Google Cloud Vertex AI / Google AI Studio - Gemini 2.5/3.5 Flash).'
      },
      {
        bold: 'Purpose of AI Processing:',
        normal: '(1) Parsing user-uploaded departmental timetable image files into course schedule entries. (2) Answering conversational inquiries regarding RSU campus buildings, clearance desks, and lecture halls.'
      },
      {
        bold: 'Complete Data Isolation:',
        normal: 'AI processing pipelines operate in strict isolation from Google User Data. Google OAuth access tokens, user email addresses, Google profile identifiers, and personal Google Calendar items are NEVER passed to, shared with, or accessible by the AI service.'
      },
      {
        bold: 'Zero Retention & No Model Training:',
        normal: 'All AI inference requests are transient and stateless. Inputs (such as timetable images or text queries) are processed on-the-fly with zero persistent data retention and are never stored or used by third-party AI models for machine learning or foundation model training.'
      }
    ]
  },
  {
    id: 'third-party',
    num: '6',
    title: 'Maps and Third-Party API Integration',
    content: [
      'The Application utilizes robust third-party mapping frameworks (such as Mapbox or standard open-source geospatial tools) to render the base map tiles of the Rivers State University campus.'
    ],
    bullets: [
      {
        bold: 'Direct Map Asset Serving:',
        normal: 'When rendering map layers, your device communicates directly with these mapping infrastructure providers to load standard map assets.'
      },
      {
        bold: 'Technical Parameters:',
        normal: 'Any technical data automatically transmitted to these providers (such as IP addresses required to fetch web resources) is governed independently by their respective, enterprise-grade privacy policies. No identifying personal student records are ever attached to these structural requests.'
      }
    ]
  },
  {
    id: 'storage',
    num: '7',
    title: 'Data Storage and Local Caching',
    content: [
      'To optimize performance, reduce internet data consumption, and ensure fast response times when searching for local student aliases, landmarks, and faculties, certain static application assets—such as university timetable layouts and localized campus landmarks—are cached directly on your device’s local storage.'
    ],
    bullets: [
      {
        bold: 'Public Caching:',
        normal: 'This data consists strictly of static public information (schedules and geographic landmarks) and contains no user-specific metrics.'
      },
      {
        bold: 'User Control:',
        normal: 'You can easily clear this localized application cache at any time through your browser or operating system\'s application settings.'
      }
    ]
  },
  {
    id: 'security',
    num: '8',
    title: 'Security',
    content: [
      'Because our System does not manage or host personal user files or database repositories on external servers, the risk of traditional personal data breaches or credential leaks is minimized. We protect the integrity of the application platform by utilizing secure transmission protocols (such as HTTPS) for fetching updated university schedules, public landmark coordinates, and communicating with Google APIs.'
    ]
  },
  {
    id: 'revisions',
    num: '9',
    title: 'Changes to This Privacy Policy',
    content: [
      'We may periodically update this Privacy Policy to reflect changes in the application’s functionality or relevant institutional frameworks. Any updates will be accompanied by a revised "Effective Date" at the top of this document. Since the system does not store your contact information, we encourage you to review this page within the application settings dynamically to stay informed of our data-handling practices.'
    ]
  },
  {
    id: 'contact',
    num: '10',
    title: 'Contact and Data Deletion Support',
    content: [
      'If you have any questions, feedback, or technical inquiries regarding this Privacy Policy, your Google user data, or wish to request data deletion assistance, please contact the development team at progressphilemon@gmail.com or through the designated developer channel in the application interface.'
    ]
  }
];

// Highlight helper component to render search matches and allow quick jumping
const HighlightText: React.FC<{
  text: string;
  searchQuery: string;
  sectionId: string;
  type: 'terms' | 'privacy';
  currentIndex: number;
  onMatchFound: (sectionId: string, charIndex: number, textSnippet: string) => void;
  matchesRef: React.MutableRefObject<Array<{ id: string; query: string; tab: 'terms' | 'privacy' }>>;
}> = ({ text, searchQuery, sectionId, type, currentIndex, onMatchFound, matchesRef }) => {
  if (!searchQuery.trim()) return <span>{text}</span>;

  const parts = text.split(new RegExp(`(${searchQuery.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})`, 'gi'));
  
  return (
    <span>
      {parts.map((part, index) => {
        const isMatch = part.toLowerCase() === searchQuery.toLowerCase();
        if (isMatch) {
          // Add this instance to the list of matches dynamically on render
          const matchId = `${type}-${sectionId}-${index}`;
          
          return (
            <mark
              key={index}
              className={`px-1 rounded-sm text-neutral-900 border transition-colors ${
                currentIndex === matchesRef.current.findIndex(m => m.id === matchId)
                  ? 'bg-rsu-orange text-white border-rsu-orange font-bold scale-105 inline-block'
                  : 'bg-yellow-200 dark:bg-yellow-800/40 border-yellow-300 dark:border-yellow-700/50'
              }`}
            >
              {part}
            </mark>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
};

export const LegalPage: React.FC<LegalPageProps> = ({ initialTab = 'terms', onBack }) => {
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derive structural text from active tab to run indexing
  const currentSections = useMemo(() => {
    return activeTab === 'terms' ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  }, [activeTab]);

  // Compute all matches statically in current section set
  const matches = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const found: Array<{ sectionId: string; textSnippet: string; matchKey: string }> = [];
    const queryLower = searchQuery.toLowerCase();

    currentSections.forEach((sec) => {
      // Search inside the section title
      if (sec.title.toLowerCase().includes(queryLower)) {
        found.push({
          sectionId: sec.id,
          textSnippet: `In Title: "${sec.title}"`,
          matchKey: `${activeTab}-${sec.id}-title`
        });
      }
      
      // Search in paragraph content
      sec.content.forEach((para, pIdx) => {
        let index = -1;
        while ((index = para.toLowerCase().indexOf(queryLower, index + 1)) !== -1) {
          const snippetStart = Math.max(0, index - 25);
          const snippetEnd = Math.min(para.length, index + searchQuery.length + 25);
          const snippet = para.substring(snippetStart, snippetEnd);
          found.push({
            sectionId: sec.id,
            textSnippet: `"...${snippet}..."`,
            matchKey: `${activeTab}-${sec.id}-content-${pIdx}-${index}`
          });
        }
      });

      // Search inside list bullet texts
      if (sec.bullets) {
        sec.bullets.forEach((bullet, bIdx) => {
          const combinedText = `${bullet.bold} ${bullet.normal}`;
          let index = -1;
          while ((index = combinedText.toLowerCase().indexOf(queryLower, index + 1)) !== -1) {
            const snippetStart = Math.max(0, index - 25);
            const snippetEnd = Math.min(combinedText.length, index + searchQuery.length + 25);
            const snippet = combinedText.substring(snippetStart, snippetEnd);
            found.push({
              sectionId: sec.id,
              textSnippet: `In point: "...${snippet}..."`,
              matchKey: `${activeTab}-${sec.id}-bullet-${bIdx}-${index}`
            });
          }
        });
      }

      // Search in InfoBox text
      if (sec.infoBox) {
        const infoText = `${sec.infoBox.title} ${sec.infoBox.text}`;
        let index = -1;
        while ((index = infoText.toLowerCase().indexOf(queryLower, index + 1)) !== -1) {
          const snippetStart = Math.max(0, index - 25);
          const snippetEnd = Math.min(infoText.length, index + searchQuery.length + 25);
          const snippet = infoText.substring(snippetStart, snippetEnd);
          found.push({
            sectionId: sec.id,
            textSnippet: `In notice: "...${snippet}..."`,
            matchKey: `${activeTab}-${sec.id}-infoBox-${index}`
          });
        }
      }
    });

    return found;
  }, [searchQuery, currentSections, activeTab]);

  // Adjust highlight matching index boundary bounds
  useEffect(() => {
    if (matches.length > 0) {
      setMatchIndex(prev => (prev >= 0 && prev < matches.length ? prev : 0));
    } else {
      setMatchIndex(prev => (prev === -1 ? prev : -1));
    }
  }, [matches.length, activeTab]);

  // Handle Next Index matching & auto scrolls to target sections
  const scrollToMatch = (index: number) => {
    if (index < 0 || index >= matches.length) return;
    const match = matches[index];
    const element = document.getElementById(`sec-${match.sectionId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add subtle glow animation transition effect to matching block
      element.classList.add('ring-2', 'ring-rsu-orange/40');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-rsu-orange/40');
      }, 2000);
    }
  };

  const handleNextMatch = () => {
    if (matches.length === 0) return;
    const nextIdx = (matchIndex + 1) % matches.length;
    setMatchIndex(nextIdx);
    scrollToMatch(nextIdx);
  };

  const handlePrevMatch = () => {
    if (matches.length === 0) return;
    const prevIdx = (matchIndex - 1 + matches.length) % matches.length;
    setMatchIndex(prevIdx);
    scrollToMatch(prevIdx);
  };

  // Build reactive Match item list component
  const matchesRef = useRef<Array<{ id: string; query: string; tab: 'terms' | 'privacy' }>>([]);
  matchesRef.current = matches.map(m => ({ id: m.matchKey, query: searchQuery, tab: activeTab }));

  return (
    <div className="absolute inset-0 bg-rsu-bg text-rsu-text flex flex-col z-[1000] overflow-hidden">
      {/* Dynamic top bar branded with university identity */}
      <div className="h-1.5 bg-gradient-to-r from-rsu-navy via-rsu-orange to-rsu-green w-full shrink-0" />
      
      {/* Header Panel with back action and main search controller */}
      <header className="px-6 py-5 bg-rsu-card border-b border-rsu-border/20 flex flex-col gap-4 shadow-md shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-3 bg-rsu-bg border border-rsu-border/10 rounded-2xl hover:bg-rsu-navy hover:text-white dark:hover:bg-rsu-green text-rsu-navy transition-all active:scale-95 shadow-sm"
              title="Return to Campus map"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="text-xl md:text-2xl font-display font-black tracking-tight text-rsu-navy dark:text-white uppercase leading-none">
                Legal Workspace
              </h1>
              <p className="text-[10px] font-bold text-rsu-muted uppercase tracking-widest mt-1">
                Rivers State University Digital Information Center
              </p>
            </div>
          </div>

          {/* Quick toggle tab items */}
          <div className="flex bg-rsu-bg border border-rsu-border/20 p-1.5 rounded-2xl gap-1">
            <button
              onClick={() => {
                setActiveTab('terms');
                setSearchQuery('');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'terms'
                  ? 'bg-rsu-navy text-white shadow-sm'
                  : 'text-rsu-muted hover:text-rsu-navy dark:hover:text-white'
              }`}
            >
              Terms of Service
            </button>
            <button
              onClick={() => {
                setActiveTab('privacy');
                setSearchQuery('');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'privacy'
                  ? 'bg-rsu-navy text-white shadow-sm'
                  : 'text-rsu-muted hover:text-rsu-navy dark:hover:text-white'
              }`}
            >
              Privacy Policy
            </button>
          </div>
        </div>

        {/* Integrated forward search controller */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="relative flex-1 bg-rsu-bg border border-rsu-border/20 rounded-2xl flex items-center px-4 py-2 focus-within:border-rsu-orange transition-colors">
            <Search size={16} className="text-rsu-orange mr-3 flex-shrink-0" />
            <input
              type="text"
              placeholder={`Search within ${activeTab === 'terms' ? 'Terms' : 'Privacy Policy'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs font-bold uppercase tracking-wider outline-none text-rsu-text placeholder:text-rsu-muted"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-[9px] font-black uppercase tracking-widest text-rsu-orange hover:bg-rsu-orange/10 px-2.5 py-1 rounded-lg"
              >
                Clear
              </button>
            )}
          </div>

          {/* Forward search control indicators */}
          {searchQuery && (
            <div className="bg-rsu-orange/10 border border-rsu-orange/20 rounded-2xl flex items-center px-4 py-2 gap-3 shrink-0 justify-between md:justify-start">
              <span className="text-[10px] font-black text-rsu-orange uppercase tracking-wider">
                {matches.length === 0 
                  ? 'No Matches Found' 
                  : `${matchIndex + 1} of ${matches.length} matches`
                }
              </span>
              
              {matches.length > 0 && (
                <div className="flex items-center gap-1.5 border-l border-rsu-orange/20 pl-2.5">
                  <button
                    onClick={handlePrevMatch}
                    className="p-1 hover:bg-rsu-orange/20 text-rsu-orange rounded-md transition-all active:scale-95"
                    title="Previous occurrence"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    onClick={handleNextMatch}
                    className="p-1 hover:bg-rsu-orange/20 text-rsu-orange rounded-md transition-all active:scale-95"
                    title="Next occurrence (Forward)"
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Structured legal doc viewport scrolling grid container */}
      <div className="flex-1 overflow-y-auto no-scrollbar bg-slate-50 dark:bg-slate-900/30">
        <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
          
          {/* Branded welcome section card widget */}
          <div className="bg-rsu-card border border-rsu-border/25 rounded-3xl p-6 md:p-8 flex gap-6 items-center shadow-sm">
            <div className="p-4 bg-rsu-navy text-white rounded-2xl hidden md:block">
              {activeTab === 'terms' ? <FileText size={32} /> : <Shield size={32} />}
            </div>
            <div>
              <h2 className="text-lg font-display font-black uppercase tracking-tight text-rsu-navy dark:text-white">
                {activeTab === 'terms' ? 'RSU Campus Map & Timetable Terms' : 'RSU Campus Navigation Privacy Charter'}
              </h2>
              <p className="text-xs text-rsu-muted leading-relaxed mt-1">
                Transparency and safety are paramount at Rivers State University. This legal documentation defines the protocols governing geo-coordinates loading, timetable image parsing, custom bookmarks cache, and Secure Google Web Sync routes.
              </p>
            </div>
          </div>

          {/* Sections List Rendering */}
          <div className="space-y-4">
            {currentSections.map((sec) => {
              const hasMatchesInThisSection = matches.some(m => m.sectionId === sec.id);
              
              return (
                <div
                  id={`sec-${sec.id}`}
                  key={sec.id}
                  className={`bg-rsu-card rounded-3xl p-6 md:p-8 border border-rsu-border/25 shadow-sm transition-all duration-300 ${
                    hasMatchesInThisSection ? 'border-rsu-orange/50 ring-2 ring-rsu-orange/5 bg-rsu-orange/[0.01]' : ''
                  }`}
                >
                  {/* Category Title Header */}
                  <h3 className="font-display font-black text-base md:text-lg text-rsu-navy dark:text-white flex items-center gap-3 border-b border-rsu-border/10 pb-3 mb-4">
                    {sec.num && (
                      <span className="bg-rsu-orange/10 text-rsu-orange w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-xs">
                        {sec.num}
                      </span>
                    )}
                    <HighlightText
                      text={sec.title}
                      searchQuery={searchQuery}
                      sectionId={sec.id}
                      type={activeTab}
                      currentIndex={matchIndex}
                      onMatchFound={() => {}}
                      matchesRef={matchesRef}
                    />
                  </h3>

                  {/* Optional Branded Interactive Info Attention Banner */}
                  {sec.infoBox && (
                    <div className={`p-4 rounded-2xl border mb-5 space-y-1 ${
                      sec.infoBox.type === 'attention' 
                        ? 'bg-rsu-orange/5 border-rsu-orange/10 text-rsu-text' 
                        : 'bg-rsu-green/5 border-rsu-green/10 text-rsu-text'
                    }`}>
                      <h4 className="font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 text-rsu-orange">
                        {sec.infoBox.type === 'attention' ? <AlertCircle size={14} /> : <Info size={14} />}
                        <HighlightText
                          text={sec.infoBox.title}
                          searchQuery={searchQuery}
                          sectionId={sec.id}
                          type={activeTab}
                          currentIndex={matchIndex}
                          onMatchFound={() => {}}
                          matchesRef={matchesRef}
                        />
                      </h4>
                      <p className="text-xs text-rsu-muted leading-relaxed">
                        <HighlightText
                          text={sec.infoBox.text}
                          searchQuery={searchQuery}
                          sectionId={sec.id}
                          type={activeTab}
                          currentIndex={matchIndex}
                          onMatchFound={() => {}}
                          matchesRef={matchesRef}
                        />
                      </p>
                    </div>
                  )}

                  {/* Content Paragraphs list */}
                  <div className="space-y-4">
                    {sec.content.map((text, idx) => (
                      <p key={idx} className="text-xs md:text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                        <HighlightText
                          text={text}
                          searchQuery={searchQuery}
                          sectionId={sec.id}
                          type={activeTab}
                          currentIndex={matchIndex}
                          onMatchFound={() => {}}
                          matchesRef={matchesRef}
                        />
                      </p>
                    ))}
                  </div>

                  {/* Bullet Lists */}
                  {sec.bullets && (
                    <ul className="mt-4 pl-4 border-l-2 border-rsu-orange/15 space-y-3.5">
                      {sec.bullets.map((bullet, idx) => (
                        <li key={idx} className="text-xs md:text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                          <strong className="text-neutral-800 dark:text-neutral-200 block md:inline md:mr-1">
                            <HighlightText
                              text={bullet.bold}
                              searchQuery={searchQuery}
                              sectionId={sec.id}
                              type={activeTab}
                              currentIndex={matchIndex}
                              onMatchFound={() => {}}
                              matchesRef={matchesRef}
                            />
                          </strong>
                          <HighlightText
                            text={bullet.normal}
                            searchQuery={searchQuery}
                            sectionId={sec.id}
                            type={activeTab}
                            currentIndex={matchIndex}
                            onMatchFound={() => {}}
                            matchesRef={matchesRef}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick Help Desk Card */}
          <div className="bg-rsu-navy text-white rounded-3xl p-6 md:p-8 flex flex-col md:flex-row gap-6 justify-between items-center text-center md:text-left">
            <div>
              <h4 className="font-display font-black text-lg uppercase tracking-tight">Need further clarity?</h4>
              <p className="text-xs text-white/70 mt-1 max-w-lg leading-relaxed">
                If you have concerns about secure Google Calendar syncing pipelines, OSRM routing loops, or local user cache, please speak with our system architect.
              </p>
            </div>
            <button
              onClick={onBack}
              className="px-6 py-3.5 bg-rsu-orange hover:bg-rsu-orange/95 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-rsu-orange/20 cursor-pointer transition-all active:scale-95 shrink-0"
            >
              Return to Map
            </button>
          </div>

          <div className="pt-4 pb-8 text-center">
            <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              © {new Date().getFullYear()} CampusGryd. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
