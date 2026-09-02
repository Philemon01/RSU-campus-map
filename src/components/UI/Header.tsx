import React from 'react';
import { Menu, GraduationCap, Volume2, Sun, Moon, Home } from 'lucide-react';
import { cn } from '../../lib/utils';

interface HeaderProps {
  isVoiceAssistEnabled: boolean;
  isDarkMode: boolean;
  setIsMenuOpen: (o: boolean) => void;
  setIsVoiceAssistEnabled: (e: boolean) => void;
  setIsDarkMode: (d: boolean) => void;
  onNavigateHome?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isVoiceAssistEnabled,
  isDarkMode,
  setIsMenuOpen,
  setIsVoiceAssistEnabled,
  setIsDarkMode,
  onNavigateHome
}) => {
  return (
    <header className="absolute top-0 left-0 right-0 z-20 bg-rsu-card/95 backdrop-blur-xl border-b border-rsu-border/20 px-2.5 py-2.5 sm:px-4 sm:py-4 flex items-center justify-between shadow-lg gap-2">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <button
          onClick={() => setIsMenuOpen(true)}
          className="p-2 sm:p-2.5 bg-rsu-navy text-white rounded-xl hover:bg-rsu-navy/90 transition-all flex items-center justify-center shadow-lg border border-white/10 active:scale-95 shrink-0 cursor-pointer"
          aria-label="Open menu"
        >
          <Menu size={19} />
        </button>
        
        <div className="flex items-center gap-2 sm:gap-3 text-left min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-rsu-navy to-[#0a2e5c] rounded-xl flex items-center justify-center shadow-md border border-white/20 shrink-0">
            <GraduationCap className="text-white drop-shadow-sm font-bold" size={18} />
          </div>
          <div className="flex flex-col justify-center min-w-0">
            <h1 
              style={{ color: isDarkMode ? '#FFFFFF' : '#0F172A' }}
              className="text-xs sm:text-sm font-display font-bold tracking-tight leading-none truncate"
            >
              <span className="hidden sm:inline">Rivers State University</span>
              <span className="inline sm:hidden">RSU</span>
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5 sm:mt-1">
              <span className="text-[8px] sm:text-[9px] font-bold text-white bg-rsu-orange px-1.2 py-0.5 rounded uppercase tracking-wider">
                CampusGryd
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {/* Prominent Go to Homepage Button - visible on both mobile and desktop */}
        <button
          onClick={onNavigateHome}
          className="flex items-center gap-1.5 px-2.5 py-2 sm:px-3.5 sm:py-2.5 bg-gradient-to-r from-rsu-navy to-[#0a2e5c] hover:from-emerald-600 hover:to-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-95 cursor-pointer border border-white/10 group shrink-0"
          title="Go to Homepage"
        >
          <Home size={15} className="text-emerald-400 group-hover:text-white transition-colors" />
          <span className="hidden sm:inline">Home</span>
        </button>

        <div className="text-right hidden lg:flex flex-col items-end">
          <p className="text-[10px] font-mono font-black text-rsu-navy dark:text-rsu-green uppercase tracking-widest leading-none">
            Philemon Progress
          </p>
          <p className="text-[8px] font-bold text-rsu-muted uppercase mt-0.5">System Architect</p>
        </div>
        
        <button
          onClick={() => setIsVoiceAssistEnabled(!isVoiceAssistEnabled)}
          className={cn(
            "p-2 sm:p-2.5 rounded-xl transition-all flex items-center justify-center shadow-inner border cursor-pointer shrink-0",
            isVoiceAssistEnabled ? "bg-rsu-green/10 text-rsu-green border-rsu-green/20" : "bg-rsu-bg text-rsu-muted border-rsu-border"
          )}
          aria-label="Toggle voice assist"
          title={isVoiceAssistEnabled ? "Voice Assist On" : "Voice Assist Off"}
        >
          {isVoiceAssistEnabled ? <Volume2 size={17} /> : <Volume2 size={17} className="opacity-30" />}
        </button>
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className={cn(
            "p-2 sm:p-2.5 bg-rsu-bg rounded-xl transition-all flex items-center justify-center shadow-inner border cursor-pointer shrink-0",
            isDarkMode 
              ? "text-white border-white/20 hover:bg-white/10" 
              : "text-rsu-navy border-rsu-navy/10 hover:bg-rsu-navy/10"
          )}
          aria-label="Toggle dark mode"
        >
          {isDarkMode ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </header>
  );
};
