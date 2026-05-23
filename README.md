# Allo Inventory — Reservation System

A concurrency-safe inventory reservation system for multi-warehouse retail fulfillment, built with Next.js, Prisma, PostgreSQL, and Redis.

> Built as a take-home exercise for Allo Health Engineering.

## Live Demo

🔗 **[Live URL]** — _(Add your Vercel deployment URL here)_

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌───────────┐
│   Next.js   │───▶│  PostgreSQL  │    │   Redis   │
│  (Vercel)   │    │   (Neon)     │    │ (Upstash) │
│             │───▶│              │    │           │
│  App Router │    │  Prisma ORM  │    │Idempotency│
│  API Routes │    │  Row Locking │    │   Cache   │
└──────┬──────┘    └──────────────┘    └───────────┘
       │
       │ Cron (every 1 min)
       ▼
┌──────────────┐
│ Expire Stale │
│ Reservations │
└──────────────┘
```

## How to Run Locally

### Prerequisites
- Node.js 18+
- npm
- A PostgreSQL database (Neon, Supabase, or Railway — free tier)
- An Upstash Redis instance (free tier) — optional, used for idempotency bonus

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/allo-inventory.git
cd allo-inventory
npm install
```

### 2. Set Up Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
DATABASE_URL="postgresql://user:password@host:5432/allo-inventory?sslmode=require"
UPSTASH_REDIS_REST_URL="https://your-redis.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token"
RESERVATION_TTL_MINUTES=10
CRON_SECRET="your-secret"
```

### 3. Database Setup

```bash
# Push the Prisma schema to your database
npx prisma db push

# Seed the database with sample data
npm run db:seed
```

### 4. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## How It Works

### The Problem

In a multi-warehouse e-commerce system, there's a race condition between checkout and payment:
- If stock is decremented at **payment time**, two customers can pay for the same unit (overselling).
- If stock is decremented at **add-to-cart time**, abandoned carts falsely deplete inventory.

### The Solution: Reservations

When a customer proceeds to checkout, we **temporarily hold** (reserve) the units for a configurable window (default: 10 minutes). This is a three-state workflow:

1. **PENDING** → Units are reserved, timer is running
2. **CONFIRMED** → Payment succeeded, units are permanently sold
3. **RELEASED** → Payment failed, timer expired, or user cancelled — units return to available stock

### Concurrency Safety: `SELECT ... FOR UPDATE`

The reservation endpoint is the heart of this system. We use **pessimistic row-level locking** via PostgreSQL's `SELECT ... FOR UPDATE` to prevent race conditions:

```sql
BEGIN;
  -- Lock the inventory row — blocks other transactions from reading/modifying it
  SELECT * FROM "Inventory"
  WHERE "productId" = $1 AND "warehouseId" = $2
  FOR UPDATE;

  -- Check if enough stock is available
  -- If yes: increment reserved count, create reservation
  -- If no: rollback, return 409
COMMIT;
```

**Why this approach?**
- **Database-native**: No external infrastructure needed (unlike Redis locks)
- **Deadlock-safe**: We only lock one row per transaction
- **Proven**: PostgreSQL's MVCC + row locking is battle-tested
- **Simple**: Compared to optimistic locking (version columns + retry loops)

If two requests hit simultaneously for the last unit, PostgreSQL serializes them — the first transaction locks the row, the second waits. When the first commits, the second sees the updated `reserved` count and correctly returns 409.

### Reservation Expiry

We use a **hybrid approach** for releasing expired reservations:

1. **Lazy cleanup on read**: When fetching products (`GET /api/products`) or a specific reservation (`GET /api/reservations/:id`), we check for and release any expired `PENDING` reservations. This ensures stock counts are always accurate, even if the cron hasn't run yet.

2. **Vercel Cron job** (`/api/cron/expire-reservations`): Runs every minute and bulk-releases all expired `PENDING` reservations. This handles background cleanup and keeps the database tidy.

**Why both?** The cron provides periodic background cleanup, but if it's delayed (e.g., cold start, rate limiting on Vercel's free tier), the lazy cleanup ensures correctness on the next read. The two approaches are complementary and idempotent — running both never double-releases.

**CRON_SECRET**: On Vercel Pro plans, the `CRON_SECRET` environment variable is injected automatically. On the free tier, you must set it manually in your Vercel dashboard environment variables. The cron endpoint checks `Authorization: Bearer <CRON_SECRET>` to prevent unauthorized access.

### Idempotency (Bonus)

The reserve and confirm endpoints support idempotency via the `Idempotency-Key` request header:

```bash
curl -X POST /api/reservations \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-request-id-123" \
  -d '{"productId": "...", "warehouseId": "...", "quantity": 1}'
```

**How it works:**
1. On the first request, we process normally and cache the response in Redis with a 24-hour TTL, keyed by `idempotency:{key}`.
2. On retries with the same key, we return the cached response without re-executing the side effect.
3. If Redis is unavailable, we gracefully degrade — the request proceeds without idempotency protection (fail-open).

### Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Two users reserve the last unit simultaneously | Exactly one gets 201, the other gets 409 (`SELECT ... FOR UPDATE`) |
| User tries to confirm an expired reservation | 410 with message; units lazily released |
| User tries to release an already-confirmed reservation | No-op (not an error) — units are permanently sold |
| User tries to release an already-released reservation | No-op — returns current state |
| Cron and lazy expiry both try to release the same reservation | Idempotent — the second attempt is a no-op |
| Redis is down | Idempotency degrades gracefully; core reservation logic is unaffected |

## API Reference

| Method | Path | Behaviour |
|--------|------|-----------|
| `GET` | `/api/products` | List products with available stock per warehouse |
| `GET` | `/api/warehouses` | List all warehouses |
| `POST` | `/api/reservations` | Reserve units (409 if insufficient stock) |
| `GET` | `/api/reservations/:id` | Get reservation details |
| `POST` | `/api/reservations/:id/confirm` | Confirm purchase (410 if expired) |
| `POST` | `/api/reservations/:id/release` | Cancel/release reservation |
| `GET` | `/api/cron/expire-reservations` | Cron: release expired reservations |

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 14 (App Router) | Full-stack React with API routes |
| Language | TypeScript | Type safety end-to-end |
| Database | PostgreSQL (Neon) | Serverless, free tier, row-level locking |
| ORM | Prisma | Type-safe database access, migrations |
| Cache | Redis (Upstash) | Serverless, free tier, idempotency store |
| Validation | Zod | Shared schemas between API and frontend |
| Styling | Tailwind CSS | Utility-first, rapid UI development |
| Icons | Lucide React | Consistent, lightweight icon set |
| Toasts | Sonner | Clean toast notifications |
| Hosting | Vercel | Serverless deployment, cron jobs |

## Trade-offs & Things I'd Do Differently

### What I'd improve with more time:

1. **Optimistic UI updates**: Currently the frontend re-fetches after mutations. I'd add optimistic updates with rollback on error for snappier UX.

2. **WebSocket/SSE for real-time stock**: Instead of polling every 15s, use Server-Sent Events or WebSockets so stock counts update in real-time across all connected clients.

3. **Rate limiting**: Add rate limiting on the reservation endpoint to prevent abuse (e.g., one customer hoarding all stock with rapid-fire reservations).

4. **Unit tests**: Add comprehensive tests for the concurrency logic using concurrent API calls to verify the `SELECT ... FOR UPDATE` behavior under load.

5. **User authentication**: Currently there's no concept of a "user" — reservations are anonymous. In production, you'd tie reservations to authenticated users.

6. **Bulk reservation**: Reserve multiple products from multiple warehouses in a single transaction (cart-level reservation vs. item-level).

7. **Warehouse selection strategy**: Automatically pick the optimal warehouse based on proximity, stock levels, or shipping cost — rather than having the user choose.

### Conscious trade-offs made:

- **No authentication**: Kept the system simple and focused on the core reservation logic. Auth would add complexity without demonstrating the concurrency guarantees.

- **Polling over WebSockets**: Simpler to implement and debug. The 15s polling interval is a pragmatic choice for a demo.

- **Single-item reservation**: Each reservation is for one product from one warehouse. This keeps the locking strategy simple (one row lock per transaction).

- **TTL as env var**: `RESERVATION_TTL_MINUTES` defaults to 10 minutes but can be set to 2 minutes in the Vercel dashboard for demo purposes during the debrief call.

## Project Structure

```
allo-inventory/
├── prisma/
│   ├── schema.prisma          # Data model
│   └── seed.ts                # Database seed script
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout with Toaster
│   │   ├── page.tsx           # Product listing page
│   │   ├── globals.css        # Global styles
│   │   ├── reservation/
│   │   │   └── [id]/
│   │   │       └── page.tsx   # Checkout page with countdown
│   │   └── api/
│   │       ├── products/route.ts
│   │       ├── warehouses/route.ts
│   │       ├── reservations/
│   │       │   ├── route.ts              # POST create, GET list
│   │       │   └── [id]/
│   │       │       ├── route.ts          # GET by ID
│   │       │       ├── confirm/route.ts  # POST confirm
│   │       │       └── release/route.ts  # POST release
│   │       └── cron/
│   │           └── expire-reservations/route.ts
│   └── lib/
│       ├── prisma.ts          # Prisma client singleton
│       ├── redis.ts           # Upstash Redis client
│       ├── validators.ts      # Zod schemas
│       ├── idempotency.ts     # Idempotency helper
│       └── utils.ts           # Utility functions
├── vercel.json                # Cron job config
├── .env.example               # Environment variables template
└── README.md
```

## License

MIT
