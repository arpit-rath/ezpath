import React, { useState, useMemo } from 'react';
import { ACTIVE_MAP_CONFIG, ACTIVE_NETWORK_NODES } from '../../data/networkLocations';
import { JourneyRoute, FacilityStatus, NetworkNode } from '../../types';
import { MapLegend } from './MapLegend';
import { useOperatorStore } from '../../stores/operatorStore';
import { 
  CheckCircle2, 
  XCircle, 
  X,
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import { MapLibreCanvas } from './MapLibreCanvas';

interface InteractiveMapProps {
  routes?: JourneyRoute[];
  selectedRouteId?: string | null;
  onSelectRoute?: (routeId: string) => void;
  className?: string;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  routes = [],
  selectedRouteId,
  className = "w-full h-full relative"
}) => {
  const [selectedEntity, setSelectedEntity] = useState<NetworkNode | FacilityStatus | null>(null);
  const [mapMode, setMapMode] = useState<'street' | 'schematic'>('street');
  const { disruptions } = useOperatorStore();

  const selectedRoute = useMemo(() => {
    return routes.find(r => r.id === selectedRouteId) || routes[0];
  }, [routes, selectedRouteId]);
  const providerLabel = 'Amazon Location';

  return (
    <div 
      className={`relative w-full h-full min-h-[500px] overflow-hidden bg-slate-100 flex flex-col ${className}`}
      aria-label="SRM campus accessible walking map"
    >
      {/* 1. MapLibre street map - Amazon Location in configured production builds */}
      {mapMode === 'street' ? (
        <div className="absolute inset-0 w-full h-full">
          <MapLibreCanvas selectedRoute={selectedRoute} onSelectEntity={setSelectedEntity} />
        </div>
      ) : (
        /* 2. Multimodal Transit Schematic Overlay */
        <div className="absolute inset-0 w-full h-full bg-[#F4F6F9] flex flex-col items-center justify-center p-4">
          <svg viewBox={ACTIVE_MAP_CONFIG.schematicViewBox} className="w-full h-full max-h-[700px]">
            {ACTIVE_NETWORK_NODES.map(node => {
              const isOrigin = selectedRoute?.legs[0]?.fromNodeId === node.id;
              const isDest = selectedRoute?.legs[selectedRoute.legs.length - 1]?.toNodeId === node.id;
              const fill = isOrigin ? '#2563EB' : isDest ? '#087F6D' : '#334155';

              return (
                <g 
                  key={node.id} 
                  className="cursor-pointer"
                  onClick={() => setSelectedEntity(node)}
                >
                  <circle
                    cx={node.coordinates[0]}
                    cy={node.coordinates[1]}
                    r={isOrigin || isDest ? 0.0012 : 0.0008}
                    fill={fill}
                    stroke="#FFFFFF"
                    strokeWidth="0.0002"
                  />
                  <text
                    x={node.coordinates[0]}
                    y={node.coordinates[1] - 0.0012}
                    fontSize="0.001"
                    textAnchor="middle"
                    fill="#14243A"
                    fontWeight={isOrigin || isDest ? "700" : "500"}
                  >
                    {node.name.split(' (')[0]}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Top Floating Map Header Bar - Centered between Floating Panels */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 hidden md:flex items-center gap-2 pointer-events-auto">
        <div className="bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-floating flex items-center gap-2 text-xs font-medium text-ink">
          <div className="w-5 h-5 rounded-md bg-emerald-700 text-white flex items-center justify-center font-bold text-[9px]">
            AWS
          </div>
          <span className="font-bold text-ink">{providerLabel}</span>
          <span className="text-slate-300">|</span>
          <span className="text-[11px] text-slate-500">{ACTIVE_MAP_CONFIG.subtitle}</span>
        </div>

        {/* Map View Mode Switcher */}
        <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-xl border border-slate-200 shadow-floating text-xs">
          <button
            onClick={() => setMapMode('street')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              mapMode === 'street'
                ? 'bg-slate-900 text-white shadow-sm' 
                : 'text-slate-600 hover:text-ink'
            }`}
          >
            Street
          </button>
          <button
            onClick={() => setMapMode('schematic')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              mapMode === 'schematic' 
                ? 'bg-slate-900 text-white shadow-sm' 
                : 'text-slate-600 hover:text-ink'
            }`}
          >
            Schematic
          </button>
        </div>
      </div>

      {/* Map Legend - Centered at Bottom */}
      <MapLegend className="bottom-4 left-1/2 -translate-x-1/2" />

      {/* Interactive Entity Inspection Drawer (when a station/facility marker is clicked) */}
      {selectedEntity && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 w-80 max-w-[calc(100%-2rem)] bg-white/98 backdrop-blur-md rounded-xl border border-subtle-border shadow-floating p-4 animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-2 border-b border-subtle-border pb-2 mb-2">
            <div>
              <div className="text-[10px] font-semibold text-accent uppercase tracking-wider">
                {'type' in selectedEntity ? 'Transit Node' : 'Facility Sensor'}
              </div>
              <h3 className="font-heading font-bold text-sm text-ink leading-tight">
                {selectedEntity.name}
              </h3>
            </div>
            <button
              onClick={() => setSelectedEntity(null)}
              className="p-1 rounded-md text-slate-400 hover:text-ink hover:bg-slate-100"
              aria-label="Close details"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 text-xs">
            {'zone' in selectedEntity && selectedEntity.zone && (
              <div className="flex justify-between items-center text-slate-600 text-[11px]">
                <span>District</span>
                <span className="font-medium text-ink">{selectedEntity.zone}</span>
              </div>
            )}

            {'facilities' in selectedEntity && selectedEntity.facilities.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="font-semibold text-slate-500 text-[10px] uppercase">
                  Station Hardware
                </div>
                {selectedEntity.facilities.map(fac => {
                  const isDisrupted = disruptions.some(d => d.isActive && d.entityId === fac.id);
                  return (
                    <div 
                      key={fac.id} 
                      className={`p-1.5 rounded-lg border text-[11px] flex items-center justify-between ${
                        isDisrupted 
                          ? 'bg-disruption-subtle border-disruption-border text-disruption' 
                          : 'bg-slate-50 border-slate-200 text-ink'
                      }`}
                    >
                      <span className="font-semibold">{fac.name}</span>
                      {isDisrupted ? (
                        <Badge variant="disruption">Unavailable</Badge>
                      ) : (
                        <Badge variant="accessible">Operational</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {'isWheelchairAccessible' in selectedEntity && (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-600">Wheelchair Accessible</span>
                {selectedEntity.isWheelchairAccessible === true ? (
                  <span className="flex items-center gap-1 font-semibold text-accessible">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Yes
                  </span>
                ) : selectedEntity.isWheelchairAccessible === false ? (
                  <span className="flex items-center gap-1 font-semibold text-disruption">
                    <XCircle className="w-3.5 h-3.5" /> No (Stairs)
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-semibold text-warning">
                    Accessibility not verified
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
