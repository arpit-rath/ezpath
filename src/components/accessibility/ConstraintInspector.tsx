import React from 'react';
import { JourneyRoute } from '../../types';
import { 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  HelpCircle, 
  X, 
  Clock, 
  Database,
  Info
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface ConstraintInspectorProps {
  route: JourneyRoute | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ConstraintInspector: React.FC<ConstraintInspectorProps> = ({
  route,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !route) return null;

  const { explanation } = route;
  const isUncertain = route.accessibilityStatus === 'uncertain';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="constraint-inspector-title"
    >
      <div 
        className="w-full max-w-2xl bg-white rounded-2xl shadow-floating border border-subtle-border overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="p-5 border-b border-subtle-border bg-slate-50/70 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accessible-subtle border border-accessible-border text-accessible flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold text-accessible uppercase tracking-wider">
                Accessibility Evidence & Constraint Verification
              </div>
              <h2 id="constraint-inspector-title" className="font-heading font-extrabold text-lg text-ink">
                Why does this route work for you?
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-ink hover:bg-slate-200 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-ink">
          {/* Summary Banner */}
          <div className={`p-4 rounded-xl border flex items-start gap-3 ${
            route.isFeasible && !isUncertain
              ? 'bg-emerald-50/80 border-emerald-200 text-accessible' 
              : isUncertain
              ? 'bg-amber-50/80 border-amber-200 text-warning'
              : 'bg-rose-50/80 border-rose-200 text-disruption'
          }`}>
            {route.isFeasible && !isUncertain ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            )}
            <div className="text-xs space-y-1">
              <div className="font-bold text-sm">
                {isUncertain
                  ? 'Route Allowed with Unverified Accessibility Evidence'
                  : route.isFeasible
                  ? 'All Required Accessibility Criteria Satisfied'
                  : 'Requirement Violation Detected'}
              </div>
              <p className="text-slate-700 leading-relaxed">
                {explanation.summary}
              </p>
            </div>
          </div>

          {/* Detailed Constraint Evaluations List */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
              Constraint Verification Breakdown
            </div>

            <div className="space-y-2.5">
              {explanation.evaluations.map((evalItem) => {
                const isPassed = evalItem.status === 'passed';
                const isUnverified = evalItem.status === 'unverified';

                return (
                  <div
                    key={evalItem.constraintId}
                    className="p-3.5 rounded-xl border border-subtle-border bg-white hover:bg-slate-50/50 transition-colors shadow-subtle space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        {isPassed ? (
                          <CheckCircle2 className="w-4 h-4 text-accessible shrink-0 mt-0.5" />
                        ) : isUnverified ? (
                          <HelpCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-disruption shrink-0 mt-0.5" />
                        )}

                        <div>
                          <div className="text-xs font-bold text-ink">
                            {evalItem.name}
                          </div>
                          <div className="text-xs text-ink-secondary mt-0.5">
                            {evalItem.routeValue}
                          </div>
                        </div>
                      </div>

                      <div>
                        {isPassed ? (
                          <Badge variant="accessible">Verified Pass</Badge>
                        ) : isUnverified ? (
                          <Badge variant="warning">Unverified</Badge>
                        ) : (
                          <Badge variant="disruption">Failed</Badge>
                        )}
                      </div>
                    </div>

                    {/* Metadata & Evidence Line */}
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100 flex-wrap gap-2">
                      <span className="flex items-center gap-1">
                        <Database className="w-3 h-3 text-slate-400" />
                        Evidence: <strong>{evalItem.evidenceSource}</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        Updated: <strong>{evalItem.lastUpdated}</strong>
                      </span>
                    </div>

                    {evalItem.notes && (
                      <div className="text-[11px] text-disruption bg-rose-50 p-2 rounded border border-rose-100">
                        {evalItem.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Transparency & Evidence Confidence Notice */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-ink">
              <Info className="w-4 h-4 text-accent" />
              <span>Transparent Accessibility Scoring</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              {route.accessibilityStatus
                ? 'Ezpath uses recorded OpenStreetMap tags and the current operator disruption overlay. Missing tags remain unverified, and tag-supported results do not imply an on-site physical audit.'
                : 'Ezpath does not guess or assume accessibility. Demo evidence is evaluated against the scenario network and its simulated facility status.'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-subtle-border bg-slate-50 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close Inspector
          </Button>
        </div>
      </div>
    </div>
  );
};

