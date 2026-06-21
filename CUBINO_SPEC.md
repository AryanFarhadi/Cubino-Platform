# Cubino — Full-Stack Community Platform Specification

> **Purpose:** Use this document as a master prompt for an AI coding agent or as a product/engineering spec for building **Cubino** — a Discord-like real-time chat and community platform with a cozy bear-cub brand identity.

---

## 1. Product Vision

**Cubino** is a modern, self-hostable community platform where people gather in **Dens** (servers), chat in **Text Nests** (text channels), talk in **Voice Hollows** (voice channels), and connect through DMs and friends — all wrapped in a warm, playful **bear cub** aesthetic.

**Target users:** Friend groups, gaming communities, study groups, and small teams who want Discord-like functionality with a distinct brand and optional self-hosting.

**MVP goal:** A working real-time chat app with Dens, channels, DMs, basic roles, and peer-to-peer voice — deployable via Docker Compose on a VPS or Raspberry Pi.

**North-star goal:** Scalable SFU voice/video, discovery, moderation suite, PWA, and OAuth — phased after MVP.

---

## 2. Branding & Visual Identity

### 2.1 Name & Mascot

| Element | Detail |
|---------|--------|
| **Product name** | Cubino |
| **Mascot** | **Cubby** — friendly cartoon bear cub |
| **Voice** | Warm, playful, inclusive; never corporate or aggressive |
| **Logo** | Minimalist bear cub face (round ears, small nose, soft eyes) |

### 2.2 Color Palette (Dark Mode Default)

```css
/* Core */
--cubino-bg-deep:      #1a1410;   /* den interior */
--cubino-bg-surface:   #252018;   /* panels, sidebars */
--cubino-bg-elevated:  #2f2820;   /* cards, inputs */
--cubino-text-primary: #f5ebe0;   /* cream text */
--cubino-text-muted:   #a89888;   /* secondary text */

/* Brand accents */
--cubino-honey:        #e8a838;   /* primary CTA, highlights */
--cubino-amber:          #d4842a;   /* hover states */
--cubino-brown:          #8b5a3c;   /* borders, icons */
--cubino-cream:          #fff8f0;   /* inverted text on honey buttons */
--cubino-forest:         #4a7c59;   /* online / success */
--cubino-berry:          #c45c6a;   /* danger, mute indicator */
--cubino-sky:            #6ea8ff;   /* links, mentions (optional cool accent) */
```

### 2.3 Typography

- **UI font:** `Inter`, `Segoe UI`, or `Nunito` — rounded, readable at small sizes
- **Monospace (code blocks):** `JetBrains Mono` or `Fira Code`
- **Headings:** Semi-bold; avoid all-caps except tiny labels

### 2.4 Motifs & Micro-interactions

- **Shapes:** 12–16px border radius on panels; pill buttons
- **Patterns:** Subtle honeycomb background on splash/loading; paw-print ripple on primary button click
- **Shadows:** Soft, warm-tinted (`rgba(26, 20, 16, 0.4)`)
- **Loading:** Honeycomb spinner with Cubby peeking from behind
- **Empty states:** Cubby illustrations + short encouraging copy
- **Sounds (optional pack):** Soft stream, gentle hoot, paw tap — user-selectable in settings

### 2.5 Terminology Map (Discord → Cubino)

| Discord | Cubino |
|---------|--------|
| Server | **Den** |
| Text channel | **Text Nest** |
| Voice channel | **Voice Hollow** |
| Nitro | *(none in MVP — use “Cubino Plus” later if monetized)* |
| @everyone | **@whole-den** |
| Server boost | **Den warmth** *(future)* |

---

## 3. Core Features (Full Product)

### 3.1 Dens & Channels

- Create, join, leave, and delete Dens
- **Categories** group channels (e.g. General, Gaming, Hibernation Zone)
- **Text Nests:** `#`-prefixed in UI; real-time messaging
- **Voice Hollows:** speaker icon; WebRTC voice (video in v2)
- Sidebar: collapsible categories, unread badges, mute channel
- Den icon: circular image or default Cubby variant; hover tooltip with name
- Den settings: name, icon, banner, description, default notification level

### 3.2 Messaging

- Real-time delivery via WebSocket (Socket.IO)
- Typing indicators (debounced, channel-scoped)
- Emoji reactions (toggle own reaction; show count + tooltip of users)
- Edit message (show “edited” label + optional edit history for mods)
- Delete message (soft-delete for audit; hard-delete for own messages within window)
- **Markdown:** bold, italic, strikethrough, spoilers (`||text||`), blockquotes, lists
- **Code blocks:** fenced ``` with language tag → syntax highlighting (highlight.js or Shiki)
- **Slash commands (MVP subset):** `/giphy <query>`, `/nickname <name>`, `/me <action>`
- **Uploads:** drag-drop, paste image; preview inline; max size configurable (default 8 MB MVP, warn at 25 MB)
- **Pins:** pin/unpin (permission-gated); pinned messages panel
- **Search:** in-channel full-text search with jump-to-message

### 3.3 Voice & Video

**MVP:** P2P mesh in Voice Hollows (≤6 users); mute/deafen; speaking indicator

**v2:** SFU via **LiveKit** (preferred for speed) or self-hosted **mediasoup**

- Push-to-talk (configurable key) + voice activity detection
- Per-user volume slider
- Screen share (single window / full screen)
- Group video grid (“Cub Cam”) up to 25 participants (SFU phase)
- In-call overlay: who’s speaking, connection quality icon

### 3.4 Direct Messages & Friends

- Friend requests: send, accept, decline, block
- Presence-aware friend list (online / idle / dnd / invisible)
- 1:1 DMs and group DMs (up to 10)
- DM list: last message preview, unread count, pin DMs

### 3.5 Roles & Permissions

Bitfield or JSON permission set per role, per Den:

| Permission | Key |
|------------|-----|
| Administrator | `ADMINISTRATOR` |
| Manage Den | `MANAGE_DEN` |
| Manage channels | `MANAGE_CHANNELS` |
| Manage roles | `MANAGE_ROLES` |
| Kick members | `KICK_MEMBERS` |
| Ban members | `BAN_MEMBERS` |
| Send messages | `SEND_MESSAGES` |
| Manage messages | `MANAGE_MESSAGES` |
| Attach files | `ATTACH_FILES` |
| Connect voice | `CONNECT_VOICE` |
| Speak | `SPEAK` |
| Mute members | `MUTE_MEMBERS` |
| Deafen members | `DEAFEN_MEMBERS` |
| Mention @whole-den | `MENTION_EVERYONE` |

- Role hierarchy: higher position wins on conflicts
- Drag-and-drop role order in admin UI
- @role mentions with highlight

### 3.6 User Profiles & Presence

- Avatar upload + 12 default Cubby avatars
- Display name (global) + Den nickname (per-Den override)
- Bio / About Me (256 chars MVP)
- Status: Online, Idle, Do Not Disturb, Invisible
- Custom status text (128 chars)
- Activity: “Roaming in **Den Name** → **Voice Hollow**”

### 3.7 Notifications

- In-app notification drawer: mentions, friend requests, Den invites
- Desktop push (service worker + Web Push API)
- Per-Den overrides: All / @mentions only / Mute
- Sound toggles per category

### 3.8 Moderation

- Delete messages, timeout, kick, ban (with reason)
- Audit log: who did what, when, target, reason
- Slow mode (1s–6h between messages per channel)
- Link filter (allowlist/blocklist)
- Keyword auto-mod (flag or block)
- Report user flow → mod queue

### 3.9 Onboarding & Discovery

- First-run wizard: pick interests → create Den or join public community
- Discover page: featured public Dens, tag search
- Invite links: `cubino.gg/den/<code>` or self-hosted `cubino.ir/invite/<code>`
- Configurable expiry + max uses + grant role on join

### 3.10 Gamification (Cubino Touches)

| Badge | Trigger |
|-------|---------|
| First Roar | Send first message |
| Den Builder | Create a Den |
| Honey Gatherer | Upload 10 files |
| Night Owl | Send message after midnight |
| Hibernation Pro | 7-day login streak |

Cubby appears in celebration toasts when badges unlock.

### 3.11 Custom Emotes

- Global Cubby expression set (24 emotes MVP)
- Den-specific emotes (upload PNG/GIF, max 256 KB, 128×128) — permission-gated

---

## 4. UI / UX Layout

### 4.1 Desktop (≥1024px)

```
┌──────┬─────────────┬──────────────────────────────┬─────────────┐
│ Den  │  Channels   │         Messages             │  Members    │
│ rail │  + cats     │  (scroll + date dividers)    │  (toggle)   │
│ 72px │  240px      │         flex-1               │  240px      │
│      │             ├──────────────────────────────┤             │
│      │             │  Message input + uploads     │             │
├──────┴─────────────┴──────────────────────────────┴─────────────┤
│ User bar: avatar | status | mute | deafen | settings          │
└───────────────────────────────────────────────────────────────┘
```

### 4.2 Mobile

- Bottom nav or hamburger: Dens → Channels → Chat
- Member list as slide-over sheet
- Voice bar sticks above keyboard when in Voice Hollow

### 4.3 Accessibility

- Full keyboard navigation (Tab order: rail → channels → messages → input)
- ARIA labels on icon buttons
- Focus rings visible (honey-colored outline)
- Reduced motion: disable slide animations, keep opacity fades
- Screen reader announcements for new mentions

### 4.4 Key Screens

1. Splash / loading (Cubby + honeycomb spinner)
2. Login / Register
3. Onboarding wizard
4. Main app shell (layout above)
5. Den settings (tabs: Overview, Roles, Members, Bans, Audit)
6. User settings (Profile, Appearance, Notifications, Voice & Video, Keybinds)
7. Discover
8. DM view (same message UI, no channel sidebar)

---

## 5. Technical Architecture

### 5.1 Stack Summary

| Layer | Choice | Notes |
|-------|--------|-------|
| Frontend | **Next.js 14+ (App Router)** + React 18 | SSR for landing/marketing; SPA shell for app |
| Styling | **Tailwind CSS** + **Framer Motion** | Design tokens in `tailwind.config.ts` |
| Client state | **Zustand** | UI state, voice UI, sidebar |
| Server state | **TanStack Query** | REST caching, optimistic updates |
| Real-time | **Socket.IO** | Namespaced: `/chat`, `/presence`, `/signal` |
| API | **Fastify** + TypeScript | Faster than Express; schema validation via Zod |
| ORM | **Drizzle ORM** | Type-safe PostgreSQL |
| Database | **PostgreSQL 16** | Primary data store |
| Cache / pub-sub | **Redis 7** | Sessions, presence, rate limits, Socket.IO adapter |
| Voice (MVP) | **simple-peer** or native RTCPeerConnection + Socket.IO signaling | Mesh P2P |
| Voice (scale) | **LiveKit** self-hosted or cloud | SFU |
| Files | **MinIO** (S3-compatible) | Avatars, attachments, emotes |
| Auth | **JWT** access (15m) + refresh (7d) in httpOnly cookie | OAuth v2: Google, GitHub |
| Search | **PostgreSQL FTS** (MVP) → Meilisearch (v2) | Message search |
| Email | **Resend** or SMTP | Verification, password reset |
| PWA | **next-pwa** or custom service worker | Installable, push |

### 5.2 System Diagram

```mermaid
flowchart TB
  subgraph clients [Clients]
    Web[Next.js PWA]
    Mobile[Mobile Browser]
  end

  subgraph edge [Edge]
    CF[Cloudflare Tunnel / CDN]
  end

  subgraph app [Application Layer]
    API[Fastify API]
    WS[Socket.IO Gateway]
    VoiceSig[WebRTC Signaling]
  end

  subgraph data [Data Layer]
    PG[(PostgreSQL)]
    Redis[(Redis)]
    MinIO[(MinIO)]
  end

  subgraph media [Media - v2]
    LK[LiveKit SFU]
  end

  Web --> CF --> API
  Web --> CF --> WS
  Web -.->|WebRTC MVP| Web
  Web -.->|WebRTC v2| LK
  API --> PG
  API --> Redis
  API --> MinIO
  WS --> Redis
  WS --> PG
  VoiceSig --> WS
```

### 5.3 Monorepo Structure

```
cubino/
├── apps/
│   ├── web/                 # Next.js frontend
│   │   ├── app/
│   │   │   ├── (auth)/      # login, register
│   │   │   ├── (app)/       # main chat shell
│   │   │   ├── discover/
│   │   │   └── api/         # optional BFF routes
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   ├── den/
│   │   │   ├── voice/
│   │   │   └── ui/          # design system
│   │   ├── hooks/
│   │   ├── stores/          # Zustand
│   │   └── lib/
│   └── server/              # Fastify + Socket.IO
│       ├── src/
│       │   ├── routes/
│       │   ├── ws/
│       │   ├── services/
│       │   ├── db/
│       │   └── middleware/
│       └── drizzle/
├── packages/
│   ├── shared/              # types, constants, permissions
│   └── eslint-config/
├── docker/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   └── Dockerfile.*
├── docs/
│   └── CUBINO_SPEC.md       # this file
└── README.md
```

### 5.4 Docker Compose (MVP Dev)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: cubino
      POSTGRES_PASSWORD: cubino
      POSTGRES_DB: cubino
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports: ["9000:9000", "9001:9001"]
    environment:
      MINIO_ROOT_USER: cubino
      MINIO_ROOT_PASSWORD: cubino12345

  server:
    build: ./apps/server
    ports: ["3001:3001"]
    env_file: .env
    depends_on: [postgres, redis, minio]

  web:
    build: ./apps/web
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [server]

volumes:
  pgdata:
```

---

## 6. Data Model (Core Entities)

### 6.1 Tables (PostgreSQL)

```
users
  id, email, password_hash, username, display_name, avatar_url,
  bio, status, custom_status, created_at, updated_at

refresh_tokens
  id, user_id, token_hash, expires_at, revoked_at

dens
  id, name, icon_url, banner_url, owner_id, description,
  is_public, created_at

den_members
  den_id, user_id, nickname, joined_at

categories
  id, den_id, name, position

channels
  id, den_id, category_id, name, type (TEXT|VOICE), position, topic

messages
  id, channel_id, author_id, content, edited_at, deleted_at, created_at

message_reactions
  message_id, user_id, emoji, created_at

roles
  id, den_id, name, color, position, permissions (bigint)

member_roles
  den_id, user_id, role_id

dm_channels
  id, type (DM|GROUP), created_at

dm_participants
  dm_channel_id, user_id

dm_messages
  (same shape as messages, fk dm_channel_id)

friendships
  id, requester_id, addressee_id, status (PENDING|ACCEPTED|BLOCKED)

invites
  id, den_id, code, creator_id, max_uses, uses, expires_at

attachments
  id, message_id, filename, mime, size, storage_key, url

audit_logs
  id, den_id, actor_id, action, target_type, target_id, reason, created_at
```

### 6.2 Redis Keys

```
session:{userId}           → socket ids
presence:{userId}          → { status, lastSeen, denId, channelId }
typing:{channelId}         → set of userIds (TTL 8s)
ratelimit:{userId}:{route} → counter
```

---

## 7. API Outline (REST)

Base: `https://api.cubino.ir/v1` (or `/api/v1` same-origin)

### Auth
- `POST /auth/register` — email, username, password
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET  /auth/me`

### Dens
- `GET    /dens` — user’s Dens
- `POST   /dens` — create
- `GET    /dens/:id`
- `PATCH  /dens/:id`
- `DELETE /dens/:id`
- `POST   /dens/:id/join` — via invite code
- `GET    /dens/:id/members`
- `POST   /dens/:id/invites`

### Channels
- `GET    /dens/:denId/channels`
- `POST   /dens/:denId/channels`
- `PATCH  /channels/:id`
- `DELETE /channels/:id`

### Messages
- `GET    /channels/:id/messages?before=&limit=50`
- `POST   /channels/:id/messages`
- `PATCH  /messages/:id`
- `DELETE /messages/:id`
- `POST   /messages/:id/reactions`
- `GET    /channels/:id/messages/search?q=`

### DMs
- `GET    /dms`
- `POST   /dms` — { userIds[] }
- `GET    /dms/:id/messages`
- `POST   /dms/:id/messages`

### Roles
- `GET    /dens/:denId/roles`
- `POST   /dens/:denId/roles`
- `PATCH  /roles/:id`
- `DELETE /roles/:id`
- `PUT    /dens/:denId/members/:userId/roles`

### Uploads
- `POST   /uploads/presign` — returns MinIO presigned URL

---

## 8. WebSocket Events (Socket.IO)

**Namespace `/chat`**

| Client → Server | Payload |
|-----------------|---------|
| `join:channel` | `{ channelId }` |
| `leave:channel` | `{ channelId }` |
| `message:send` | `{ channelId, content, attachments? }` |
| `typing:start` | `{ channelId }` |
| `typing:stop` | `{ channelId }` |

| Server → Client | Payload |
|-----------------|---------|
| `message:create` | `Message` |
| `message:update` | `Message` |
| `message:delete` | `{ id, channelId }` |
| `typing:update` | `{ channelId, userIds[] }` |
| `presence:update` | `{ userId, status, ... }` |

**Namespace `/signal`** (voice MVP)

| Event | Purpose |
|-------|---------|
| `voice:join` | `{ channelId }` |
| `voice:leave` | `{ channelId }` |
| `signal:offer` | WebRTC SDP |
| `signal:answer` | WebRTC SDP |
| `signal:ice` | ICE candidate |
| `voice:state` | `{ muted, deafened, speaking }` |

Use `@socket.io/redis-adapter` for horizontal scale.

---

## 9. Security Requirements

- Passwords: **argon2id**
- Rate limit: login 5/min, messages 30/min per channel, uploads 10/hr
- CSRF protection on cookie-based refresh
- CORS: allow only `cubino.ir`, localhost dev origins
- Validate all uploads: MIME sniff, max size, virus scan (ClamAV v2)
- Sanitize Markdown render (no raw HTML; DOMPurify)
- Permission check on every WS event (channel membership + bitfield)
- Audit log for all mod actions

---

## 10. Environment Variables

```bash
# apps/server/.env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://cubino:cubino@localhost:5432/cubino
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=cubino
MINIO_SECRET_KEY=cubino12345
MINIO_BUCKET=cubino-uploads
CORS_ORIGIN=http://localhost:3000

# OAuth (v2)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# LiveKit (v2)
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 11. MVP Scope & Acceptance Criteria

### Phase 1 — MVP (build this first)

| # | Feature | Done when |
|---|---------|-----------|
| 1 | Auth (register/login/logout/JWT) | User can create account and persist session |
| 2 | Create/join Den | Owner creates Den; invite link joins member |
| 3 | Text Nests | Create channels; real-time messages appear for all members |
| 4 | Typing + reactions | Visible to channel members |
| 5 | Basic roles | @everyone + Admin role; send/manage permissions work |
| 6 | 1:1 DMs | Friend not required for MVP; start DM by username |
| 7 | Voice Hollow (P2P) | 2–4 users join voice; mute/deafen; speaking indicator |
| 8 | Cubino UI shell | Den rail, channel list, chat, user bar — on-brand dark theme |
| 9 | Docker Compose | `docker compose up` runs full stack locally |
| 10 | README | Setup documented; env vars explained |

### Phase 2 — Community
- Friends, group DMs, discovery, pins, search, file uploads, push notifications

### Phase 3 — Scale & polish
- LiveKit SFU, screen share, video grid, OAuth, audit log, auto-mod, PWA push, achievements

---

## 12. AI Agent Implementation Prompt

Copy everything below into an AI coding tool to start building:

---

**Build Cubino** — a full-stack Discord-like community chat platform.

Follow `CUBINO_SPEC.md` in the repo root for branding, architecture, and data models.

**Start with MVP Phase 1 only.**

### Stack (mandatory)
- Monorepo: `apps/web` (Next.js 14 App Router, Tailwind, Framer Motion, Zustand, TanStack Query)
- `apps/server` (Fastify, TypeScript, Socket.IO, Drizzle ORM)
- PostgreSQL + Redis + MinIO via Docker Compose
- JWT auth with httpOnly refresh cookies

### Brand (mandatory)
- Dark cozy den aesthetic: warm browns, honey `#e8a838`, cream text
- Mascot **Cubby** bear cub in empty states and loading spinner
- Terminology: Den, Text Nest, Voice Hollow
- Rounded UI, honeycomb loader, paw-click ripple on primary buttons

### UI layout (mandatory)
- Left Den rail (72px) → channel sidebar (240px) → message area → optional member list
- Bottom user bar with mute/deafen placeholders
- Mobile-responsive

### Implement in order
1. Scaffold monorepo + Docker Compose + README
2. Database schema (Drizzle migrations) for users, dens, channels, messages, roles, dm
3. Auth routes + middleware
4. Den/channel CRUD REST API
5. Socket.IO message relay with Redis adapter stub (single instance OK for MVP)
6. Next.js auth pages + main app shell matching brand
7. Real-time chat in Text Nest
8. Basic role permission checks
9. DM threads
10. WebRTC voice via Socket.IO signaling (simple-peer mesh, ≤4 users)
11. Seed script with demo Den + Cubby default avatars

### Code quality
- TypeScript strict mode
- Zod validation on all API inputs
- Shared types in `packages/shared`
- No placeholder lorem UI — use Cubby copy
- Include `.env.example`

### Do NOT implement in MVP
- LiveKit, OAuth, discovery, audit log, achievements, screen share, video grid

When MVP is complete, output run instructions and a short demo script (create user → create Den → send message → join voice).

---

## 13. Deployment Notes (Cubino Homelab)

For self-hosting on Raspberry Pi behind CGNAT:

- **Web app:** Cloudflare Tunnel → Next.js (port 3000)
- **WebSocket:** Cloudflare Tunnel supports WS to origin; enable in tunnel config
- **Voice:** WebRTC may need TURN server (coturn on VPS or LiveKit Cloud) — P2P fails for some NATs
- **Database:** PostgreSQL on Pi or managed (Supabase/Neon free tier)
- **Files:** MinIO on Pi or Cloudflare R2

---

*Cubino — gather in the den.*
