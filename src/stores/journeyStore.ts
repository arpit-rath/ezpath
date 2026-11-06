import { create } from 'zustand';
import { 
  TravellerProfile, 
  JourneyRoute, 
  DisruptionDiff, 
  DisruptionEvent 
} from '../types';
import { getApiClient } from '../services/api';
import {
  DEFAULT_DESTINATION_ID,
  DEFAULT_ORIGIN_ID,
  getJourneyLocationName,
} from '../data/networkLocations';
import { isDemoMode } from '../config/runtime';

export const DEFAULT_PROFILES: Record<string, TravellerProfile> = {
  standard: {
    id: 'standard',
    name: 'Standard travel',
    description: 'Fastest routes without specific physical accessibility restrictions.',
    avoidStairs: false,
    requireStepFree: false,
    requireWheelchairBoarding: false,
    requireOperationalLiftOrRamp: false,
    maxWalkingDistanceMeters: 2000,
    maxBudgetINR: 100,
    allowedModes: ['walking', 'bus', 'train', 'metro'],
    strictVerification: false,
  },
  wheelchair: {
    id: 'wheelchair',
    name: 'Wheelchair user',
    description: '100% step-free, operational elevators or ramps, level vehicle boarding.',
    avoidStairs: true,
    requireStepFree: true,
    requireWheelchairBoarding: true,
    requireOperationalLiftOrRamp: true,
    maxWalkingDistanceMeters: 600,
    maxBudgetINR: 50,
    allowedModes: ['walking', 'bus', 'train', 'metro'],
    strictVerification: true,
  },
  step_free: {
    id: 'step_free',
    name: 'Step-free travel',
    description: 'Ramps and elevators preferred; strictly avoids stairs and steps.',
    avoidStairs: true,
    requireStepFree: true,
    requireWheelchairBoarding: false,
    requireOperationalLiftOrRamp: true,
    maxWalkingDistanceMeters: 800,
    maxBudgetINR: 60,
    allowedModes: ['walking', 'bus', 'train', 'metro'],
    strictVerification: true,
  },
  limited_walking: {
    id: 'limited_walking',
    name: 'Limited walking',
    description: 'Minimizes walking distances and transfers. Bench/seating friendly.',
    avoidStairs: true,
    requireStepFree: false,
    requireWheelchairBoarding: false,
    requireOperationalLiftOrRamp: true,
    maxWalkingDistanceMeters: 300,
    maxBudgetINR: 80,
    allowedModes: ['walking', 'bus', 'train', 'metro'],
    strictVerification: false,
  },
  custom: {
    id: 'custom',
    name: 'Custom requirements',
    description: 'Fine-tune specific walking thresholds, budgets, and hardware criteria.',
    avoidStairs: true,
    requireStepFree: true,
    requireWheelchairBoarding: true,
    requireOperationalLiftOrRamp: true,
    maxWalkingDistanceMeters: 600,
    maxBudgetINR: 50,
    allowedModes: ['walking', 'bus', 'train', 'metro'],
    strictVerification: true,
  }
};

interface JourneyState {
  originId: string;
  destinationId: string;
  profile: TravellerProfile;
  departureTime: string;
  routes: JourneyRoute[];
  selectedRouteId: string | null;
  hoveredRouteId: string | null;
  isLoading: boolean;
  isReplanning: boolean;
  error: string | null;
  activeDisruptionAlert: DisruptionEvent | null;
  lastDisruptionDiff: DisruptionDiff | null;
  isConstraintInspectorOpen: boolean;
  isComparisonModalOpen: boolean;

  // Actions
  setOriginId: (id: string) => void;
  setDestinationId: (id: string) => void;
  swapLocations: () => void;
  setProfile: (profileId: string) => void;
  updateProfileConstraint: <K extends keyof TravellerProfile>(key: K, value: TravellerProfile[K]) => void;
  setSelectedRouteId: (id: string | null) => void;
  setHoveredRouteId: (id: string | null) => void;
  setConstraintInspectorOpen: (open: boolean) => void;
  setComparisonModalOpen: (open: boolean) => void;
  clearDisruptionDiff: () => void;
  
  // Async workflows
  searchJourneys: () => Promise<void>;
  handleDisruptionNotification: (events: DisruptionEvent[]) => Promise<void>;
  replanJourney: () => Promise<void>;
}

export const useJourneyStore = create<JourneyState>((set, get) => ({
  originId: DEFAULT_ORIGIN_ID,
  destinationId: DEFAULT_DESTINATION_ID,
  profile: isDemoMode ? DEFAULT_PROFILES.wheelchair : DEFAULT_PROFILES.standard,
  departureTime: new Date().toISOString(),
  routes: [],
  selectedRouteId: null,
  hoveredRouteId: null,
  isLoading: false,
  isReplanning: false,
  error: null,
  activeDisruptionAlert: null,
  lastDisruptionDiff: null,
  isConstraintInspectorOpen: false,
  isComparisonModalOpen: false,

  setOriginId: (id) => set({ originId: id }),
  setDestinationId: (id) => set({ destinationId: id }),
  swapLocations: () => {
    const { originId, destinationId } = get();
    set({ originId: destinationId, destinationId: originId });
  },
  setProfile: (profileId) => {
    const template = DEFAULT_PROFILES[profileId] || DEFAULT_PROFILES.custom;
    set({ profile: { ...template } });
  },
  updateProfileConstraint: (key, value) => {
    set((state) => ({
      profile: {
        ...state.profile,
        [key]: value,
        id: 'custom' // Switch to custom when modified
      }
    }));
  },
  setSelectedRouteId: (id) => set({ selectedRouteId: id }),
  setHoveredRouteId: (id) => set({ hoveredRouteId: id }),
  setConstraintInspectorOpen: (open) => set({ isConstraintInspectorOpen: open }),
  setComparisonModalOpen: (open) => set({ isComparisonModalOpen: open }),
  clearDisruptionDiff: () => set({ lastDisruptionDiff: null }),

  searchJourneys: async () => {
    const { originId, destinationId, profile } = get();
    const departureTime = isDemoMode ? get().departureTime : new Date().toISOString();
    set({ isLoading: true, error: null, departureTime });

    try {
      const client = getApiClient();
      const result = await client.searchRoutes({
        originId,
        destinationId,
        departureTime,
        profile
      });

      const selectedId = result.routes.length > 0 ? result.routes[0].id : null;
      set({
        routes: result.routes, 
        selectedRouteId: selectedId,
        error: result.routes.length === 0
          ? result.message || 'No route satisfies the selected accessibility constraints.'
          : null,
        isLoading: false 
      });
    } catch (err: any) {
      set({ 
        error: err.message || 'Failed to calculate journeys. Please check your constraints.',
        isLoading: false 
      });
    }
  },

  handleDisruptionNotification: async (events: DisruptionEvent[]) => {
    const { routes, selectedRouteId } = get();
    if (!routes || routes.length === 0) return;

    const selectedRoute = routes.find(r => r.id === selectedRouteId);
    if (!selectedRoute) return;

    // Check if any active disruption affects a dependent lift or node of selectedRoute
    const criticalDisruption = events.find(event => {
      if (!event.isActive) return false;
      return selectedRoute.dependentLifts.includes(event.entityId) ||
             selectedRoute.legs.some(leg => leg.fromNodeId === event.entityId || leg.toNodeId === event.entityId);
    });

    if (criticalDisruption) {
      set({ 
        activeDisruptionAlert: criticalDisruption,
        // Mark selected route as invalid / affected
        routes: routes.map(r => r.id === selectedRouteId ? {
          ...r,
          isFeasible: false,
          affectedByDisruption: true,
          disruptionReason: criticalDisruption.reason
        } : r)
      });
    } else {
      set({ activeDisruptionAlert: null });
    }
  },

  replanJourney: async () => {
    const { originId, destinationId, profile, departureTime, selectedRouteId } = get();
    if (!selectedRouteId) return;

    set({ isReplanning: true, error: null });

    try {
      const client = getApiClient();
      const result = await client.replanRoute(selectedRouteId, {
        originId,
        destinationId,
        departureTime,
        profile
      });

      // Update state with new route and detailed diff
      set({
        routes: [result.newRoute],
        selectedRouteId: result.newRoute.id,
        lastDisruptionDiff: result.diff,
        activeDisruptionAlert: null,
        isReplanning: false
      });
    } catch (err: any) {
      set({
        error: err.message || 'No accessible alternative route found matching your strict requirements.',
        isReplanning: false
      });
    }
  }
}));

export function getStationName(id: string): string {
  return getJourneyLocationName(id);
}

