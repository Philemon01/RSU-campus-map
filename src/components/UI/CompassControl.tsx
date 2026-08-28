import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Compass, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CompassControlProps {
  rotation: number;
  onRotationChange: (angle: number) => void;
  hasActiveSelection?: boolean;
  isPanelExpanded?: boolean;
}

export const CompassControl: React.FC<CompassControlProps> = ({
  rotation,
  onRotationChange,
  hasActiveSelection = false,
  isPanelExpanded = false
}) => {
  const dialRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startAngleRef = useRef(0);
  const startRotationRef = useRef(0);

  // Smooth reset to 0 degrees
  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRotationChange(0);
  };

  // Convert coordinate to angle relative to center of dial
  const getAngle = (clientX: number, clientY: number): number => {
    if (!dialRef.current) return 0;
    const rect = dialRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(clientY - cy, clientX - cx) * 180 / Math.PI;
  };

  const handleDragStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    const angle = getAngle(clientX, clientY);
    startAngleRef.current = angle;
    startRotationRef.current = rotation;
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    const currentAngle = getAngle(clientX, clientY);
    const deltaAngle = currentAngle - startAngleRef.current;
    
    // Normalize new rotation to [0, 360) range
    let newRotation = (startRotationRef.current + deltaAngle) % 360;
    if (newRotation < 0) newRotation += 360;
    
    onRotationChange(Math.round(newRotation));
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDragMoveRef = useRef(handleDragMove);
  handleDragMoveRef.current = handleDragMove;

  // Bind move & up event handlers globally during drag
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        handleDragMoveRef.current(e.clientX, e.clientY);
      }
    };

    const onMouseUp = () => {
      handleDragEnd();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches.length > 0) {
        handleDragMoveRef.current(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const onTouchEnd = () => {
      handleDragEnd();
    };

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isDragging]);

  const roundedRot = Math.round(rotation);

  return (
    <div 
      className={cn(
        "absolute flex flex-col items-center gap-2 z-30 select-none transition-all duration-350",
        // Position changes based on whether map details are showing
        hasActiveSelection 
          ? "left-3.5 bottom-[195px] md:left-6 md:bottom-6" 
          : "left-3.5 bottom-20 md:left-6 md:bottom-6",
        // Hide on mobile if details panel is fully expanded to prevent clutter
        isPanelExpanded ? "opacity-0 pointer-events-none scale-90 md:opacity-100 md:pointer-events-auto md:scale-100" : "opacity-100 scale-100"
      )}
    >
      {/* Visual orientation label badge */}
      <AnimatePresence>
        {roundedRot !== 0 && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.8 }}
            className="px-2.5 py-1 bg-rsu-navy text-white text-[9px] font-mono font-black rounded-lg shadow-md uppercase tracking-wider flex items-center gap-1 border border-white/10"
          >
            <span>{roundedRot}°</span>
            <button 
              onClick={handleReset}
              className="hover:text-rsu-orange text-white/80 active:scale-95 transition-all outline-none cursor-pointer p-0.5"
              title="Reset View to North-Up"
            >
              <RotateCcw size={10} strokeWidth={3} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div 
        ref={dialRef}
        onMouseDown={(e) => {
          if (e.button === 0) {
            e.stopPropagation();
            handleDragStart(e.clientX, e.clientY);
          }
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          if (e.touches.length > 0) {
            handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        className={`relative w-14 h-14 rounded-full bg-white dark:bg-rsu-card border-2 shadow-xl flex items-center justify-center transition-all cursor-grab active:cursor-grabbing ${
          isDragging 
            ? 'scale-110 border-rsu-orange shadow-rsu-orange/10' 
            : roundedRot !== 0 
              ? 'border-rsu-orange saturate-100' 
              : 'border-rsu-border/80 dark:border-rsu-border/20'
        }`}
        title="Map Compass - Drag to rotate. Click center red tip to reset."
      >
        {/* Outer circular dial ticks */}
        <div 
          className="absolute inset-0 rounded-full transition-transform duration-75 ease-out"
          style={{ transform: `rotate(${-rotation}deg)` }}
        >
          {/* North label */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-display font-black text-rsu-orange">N</div>
          {/* South label */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-display font-bold text-rsu-muted">S</div>
          {/* East label */}
          <div className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] font-display font-bold text-rsu-muted">E</div>
          {/* West label */}
          <div className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] font-display font-bold text-rsu-muted">W</div>

          {/* Precision dial ring markings */}
          <div className="absolute inset-2 border border-dashed border-rsu-border/30 dark:border-white/5 rounded-full" />
        </div>

        {/* 3D Magnetic Compass Needle (Always points North on screen, which is rotated opposite) */}
        <div 
          className="absolute w-8 h-8 flex items-center justify-center transition-transform duration-75 ease-out pointer-events-none"
          style={{ transform: `rotate(${-rotation}deg)` }}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]">
            {/* North pointing Red Arrow */}
            <polygon points="50,10 65,50 50,42" fill="#FF6B35" />
            <polygon points="50,10 35,50 50,42" fill="#E04F1A" />
            
            {/* South pointing Slate Arrow */}
            <polygon points="50,90 65,50 50,58" fill="#94A3B8" />
            <polygon points="50,90 35,50 50,58" fill="#CBD5E1" />
            
            {/* Center golden pivot bezel pin */}
            <circle cx="50" cy="50" r="7" fill="#001F3F" stroke="#E2E8F0" strokeWidth="1.5" />
            <circle cx="50" cy="50" r="2.5" fill="#FF6B35" />
          </svg>
        </div>

        {/* Invisible clicking hot-spot at center for quick North reset */}
        <div 
          onClick={handleReset}
          className="absolute w-5 h-5 rounded-full cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center z-10 transition-colors"
          title="Reset to North"
        />
      </div>

      {/* Helper caption/indicator */}
      <span className="text-[7px] font-mono text-rsu-muted uppercase tracking-widest font-black leading-none">
        {isDragging ? 'Turning...' : 'Drag Turn'}
      </span>
    </div>
  );
};
