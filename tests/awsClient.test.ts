import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILES } from '../src/stores/journeyStore';
import { AwsApiClient } from '../src/services/api/awsClient';
import {
  AwsRouteResponse,
  buildAwsRouteRequest,
  mapAwsRouteResponse,
} from '../src/services/api/awsContract';
import { JourneySearchRequest } from '../src/types';


function searchRequest(strictVerification = true): JourneySearchRequest {
  return {
    originId: 'srm-library',
    destinationId: 'srm-medical-college-hospital',
    departureTime: '2026-11-06T09:00:00+05:30',
    profile: {
      ...DEFAULT_PROFILES.wheelchair,
      strictVerification,
      maxWalkingDistanceMeters: 2500,
    },
  };
}

function routeResponse(accessibility: 'ACCESSIBLE' | 'UNKNOWN' = 'UNKNOWN'): AwsRouteResponse {
  const unknown = accessibility === 'UNKNOWN';
  return {
    request_id: 'request-123',
    status: 'ok',
    graph: { version: 'osm-test-v1', source: 'OpenStreetMap via OSMnx', crs: 'epsg:4326' },
    snapped_points: {},
    routes: [{
      route_id: 'route-1',
      nodes: [100, 200],
      edges: [{
        from: 100,
        to: 200,
        key: 0,
        mode: 'walk',
        distance_m: 420.5,
        duration_min: 7.01,
        accessibility,
        reason_code: unknown ? 'ALLOWED_WITH_UNKNOWN_ACCESSIBILITY' : 'ACCESSIBILITY_TAG_SUPPORTED',
        osm_tags: { highway: 'footway' },
      }],
      metrics: {
        duration_min: 7.01,
        walking_distance_m: 420.5,
        uncertainty_points: unknown ? 100 : 0,
        unknown_accessibility_edges: unknown ? 1 : 0,
        transfer_count: 0,
      },
      accessibility: {
        status: unknown ? 'uncertain' : 'tag_supported',
        policy: unknown ? 'relaxed' : 'strict',
        wheelchair_profile: true,
        warnings: unknown ? ['1 route edge(s) have unknown wheelchair accessibility.'] : [],
      },
      geometry: {
        type: 'LineString',
        coordinates: [[80.0426, 12.8230], [80.0476, 12.8212]],
      },
      diagnostics: { search_expansions: 12, search_complete: true, label_cap_hit: false },
    }],
    status_overlay: { active_events: 1, blocking_events: 1, blocked_entity_ids: ['edge:1:2:0'] },
    message: null,
  };
}

describe('AWS route contract adapter', () => {
  it('translates selected SRM locations and strict profile to the backend contract', () => {
    const payload = buildAwsRouteRequest(searchRequest(true), 'request-123');

    expect(payload.request_id).toBe('request-123');
    expect(payload.origin).toEqual({ latitude: 12.8232845, longitude: 80.0425857 });
    expect(payload.destination).toEqual({ latitude: 12.8210402, longitude: 80.0479585 });
    expect(payload.profile).toEqual({
      wheelchair_user: true,
      unknown_accessibility_policy: 'strict',
      walking_speed_mps: 1,
    });
    expect(payload.constraints).toEqual({
      max_walking_distance_m: 2500,
      max_snap_distance_m: 100,
      max_routes: 3,
    });
  });

  it('keeps unknown OpenStreetMap evidence visibly unverified', () => {
    const routes = mapAwsRouteResponse(
      routeResponse('UNKNOWN'),
      searchRequest(false),
      '2026-11-06T04:00:00Z',
    );

    expect(routes[0].accessibilityStatus).toBe('uncertain');
    expect(routes[0].isStepFree).toBe(false);
    expect(routes[0].isFeasible).toBe(true);
    expect(routes[0].evidenceConfidence).toBe('low');
    expect(routes[0].reliabilityScore).toBeNull();
    expect(routes[0].explanation.evaluations[0].status).toBe('unverified');
  });

  it('uses POST /v1/routes and maps the canonical response', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(routeResponse('ACCESSIBLE')),
    } as Response));
    const client = new AwsApiClient({
      baseUrl: 'https://api.example.test/',
      fetchImpl: fetchImpl as typeof fetch,
      getToken: () => 'operator-token',
      requestId: () => 'request-123',
    });

    const result = await client.searchRoutes(searchRequest(true));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.example.test/v1/routes');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer operator-token' });
    expect(JSON.parse(String(init?.body)).origin).toEqual({
      latitude: 12.8232845,
      longitude: 80.0425857,
    });
    expect(result.graphVersion).toBe('osm-test-v1');
    expect(result.routes[0].accessibilityStatus).toBe('verified');
  });

  it('surfaces the backend error message', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ error: { message: 'SNAP_DISTANCE_EXCEEDED' } }),
    } as Response));
    const client = new AwsApiClient({
      baseUrl: 'https://api.example.test',
      fetchImpl: fetchImpl as typeof fetch,
      getToken: () => null,
    });

    await expect(client.searchRoutes(searchRequest())).rejects.toThrow('SNAP_DISTANCE_EXCEEDED');
  });

  it('calls the default browser fetch without binding it to the client', async () => {
    const browserFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async function (this: unknown) {
      // Browsers reject fetch when it is called as a method of another object.
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      return new Response(JSON.stringify({ status: 'ok', graph_version: 'osm-test-v1' }), { status: 200 });
    } as typeof fetch);

    try {
      const client = new AwsApiClient({ baseUrl: 'https://api.example.test', getToken: () => null });

      await expect(client.getHealth()).resolves.toMatchObject({ status: 'ok', mode: 'aws' });
      expect(browserFetch).toHaveBeenCalledTimes(1);
    } finally {
      browserFetch.mockRestore();
    }
  });
});
