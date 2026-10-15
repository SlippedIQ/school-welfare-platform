# School Welfare Platform

A production-style web application for **school children's welfare monitoring**: continuous
biometric health signals (heart rate, body temperature), stress / behavioural state inference,
threshold-based alerting, and **classroom CCTV integration** through per-section NAS/NVR routing.

Two portals ship in the same app:

| Portal | Path | Purpose |
| --- | --- | --- |
| **Teacher Portal** | `/teacher` | Live class dashboard: per-student BPM with status banding, stress + behavioural state, the section's camera feed, a live alerts drawer, and timestamped observation notes. |
| **Admin Master Control** | `/admin` | School-wide metrics, full student CRUD, NAS/stream gateway configuration per section, teacher provisioning, and the global alert audit log. |

Everything is interactive **out of the box**: a local simulation engine ticks every 4 seconds,
evolves each student's readings, raises alerts when thresholds are crossed, and streams the
resulting snapshots to every open dashboard over Server-Sent Events.

---

## Tech stack

- **Frontend** — Next.js 14 (App Router), React 18, Tailwind CSS 3, lucide-react icons
- **Backend** — Next.js Route Handlers (`/api/*`) with Zod validation
- **Database** — PostgreSQL (Neon free tier) via Prisma ORM; same DB locally and in production
- **Real-time** — custom in-process simulation engine broadcasting over SSE, with an
  automatic short-polling fallback (`/api/live/snapshot`)
- **Language** — TypeScript, strict mode throughout

---

## Quick start

```bash
# 1. Create a free Neon database (https://neon.tech), copy the DIRECT connection
#    string, and put it in .env as DATABASE_URL (see .env.example)

# 2. Install dependencies (also runs `prisma generate` via postinstall)
npm install

# 3. Create the tables and apply the schema
npm run db:push

# 4. Seed classrooms, cameras, teachers, students, history, alerts
npm run db:seed

# 5. Start the dev server
npm run dev
```

Open **http://localhost:3000** — the entry page links to both portals.

### Production build

```bash
npm run build
npm start
```

---

## Available scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build (lint + type-check + bundle) |
| `npm start` | Serve the production build |
| `npm run typecheck` | TypeScript check without emitting |
| `npm run lint` | ESLint (Next.js config) |
| `npm run db:push` | Create/update the database schema |
| `npm run db:seed` | Seed demo data |
| `npm run db:reset` | Drop, re-create and re-seed the database |
| `npm run db:studio` | Browse the database in Prisma Studio |

---

## Architecture

### Directory structure

```
school-welfare-platform/
├── prisma/
│   ├── schema.prisma            # Student, BiometricLog, Classroom, Teacher, AlertLog, Observation
│   └── seed.ts                  # Demo roster, camera mappings, history, alerts
├── src/
│   ├── app/
│   │   ├── page.tsx             # Console entry (portal selection + status strip)
│   │   ├── teacher/page.tsx     # Teacher portal (server-rendered roster)
│   │   ├── admin/               # Overview, students, classrooms, teachers, audit
│   │   └── api/                 # Route handlers (see "API" below)
│   ├── components/
│   │   ├── ui/                  # Design system: Button, Card, Badge, Modal, Table bits…
│   │   ├── shell/               # AppShell (sidebar/topbar), admin nav
│   │   ├── live/                # SSE status, sparkline, alerts dock/ticker, unread badge
│   │   ├── teacher/             # Class dashboard, student card/modal, camera viewer
│   │   └── admin/               # Overview metrics, CRUD managers, audit log
│   ├── hooks/
│   │   └── use-live-feed.tsx    # SSE subscription + polling fallback + context
│   └── lib/
│       ├── sim/engine.ts        # Background simulation engine (singleton)
│       ├── db.ts                # Prisma client singleton
│       ├── types.ts             # DTOs, unions, threshold policy
│       ├── validation.ts        # Zod schemas (API contract)
│       ├── api.ts / client.ts   # Server + client response envelopes
│       └── serialize.ts         # Prisma → DTO mappers
└── package.json
```

### Real-time flow

```
SimulationEngine (globalThis singleton, 4s tick)
   │  evolves HR / temp / stress / state, evaluates thresholds,
   │  persists BiometricLog rows + AlertLog rows to the database
   ├─► SSE subscribers ──► GET /api/live ──► LiveFeedProvider ──► every dashboard
   │                              ▲ (on error: falls back to polling /api/live/snapshot)
   └─► CRUD mutations call engine.syncRoster() so new/edited students appear live
```

- **Alert policy** (`src/lib/types.ts → THRESHOLDS`): heart rate ≥ baseline + 25 BPM → `WARNING`,
  ≥ baseline + 45 BPM or body temperature ≥ 38.3 °C → `CRITICAL`. Per-severity cooldowns
  prevent notification spam; readings are only flagged while the sensor is reporting.
- **Sensor dropouts & camera outages** are simulated too, so the "online sensors" and
  "connected streams" metrics are genuinely dynamic.
- Biometric logs older than 24 h are pruned automatically (~every 5 minutes).

### Design decisions

- **PostgreSQL with application-level enums.** Enum-backed columns (`stressLevel`, `state`,
  `severity`) are stored as strings and constrained at the application layer: Zod on write,
  discriminated unions + narrowers (`src/lib/serialize.ts`) on read.
- **The simulation runs on the server**, not in the browser, so the teacher and admin portals
  always agree on the same state — exactly as real sensors feeding a backend would.
- **Mock session switcher** (teacher portal top bar): SSO is out of scope for a local build, so
  an admin can impersonate any provisioned teacher. The selection is stored in a cookie so
  server-rendered navigation stays consistent.
- **The camera panel is a mock video source**: a deterministic canvas render of the classroom
  (desks + occupants coloured by live health band) with realistic connection states driven by
  the classroom's stream gateway config and simulated link health. Point `streamUrl` at a real
  HLS/RTSP gateway to swap in an actual player.

---

## API

All responses use the envelope `{ ok: true, data }` or `{ ok: false, error }`.

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/live` | SSE stream of `LiveSnapshot` (event: `snapshot`, `tick`) |
| `GET` | `/api/live/snapshot` | Point-in-time snapshot (polling fallback) |
| `GET`/`POST` | `/api/students` | List / enroll students |
| `GET`/`PUT`/`DELETE` | `/api/students/:id` | Detail (readings + observations) / update / remove |
| `GET`/`POST` | `/api/classrooms` | List / add sections (NAS + stream gateway) |
| `PUT`/`DELETE` | `/api/classrooms/:id` | Update mapping / remove (protected while students enrolled) |
| `GET`/`POST` | `/api/teachers` | List / provision teachers |
| `PUT`/`DELETE` | `/api/teachers/:id` | Update assignments / remove |
| `GET` | `/api/alerts?severity&status&search&limit` | Filterable alert feed |
| `PATCH` | `/api/alerts` | Mark read: `{ ids: [...] }` or `{ all: true }` |
| `GET`/`POST` | `/api/observations?studentId` | List / append observation notes |

---

## Configuration

Environment variables (`.env`, already created for local dev):

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string (Neon). Local: *direct* URL, Render: *pooler* URL |
| `SIM_TICK_MS` | `4000` | Simulation cadence in milliseconds (clamped 1–30 s) |

---

## Notes & limitations

- **No authentication** — portals are open by design for the local build; wire your identity
  provider into `AppShell` and the acting-teacher cookie before any real deployment.
- **Biometric data is synthetic.** The simulation engine produces plausible readings for demo
  and development purposes only.
- Threshold values are intentionally policy constants in `src/lib/types.ts`; move them to the
  database or environment if they need to be configurable per school.

---

## Deploying (Render + Neon, free)

The app is configured to deploy as a **Render web service** backed by a **Neon Postgres**
database — both have free tiers, and `render.yaml` at the repo root contains the service
definition so Render can read the build/start commands automatically.

### One-time setup

1. **Neon** — create a free account at [neon.tech](https://neon.tech), create a project, and
   copy the **direct** (non-pooler) connection string into your local `.env`. Run
   `npm run db:push && npm run db:seed` once to provision and populate the cloud database.
2. **GitHub** — push this repository to GitHub (Render connects to repos for deploys).
3. **Render** — New → Web Service → connect the repository. Render detects `render.yaml`;
   review the build command (`npm install && npm run build`) and start command (`npm start`).
4. **Environment** — in the Render service's *Environment* tab add:
   - `DATABASE_URL` = the Neon **pooler** connection string (use the pooler URL in production
     so connection spikes from the engine don't exhaust Neon's direct connection limit).
5. Deploy. The first build takes a few minutes; subsequent deploys trigger on every push.

### Behaviour on a free instance

- The service sleeps after ~15 minutes with no traffic; the first request after idle takes
  ~30–50 s while it wakes (the simulation engine resumes immediately once booted).
- Because the simulation runs **inside the server process**, keep the free instance warm if
  you are demoing: Render's paid tier (or a paid instance type) removes the cold start.

### Local tunnel (alternative to hosting)

For an instant shareable link without deploying, run the bundled Cloudflare tunnel scripts
(see `scripts/`): `go-live.ps1` prints a public `https://…trycloudflare.com` URL served from
your own machine; `stop-live.ps1` stops it. Quick-tunnel URLs are ephemeral — they change on
every restart — which is why the Render route is preferable for a permanent address.
