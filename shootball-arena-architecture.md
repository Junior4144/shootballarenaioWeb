# ShootBall Arena — Hosting Architecture & Upgrade Path

## 1. Goal

ShootBall Arena is a browser-based 2D top-down multiplayer shooting game.

The initial hosting setup should prioritize:

- Low cost
- Low latency
- Simple deployments
- Minimal infrastructure overhead
- A clean path to scale later

The recommended MVP stack is:

```text
Frontend
Vercel
- TypeScript
- Vite
- Phaser
- Static assets
- Lightweight serverless API routes if needed

Database / Auth
Supabase
- Auth
- Postgres
- Profiles
- Stats
- Match history
- Leaderboards

Authoritative Game Server
Google Compute Engine
- Node.js
- TypeScript
- Colyseus
- WebSocket connections
- Match rooms
- Simulation
```

---

## 2. MVP Architecture

```text
                        ┌─────────────────────┐
                        │       Vercel        │
                        │                     │
                        │ Phaser + Vite app   │
                        │ Static assets       │
                        │ Optional API funcs  │
                        └──────────┬──────────┘
                                   │
                                   │ HTTPS
                                   ▼
                        ┌─────────────────────┐
                        │      Supabase       │
                        │                     │
                        │ Auth                │
                        │ PostgreSQL          │
                        │ Profiles / Stats    │
                        └─────────────────────┘


Browser
   │
   │ WSS
   ▼

game.shootballarena.com
   │
   ▼
Google Compute Engine VM
   │
   ├── Caddy or nginx
   └── Node.js + Colyseus
          │
          ├── Room 1
          ├── Room 2
          ├── Room 3
          └── ...
```

The frontend and persistent backend are separate from the realtime game server.

---

## 3. Frontend

### Stack

```text
TypeScript
Vite
Phaser
HTML / CSS
```

### Hosting

Use **Vercel** initially.

Vercel handles:

- Static frontend deployment
- CDN delivery
- HTTPS
- Custom domains
- Git-based deployments
- Optional lightweight serverless API endpoints

Example:

```text
www.shootballarena.com
```

or

```text
shootballarena.com
```

The frontend does not need to run on Google Cloud initially.

---

## 4. Supabase

Use Supabase for persistent application data.

### Good uses

```text
users
profiles
player_stats
cosmetics
inventory
match_history
leaderboards
settings
```

Supabase Auth can handle player authentication.

The browser logs in through Supabase and receives an auth token.

The game server verifies that token when a player connects.

### Do not use Supabase for

Do not store realtime gameplay state such as:

```text
player position
bullet position
velocity
active collisions
current match timer
live room state
```

That information should stay in memory inside the authoritative Colyseus server.

---

## 5. Authoritative Game Server

### Stack

```text
Node.js
TypeScript
Colyseus
```

### Hosting

Initially use one **Google Compute Engine VM**.

The VM owns the active rooms.

Example:

```text
VM

Colyseus
├── Room #1001
│   ├── 8 players
│   └── projectiles
│
├── Room #1002
│   ├── 6 players
│   └── projectiles
│
└── Room #1003
```

The authoritative server decides:

- Player movement validity
- Shooting
- Projectile spawning
- Projectile collisions
- Damage
- Death
- Respawn
- Score
- Match timer
- Match winner

The client sends intent, not authoritative results.

Example:

```text
move left
aim 125°
fire
```

rather than:

```text
my position is X
I hit player 5
give me 10 points
```

---

## 6. Networking

The browser connects directly to the game server using WebSockets.

Example:

```text
wss://game.shootballarena.com
```

DNS points directly to the Compute Engine VM.

```text
game.shootballarena.com
        │
        ▼
Compute Engine public IP
```

Caddy or nginx can terminate HTTPS/WSS and forward traffic to Colyseus.

Example:

```text
Internet
   │
   ▼
Caddy
   │
   ▼
Colyseus :2567
```

---

## 7. Why No Load Balancer Initially

A load balancer is unnecessary while there is only one game server.

Initial setup:

```text
Browser
   │
   ▼
Game VM
```

Instead of:

```text
Browser
   │
   ▼
Load Balancer
   │
   ▼
Game VM
```

This reduces:

- Cost
- Configuration
- Operational complexity

A load balancer becomes useful once multiple game-server machines exist.

---

## 8. Why No Redis Initially

Redis is mainly useful when multiple Colyseus processes or servers need to coordinate.

With one server:

```text
VM #1
 └── all rooms
```

there is no need for shared room discovery.

Later:

```text
VM #1
VM #2
VM #3
   │
   ▼
Redis
```

Redis can coordinate:

- Server presence
- Room discovery
- Matchmaking
- Distributed room ownership
- Temporary shared state

On Google Cloud, this could later be **Memorystore for Redis**.

---

## 9. Repository Layout

A clean monorepo could look like:

```text
apps/
  web/
    # Phaser + Vite frontend

  game-server/
    # Node + Colyseus

packages/
  shared/
    # Shared constants and game types

  protocol/
    # Network message definitions
```

Potential later structure:

```text
infra/
  terraform/
  docker/
```

---


---

# Monorepo & CI/CD

## Monorepo Structure

Keep the frontend, game server, shared protocol, and infrastructure configuration in one GitHub repository.

```text
shootball-arena/
  apps/
    web/
      # TypeScript + Vite + Phaser
      # deployed by Vercel

    game-server/
      # Node.js + TypeScript + Colyseus
      # deployed to Google Compute Engine

  packages/
    shared/
      # shared game types, constants, validation

    protocol/
      # client/server message definitions

  infra/
    docker/
    terraform/
    scripts/

  .github/
    workflows/
      deploy-game-server.yml

  package.json
  pnpm-workspace.yaml
```

Use a workspace setup such as `pnpm` or npm workspaces so both applications can import shared packages.

Example:

```text
apps/web
  -> packages/shared
  -> packages/protocol

apps/game-server
  -> packages/shared
  -> packages/protocol
```

Avoid putting browser-only code inside shared packages.

---

## Vercel Deployment

Vercel should deploy only the frontend.

Configure the Vercel project root as:

```text
apps/web
```

Vercel handles:

- Frontend builds
- Static assets
- HTTPS
- CDN delivery
- Custom domains
- Preview deployments
- Production deploys from GitHub

The Colyseus server should not be deployed through Vercel.

---

## Game Server Deployment

The game server is deployed separately from the same repository.

Target:

```text
apps/game-server
```

Deployment destination:

```text
Google Compute Engine
```

There are two reasonable approaches.

### MVP Approach — SSH Deployment

For an early version:

```text
GitHub push
   ↓
GitHub Actions
   ↓
SSH into Compute Engine VM
   ↓
git pull
pnpm install
pnpm build
restart Colyseus
```

This is easy to understand and inexpensive.

A process manager or system service can keep the server running, for example:

```text
systemd
or
PM2
```

This approach is fine while there is only one game server.

---

### Preferred Production Approach — Docker

As the project becomes more serious:

```text
GitHub push
   ↓
GitHub Actions
   ↓
build Docker image
   ↓
Google Artifact Registry
   ↓
Compute Engine pulls image
   ↓
restart game-server container
```

Example flow:

```text
GitHub
   |
   v
GitHub Actions
   |
   v
Artifact Registry
   |
   v
Compute Engine
   |
   v
Colyseus container
```

This makes releases more reproducible and makes rollback easier.

---

## Deployment Flow

A push to `main` can trigger both deployment pipelines independently.

```text
Push to main
     │
     ├── apps/web changed
     │      ↓
     │    Vercel
     │      ↓
     │    Frontend deployed
     │
     └── apps/game-server changed
            ↓
          GitHub Actions
            ↓
          Google Cloud
            ↓
          Game server deployed
```

Use path-based triggers so backend changes do not unnecessarily redeploy the frontend, and frontend-only changes do not redeploy the game server.

Example concept:

```text
apps/web/**
packages/shared/**
packages/protocol/**
```

can affect the frontend build.

```text
apps/game-server/**
packages/shared/**
packages/protocol/**
```

can affect the game server build.

---

## Environment Variables

Keep frontend and backend environment variables separate.

Frontend examples:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_GAME_SERVER_URL
```

These values are visible to the browser and must not contain private credentials.

Backend examples:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
GAME_SERVER_PORT
NODE_ENV
```

Backend secrets should live in:

```text
GitHub Actions secrets
Google Secret Manager
or VM environment configuration
```

Never expose private Supabase service credentials in the Vite frontend.

---

## Recommended Initial CI/CD Setup

For the first production-capable version:

```text
GitHub repository
   │
   ├── Vercel
   │     └── apps/web
   │
   └── GitHub Actions
         └── apps/game-server
               ↓
         Google Artifact Registry
               ↓
         Compute Engine VM
```

This keeps everything in one repo while allowing each application to have its own deployment lifecycle.

Later, if the game expands to multiple servers, the same repository and CI/CD model can deploy:

```text
multiple Compute Engine VMs
Redis / Memorystore
Load Balancer
regional game servers
```

without requiring a major repository restructure.


# Upgrade Path

## Stage 1 — Prototype

```text
Vercel
Supabase Free
1 Compute Engine VM
```

No:

```text
Redis
Load Balancer
GKE
Cloud SQL
Multi-region
```

Goal:

- Build gameplay
- Test multiplayer
- Measure CPU usage
- Measure bandwidth
- Measure latency

---

## Stage 2 — Larger Single Server

If the first VM becomes CPU or memory constrained:

```text
small VM
   ↓
larger VM
```

No architecture change is required.

For example:

```text
e2-micro
   ↓
e2-small
   ↓
e2-medium
```

This is the simplest scaling method.

---

## Stage 3 — Multiple Game Servers

When one machine is no longer enough:

```text
                  ┌── Game Server #1
Browser → Router ─┼── Game Server #2
                  └── Game Server #3
```

At this point introduce Redis.

```text
Game Server #1 ─┐
Game Server #2 ─┼── Redis
Game Server #3 ─┘
```

Redis allows Colyseus instances to discover rooms and coordinate matchmaking.

---

## Stage 4 — Google Load Balancer

Once multiple game servers exist:

```text
Browser
   │
   ▼
Google Cloud Load Balancer
   │
   ├── VM #1
   ├── VM #2
   └── VM #3
```

Add:

```text
Google Load Balancer
Google Memorystore
multiple Compute Engine VMs
```

The exact room-routing strategy should be designed carefully because a live Colyseus room belongs to a specific process.

---

## Stage 5 — Regional Servers

If users are geographically distributed:

```text
US Central
US East
US West
Europe
```

Matchmaking can measure latency and send players to the closest available region.

Example:

```text
Player

US Central  28ms
US East     62ms
US West     75ms

→ choose US Central
```

Potential domains:

```text
game-us-central.shootballarena.com
game-us-east.shootballarena.com
game-eu.shootballarena.com
```

---

## Stage 6 — Larger Infrastructure

Only if the game becomes large enough to justify it:

```text
GKE / Kubernetes
regional autoscaling
dedicated matchmaking service
regional Redis
metrics / observability
autoscaled game-server fleets
```

GKE should not be the starting point unless the project already has enough traffic to justify the operational complexity.

---

# Cost-Minimizing Strategy

The main principle is:

> Do not pay for scaling infrastructure before the game actually needs scaling.

Start with:

```text
Vercel
   +
Supabase
   +
1 Compute Engine VM
```

Then scale vertically first:

```text
larger VM
```

before scaling horizontally:

```text
multiple VMs
+ Redis
+ Load Balancer
```

This keeps the early infrastructure inexpensive and easy to understand.

---

# Recommended Initial Setup

```text
Frontend
Vercel
TypeScript + Vite + Phaser

Auth / Database
Supabase

Realtime Game Server
Google Compute Engine
Node.js + TypeScript + Colyseus

TLS / WebSocket Proxy
Caddy

DNS
game.shootballarena.com → VM IP
```

This gives ShootBall Arena a simple MVP architecture while preserving a clean path toward:

```text
larger VM
→ multiple servers
→ Redis
→ load balancer
→ regional game servers
→ GKE if eventually justified
```
