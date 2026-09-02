import React from 'react';
import L from 'leaflet';
import { 
  GraduationCap, 
  Building2, 
  Home, 
  Utensils, 
  DoorOpen, 
  Trophy, 
  Library, 
  MapPin,
  BookOpen,
  Compass
} from 'lucide-react';
import { cn } from './utils';

export const getCategoryIcon = (type: string) => {
  switch (type) {
    case 'nearby': return <Compass size={18} />;
    case 'faculty': return <GraduationCap size={18} />;
    case 'college': return <GraduationCap size={18} />;
    case 'department': return <BookOpen size={18} />;
    case 'admin': return <Building2 size={18} />;
    case 'hostel': return <Home size={18} />;
    case 'food': return <Utensils size={18} />;
    case 'gate': return <DoorOpen size={18} />;
    case 'sports': return <Trophy size={18} />;
    case 'library': return <Library size={18} />;
    case 'facility': return <Building2 size={18} />;
    default: return <MapPin size={18} />;
  }
};

// Cache DivIcons to prevent recreating identical DOM/Leaflet icon objects on every render
const iconCache = new Map<string, L.DivIcon>();

export const createCustomIcon = (type: string, isActive: boolean, isHighlighted: boolean = false) => {
  const key = `${type}_${isActive}_${isHighlighted}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  let icon: L.DivIcon;

  if (isActive) {
    icon = L.divIcon({
      className: 'custom-marker active-highlight',
      html: `
        <div class="relative flex items-center justify-center w-14 h-14 marker-inner-active">
          <!-- Multi-tier pulsating radar waves -->
          <div class="absolute w-16 h-16 bg-blue-600/25 rounded-full search-radar-pulse opacity-90"></div>
          <div class="absolute w-11 h-11 bg-blue-600/35 rounded-full animate-pulse opacity-95"></div>
          
          <!-- Elegant bouncing & floating pin -->
          <div class="relative w-10 h-10 bg-white dark:bg-slate-900 rounded-full shadow-2xl border-2 border-blue-600 flex items-center justify-center marker-floating-pin z-10">
            <!-- Inner color containing custom icon path -->
            <div class="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-inner">
              <svg viewBox="0 0 24 24" class="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
            </div>
          </div>
          <!-- Subtle shadow under the floating pin -->
          <div class="absolute bottom-1 w-6 h-1.5 bg-black/30 dark:bg-black/60 rounded-full blur-[1px] opacity-70"></div>
        </div>
      `,
      iconSize: [56, 56],
      iconAnchor: [28, 48],
    });
  } else if (isHighlighted) {
    icon = L.divIcon({
      className: 'custom-marker search-highlight',
      html: `
        <div class="relative flex items-center justify-center w-12 h-12 marker-inner-highlight">
          <!-- Pulsating blue highlight halo -->
          <div class="absolute w-12 h-12 bg-blue-500/25 rounded-full search-radar-pulse"></div>
          <div class="z-10 bg-blue-600 text-white w-7 h-7 rounded-full shadow-lg border-2 border-white dark:border-slate-800 flex items-center justify-center transition-all duration-300 scale-110">
            <svg viewBox="0 0 24 24" class="w-3.5 h-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });
  } else {
    const bgColor = 'bg-white dark:bg-slate-900';
    const dotColor = 'bg-slate-900 dark:bg-blue-400';
    
    icon = L.divIcon({
      className: cn('custom-marker default-location-dot pointer-events-auto cursor-pointer opacity-0'),
      html: `
        <div class="relative flex items-center justify-center w-11 h-11 opacity-0 pointer-events-auto cursor-pointer" style="opacity: 0 !important; pointer-events: auto !important; cursor: pointer !important;">
          <div class="z-10 ${bgColor} w-7 h-7 rounded-full shadow-md border-2 border-white dark:border-slate-800/80 flex items-center justify-center opacity-0 pointer-events-auto" style="opacity: 0 !important; pointer-events: auto !important;">
            <div class="w-2.5 h-2.5 rounded-full ${dotColor} opacity-0" style="opacity: 0 !important;"></div>
          </div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
  }

  iconCache.set(key, icon);
  return icon;
};
