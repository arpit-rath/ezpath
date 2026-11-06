import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOperatorStore } from '../stores/operatorStore';
import { DEMO_SCENARIOS } from '../data/demoNetwork';
import { 
  ShieldAlert, 
  RotateCcw, 
  AlertTriangle, 
  Activity, 
  Building2, 
  CheckCircle2, 
  XCircle, 
  Radio, 
  BarChart2, 
  Plus, 
  X,
  Server,
  LogIn,
  LogOut,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { authService } from '../services/auth/cognito';
import { isDemoMode } from '../config/runtime';
import { DisruptionEvent } from '../types';
import { CommunityReportQueue } from '../components/reports/CommunityReportQueue';

export const OperatorDashboard: React.FC = () => {
  const {
    nodes,
    edges,
    facilities,
    disruptions,
    selectedScenarioId,
    applyScenario,
    resetDemo,
    resolveDisruption,
    createDisruption,
    isSimulating
  } = useOperatorStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [newDisruption, setNewDisruption] = useState({
    entityId: isDemoMode ? 'elev_a1' : '',
    entityName: isDemoMode ? 'Elevator A1 (Platform 1-2 & Concourse)' : '',
    stationName: isDemoMode ? 'Central Station' : 'SRM Kattankulathur',
    type: 'elevator_outage' as DisruptionEvent['type'],
    severity: 'critical' as DisruptionEvent['severity'],
    reason: isDemoMode ? 'Routine sensor recalibration and maintenance' : '',
    affectedLinesOrStops: isDemoMode ? ['Central Station Metro Link'] : [],
    impactOnAccessibility: isDemoMode ? 'Wheelchair access requires alternate ramp.' : '',
  });

  const currentUser = authService.getCurrentUser();
  const isAuthenticated = authService.isAuthenticated();
  const operatorName = !isDemoMode && !isAuthenticated ? 'Operator sign-in required' : currentUser.name;
  const canWrite = isDemoMode || isAuthenticated;
  const activeDisruptions = disruptions.filter(d => d.isActive);
  const operationalLifts = facilities.filter(f => f.type === 'elevator' && f.operational).length;
  const unavailableLifts = facilities.filter(f => f.type === 'elevator' && !f.operational).length;
  const closedSegments = edges.filter(e => !e.isOperational).length;

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createDisruption({
      ...newDisruption,
      effectiveStart: new Date().toISOString(),
      isActive: true,
    });
    setIsModalOpen(false);
  };

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await authService.beginSignIn();
    } catch (reason) {
      setAuthError(reason instanceof Error ? reason.message : 'Operator sign-in could not start.');
    }
  };

  const metrics = isDemoMode ? [
    { label: 'Active disruptions', value: activeDisruptions.length, detail: 'Requiring attention', alert: activeDisruptions.length > 0 },
    { label: 'Operational lifts', value: operationalLifts, detail: 'Available across the network', alert: false },
    { label: 'Unavailable lifts', value: unavailableLifts, detail: 'Awaiting restoration', alert: unavailableLifts > 0 },
    { label: 'Closed segments', value: closedSegments, detail: 'Alternative route required', alert: closedSegments > 0 },
    { label: 'Accessibility coverage', value: '94.2%', detail: 'Demo audit coverage', alert: false },
  ] : [
    { label: 'Active disruptions', value: activeDisruptions.length, detail: 'Operator-reported events', alert: activeDisruptions.length > 0 },
    { label: 'Catalog locations', value: nodes.length, detail: 'Source-backed selection points', alert: false },
    { label: 'Tracked facilities', value: facilities.length, detail: 'Verified inventory not connected', alert: false },
    { label: 'Closed segments', value: activeDisruptions.filter(event => event.type === 'path_closure' || event.type === 'entrance_closure').length, detail: 'Active reported closures', alert: activeDisruptions.some(event => event.type === 'path_closure' || event.type === 'entrance_closure') },
    { label: 'Accessibility coverage', value: 'Not measured', detail: 'No physical audit claim', alert: false },
  ];

  return (
    <div className="product-page operator-page">
      <div data-reveal className="operator-heading">
        <div><h1 className="product-title">A clearer view of your network.</h1>
          <p className="product-description">Monitor access. Manage disruptions. Keep every journey moving.</p>
          <div className="operator-session"><span className="status-dot" /> {operatorName}<span className="session-divider" /><span>{isDemoMode ? 'Demo workspace' : 'AWS operator workspace'}</span></div>
        </div>
        <nav className="operator-actions" aria-label="Operator tools">
          <Link to="/operator/network" className="workspace-link"><Server size={15} /> Infrastructure</Link>
          <Link to="/operator/analytics" className="workspace-link"><BarChart2 size={15} /> Analytics</Link>
          {!isDemoMode && !isAuthenticated && (
            <Button size="sm" variant="operator" onClick={handleSignIn}>
              <LogIn size={14} /> Sign in with Cognito
            </Button>
          )}
          {!isDemoMode && isAuthenticated && (
            <Button size="sm" variant="outline" onClick={() => authService.signOut(true)}>
              <LogOut size={14} /> Sign out
            </Button>
          )}
          {isDemoMode && <Button size="sm" variant="outline" onClick={() => resetDemo()} isLoading={isSimulating}><RotateCcw size={14} /> Reset demo</Button>}
        </nav>
      </div>
      {authError && <div className="disruption-banner" role="alert">{authError}</div>}
      <div data-reveal className="operator-metrics">
        {metrics.map(metric => <div key={metric.label} className="operator-metric"><span>{metric.label}</span><strong className={metric.alert ? 'text-disruption' : ''}>{metric.value}</strong><small>{metric.detail}</small></div>)}
      </div>
      {/* Hackathon Demo Scenario Presets */}
      {isDemoMode && <div data-reveal className="workspace-panel space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>

            <h2 className="font-heading font-medium text-xl text-ink">
              Explore a network scenario
            </h2>
            <p className="product-description">Test how the planner responds when access changes.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {DEMO_SCENARIOS.map((scenario) => {
            const isSelected = selectedScenarioId === scenario.id;
            return (
              <button
                type="button"
                aria-pressed={isSelected}
                disabled={isSimulating}
                key={scenario.id}
                onClick={() => applyScenario(scenario.id)}
                className={`scenario-option ${isSelected ? 'is-selected' : ''}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <span className="font-heading font-medium text-base text-ink">
                    {scenario.name.replace(/^Scenario \d+: /, '').replace(' (Hero Hackathon Demo)', '')}
                  </span>
                  {isSelected && (
                    <Badge variant="accent" className="bg-accent text-white border-transparent">Active</Badge>
                  )}
                </div>
                <span className="block text-sm text-ink-secondary leading-relaxed">
                  {scenario.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>}

      {/* Active Disruptions Management Panel */}
      <div data-reveal className="workspace-panel space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-disruption" />
            <h2 className="font-heading font-bold text-lg text-ink">
              Network disruptions <span className="text-ink-muted">({activeDisruptions.length})</span>
            </h2>
          </div>

          <Button
            size="sm"
            variant="operator"
            onClick={() => setIsModalOpen(true)}
            disabled={!canWrite}
            title={canWrite ? 'Report a disruption' : 'Cognito operator sign-in is required'}
            className="text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Report disruption
          </Button>
        </div>

        {activeDisruptions.length === 0 ? (
          <div className="network-empty">
            <CheckCircle2 className="w-8 h-8 text-accessible mx-auto mb-2" />
            <div>{isDemoMode
              ? 'No active disruptions on the demo network. All scenario facilities are operational.'
              : 'No active operator-reported disruptions. This does not confirm that every campus facility is operational.'}</div>
          </div>
        ) : (
          <div className="space-y-3">
            {activeDisruptions.map((disruption) => (
              <div
                key={disruption.id}
                className="p-4 rounded-xl bg-operator-card border border-rose-900/40 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-ink">{disruption.entityName}</span>
                    <Badge variant="disruption">{disruption.severity}</Badge>
                    <span className="text-ink-muted text-[11px]">{disruption.stationName}</span>
                  </div>
                  <p className="text-ink-secondary">{disruption.reason}</p>
                  <p className="text-disruption text-[11px] font-medium">Impact: {disruption.impactOnAccessibility}</p>
                </div>

                <div className="shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resolveDisruption(disruption.id)}
                    disabled={!canWrite}
                    className="border-emerald-600/40 text-accessible bg-accessible-subtle hover:bg-accessible-subtle text-xs"
                  >
                    Resolve & Restore
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isDemoMode && <CommunityReportQueue enabled={isAuthenticated} />}

      {/* Manual Report Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div role="dialog" aria-modal="true" aria-labelledby="report-heading" className="w-full max-w-lg bg-operator-surface rounded-2xl border border-operator-border p-6 space-y-4 text-operator-ink shadow-floating">
            <div className="flex items-center justify-between border-b border-operator-border pb-3">
              <h3 id="report-heading" className="font-heading font-bold text-lg text-ink">
                Dispatch New Network Disruption
              </h3>
              <button aria-label="Close disruption report" onClick={() => setIsModalOpen(false)} className="text-ink-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-ink-muted mb-1">Affected Facility</label>
                {facilities.length > 0 ? (
                  <select
                    value={newDisruption.entityId}
                    onChange={(e) => {
                      const fac = facilities.find(f => f.id === e.target.value);
                      setNewDisruption({
                        ...newDisruption,
                        entityId: e.target.value,
                        entityName: fac ? fac.name : e.target.value,
                        stationName: fac ? fac.stationName : 'Transit Node'
                      });
                    }}
                    className="w-full p-2.5 rounded-lg bg-operator-bg border border-operator-border text-ink text-xs"
                  >
                    {facilities.map(fac => (
                      <option key={fac.id} value={fac.id}>
                        {fac.name} &mdash; {fac.stationName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={newDisruption.entityId}
                    onChange={(e) => setNewDisruption({ ...newDisruption, entityId: e.target.value })}
                    placeholder="Exact graph identifier, for example node:123"
                    className="w-full p-2.5 rounded-lg bg-operator-bg border border-operator-border text-ink text-xs"
                    required
                  />
                )}
              </div>

              {!isDemoMode && (
                <div>
                  <label className="block text-ink-muted mb-1">Facility or path name</label>
                  <input
                    type="text"
                    value={newDisruption.entityName}
                    onChange={(e) => setNewDisruption({ ...newDisruption, entityName: e.target.value })}
                    className="w-full p-2.5 rounded-lg bg-operator-bg border border-operator-border text-ink text-xs"
                    required
                  />
                </div>
              )}

              {!isDemoMode && (
                <div>
                  <label className="block text-ink-muted mb-1">Disruption type</label>
                  <select
                    value={newDisruption.type}
                    onChange={(e) => setNewDisruption({
                      ...newDisruption,
                      type: e.target.value as DisruptionEvent['type'],
                    })}
                    className="w-full p-2.5 rounded-lg bg-operator-bg border border-operator-border text-ink text-xs"
                  >
                    <option value="elevator_outage">Elevator outage</option>
                    <option value="path_closure">Path closure</option>
                    <option value="entrance_closure">Entrance closure</option>
                    <option value="service_delay">Service delay</option>
                    <option value="bus_cancellation">Bus cancellation</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-ink-muted mb-1">Disruption Reason</label>
                <input
                  type="text"
                  value={newDisruption.reason}
                  onChange={(e) => setNewDisruption({ ...newDisruption, reason: e.target.value })}
                  className="w-full p-2.5 rounded-lg bg-operator-bg border border-operator-border text-ink text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-ink-muted mb-1">Accessibility Impact Description</label>
                <textarea
                  value={newDisruption.impactOnAccessibility}
                  onChange={(e) => setNewDisruption({ ...newDisruption, impactOnAccessibility: e.target.value })}
                  className="w-full p-2.5 rounded-lg bg-operator-bg border border-operator-border text-ink text-xs h-20"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-operator-border">
                <Button type="button" size="sm" variant="ghost" onClick={() => setIsModalOpen(false)} className="text-ink-muted hover:text-ink">
                  Cancel
                </Button>
                <Button size="sm" variant="danger" type="submit">
                  Dispatch Outage
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

