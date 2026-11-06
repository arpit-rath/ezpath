export type TransportMode = 'walking' | 'bus' | 'train' | 'metro';

export type MobilityProfileId = 
  | 'standard' 
  | 'wheelchair' 
  | 'step_free' 
  | 'limited_walking' 
  | 'custom';

export interface AccessibilityConstraint {
  id: string;
  name: string;
  description: string;
  required: boolean; // hard requirement vs preference
  value?: string | number | boolean;
}

export interface TravellerProfile {
  id: MobilityProfileId;
  name: string;
  description: string;
  avoidStairs: boolean;
  requireStepFree: boolean;
  requireWheelchairBoarding: boolean;
  requireOperationalLiftOrRamp: boolean;
  maxWalkingDistanceMeters: number;
  maxBudgetINR: number;
  allowedModes: TransportMode[];
  strictVerification: boolean; // if true, exclude unknown records; if false, permit with uncertainty warning
}

export interface JourneySearchRequest {
  originId: string;
  destinationId: string;
  departureTime: string; // ISO string
  profile: TravellerProfile;
}

export type LegType = 'walk' | 'stairs' | 'elevator' | 'ramp' | 'bus' | 'train';

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationMinutes: number;
  stepFree: boolean;
  elevationChangeMeters?: number;
  facilityId?: string;
  facilityName?: string;
  hazardWarning?: string;
}

export interface RouteLeg {
  id: string;
  fromNodeId: string;
  fromNodeName: string;
  toNodeId: string;
  toNodeName: string;
  mode: TransportMode | 'elevator' | 'stairs' | 'ramp';
  legType: LegType;
  lineName?: string;
  lineColor?: string;
  durationMinutes: number;
  distanceMeters: number;
  fareINR: number;
  stepFree: boolean;
  wheelchairAccessible: boolean;
  elevatorId?: string;
  elevatorOperational?: boolean;
  evidenceSource: 'operator_iot' | 'station_audit' | 'municipal_survey' | 'crowdsourced' | 'openstreetmap' | 'unknown';
  evidenceTimestamp: string;
  confidenceScore: number | null; // null when confidence has not been measured
  geometry: [number, number][]; // [longitude, latitude]
  steps: RouteStep[];
}

export interface ConstraintEvaluation {
  constraintId: string;
  name: string;
  status: 'passed' | 'failed' | 'unverified';
  userLimit: string;
  routeValue: string;
  evidenceSource: string;
  lastUpdated: string;
  isHardRequirement: boolean;
  notes?: string;
}

export interface RouteExplanation {
  summary: string;
  evaluations: ConstraintEvaluation[];
  confidenceLevel: 'high' | 'moderate' | 'uncertain';
  unknownDataPoints: string[];
  reasons: string[];
}

export interface JourneyRoute {
  id: string;
  label: string; // e.g., 'Fastest accessible', 'Lowest cost', 'Least walking'
  categoryTags: ('fastest' | 'cheapest' | 'least_walking' | 'accessible')[];
  totalDurationMinutes: number;
  totalDistanceMeters: number;
  walkingDistanceMeters: number;
  totalFareINR: number;
  transfersCount: number;
  transportModes: TransportMode[];
  legs: RouteLeg[];
  isStepFree: boolean;
  isWheelchairAccessible: boolean;
  accessibilityStatus?: 'verified' | 'uncertain' | 'inaccessible';
  isFeasible: boolean;
  feasibilityReason?: string;
  reliabilityScore: number | null; // null when verification coverage is not measured
  evidenceConfidence: 'high' | 'medium' | 'low';
  explanation: RouteExplanation;
  geometry: [number, number][]; // Full route line
  departureTime: string;
  arrivalTime: string;
  dependentLifts: string[];
  affectedByDisruption?: boolean;
  disruptionReason?: string;
}

export interface RouteComparison {
  routes: JourneyRoute[];
  recommendedRouteId: string;
  tradeoffs: {
    durationVsWalking: string;
    costVsDuration: string;
    accessibilityDifference: string;
  };
}

export type FacilityType = 'elevator' | 'ramp' | 'stairs' | 'accessible_gate' | 'tactile_paving';

export interface FacilityStatus {
  id: string;
  name: string;
  stationId: string;
  stationName: string;
  type: FacilityType;
  operational: boolean;
  statusDescription: string;
  lastUpdated: string;
  verifiedBy: string;
  latitude: number;
  longitude: number;
}

export type DisruptionSeverity = 'critical' | 'warning' | 'info';

export interface DisruptionEvent {
  id: string;
  entityId: string; // facilityId, nodeId, or edgeId
  entityName: string;
  stationName?: string;
  type: 'elevator_outage' | 'path_closure' | 'entrance_closure' | 'service_delay' | 'bus_cancellation';
  severity: DisruptionSeverity;
  reason: string;
  effectiveStart: string;
  estimatedResolution?: string;
  affectedLinesOrStops: string[];
  impactOnAccessibility: string;
  isActive: boolean;
}

export interface NetworkNode {
  id: string;
  name: string;
  type: 'station' | 'bus_stop' | 'entrance' | 'platform' | 'intersection' | 'destination';
  coordinates: [number, number]; // [lng, lat]
  accessibilityStatus?: 'verified' | 'unknown' | 'inaccessible';
  isWheelchairAccessible: boolean | null;
  hasElevator: boolean;
  hasRamps: boolean;
  hasTactilePaving: boolean;
  facilities: FacilityStatus[];
  zone?: string;
}

export interface NetworkEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  mode: TransportMode | 'elevator' | 'stairs' | 'ramp';
  distanceMeters: number;
  durationMinutes: number;
  fareINR: number;
  stepFree: boolean;
  wheelchairAccessible: boolean;
  elevatorId?: string;
  hasStairs: boolean;
  evidenceSource: 'operator_iot' | 'station_audit' | 'municipal_survey' | 'crowdsourced' | 'openstreetmap' | 'unknown';
  lastUpdated: string;
  geometry: [number, number][];
  isOperational: boolean;
  lineName?: string;
  lineColor?: string;
}

export interface SavedJourney {
  id: string;
  routeId: string;
  originName: string;
  destinationName: string;
  departureTime: string;
  arrivalTime: string;
  totalDurationMinutes: number;
  totalFareINR: number;
  walkingDistanceMeters: number;
  transfersCount: number;
  transportModes: TransportMode[];
  dependentLifts: string[];
  legs: RouteLeg[];
  explanation: RouteExplanation;
  savedTimestamp: string;
  lastKnownStatus: 'normal' | 'disrupted' | 'unknown';
  geometry: [number, number][];
}

export interface DisruptionDiff {
  previousRoute: JourneyRoute;
  newRoute: JourneyRoute;
  durationChangeMinutes: number;
  fareChangeINR: number;
  walkingDistanceChangeMeters: number;
  transfersChange: number;
  stepFreeMaintained: boolean;
  affectedFacilityName: string;
  disruptionReason: string;
}

export type CommunityReportStatus =
  | 'AWAITING_UPLOAD'
  | 'PENDING_REVIEW'
  | 'VERIFIED'
  | 'REJECTED';

export interface CommunityReport {
  reportId: string;
  status: CommunityReportStatus;
  description: string;
  locationId: string;
  locationName: string;
  latitude: number;
  longitude: number;
  photoUrl: string;
  contentType: string;
  createdAt: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

