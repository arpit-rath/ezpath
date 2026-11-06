import React from 'react';
import { Link } from 'react-router-dom';
import { useOperatorStore } from '../stores/operatorStore';
import { FacilityStatusTable } from '../components/analytics/FacilityStatusTable';
import { ArrowLeft, Server, Activity, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { isDemoMode } from '../config/runtime';

export const NetworkStatus: React.FC = () => {
  const { facilities, triggerElevatorFailure, resolveDisruption, disruptions, isSimulating } = useOperatorStore();

  const handleToggleFacility = async (facilityId: string) => {
    const isDisrupted = disruptions.some(d => d.isActive && d.entityId === facilityId);
    if (isDisrupted) {
      const target = disruptions.find(d => d.isActive && d.entityId === facilityId);
      if (target) await resolveDisruption(target.id);
    } else {
      await triggerElevatorFailure(facilityId);
    }
  };

  return (
    <div className="product-page space-y-8">
      <div className="flex items-center justify-between">
        <Link to="/operator" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-ink">
          <ArrowLeft className="w-4 h-4" />
          Back to overview
        </Link>
      </div>

      <div data-reveal>
        <div className="text-xs font-semibold text-accent uppercase tracking-wider">
          Network facilities
        </div>
        <h1 className="product-title">
          Network infrastructure
        </h1>
        <p className="product-description">
          {isDemoMode
            ? 'Scenario facility status for elevators, ramps, and stairs across the demo corridor.'
            : 'Operator-reported campus disruptions. A verified facility inventory and IoT telemetry feed have not yet been connected.'}
        </p>
      </div>

      {facilities.length > 0 ? <FacilityStatusTable
        facilities={facilities}
        onToggleFacility={handleToggleFacility}
        isLoading={isSimulating}
      /> : (
        <div className="workspace-panel text-sm text-ink-secondary">
          No verified production facility records are available yet. Use the operator dashboard to report an outage against an exact graph identifier.
        </div>
      )}
    </div>
  );
};

