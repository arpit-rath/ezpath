import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useJourneyStore, getStationName } from '../stores/journeyStore';
import { ItineraryTimeline } from '../components/journey/ItineraryTimeline';
import { saveJourney, isOffline } from '../services/offline/idbStorage';
import { 
  ArrowLeft, 
  Bookmark, 
  Check, 
  WifiOff, 
  Clock, 
  IndianRupee, 
  Footprints, 
  ShieldCheck, 
  AlertTriangle,
  Printer
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { fareLabel } from '../utils/fare';

export const JourneyDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { routes, originId, destinationId } = useJourneyStore();
  const [isSaved, setIsSaved] = useState(false);
  const [offline, setOffline] = useState(isOffline());

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const route = routes.find(r => r.id === id) || routes[0];

  if (!route) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h2 className="font-heading font-bold text-2xl text-ink">Journey Not Found</h2>
        <p className="text-slate-600 text-sm">Please return to the planner to search for accessible routes.</p>
        <Link to="/plan">
          <Button variant="primary">Return to Journey Planner</Button>
        </Link>
      </div>
    );
  }

  const handleSave = async () => {
    try {
      await saveJourney(
        route, 
        getStationName(originId), 
        getStationName(destinationId)
      );
      setIsSaved(true);
    } catch {
      // Save handling
    }
  };

  return (
    <div className="product-page journey-details space-y-7">
      {/* Top back navigation and actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link 
          to="/plan" 
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Planner
        </Link>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.print()}
            className="text-xs gap-1 border-slate-300"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </Button>

          <Button
            size="sm"
            variant={isSaved ? 'secondary' : 'primary'}
            onClick={handleSave}
            className="text-xs gap-1"
          >
            {isSaved ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Saved for Offline Use
              </>
            ) : (
              <>
                <Bookmark className="w-3.5 h-3.5" />
                Save Journey
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Offline Status Warning Bar if client is offline */}
      {offline && (
        <div className="p-3.5 rounded-xl bg-warning-subtle border border-warning-border text-xs text-warning flex items-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            You are currently offline. Viewing cached journey itinerary. Live lift telemetry and disruption recalculation are disabled.
          </span>
        </div>
      )}

      {/* Main Journey Header Summary */}
      <div data-reveal className="journey-panel space-y-6">
        <div className="journey-summary-heading">
          <div>
            <div className="text-xs font-semibold text-accent uppercase tracking-wider">
              {route.label}
            </div>
            <h1 className="journey-title">
              {getStationName(originId)} → {getStationName(destinationId)}
            </h1>
          </div>

          <div className="journey-status">
            {(route.accessibilityStatus ?? (route.isStepFree ? 'verified' : 'inaccessible')) === 'verified' ? (
              <Badge variant="accessible">{route.accessibilityStatus ? 'Tag-supported' : 'Step-free'}</Badge>
            ) : route.accessibilityStatus === 'uncertain' ? (
              <Badge variant="warning">Accessibility unverified</Badge>
            ) : (
              <Badge variant="disruption">Contains Stairs</Badge>
            )}
            <Badge variant="accent">{route.evidenceConfidence.charAt(0).toUpperCase() + route.evidenceConfidence.slice(1).toLowerCase()} confidence</Badge>
          </div>
        </div>

        {/* Metrics Bar */}
        <div className="journey-metrics">
          <div className="journey-metric">
            <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1 mb-1">
              <Clock className="w-3.5 h-3.5 text-accent" /> Total Time
            </div>
            <div className="font-heading font-extrabold text-xl text-ink">
              {route.totalDurationMinutes} min
            </div>
            <div className="text-[10px] text-ink-muted">
              {route.departureTime} &ndash; {route.arrivalTime}
            </div>
          </div>

          <div className="journey-metric">
            <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1 mb-1">
              <IndianRupee className="w-3.5 h-3.5 text-emerald-600" /> Fare
            </div>
            <div className="font-heading font-extrabold text-xl text-ink">
              {fareLabel(route.totalFareINR, route.fareStatus)}
            </div>
            <div className="text-[10px] text-ink-muted">
              {route.fareStatus === 'partial' ? 'Bus and suburban fares are not published' : route.transportModes.length === 1 && route.accessibilityStatus ? 'Walking route' : route.accessibilityStatus ? 'Published metro fare' : 'Integrated tariff'}
            </div>
          </div>

          <div className="journey-metric">
            <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1 mb-1">
              <Footprints className="w-3.5 h-3.5 text-accent" /> Walking
            </div>
            <div className="font-heading font-extrabold text-xl text-ink">
              {route.walkingDistanceMeters} m
            </div>
            <div className="text-[10px] text-ink-muted">
              {route.accessibilityStatus ? 'Total walking on this journey' : 'Max slope < 1:14'}
            </div>
          </div>

          <div className="journey-metric">
            <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1 mb-1">
              <span className="font-bold">⇌</span> Transfers
            </div>
            <div className="font-heading font-extrabold text-xl text-ink">
              {route.transfersCount}
            </div>
            <div className="text-[10px] text-ink-muted">
              {route.accessibilityStatus ? 'Changes between vehicles' : 'Level platform changes'}
            </div>
          </div>
        </div>
      </div>

      {route.dataNotes && route.dataNotes.length > 0 && (
        <section className="journey-panel space-y-2" aria-label="About this journey's data">
          <h2 className="font-heading font-bold text-sm text-ink">About this information</h2>
          <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600">
            {route.dataNotes.map(note => <li key={note}>{note}</li>)}
          </ul>
        </section>
      )}

      {/* Turn-by-Turn Text Itinerary */}
      <div className="journey-panel space-y-6">
        <h2 className="font-heading font-bold text-lg text-ink">
          Your journey, step by step
        </h2>
        <ItineraryTimeline legs={route.legs} />
      </div>
    </div>
  );
};

