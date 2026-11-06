# Accessible Routing Engine (integration-ready walking component)

This package owns **pedestrian graph extraction, graph validation, coordinate snapping, accessibility evaluation, constrained multi-label A* traversal, route reconstruction, and a stable JSON response contract**.

It deliberately does not own the frontend map, AWS credentials, user authentication, live alerts, or GTFS bus/train schedules. Those systems call this component through the JSON service contract or HTTP API.

## 1. Project layout

```text
routing/
├── config/
│   ├── campus.json            # fixed build coverage and S3 object key
│   └── campus-locations.json  # source-backed frontend location catalog
├── data/                    # generated locally; published to S3, not Git
│   ├── campus.graphml
│   └── campus.manifest.json
├── scripts/
│   ├── download_graph.py
│   ├── inspect_graph.py
│   ├── upload_graph.py
│   └── route_demo.py
├── src/routing/
│   ├── graph.py          # OSM extraction, loading, snapping
│   ├── accessibility.py  # edge feasibility and reason codes
│   ├── router.py         # multi-label A* and Pareto pruning
│   ├── service.py        # framework-independent JSON contract
│   └── api.py            # optional FastAPI adapter
├── tests/test_routing.py
├── contracts/               # JSON Schemas shared with frontend/backend
├── examples/route_request.json
├── pyproject.toml
└── requirements.txt
```

## 2. Install

From the `traversal/routing` package directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -e '.[api,build,test]'
```

PowerShell:

```powershell
.venv\Scripts\Activate.ps1
python -m pip install -e ".[api,build,test]"
```

Editable installation resolves `routing` imports without manually setting `PYTHONPATH`.

## 3. Download and inspect the graph

```bash
python scripts/download_graph.py
python scripts/inspect_graph.py
```

The downloader uses the explicit SRM Kattankulathur center and radius in `config/campus.json`, not an ambiguous place-name geocoder. It validates the directed `MultiDiGraph`, verifies every source-backed catalog location can snap to one strongly connected walking component, and writes `data/campus.graphml` plus `data/campus.manifest.json`. The manifest records source/license, coverage, graph version, connectivity counts, byte size, and SHA-256. These generated files are ignored by Git and belong in the versioned S3 graph bucket. Downloading requires internet access.

Use `--force` to deliberately replace a local artifact with a fresh OpenStreetMap snapshot:

```bash
python scripts/download_graph.py --force
```

Preview the S3 publication commands after CDK deployment:

```powershell
python scripts/upload_graph.py `
  --bucket <GraphBucketName-output> `
  --profile ezpath-dev `
  --region ap-south-1
```

The upload helper is a dry run by default. Add `--execute` only after checking the bucket, profile, region, and printed commands. It verifies the graph SHA-256 before invoking the AWS CLI. No AWS credentials are stored in the repository.

## 4. Run the local route demo

```bash
python scripts/route_demo.py \
  --start-lat 12.8230 --start-lon 80.0440 \
  --end-lat 12.8250 --end-lon 80.0470 \
  --unknown-policy relaxed \
  --max-walking-m 2500 \
  --max-snap-m 100 \
  --routes 3
```

The sample coordinates are illustrative. Choose points near mapped paths. `--max-snap-m` defaults to 50 metres. If the selected point is farther away, the service rejects it rather than quietly starting the route at a distant location. For your earlier sample, the snapped start was about 77 m away, so use a 100 m cap for that test or choose a closer point.

## 5. Stable request/response contract

The frontend/backend sends this JSON to the routing service. The canonical schemas are in `contracts/route-request.schema.json` and `contracts/route-response.schema.json`; use these as the shared integration contract:

```json
{
  "request_id": "journey-001",
  "origin": {"latitude": 12.8230, "longitude": 80.0447},
  "destination": {"latitude": 12.8243, "longitude": 80.0473},
  "profile": {
    "wheelchair_user": true,
    "unknown_accessibility_policy": "relaxed",
    "walking_speed_mps": 1.0
  },
  "constraints": {
    "max_walking_distance_m": 2500,
    "max_snap_distance_m": 50,
    "max_routes": 3
  }
}
```

Response shape (values abbreviated):

```json
{
  "request_id": "journey-001",
  "status": "ok",
  "graph": {"version": "osm-download-v1", "source": "OpenStreetMap via OSMnx", "crs": "EPSG:4326"},
  "snapped_points": {
    "origin": {"node_id": 123, "distance_m": 8.2, "requested": {}, "snapped": {}},
    "destination": {"node_id": 456, "distance_m": 6.1, "requested": {}, "snapped": {}}
  },
  "routes": [
    {
      "route_id": "stable-short-id",
      "metrics": {"duration_min": 7.3, "walking_distance_m": 441.2, "uncertainty_points": 200, "unknown_accessibility_edges": 2, "transfer_count": 0},
      "accessibility": {"status": "uncertain", "policy": "relaxed", "wheelchair_profile": true, "warnings": []},
      "geometry": {"type": "LineString", "coordinates": [[80.0, 12.8], [80.1, 12.9]]},
      "edges": [], "nodes": [], "diagnostics": {"search_expansions": 93}
    }
  ]
}
```

`geometry` is GeoJSON `LineString` with `[longitude, latitude]` coordinates. MapLibre can draw it directly as a GeoJSON source. The frontend should not need NetworkX node IDs to render the route.

### Request fields

- `request_id`: optional caller-generated correlation ID.
- `origin`, `destination`: WGS84 latitude/longitude.
- `profile.wheelchair_user`: whether wheelchair-specific restrictions apply.
- `profile.unknown_accessibility_policy`: `strict` excludes unknown edges; `relaxed` permits them with warnings and uncertainty points.
- `profile.walking_speed_mps`: estimated walking speed used for time estimates.
- `constraints.max_walking_distance_m`: hard walking-distance limit.
- `constraints.max_snap_distance_m`: maximum distance from selected coordinate to mapped pedestrian node.
- `constraints.max_routes`: maximum number of Pareto alternatives (1–10).

### Response statuses

- `ok`: one or more routes found.
- `no_route`: no route satisfies the supplied constraints and policy.
- HTTP `400`: malformed or invalid request.
- HTTP `422`: selected coordinate is too far from the pedestrian graph.

## 6. Run the HTTP API locally

The API loads the graph once when the app starts:

```bash
uvicorn routing.api:app --host 0.0.0.0 --port 8000
```

Check health:

```bash
curl http://localhost:8000/health
```

Route request:

```bash
curl -X POST http://localhost:8000/v1/routes \
  -H 'Content-Type: application/json' \
  -d '{"request_id":"demo-1","origin":{"latitude":12.8230,"longitude":80.0447},"destination":{"latitude":12.8243,"longitude":80.0473},"profile":{"wheelchair_user":true,"unknown_accessibility_policy":"relaxed"},"constraints":{"max_walking_distance_m":2500,"max_snap_distance_m":100,"max_routes":3}}'
```

For AWS Lambda/API Gateway, keep `RoutingService.route(payload)` as the core callable and wrap it with the Lambda adapter selected by your backend team. Do not put AWS SDK calls inside the routing algorithm. Load a versioned graph artifact from S3 during deployment/cold start or package it with the runtime; cache it in the execution environment. Include graph version in logs and responses.

## 7. How the algorithm works

Each label stores `(node, elapsed_time, walking_distance, uncertainty_points, unknown_edge_count, path)`.

A label dominates another at the same node only when it is no worse in every tracked resource and strictly better in at least one. Incomparable labels survive, allowing alternatives such as a slightly slower route with fewer unknown-accessibility edges. A* prioritizes estimated elapsed time; walking distance is a hard resource limit. The heuristic is straight-line distance divided by configured walking speed.

The implementation has safety limits (`max_expansions`, `max_labels_per_node`) to prevent unbounded search. If the per-node label cap is reached, some Pareto alternatives may be dropped; increase the cap for offline analysis if needed. This is a bounded multi-label A* implementation, not a proof of complete Pareto enumeration under the cap.

## 8. Accessibility interpretation

- `highway=steps`, `wheelchair=no`, or `access=no/private` -> inaccessible for wheelchair routing.
- `wheelchair=yes` -> accessible according to that OSM tag.
- missing tags, `wheelchair=limited`, or ambiguous tags -> unknown.
- strict policy excludes unknown edges; relaxed policy allows them and adds 100 uncertainty points per unknown edge.

Do not call a route physically verified based solely on OSM. `tag_supported` means the available tags explicitly support the route; it does not mean an on-site audit has happened.

### Live disruption overlay

The AWS adapter queries the active-event DynamoDB index before every route request. `elevator_outage`, `path_closure`, and `entrance_closure` events hard-block only graph elements whose identifiers match the event `entityId` exactly after case normalization. Service delays and bus cancellations remain visible events but do not close walking edges.

Graph elements expose deterministic identifiers as follows:

- Edges: `edge:{from}:{to}:{key}`, or explicit `entity_id`, `edge_id`, `facility_id`, `elevator_id`, or `ref` attributes.
- Nodes: `node:{node}`, or explicit `entity_id`, `node_id`, `facility_id`, `elevator_id`, or `ref` attributes.
- OSM identifiers: `osm:{osmid}`.

No fuzzy or location-based matching is used. If the live status snapshot cannot be read, the Lambda returns HTTP `503` rather than calculating a route that might rely on an unavailable facility.

## 9. Tests

```bash
pytest -q
```

Tests use a small synthetic graph and do not need an internet connection or the campus GraphML file.

## 10. Integration responsibilities and current limits

- **Routing component (this repository):** OSM pedestrian graph, snapping, feasibility, constrained traversal, route geometry, metrics, JSON contract.
- **Backend/AWS integration:** authentication, request authorization, graph artifact/version management, dynamic status data, logging, API deployment, rate limits.
- **Frontend:** obtain coordinates, send the JSON request, render returned GeoJSON, display warnings and route comparisons.
- **Multimodal extension:** import GTFS stops, trips, stop_times, routes and calendars; add transfer links; model departure-time-dependent waiting and transfer constraints. This code currently routes walking edges only. Do not send transit edges through the walking-only time heuristic until the search state and heuristic are extended for schedules.

The graph downloader uses public OpenStreetMap data. Follow OSM attribution and applicable ODbL requirements in the app.
