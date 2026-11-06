import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJourneyStore, getStationName } from '../stores/journeyStore';
import { SearchControls } from '../components/journey/SearchControls';
import { RouteCard } from '../components/journey/RouteCard';
import { InteractiveMap } from '../components/maps/InteractiveMap';
import { DisruptionBanner } from '../components/disruptions/DisruptionBanner';
import { WhatChangedDiff } from '../components/journey/WhatChangedDiff';
import { ConstraintInspector } from '../components/accessibility/ConstraintInspector';
import { RouteComparison } from '../components/journey/RouteComparison';
import { saveJourney } from '../services/offline/idbStorage';
import { 
  PanelLeftClose, 
  PanelLeftOpen, 
  PanelRightClose, 
  PanelRightOpen, 
  Scale, 
  Bookmark, 
  Check, 
  Compass, 
  AlertCircle
} from 'lucide-react';
import { Button } from '../components/ui/Button';

export const JourneyPlanner: React.FC = () => {
  const navigate = useNavigate();
  const {
    originId,
    destinationId,
    routes,
    selectedRouteId,
    decision,
    setSelectedRouteId,
    searchJourneys,
    isLoading,
    error,
    isConstraintInspectorOpen,
    setConstraintInspectorOpen,
    isComparisonModalOpen,
    setComparisonModalOpen,
  } = useJourneyStore();

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [savedRouteId, setSavedRouteId] = useState<string | null>(null);

  // Automatically perform initial search on mount
  useEffect(() => {
    if (routes.length === 0) {
      searchJourneys();
    }
  }, []);

  const selectedRoute = routes.find(r => r.id === selectedRouteId) ||
    (decision && decision.status !== 'READY' ? null : routes[0]) || null;
  const affectedRouteIds = new Set(decision?.status === 'READY' ? []
    : decision?.missingFacts.flatMap((fact) => fact.affectedRouteIds) ?? []);
  const selectedNeedsConfirmation = selectedRoute ? affectedRouteIds.has(selectedRoute.id) : false;

  const handleSaveCurrentJourney = async () => {
    if (!selectedRoute) return;
    try {
      await saveJourney(
        selectedRoute, 
        getStationName(originId), 
        getStationName(destinationId)
      );
      setSavedRouteId(selectedRoute.id);
      setTimeout(() => setSavedRouteId(null), 3000);
    } catch {
      // IndexedDB save handling
    }
  };

  return (
    <div className="relative w-full flex-1 lg:min-h-[560px] lg:overflow-hidden bg-slate-100">
      <h1 className="sr-only">Plan a journey</h1>
      {/* 1. FULL-PAGE EDGE-TO-EDGE MAP (Spans whole screen underneath everything) */}
      <div className="relative h-[46vh] w-full lg:absolute lg:inset-0 lg:h-full z-0">
        <InteractiveMap
          routes={routes}
          selectedRouteId={selectedRouteId}
          onSelectRoute={(id) => setSelectedRouteId(id)}
          className="w-full h-full"
        />
      </div>

      {/* 2. FLOATING PANELS & COMPONENTS LAYER */}
      <div className="relative z-10 lg:absolute lg:inset-0 lg:pointer-events-none p-3 sm:p-5 flex flex-col lg:flex-row justify-between items-start gap-4 lg:overflow-hidden">

        {/* LEFT FLOATING PANEL — Journey Requirements Form */}
        {leftOpen ? (
          <aside 
            aria-label="Journey Planning Controls"
            className="pointer-events-auto w-full lg:w-[370px] lg:max-h-full bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-floating flex flex-col overflow-hidden animate-in fade-in slide-in-from-left-4 duration-200"
          >
            {/* Top Header */}
            <div className="p-3.5 border-b border-subtle-border flex items-center justify-between bg-slate-50/70">
              <span className="font-heading font-bold text-sm text-ink flex items-center gap-2">
                <Compass className="w-4 h-4 text-accent" />
                Journey Requirements
              </span>
              <button
                onClick={() => setLeftOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-ink hover:bg-slate-200 transition-colors"
                aria-label="Collapse search panel"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>

            {/* Form Scroll Area */}
            <div className="flex-1 overflow-y-auto">
              <SearchControls />
            </div>
          </aside>
        ) : (
          <button
            onClick={() => setLeftOpen(true)}
            aria-label="Expand journey controls"
            className="pointer-events-auto p-2.5 px-3.5 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-floating text-ink hover:text-accent hover:scale-105 transition-all flex items-center gap-2 text-xs font-semibold"
          >
            <PanelLeftOpen className="w-4 h-4 text-accent" />
            <span>Requirements</span>
          </button>
        )}

        {/* RIGHT FLOATING PANEL — Route Alternatives & Results */}
        {rightOpen ? (
          <aside
            aria-label="Route Results and Inspection"
            className="pointer-events-auto w-full lg:w-[390px] lg:max-h-full bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-floating flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200"
          >
            {/* Top Header */}
            <div className="p-3.5 border-b border-subtle-border flex items-center justify-between bg-slate-50/70">
              <span className="font-heading font-bold text-sm text-ink">
                Route Alternatives ({routes.length})
              </span>

              <div className="flex items-center gap-1.5">
                {routes.length > 1 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setComparisonModalOpen(true)}
                    className="h-7 text-xs px-2 gap-1 border-slate-300 bg-white"
                    title="Compare route tradeoffs"
                  >
                    <Scale className="w-3.5 h-3.5" />
                    Compare
                  </Button>
                )}

                <button
                  onClick={() => setRightOpen(false)}
                  className="p-1 rounded-md text-slate-400 hover:text-ink hover:bg-slate-200 transition-colors"
                  aria-label="Collapse results panel"
                >
                  <PanelRightClose className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Results Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Live Disruption Alert Banner */}
              <DisruptionBanner />

              {/* Dynamic Rerouting Diff Hero */}
              <WhatChangedDiff />

              {/* Loading state */}
              {isLoading && (
                <div className="space-y-3 py-6 text-center">
                  <div className="inline-block animate-spin w-8 h-8 border-4 border-accent border-t-transparent rounded-full mb-2" />
                  <div className="text-xs font-semibold text-ink">Finding your routes</div>
                  <div className="text-[11px] text-slate-500">Checking timetables, walking limits and reported disruptions</div>
                </div>
              )}

              {/* Error / Infeasible state */}
              {error && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-ink space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-disruption">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>No route found</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">{error}</p>
                </div>
              )}

              {/* Route Cards List */}
              {decision && decision.status !== 'READY' && (
                <section role="status" aria-label="Journey needs confirmation" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-ink space-y-2">
                  <h2 className="font-heading font-bold">Confirmation needed before recommending a route</h2>
                  {decision.missingFacts.map(fact => (
                    <div key={fact.question}>
                      <p className="font-semibold">{fact.question}</p>
                      {fact.whyItMatters && <p className="text-slate-700">{fact.whyItMatters}</p>}
                    </div>
                  ))}
                  <p className="text-slate-700">Routes remain visible for comparison. Ask a station operator to confirm real lift and boarding access. Itineraries that depend on this lift are held until then.</p>
                </section>
              )}
              {!isLoading && routes.length > 0 && (
                <div className="space-y-3">
                  {routes.map((route) => (
                    <RouteCard
                      key={route.id}
                      route={route}
                      confirmationRequired={affectedRouteIds.has(route.id)}
                      isSelected={route.id === selectedRouteId}
                      onSelect={() => setSelectedRouteId(route.id)}
                      onOpenInspector={() => setConstraintInspectorOpen(true)}
                      onViewDetails={affectedRouteIds.has(route.id) ? undefined : () => navigate(`/journey/${route.id}`)}
                    />
                  ))}
                </div>
              )}

              {/* Selected Route Actions (Save offline / Detailed navigation) */}
              {selectedRoute && !selectedNeedsConfirmation && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 lg:sticky lg:bottom-0 lg:z-10 lg:shadow-floating">
                  <div className="text-xs font-semibold text-slate-600">
                    Selected Route Actions
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSaveCurrentJourney}
                      className="w-full text-xs font-medium bg-white"
                    >
                      {savedRouteId === selectedRoute.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 mr-1 text-accessible" />
                          Saved
                        </>
                      ) : (
                        <>
                          <Bookmark className="w-3.5 h-3.5 mr-1 text-accent" />
                          Save Offline
                        </>
                      )}
                    </Button>

                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => navigate(`/journey/${selectedRoute.id}`)}
                      className="w-full text-xs font-semibold"
                    >
                      Start Itinerary
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        ) : (
          <button
            onClick={() => setRightOpen(true)}
            aria-label="Expand results panel"
            className="pointer-events-auto p-2.5 px-3.5 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-floating text-ink hover:text-accent hover:scale-105 transition-all flex items-center gap-2 text-xs font-semibold"
          >
            <PanelRightOpen className="w-4 h-4 text-accent" />
            <span>Routes ({routes.length})</span>
          </button>
        )}
      </div>

      {/* Signature Feature: Constraint Inspector Modal */}
      <ConstraintInspector
        route={selectedRoute}
        isOpen={isConstraintInspectorOpen}
        onClose={() => setConstraintInspectorOpen(false)}
      />

      {/* Route Tradeoff Comparison Modal */}
      <RouteComparison
        routes={routes}
        isOpen={isComparisonModalOpen}
        onClose={() => setComparisonModalOpen(false)}
        onSelectRoute={(id) => setSelectedRouteId(id)}
        selectedRouteId={selectedRouteId}
      />
    </div>
  );
};
