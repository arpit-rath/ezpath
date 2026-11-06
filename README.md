# EzPath — Multimodal Accessible Journey Planning

> **"The shortest route isn't always the right route."**

EzPath is a multimodal, accessibility-first journey-planning platform that helps travellers find routes they can actually use — considering wheelchair accessibility, stairs, elevators, walking limits, cost, transport availability, reliability, and live disruptions.

---

## 🚀 Live Demo Walkthrough (Judge / Presentation Scenario)

The frontend features a fully deterministic, constraint-aware graph solver and multi-tab realtime synchronisation via `BroadcastChannel` and `localStorage`.

### Complete 20-Step Demo:
1. **Open EzPath** (`/`). Review the hero comparison demonstrating why naive shortest path routing fails wheelchair users.
2. Click **"Plan your journey"** (`/plan`).
3. Notice starting location is **Central Station** and destination is **Riverside Campus**.
4. Select the **Wheelchair** mobility profile:
   - Avoid stairs: **Required**
   - Require verified step-free access: **Required**
   - Wheelchair-accessible boarding: **Required**
   - Maximum walking distance: **600 m**
   - Maximum budget: **₹50**
5. Click **"Find Accessible Routes"**.
6. The routing engine deterministically excludes the direct stairs connection (Stairs C1, 24 steps) and finds the **Fastest Accessible** route using **Elevator A1** down to the Metro Blue Line platform, arriving at Riverside Campus via level ramps in 18 minutes for ₹35 with 280 m of walking.
7. Click **"Why does this route work for me?"** on the route card.
8. The **Constraint Inspector** modal opens, revealing verified evidence timestamps from Station IoT telemetry, confirming zero stairs, level boarding, and operational status of Elevator A1.
9. Click **"Operator Console"** in the navigation bar (`/operator`).
10. Review the dark command centre with live network indicators (disruptions, operational lifts, coverage).
11. Under **Instant Simulation Scenarios**, click **"Scenario 2: Elevator A1 Outage"** (or click the prominent **"Simulate Outage"** button in the header bar).
12. Return to the traveller view (`/plan`).
13. Notice the live accessible disruption alert:
    > *"Your journey has been affected. Elevator A1 at Central Station is currently unavailable (Traction motor overheating)."*
14. The affected route segment is marked in **red** on the MapLibre map and invalidated.
15. Click **"Recalculate Accessible Route"**.
16. EzPath dynamically replans the route under the **exact same physical constraints** (never loosening step-free or walking distance). It routes via the West Wing street ramp (Ramp W1) and Accessible Low-Floor Bus 402.
17. The **"What changed in your journey?"** comparison highlights:
    - Travel time: **+8 min** (26 min total)
    - Fare: **-₹10** (₹25 total, well within ₹50 limit)
    - Walking distance: **-60 m** (220 m total, well within 600 m limit)
    - Transfers: **+1 transfer**
    - Step-free requirement: **100% strictly maintained!**
18. Click **"Save Offline"** on the new route.
19. Navigate to **Saved Journeys** (`/saved`). The itinerary is safely persisted in IndexedDB.
20. Notice the clear offline transparency notice:
    > *"Offline journey saved at [time]. Current lift and disruption information is unavailable."*
21. Click **"Reset Demo"** in the navigation bar to instantly restore all network lifts to 100% operational health.

---

## 🛠️ Technology Stack

- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS with custom design tokens (`#F7F9FC` background, `#2563EB` primary, `#087F6D` accessible, `#C43D43` disruption)
- **Cartography**: MapLibre GL JS with Amazon Location Service adapter and fallback SVG vector engine
- **State Management**: Zustand
- **Asynchronous Data**: TanStack Query
- **Charts & Analytics**: Recharts
- **Offline Storage**: IndexedDB via `idb`
- **Testing**: Vitest + React Testing Library for routing, constraints, adapters, and dynamic replanning
- **Icons**: Lucide React
- **PWA**: Web App Manifest + Service Worker support
- **Accessibility**: WCAG-oriented implementation with skip-to-content, ARIA live regions, keyboard navigation, and focus rings; external conformance audit pending

---

## 📁 Project Architecture

```text
src/
├── app/
│   ├── router.tsx                # Client routes (/, /plan, /journey/:id, /saved, /operator, etc.)
│   └── providers.tsx             # TanStack Query Client provider
├── components/
│   ├── accessibility/
│   │   ├── ConstraintInspector.tsx # Signature "Why does this route work?" modal
│   │   └── ProfileBuilder.tsx     # Physical constraints & threshold builder
│   ├── analytics/
│   │   ├── AccessibilityCharts.tsx# Recharts operational analytics
│   │   └── FacilityStatusTable.tsx# Real-time hardware telemetry table
│   ├── disruptions/
│   │   └── DisruptionBanner.tsx   # ARIA live alert banner with dynamic reroute trigger
│   ├── journey/
│   │   ├── ItineraryTimeline.tsx  # Turn-by-turn text itinerary independent of map
│   │   ├── RouteCard.tsx          # Alternative route cards with metrics & tags
│   │   ├── RouteComparison.tsx    # Modal table comparing candidate alternatives
│   │   ├── SearchControls.tsx     # Left collapsible journey controls
│   │   └── WhatChangedDiff.tsx    # Hero dynamic rerouting tradeoffs diff
│   ├── layout/
│   │   ├── AppShell.tsx           # Global container & BroadcastChannel event listener
│   │   ├── Footer.tsx
│   │   └── Navbar.tsx             # Brand, nav links & live demo controls
│   ├── maps/
│   │   ├── InteractiveMap.tsx     # MapLibre GL JS + interactive station drawer
│   │   └── MapLegend.tsx          # Accessible cartography layer guide
│   └── ui/
│       ├── Badge.tsx
│       ├── Button.tsx
│       ├── Card.tsx
│       └── SkipLink.tsx           # WCAG skip link
├── data/
│   └── demoNetwork.ts             # 28 nodes, elevators, ramps, metro & bus lines
├── services/
│   ├── api/
│   │   ├── client.ts              # Abstract ApiClient interface
│   │   ├── awsClient.ts           # Production API Gateway backend adapter
│   │   ├── demoAdapter.ts         # Deterministic graph routing & replanning engine
│   │   └── index.ts               # Factory selecting Demo vs AWS adapter
│   ├── auth/
│   │   └── cognito.ts             # Amazon Cognito auth service
│   ├── maps/
│   │   └── locationAdapter.ts     # Amazon Location Service map style configuration
│   ├── offline/
│   │   └── idbStorage.ts          # IndexedDB storage via idb
│   └── realtime/
│       └── liveEvents.ts          # Tab synchronisation & AppSync live events
├── stores/
│   ├── journeyStore.ts            # Traveller planner state & search workflows
│   └── operatorStore.ts           # Operator dashboard, disruptions & simulation state
├── types/
│   └── index.ts                   # Centralised TypeScript models
└── tests/
    └── routing.test.ts            # Vitest suite verifying constraint-aware search & rerouting
```

---

## ⚡ Getting Started

### Prerequisites
- Node.js >= 18 (Tested on Node v24)
- npm >= 9

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Run Automated Tests
```bash
npm test
```

### Production Build
```bash
npm run build
```

---

## ☁️ AWS Backend Connection (Production Mode)

To connect the application to the deployed AWS routing backend:
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Update the environment variables:
   ```env
   VITE_DEMO_MODE=false
   VITE_API_BASE_URL=https://your-http-api-id.execute-api.ap-south-1.amazonaws.com
   VITE_AWS_REGION=ap-south-1
   VITE_LOCATION_MAP_NAME=EzPathSrmCampusMap
   VITE_LOCATION_API_KEY=your_referer_restricted_browser_key
   VITE_COGNITO_USER_POOL_ID=ap-south-1_replace_me
   VITE_COGNITO_CLIENT_ID=your_cognito_app_client_id
   VITE_APPSYNC_EVENTS_HTTP_URL=https://your-api-id.appsync-api.ap-south-1.amazonaws.com/event
   VITE_APPSYNC_EVENTS_REALTIME_URL=wss://your-api-id.appsync-realtime-api.ap-south-1.amazonaws.com/event/realtime
   VITE_APPSYNC_EVENTS_API_KEY=your_subscriber_key
   VITE_APPSYNC_EVENTS_CHANNEL=/disruptions/network
   ```
3. Rebuild and deploy:
   ```bash
   npm run build
   ```

Production mode plans journeys across Chennai with published metro, suburban rail and MTC bus timetables through `POST /v1/journeys`, and uses `POST /v1/routes` for trips inside the SRM campus. Times are timetabled rather than live. Metro fares come from the CMRL fare table; the bus and suburban feeds publish no fares, so those totals are shown as incomplete. The feeds publish no wheelchair-boarding data, so transit journeys are always marked unverified. Operator writes require a valid Cognito access token; demo scenario controls remain available only when `VITE_DEMO_MODE=true`.

The CDK stack creates manual Amplify Hosting, API Gateway CORS for the generated Amplify URL, and an Amazon Location map key restricted to map rendering from localhost and that hosted URL. It does not connect Amplify to GitHub. Follow [infra/DEPLOYMENT.md](infra/DEPLOYMENT.md) after IAM access is configured; the live deployment is managed from `infra/`.

---

## 🛡️ Accessibility Implementation

- **Semantic Landmarks**: Proper `<header>`, `<main>`, `<aside>`, `<nav>`, and `<footer>` elements.
- **Skip Link**: Top-level visible keyboard skip link directly targeting `#main-content`.
- **Keyboard Operable**: Full keyboard accessibility for route selection, toggles, and modals.
- **ARIA Live Regions**: Disruption alerts announce changes dynamically without interrupting user focus.
- **Color Independence**: Routes, stops, and hazards feature dedicated text labels, icons, and dash patterns.
- **Text Itinerary**: Turn-by-turn instructions provide a non-map representation of the returned route.

These implementation features have not yet undergone an external WCAG conformance audit.

