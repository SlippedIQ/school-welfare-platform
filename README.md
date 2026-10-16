# School Welfare Platform

A production-style web application for **school children's welfare monitoring**: continuous
biometric health signals (heart rate, body temperature), stress / behavioural state inference,
threshold-based alerting, and **classroom CCTV integration** through per-section NAS/NVR routing.

Three role-gated portals ship behind a real username/password login:

| Screen | Path | Access | Purpose |
| --- | --- | --- | --- |
| **Sign in** | `/login` | public | Username/password login — scrypt-hashed passwords, HTTP-only session cookie. |
| **Teacher Portal** | `/teacher` | TEACHER | Live class dashboard: per-student BPM with status banding, stress + behavioural state, the section's camera feed, a live alerts drawer, and timestamped observation notes. |
| **Admin Master Control** | `/admin` | ADMIN | School-wide metrics, full student CRUD, NAS/stream gateway configuration per section, teacher provisioning, and the global alert audit log. |
| **Nurse Station** | `/nurse` | NURSE | School-wide triage queue sorted by health band and behavioural state, live alert acknowledgement, and check-in wellbeing notes. |
| **Camera Vitals** | `/scan` | any role | On-the-go scanner: experimental optical heart rate, drowsiness via eye tracking, and heuristic stress / focus / affect estimates — all processed on-device. |

Everything is interactive **out of the box**: a local simulation engine ticks every 4 seconds,
evolves each student's readings, raises alerts when thresholds are crossed, and streams the
resulting snapshots to every open dashboard over Server-Sent Events.

---

## Tech stack

- **Frontend** — Next.js 14 (App Router), React 18, Tailwind CSS 3, lucide-react icons
- **Backend** — Next.js Route Handlers (`/api/*`) with Zod validation
- **Database** — PostgreSQL (Neon free tier) via Prisma ORM; same DB locally and in production
- **Auth** — scrypt-hashed passwords (Node `crypto`), opaque server-side sessions in an
  HTTP-only `sw_session` cookie, role guards on every portal page and API route
- **Real-time** — custom in-process simulation engine broadcasting over SSE, with an
  automatic short-polling fallback (`/api/live/snapshot`)
- **Camera vitals** — `@mediapipe/tasks-vision` (WebAssembly, fully in-browser): face landmarks
  + blendshapes feed rPPG pulse extraction, PERCLOS eye tracking, and gaze heuristics
- **Language** — TypeScript, strict mode throughout

---

## Quick start

```bash
# 1. Create a free Neon database (https://neon.tech), copy the DIRECT connection
#    string, and put it in .env as DATABASE_URL (see .env.example)

# 2. Install dependencies (postinstall: prisma generate + MediaPipe wasm copy)
npm install

# 3. Create the tables and apply the schema
npm run db:push

# 4. Seed classrooms, cameras, teachers, students, history, alerts + demo logins
npm run db:seed

# 5. Start the dev server
npm run dev
```

Open **http://localhost:3000** — sign in with a demo account from the table below.

### Demo accounts

`npm run db:seed` upserts five login users (re-seeding never wipes other data). To refresh
**only** the logins against an existing database — e.g. production — run
`npx tsx scripts/seed-users.ts`.

| Username | Password | Role | Lands on |
| --- | --- | --- | --- |
| `admin` | `admin123` | Admin | `/admin` |
| `ananya` | `ananya123` | Teacher | `/teacher` |
| `vikram` | `vikram123` | Teacher | `/teacher` |
| `meera` | `meera123` | Teacher | `/teacher` |
| `nurse` | `nurse123` | Nurse | `/nurse` |

Passwords are hashed with **scrypt** (per-user salt, stored as `scrypt$N$salt$hash`); login
compares against a dummy hash for unknown usernames so response timing doesn't reveal which
accounts exist. Sessions are opaque random tokens kept in the `Session` table and delivered in
an HTTP-only cookie (7-day expiry, revoked on logout).

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
| `npm run db:seed` | Seed demo data (roster **and** login users) |
| `npm run db:reset` | Drop, re-create and re-seed the database |
| `npm run db:studio` | Browse the database in Prisma Studio |
| `npx tsx scripts/seed-users.ts` | Upsert demo logins only (safe against production data) |

---

## Architecture

### Directory structure

```
school-welfare-platform/
├── prisma/
│   ├── schema.prisma            # Student, BiometricLog, Classroom, Teacher, AlertLog, Observation, User, Session
│   ├── demo-users.ts            # Demo login accounts (shared by both seed entry points)
│   └── seed.ts                  # Demo roster, camera mappings, history, alerts, logins
├── scripts/
│   ├── seed-users.ts            # Upsert demo logins only (safe against production data)
│   └── copy-vision-assets.mjs   # postinstall: MediaPipe wasm → public/vision/wasm
├── public/
│   ├── models/face_landmarker.task  # Face Landmarker model (committed, served from own origin)
│   └── vision/wasm/                 # MediaPipe WASM runtime (copied from node_modules)
├── src/
│   ├── app/
│   │   ├── page.tsx             # Public console entry (sign-in + status strip)
│   │   ├── login/page.tsx       # Sign-in screen
│   │   ├── teacher/page.tsx     # Teacher portal (server-rendered roster)
│   │   ├── nurse/page.tsx       # Nurse station (triage queue + alerts)
│   │   ├── scan/page.tsx        # Camera vitals scanner
│   │   ├── admin/               # Overview, students, classrooms, teachers, audit
│   │   └── api/                 # Route handlers (see "API" below)
│   ├── components/
│   │   ├── ui/                  # Design system: Button, Card, Badge, Modal, Table bits…
│   │   ├── shell/               # AppShell (sidebar/topbar), portal navs, sign-out
│   │   ├── auth/                # Login form
│   │   ├── live/                # SSE status, sparkline, alerts dock/ticker, unread badge
│   │   ├── teacher/             # Class dashboard, student card/modal, camera viewer
│   │   ├── nurse/               # Triage queue
│   │   ├── scan/                # Camera scanner UI (MediaPipe orchestration)
│   │   └── admin/               # Overview metrics, CRUD managers, audit log
│   ├── hooks/
│   │   └── use-live-feed.tsx    # SSE subscription + polling fallback + context
│   └── lib/
│       ├── auth.ts              # Sessions, requirePageUser / requireApiUser guards
│       ├── password.ts          # scrypt hash + verify (format scrypt$N$salt$hash)
│       ├── scan/                # rPPG pulse processor + facial-cue engine
│       ├── sim/engine.ts        # Background simulation engine (singleton)
│       ├── db.ts                # Prisma client singleton
│       ├── types.ts             # DTOs, unions, threshold policy, user roles
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
- **Real auth, replacing the earlier mock session switcher.** Credentials are stored as scrypt
  hashes (`src/lib/password.ts`); sessions are opaque random tokens in an HTTP-only cookie
  backed by the `Session` table. Pages redirect to `/login` via `requirePageUser`, APIs return
  401/403 via `requireApiUser`. Each portal is strict: `/teacher` = TEACHER, `/admin/*` =
  ADMIN, `/nurse` = NURSE. Mutations are ADMIN-only except alert acknowledgement and
  observation notes, which any signed-in role may write.
- **Camera vitals are honest about what they are.** Heart rate is labelled experimental with a
  live signal-quality meter and a resting-baseline calibration; drowsiness rests on established
  eye-openness metrics (EAR + PERCLOS); stress/concentration/affect are explicitly heuristic
  estimates with disclaimers on the page. Video frames never leave the device — MediaPipe runs
  in the browser via WASM, served from this origin.
- **The camera panel is a mock video source**: a deterministic canvas render of the classroom
  (desks + occupants coloured by live health band) with realistic connection states driven by
  the classroom's stream gateway config and simulated link health. Point `streamUrl` at a real
  HLS/RTSP gateway to swap in an actual player.

---

## Camera Vitals (`/scan`)

Any signed-in user can open **Camera vitals** from their portal sidebar (or `/scan` directly —
the page is standalone and mobile-friendly, with a back-to-portal link). The pipeline runs
entirely in the browser:

```
getUserMedia ─► video frames ─► MediaPipe FaceLandmarker (WASM, loaded from own origin)
                                  ├─ cheek skin ROIs (green channel) ─► PulseProcessor ─► BPM + quality
                                  ├─ eye aspect ratio → blinks, PERCLOS, yawns ─► alertness
                                  └─ iris gaze + head motion ─► focus; blendshapes ─► tension/affect
```

- **Heart rate (experimental)** — rPPG: DC/AC split of the cheek green channel, moving-average
  detrend + Hann window + DFT sweep over 42–210 BPM, half-window stability check. A 0–100 %
  quality meter gates the reading (good light, a still face, ~15 s to calibrate a resting
  baseline); the BPM stays hidden while the signal is poor.
- **Drowsiness (solid)** — EAR (eye aspect ratio) with PERCLOS over a rolling 60 s window, yawn
  detection, and head-droop: the same signals established driver-fatigue systems use.
- **Stress / concentration / affect (heuristic)** — heart-rate deviation from the calibrated
  baseline + facial tension (blendshapes); gaze stability + head stillness, penalised by
  drowsiness; smile/brow/mouth shape. Estimates only — labelled as such in the UI, never
  presented as measurements.
- **Privacy** — frames never leave the device. MediaPipe's WASM runtime and the face-landmark
  model are served from this origin (`public/vision/wasm` copied by postinstall,
  `public/models/face_landmarker.task` committed to the repo) — no CDN is involved.
- **Classroom CCTV is separate**: the existing URL-based stream viewer in the teacher/admin
  portals is untouched; the scanner only ever uses the local webcam.

---

## API

All responses use the envelope `{ ok: true, data }` or `{ ok: false, error }`.

Every route requires a valid `sw_session` cookie except `POST /api/auth/login` and the public
`GET /api/status`. Reads are open to any signed-in role; **mutations are ADMIN-only** unless
noted below.

| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Sign in: `{ username, password }` → sets the HTTP-only session cookie |
| `POST` | `/api/auth/logout` | Revoke the session and clear the cookie |
| `GET` | `/api/status` | Public aggregate-only health strip (feeds the landing page) |
| `GET` | `/api/live` | SSE stream of `LiveSnapshot` (event: `snapshot`, `tick`) |
| `GET` | `/api/live/snapshot` | Point-in-time snapshot (polling fallback) |
| `GET`/`POST` | `/api/students` | List / enroll students (POST: ADMIN) |
| `GET`/`PUT`/`DELETE` | `/api/students/:id` | Detail (readings + observations) / update / remove (writes: ADMIN) |
| `GET`/`POST` | `/api/classrooms` | List / add sections (NAS + stream gateway) (POST: ADMIN) |
| `PUT`/`DELETE` | `/api/classrooms/:id` | Update mapping / remove (protected while students enrolled) (writes: ADMIN) |
| `GET`/`POST` | `/api/teachers` | List / provision teachers (POST: ADMIN) |
| `PUT`/`DELETE` | `/api/teachers/:id` | Update assignments / remove (writes: ADMIN) |
| `GET` | `/api/alerts?severity&status&search&limit` | Filterable alert feed |
| `PATCH` | `/api/alerts` | Mark read: `{ ids: [...] }` or `{ all: true }` (**any role**) |
| `GET`/`POST` | `/api/observations?studentId` | List / append observation notes (POST: **any role**) |

---

## Configuration

Environment variables (`.env`, already created for local dev):

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string (Neon). Local: *direct* URL, Render: *pooler* URL |
| `SIM_TICK_MS` | `4000` | Simulation cadence in milliseconds (clamped 1–30 s) |

---

## Notes & limitations

- **Demo credentials are intentionally simple** (see "Demo accounts") — change them before any
  real deployment.
- **Camera vitals are experimental, not medical measurements.** rPPG pulse quality depends on
  lighting and stillness (readings are withheld below ~40 % quality); drowsiness uses
  established eye-openness metrics but is still a camera heuristic; stress/concentration/affect
  are facial-cue proxies. Nothing on this site is a medical device, and no video ever leaves
  the device.
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
   `npm run db:push && npm run db:seed` once to provision and populate the cloud database
   (including the demo login users). To refresh logins later without touching other data:
   `npx tsx scripts/seed-users.ts`.
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
