import React from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Polygon, ZoomControl, useMap, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Location, FriendBeacon } from '../../types';
import { cn } from '../../lib/utils';
import { RSU_CENTER, DEFAULT_ZOOM } from '../../constants';

interface CampusMapProps {
  mapView: { center: [number, number], zoom: number };
  isSatelliteView: boolean;
  filteredLocations: Location[];
  selectedLocation: Location | null;
  startLocation: Location | null;
  userLocation: [number, number] | null;
  navigationPath: [number, number][] | null;
  mapFeatures?: any;
  onLocationSelect: (loc: Location) => void;
  setStartLocation?: (loc: Location | null) => void;
  createCustomIcon: (type: string, isActive: boolean, isHighlighted?: boolean) => L.DivIcon;
  highlightedLocationId?: string | null;
  searchResults?: Location[];
  friendBeacons?: FriendBeacon[];
  onNavigateToFriend?: (coords: [number, number], name: string) => void;
}

function MapController({ center, zoom, onMapMove }: { center: [number, number], zoom: number, onMapMove: (center: [number, number], zoom: number) => void }) {
  const map = useMap();
  const lastTargetRef = React.useRef<{ center: [number, number]; zoom: number } | null>(null);
  const isUserInteractingRef = React.useRef<boolean>(false);
  const onMapMoveRef = React.useRef(onMapMove);
  
  React.useEffect(() => {
    onMapMoveRef.current = onMapMove;
  }, [onMapMove]);
  
  // Track physical user touches/clicks/drags to distinguish user map pans from programmatic zoom/setViews
  React.useEffect(() => {
    const onUserInteractionStart = () => {
      isUserInteractingRef.current = true;
    };
    const onUserInteractionEnd = () => {
      setTimeout(() => {
        isUserInteractingRef.current = false;
      }, 200);
    };

    map.on('dragstart', onUserInteractionStart);
    map.on('dragend', onUserInteractionEnd);

    const container = map.getContainer();
    container.addEventListener('mousedown', onUserInteractionStart, { capture: true });
    container.addEventListener('touchstart', onUserInteractionStart, { capture: true, passive: true });
    container.addEventListener('wheel', onUserInteractionStart, { capture: true, passive: true });

    window.addEventListener('mouseup', onUserInteractionEnd, { capture: true });
    window.addEventListener('touchend', onUserInteractionEnd, { capture: true });

    return () => {
      map.off('dragstart', onUserInteractionStart);
      map.off('dragend', onUserInteractionEnd);

      container.removeEventListener('mousedown', onUserInteractionStart, { capture: true });
      container.removeEventListener('touchstart', onUserInteractionStart, { capture: true });
      container.removeEventListener('wheel', onUserInteractionStart, { capture: true });

      window.removeEventListener('mouseup', onUserInteractionEnd, { capture: true });
      window.removeEventListener('touchend', onUserInteractionEnd, { capture: true });
    };
  }, [map]);

  // Update parents when map is moved manually
  React.useEffect(() => {
    const onMove = () => {
      // ONLY notify parent if this movement is active physical user interaction!
      if (!isUserInteractingRef.current) {
        return;
      }

      const newCenter = map.getCenter();
      const newZoom = map.getZoom();

      if (lastTargetRef.current) {
        const dTarget = L.latLng([newCenter.lat, newCenter.lng]).distanceTo(lastTargetRef.current.center);
        const zTarget = Math.abs(newZoom - lastTargetRef.current.zoom);
        if (dTarget < 2 && zTarget < 0.1) {
          return;
        }
      }
      
      // Update lastTargetRef immediately so echoing prop updates don't call map.setView
      lastTargetRef.current = { center: [newCenter.lat, newCenter.lng], zoom: newZoom };
      onMapMoveRef.current([newCenter.lat, newCenter.lng], newZoom);
    };

    map.on('moveend', onMove);
    return () => {
      map.off('moveend', onMove);
    };
  }, [map]);

  // Handle external view changes (selecting a location, etc)
  React.useEffect(() => {
    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    
    // Check if we already tried to set this target to avoid re-triggering during animation
    if (lastTargetRef.current) {
      const isSameTarget = 
        L.latLng(center).distanceTo(lastTargetRef.current.center) < 1 && 
        Math.abs(zoom - lastTargetRef.current.zoom) < 0.1;
      if (isSameTarget) {
        return;
      }
    }

    const dist = L.latLng(center).distanceTo(currentCenter);
    // If the map is already there (e.g. user dragged it there or it's within threshold), just sync lastTargetRef and skip setView
    if (dist <= 1 && Math.abs(zoom - currentZoom) <= 0.1) {
      lastTargetRef.current = { center, zoom };
      return;
    }

    // Otherwise, perform the programmatic movement
    isUserInteractingRef.current = false;
    lastTargetRef.current = { center, zoom };
    map.setView(center, zoom, { animate: true, duration: 0.8 });
  }, [center[0], center[1], zoom, map]);
  
  return null;
}

function MapRotationController({ rotation, setRotation, isSatelliteView }: { rotation: number, setRotation: (r: number) => void, isSatelliteView: boolean }) {
  const map = useMap();
  const rotationRef = React.useRef(rotation);

  React.useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  // Synchronize CSS variable and satellite activity class on the Leaflet map container element
  React.useEffect(() => {
    if (!map) return;
    const container = map.getContainer();
    if (container) {
      container.style.setProperty('--map-rotation', `${rotation}deg`);
      
      if (isSatelliteView) {
        container.classList.add('satellite-active');
      } else {
        container.classList.remove('satellite-active');
      }
    }
  }, [map, rotation, isSatelliteView]);

  // Patch mouseEventToContainerPoint on the map instance
  React.useEffect(() => {
    if (!map) return;

    const originalMtop = map.mouseEventToContainerPoint;
    
    map.mouseEventToContainerPoint = function (e: any) {
      const currentRotation = rotationRef.current;
      if (!currentRotation) {
        return originalMtop.call(this, e);
      }

      const container = this.getContainer();
      const rect = container.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      let clientX = e.clientX;
      let clientY = e.clientY;

      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if (e.changedTouches && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
      }

      if (clientX === undefined || clientY === undefined) {
        return originalMtop.call(this, e);
      }

      // Convert rotation to counter-clockwise radians for point-remapping
      const rad = -currentRotation * Math.PI / 180;
      const dx = clientX - cx;
      const dy = clientY - cy;

      const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

      const rotatedEvent = {
        clientX: cx + rx,
        clientY: cy + ry,
        type: e.type,
        target: e.target,
        currentTarget: e.currentTarget,
        preventDefault: e.preventDefault ? e.preventDefault.bind(e) : () => {},
        stopPropagation: e.stopPropagation ? e.stopPropagation.bind(e) : () => {},
      };

      return originalMtop.call(this, rotatedEvent);
    };

    return () => {
      map.mouseEventToContainerPoint = originalMtop;
    };
  }, [map]);

  // Hook touch and mouse events for Map turn/rotation gestures
  React.useEffect(() => {
    if (!map) return;

    const container = map.getContainer();
    let isRotating = false;
    let initialAngle = 0;
    let initialRotation = 0;
    let initialTouchAngle = 0;

    const getTouchAngle = (touches: TouchList) => {
      if (touches.length < 2) return 0;
      const t1 = touches[0];
      const t2 = touches[1];
      return Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180 / Math.PI;
    };

    const onMouseDown = (e: MouseEvent) => {
      // Rotate on Shift + Drag (primary mouse button)
      if (e.shiftKey && e.button === 0) {
        isRotating = true;
        map.dragging.disable();
        
        const rect = container.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        
        initialAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
        initialRotation = rotationRef.current;
        
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isRotating) {
        const rect = container.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        
        const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
        const deltaAngle = currentAngle - initialAngle;
        
        let newRot = (initialRotation + deltaAngle) % 360;
        if (newRot < 0) newRot += 360;
        setRotation(newRot);
        
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onMouseUp = () => {
      if (isRotating) {
        isRotating = false;
        map.dragging.enable();
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        isRotating = true;
        map.dragging.disable();
        map.doubleClickZoom.disable();
        map.scrollWheelZoom.disable();
        
        initialTouchAngle = getTouchAngle(e.touches);
        initialRotation = rotationRef.current;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isRotating && e.touches.length === 2) {
        const currentTouchAngle = getTouchAngle(e.touches);
        const deltaAngle = currentTouchAngle - initialTouchAngle;
        
        let newRot = (initialRotation + deltaAngle) % 360;
        if (newRot < 0) newRot += 360;
        setRotation(newRot);
        
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onTouchEnd = () => {
      if (isRotating) {
        isRotating = false;
        map.dragging.enable();
        map.doubleClickZoom.enable();
        map.scrollWheelZoom.enable();
      }
    };

    container.addEventListener('mousedown', onMouseDown, { capture: true });
    window.addEventListener('mousemove', onMouseMove, { capture: true });
    window.addEventListener('mouseup', onMouseUp, { capture: true });
    
    container.addEventListener('touchstart', onTouchStart, { capture: true });
    container.addEventListener('touchmove', onTouchMove, { capture: true });
    container.addEventListener('touchend', onTouchEnd, { capture: true });

    return () => {
      container.removeEventListener('mousedown', onMouseDown, { capture: true });
      window.removeEventListener('mousemove', onMouseMove, { capture: true });
      window.removeEventListener('mouseup', onMouseUp, { capture: true });
      
      container.removeEventListener('touchstart', onTouchStart, { capture: true });
      container.removeEventListener('touchmove', onTouchMove, { capture: true });
      container.removeEventListener('touchend', onTouchEnd, { capture: true });
    };
  }, [map, setRotation]);

  return null;
}

const userMarkerIcon = L.divIcon({
  className: 'user-marker-google',
  html: `<div class="relative w-12 h-12 flex items-center justify-center">
          <div class="absolute w-10 h-10 bg-blue-500/20 rounded-full animate-ping opacity-70"></div>
          
          <div class="relative w-8 h-8 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="absolute transform -rotate-[15deg]">
              <path d="M16 2L24 28L16 22L8 28L16 2Z" fill="#4285F4" fill-opacity="0.3" stroke="#4285F4" stroke-width="0.5" />
            </svg>
            
            <div class="z-10 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-md">
              <div class="w-2.5 h-2.5 bg-[#4285F4] rounded-full"></div>
            </div>
          </div>
        </div>`,
  iconSize: [48, 48],
  iconAnchor: [24, 24]
});

const navStartIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div class="w-10 h-10 flex items-center justify-center">
          <div class="w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-md">
            <div class="w-4 h-4 bg-[#4285F4] rounded-full"></div>
          </div>
        </div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20]
});

const navEndIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div class="relative w-10 h-10 flex items-center justify-center drop-shadow-xl">
          <svg viewBox="0 0 24 24" class="w-12 h-12" fill="#EA4335" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" stroke="white" stroke-width="0.5"/>
          </svg>
        </div>`,
  iconSize: [48, 48],
  iconAnchor: [24, 48]
});

const createFriendMarkerIcon = (name: string, statusNote?: string) => {
  const initial = (name || 'Friend').charAt(0).toUpperCase();
  const firstName = (name || 'Friend').split(' ')[0];
  const escapedName = firstName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  return L.divIcon({
    className: 'custom-friend-beacon-icon',
    html: `
      <div class="relative flex flex-col items-center cursor-pointer pointer-events-auto" style="transform: translate3d(0,0,0);">
        <div class="relative flex items-center justify-center">
          <div class="absolute -inset-2 bg-emerald-500/30 rounded-full animate-ping"></div>
          <div class="w-9 h-9 rounded-full bg-emerald-600 border-2 border-white shadow-lg flex items-center justify-center text-white font-black text-xs">
            ${initial}
          </div>
          <div class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 border-2 border-white rounded-full"></div>
        </div>
        <div class="mt-1 px-2 py-0.5 bg-slate-900/90 backdrop-blur-sm text-white text-[10px] font-bold rounded-md whitespace-nowrap shadow-md border border-emerald-500/50">
          ${escapedName}
        </div>
      </div>
    `,
    iconSize: [44, 52],
    iconAnchor: [22, 26]
  });
};

export const CampusMap = React.memo<CampusMapProps & { 
  onMapMove: (center: [number, number], zoom: number) => void;
  mapRotation: number;
  setMapRotation: (r: number) => void;
}>(({
  mapView,
  isSatelliteView,
  filteredLocations,
  selectedLocation,
  startLocation,
  userLocation,
  navigationPath,
  mapFeatures,
  onLocationSelect,
  setStartLocation,
  createCustomIcon,
  highlightedLocationId,
  searchResults,
  friendBeacons,
  onNavigateToFriend,
  onMapMove,
  mapRotation,
  setMapRotation
}) => {
  // Pre-calculate and memoize GeoJSON geometry layers
  const polygonFeatures = React.useMemo(() => {
    if (!mapFeatures?.features) return [];
    return mapFeatures.features.filter((f: any) => f.geometry.type.includes('Polygon'));
  }, [mapFeatures]);

  return (
    <MapContainer 
      center={RSU_CENTER} 
      zoom={DEFAULT_ZOOM} 
      zoomControl={false}
      minZoom={15}
      maxBounds={[[4.780, 6.966], [4.814, 6.994]]}
      maxBoundsViscosity={1.0}
      boxZoom={false}
      className={cn("w-full h-full", isSatelliteView && "satellite-active", "rotated-leaflet-container")}
      style={{ '--map-rotation': `${mapRotation}deg` } as React.CSSProperties}
    >
      <MapController 
        center={mapView.center} 
        zoom={mapView.zoom} 
        onMapMove={onMapMove}
      />
      <MapRotationController 
        rotation={mapRotation}
        setRotation={setMapRotation}
        isSatelliteView={isSatelliteView}
      />
      {isSatelliteView ? (
        <TileLayer
          key="google-satellite"
          attribution="&copy; Google Earth Imagery"
          url="https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
          subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
          maxZoom={20}
          zIndex={1}
        />
      ) : (
        <TileLayer
          key="osm-standard"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          zIndex={1}
        />
      )}
      
      {filteredLocations.map(loc => {
        const isSelected = selectedLocation?.id === loc.id || startLocation?.id === loc.id;
        const isHighlighted = !isSelected && (
          highlightedLocationId === loc.id || 
          (Boolean(searchResults && searchResults.length > 0) && searchResults!.some(s => s.id === loc.id))
        );
        return (
          <Marker 
            key={loc.id} 
            position={loc.coordinates}
            icon={createCustomIcon(loc.type, isSelected, isHighlighted)}
            eventHandlers={{
              click: () => {
                onLocationSelect(loc);
              }
            }}
          >
            <Popup className="rsu-popup">
              <div className="p-3 min-w-[200px]">
                <h3 className="font-display font-black text-rsu-navy uppercase text-sm mb-1 leading-tight">{loc.officialName}</h3>
                <p className="text-[9px] font-bold text-rsu-muted uppercase tracking-widest mb-3">{loc.type}</p>
                
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => onLocationSelect(loc)}
                    className="w-full bg-rsu-navy text-white py-2 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md hover:bg-black transition-all"
                  >
                    Set as Destination
                  </button>
                  <button
                    onClick={() => setStartLocation?.(loc)}
                    className="w-full bg-white dark:bg-rsu-card border border-rsu-navy text-rsu-navy dark:text-white py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-rsu-navy/5 transition-all"
                  >
                    Set as Start Point
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {userLocation && (
        <Marker 
          position={userLocation}
          icon={userMarkerIcon}
        />
      )}

      {/* Live Friend Beacons */}
      {friendBeacons && friendBeacons.filter(f => f.session.isActive && Date.now() <= f.session.expiresAt).map(({ session, distanceMeters }) => (
        <Marker
          key={`friend-${session.id}`}
          position={session.coordinates}
          icon={createFriendMarkerIcon(session.userName, session.statusNote)}
        >
          <Popup className="rsu-popup">
            <div className="p-3 min-w-[220px]">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-xs shadow-sm">
                  {session.userName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white leading-none">
                    {session.userName}
                  </h4>
                  <span className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                    Live Campus Beacon ({session.id})
                  </span>
                </div>
              </div>

              {session.statusNote && (
                <p className="text-[11px] text-slate-600 dark:text-slate-300 bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-lg mb-2 border border-emerald-100 dark:border-emerald-900/60 font-medium">
                  &ldquo;{session.statusNote}&rdquo;
                </p>
              )}

              {distanceMeters !== undefined && (
                <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-2.5">
                  Distance: <strong>{distanceMeters < 1000 ? `${Math.round(distanceMeters)}m` : `${(distanceMeters / 1000).toFixed(1)}km`}</strong>
                </p>
              )}

              <button
                onClick={() => onNavigateToFriend?.(session.coordinates, session.userName)}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-1"
              >
                <span>Walk to {session.userName.split(' ')[0]}</span>
              </button>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Base Layer for Polygons */}
      {polygonFeatures.map((feature: any, idx: number) => {
        const strokeColor = feature.properties.stroke || (isSatelliteView ? '#FFFFFF' : '#000000');
        
        if (feature.geometry.type === 'Polygon') {
          const positions = feature.geometry.coordinates.map((ring: any) => 
            ring.map((coord: any) => [coord[1], coord[0]])
          );
          return (
            <Polygon 
              key={`feature-poly-${idx}`}
              positions={positions}
              pathOptions={{
                color: strokeColor,
                weight: 2,
                opacity: 0.6,
                fillColor: strokeColor,
                fillOpacity: 0.2
              }}
            />
          );
        }

        if (feature.geometry.type === 'MultiPolygon') {
          return feature.geometry.coordinates.map((polygon: any, pIdx: number) => {
            const positions = polygon.map((ring: any) => 
              ring.map((coord: any) => [coord[1], coord[0]])
            );
            return (
              <Polygon 
                key={`feature-multipoly-${idx}-${pIdx}`}
                positions={positions}
                pathOptions={{
                  color: strokeColor,
                  weight: 2,
                  opacity: 0.6,
                  fillColor: strokeColor,
                  fillOpacity: 0.2
                }}
              />
            );
          });
        }
        return null;
      })}

      {/* Top Layer for Road Lines & Paths */}
      {mapFeatures?.features?.filter((f: any) => f.geometry.type.includes('LineString')).map((feature: any, idx: number) => {
        const strokeColor = feature.properties.stroke || (isSatelliteView ? '#FFFFFF' : '#000000');
        const lowerStroke = strokeColor.toLowerCase();
        
        // Define "blue" colors from the GeoJSON as roads/routes
        const isBlue = lowerStroke === '#000084' || 
                       lowerStroke === '#000066' || 
                       lowerStroke === '#007784' ||
                       lowerStroke === '#0000ff';

        const isRoad = isBlue || 
                       feature.id?.toLowerCase().includes('road') || 
                       feature.id?.toLowerCase().includes('route');
        
        if (feature.geometry.type === 'LineString') {
          const positions = feature.geometry.coordinates.map((coord: any) => [coord[1], coord[0]]);
          return (
            <React.Fragment key={`feature-line-group-${idx}`}>
              {/* Casing / Glow for better visibility */}
              <Polyline 
                positions={positions}
                color={isRoad ? (isSatelliteView ? "#000" : "#FFF") : "transparent"}
                weight={isRoad ? 14 : 0}
                opacity={0}
              />
              <Polyline 
                positions={positions}
                color={strokeColor}
                weight={isRoad ? 8 : 2}
                opacity={0}
                dashArray={feature.id?.toLowerCase().includes('path') ? "5, 5" : undefined}
                lineCap="round"
                lineJoin="round"
              />
            </React.Fragment>
          );
        }

        if (feature.geometry.type === 'MultiLineString') {
          return feature.geometry.coordinates.map((line: any, lIdx: number) => {
            const positions = line.map((coord: any) => [coord[1], coord[0]]);
            return (
              <Polyline 
                key={`feature-multiline-${idx}-${lIdx}`}
                positions={positions}
                color={strokeColor}
                weight={8}
                opacity={0}
              />
            );
          });
        }

        return null;
      })}

      {navigationPath && navigationPath.length > 0 && (
        <>
          <Polyline 
            positions={navigationPath} 
            color="#FFFFFF" 
            weight={10} 
            opacity={1}
          />
          <Polyline 
            positions={navigationPath} 
            color="#4285F4" 
            weight={7} 
            opacity={1}
            lineCap="round"
            lineJoin="round"
          />
          
          <Marker position={navigationPath[0]} icon={navStartIcon} />
          <Marker position={navigationPath[navigationPath.length - 1]} icon={navEndIcon} />
        </>
      )}

      <ZoomControl position="bottomright" />
    </MapContainer>
  );
});
