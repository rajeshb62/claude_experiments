# Requirements: Cross-Border Stablecoin-to-INR Payment Platform

## Overview

Build a B2B payment platform that allows foreign buyers to pay Indian suppliers in INR using USDC as the funding rail. The architecture is split across two legal entities:

- **Foreign Entity** — handles USDC receipt and USD conversion. Deployed outside India (e.g., Singapore region).
- **Indian Entity** — holds the PA-CB compliance logic, handles USD→INR conversion and INR disbursement to Indian suppliers via UPI/NEFT/IMPS. Deployed in India.

The Indian supplier receives a normal INR bank transfer. They never interact with crypto in any way.

---

## Tech Stack

- **Backend**: Node.js + TypeScript, Express, Prisma ORM
- **Database**: PostgreSQL (separate instances for each entity)
- **Queue**: BullMQ with Redis
- **Blockchain**: Ethers.js v6 (USDC on-chain monitoring)
- **Frontend**: Next.js 14 (App Router), Tailwind CSS, shadcn/ui
- **Auth**: Clerk
- **Notifications**: Resend (email), Twilio (SMS)
- **Secrets**: Environment variables via `.env` — never hardcoded

---

## Repository Structure

```
/
├── apps/
│   ├── foreign-entity/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   │   ├── wallet.service.ts
│   │   │   │   ├── conversion.service.ts
│   │   │   │   ├── transfer.service.ts
│   │   │   │   └── webhook.service.ts
│   │   │   ├── jobs/
│   │   │   │   └── chain-monitor.job.ts
│   │   │   └── prisma/schema.prisma
│   │   └── Dockerfile
│   │
│   ├── indian-entity/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   │   ├── forex.service.ts
│   │   │   │   ├── payout.service.ts
│   │   │   │   ├── compliance.service.ts
│   │   │   │   └── reconciliation.service.ts
│   │   │   ├── jobs/
│   │   │   │   └── payout.job.ts
│   │   │   └── prisma/schema.prisma
│   │   └── Dockerfile
│   │
│   └── dashboard/
│       ├── app/
│       │   ├── (auth)/
│       │   ├── (dashboard)/
│       │   │   ├── payments/
│       │   │   ├── suppliers/
│       │   │   ├── quotes/
│       │   │   └── compliance/
│       │   └── api/
│       └── components/
│
├── packages/
│   ├── shared-types/
│   └── shared-utils/
│
├── docker-compose.yml
└── .env.example
```

---

## Data Models

### Foreign Entity — `schema.prisma`

```prisma
model PaymentOrder {
  id                    String    @id @default(cuid())
  referenceId           String    @unique
  buyerEmail            String
  buyerEntityName       String

  usdcAmountExpected    Decimal
  usdcAmountReceived    Decimal?
  depositWalletAddress  String
  depositChain          String    // POLYGON | BASE | ETHEREUM | ARBITRUM

  usdcTxHash            String?
  usdcReceivedAt        DateTime?

  usdConversionRate     Decimal?
  usdAmountAfterFees    Decimal?

  wireTransferRef       String?
  wireSentAt            DateTime?

  status                ForeignOrderStatus
  indianOrderId         String?

  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
}

enum ForeignOrderStatus {
  PENDING_USDC
  USDC_RECEIVED
  CONVERTING
  WIRE_SENT
  COMPLETED
  FAILED
  REFUNDED
}

model AuditLog {
  id          String   @id @default(cuid())
  entityType  String
  entityId    String
  action      String
  metadata    Json?
  createdAt   DateTime @default(now())
}
```

### Indian Entity — `schema.prisma`

```prisma
model InboundRemittance {
  id              String   @id @default(cuid())
  foreignOrderId  String   @unique

  usdAmountReceived  Decimal
  femaPurposeCode    String
  forexRate          Decimal
  inrAmountGross     Decimal
  platformFeeInr     Decimal
  inrAmountNet       Decimal

  supplierId         String
  supplier           Supplier @relation(fields: [supplierId], references: [id])

  payoutMethod       PayoutMethod
  payoutRef          String?
  payoutInitiatedAt  DateTime?
  payoutCompletedAt  DateTime?

  status  RemittanceStatus

  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

enum RemittanceStatus {
  AWAITING_FUNDS
  FUNDS_RECEIVED
  PAYOUT_QUEUED
  PAYOUT_SENT
  SETTLED
  FAILED
  ON_HOLD
}

enum PayoutMethod {
  UPI
  NEFT
  IMPS
}

model Supplier {
  id              String  @id @default(cuid())
  businessName    String
  gstin           String? @unique
  panNumber       String  @unique

  accountHolderName  String
  accountNumber      String
  ifscCode           String
  bankName           String
  upiId              String?

  kycStatus  KycStatus
  kycDocs    Json?

  remittances  InboundRemittance[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

enum KycStatus {
  PENDING
  VERIFIED
  REJECTED
}

model QuoteLog {
  id            String   @id @default(cuid())
  usdcAmount    Decimal
  usdRate       Decimal
  forexRate     Decimal
  inrAmount     Decimal
  feeBreakdown  Json
  expiresAt     DateTime
  used          Boolean  @default(false)
  createdAt     DateTime @default(now())
}

model AuditLog {
  id          String   @id @default(cuid())
  entityType  String
  entityId    String
  action      String
  metadata    Json?
  createdAt   DateTime @default(now())
}
```

---

## API Endpoints

### Foreign Entity

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/quotes` | Get a live quote — USDC amount in, INR amount out, fees, expiry |
| POST | `/api/v1/orders` | Create a payment order — returns unique deposit wallet address and USDC amount |
| GET | `/api/v1/orders/:id` | Get full order status |
| POST | `/api/v1/webhooks/chain` | Internal — called by chain monitor job when USDC transfer is confirmed on-chain |
| GET | `/health` | Returns DB + Redis connectivity status |

### Indian Entity

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/suppliers` | Register a new supplier with KYC details and bank info |
| GET | `/api/v1/suppliers/:id` | Get supplier profile and KYC status |
| POST | `/api/v1/remittances/inbound` | Called by foreign entity when USD wire is dispatched — creates remittance record |
| GET | `/api/v1/remittances/:id` | Get remittance and payout status |
| POST | `/api/v1/payouts/process` | Internal — trigger INR disbursement for a queued remittance |
| GET | `/api/v1/reconciliation` | Daily reconciliation report — all settlements, fees, forex P&L |
| GET | `/health` | Returns DB + Redis connectivity status |

### Dashboard (Next.js Route Handlers)

```
/api/quotes/create
/api/payments/initiate
/api/payments/[id]/status
/api/suppliers/register
/api/suppliers/[id]/kyc
```

---

## Service Logic

### Quote Generation

1. Fetch live USDC/USD rate from exchange API (mock: fixed at 0.9998)
2. Fetch live USD/INR forex rate from provider (mock: fixed at 84.50)
3. Calculate USDC needed → USD value → INR delivered
4. Apply platform fee: 0.8% on FX spread + flat $5 USD equivalent
5. Return quote object with 5-minute TTL
6. Persist to `QuoteLog` for audit

### Deposit Wallet Generation

- On order creation, generate a unique single-use USDC deposit address using BIP44 HD wallet derivation from a master mnemonic stored in environment secrets
- Store the derivation path in the database linked to the order
- Never reuse wallet addresses — one per order, always
- Support USDC on: Polygon, Base, Ethereum mainnet, Arbitrum — buyer selects chain at order creation

### On-Chain Monitoring (`chain-monitor.job.ts`)

- Use Alchemy or QuickNode websocket subscriptions to listen for ERC-20 Transfer events on the USDC contract
- Filter for transfers to any active deposit address
- On confirmed transfer (2 block confirmations on Polygon/Base, 6 on Ethereum):
  - Match transfer to order via deposit address lookup
  - Record `usdcTxHash`, `usdcAmountReceived`, `usdcReceivedAt`
  - Update order status to `USDC_RECEIVED`
  - Enqueue USDC→USD conversion job

### USDC→USD Conversion (`conversion.service.ts`)

- Integrate with licensed exchange API (mock: log conversion at fixed rate, return immediately)
- Place market sell: USDC → USD
- Record `usdConversionRate` and `usdAmountAfterFees`
- Update order status to `CONVERTING` then `WIRE_SENT`
- Enqueue wire transfer job

### USD Wire to Indian Entity (`transfer.service.ts`)

- Initiate USD wire from foreign entity bank account to Indian entity nostro account (mock: log to DB only)
- Wire reference field must contain the PaymentOrder `referenceId`
- On wire initiation, call Indian entity `POST /api/v1/remittances/inbound` with HMAC-signed payload containing: `foreignOrderId`, `usdAmount`, `supplierId`, `femaPurposeCode`, `buyerEntityName`
- Update order status to `WIRE_SENT`

### INR Disbursement (`payout.service.ts`)

- On receiving the inbound webhook, create `InboundRemittance` with status `AWAITING_FUNDS`
- When USD wire credit is confirmed in nostro (mock: auto-confirm after 60 seconds in dev), update to `FUNDS_RECEIVED`
- Enqueue payout job in BullMQ
- Payout job calls Razorpay Payouts API (sandbox in dev):
  - UPI for amounts under ₹2 lakh — instant
  - IMPS for amounts ₹2 lakh to ₹10 lakh — instant
  - NEFT for amounts above ₹10 lakh — scheduled
- On UTR/transaction ID confirmation from Razorpay, update status to `SETTLED`
- Record `payoutRef` (UTR number), `payoutCompletedAt`
- Send email via Resend and SMS via Twilio to supplier confirming payment with amount and UTR

---

## Compliance Requirements

- Every `InboundRemittance` must have a `femaPurposeCode` assigned before payout is triggered — do not allow payout without it
- Generate a **FIRA PDF** (Foreign Inward Remittance Advice) for every `SETTLED` remittance — supplier downloads this from the portal for GST and tax purposes. FIRA must include: amount in USD, INR equivalent, forex rate applied, UTR number, date, purpose code, buyer entity name, supplier PAN
- KYC gate: block payout if supplier `kycStatus` is not `VERIFIED`
- AML hold: auto-set status to `ON_HOLD` for any single remittance where `inrAmountNet` exceeds ₹50,00,000 — require manual admin approval to release
- Audit log: every status transition on `PaymentOrder` and `InboundRemittance` must write an immutable row to the respective `AuditLog` table — never update or delete audit rows
- Encrypt at rest: `accountNumber`, `panNumber`, and `upiId` fields must be encrypted using AES-256 before DB write, decrypted on read

---

## Dashboard Features

### Admin Dashboard (Clerk-authenticated)

**Payments**
- Table of all payment orders with columns: Reference ID, Buyer, Supplier, USDC Amount, INR Amount, Status, Created At
- Click-through to order detail: full timeline of status changes, amounts at each step, tx hash link to block explorer
- Filter by status, date range, supplier

**New Payment Wizard**
- Step 1: Select existing supplier or add new
- Step 2: Enter USD amount — show live INR quote with fee breakdown, 5-minute countdown timer
- Step 3: Show deposit instructions — USDC amount, wallet address, QR code, selected chain
- Confirmation screen once USDC is detected on-chain

**Supplier Directory**
- List all suppliers with KYC status badges
- Add supplier form: business name, PAN, GSTIN, bank details, UPI ID
- KYC document upload and manual verification toggle for admin

**Compliance**
- Table of all remittances with FEMA purpose codes
- Export to CSV button
- AML holds queue — list of on-hold remittances with approve/reject action

**Reconciliation**
- Daily summary: total USD received, total INR disbursed, total platform fees, forex P&L
- Downloadable PDF report per day

### Payment Status Page (Public, No Auth)

Route: `/payment/[orderId]`

- Accessible by anyone with the order ID — shareable link for the buyer
- Displays: USDC amount expected, deposit wallet address, QR code, selected chain
- Real-time status indicator with these stages: Waiting for USDC → USDC Received → Converting to USD → Sending to India → Paying Supplier → Completed
- Auto-refreshes every 10 seconds via polling
- On completion: shows INR amount delivered and UTR number

### Supplier Portal (Separate Clerk org or role)

- Login for supplier to view their own payment history only
- Download FIRA PDF for each settled remittance
- Update bank details (triggers re-verification flag)
- View pending and in-progress payments

---

## Third-Party Integrations

Build with mocks first using the mock column below. Each mock must be a clearly named service wrapper so it can be swapped for the real integration without changing calling code.

| Purpose | Mock | Real Integration |
|---------|------|-----------------|
| USDC→USD conversion | Fixed rate 0.9998, instant | Coinbase Prime API or B2C2 API |
| USD/INR forex rate | Fixed rate 84.50 | CCIL rate feed or Wise rate API |
| USD wire to Indian entity | Log intent to DB, auto-confirm after 60s | Wise Business API or Currencycloud |
| INR payout | Razorpay Payouts sandbox | Razorpay Payouts live or Cashfree Payouts |
| Chain monitoring | HTTP polling every 15s via Alchemy | Alchemy websocket subscriptions |
| KYC verification | Manual admin toggle in dashboard | Digio API or Hyperverge API |
| Email | Log to console | Resend API |
| SMS | Log to console | Twilio API |

---

## Inter-Service Security

- All HTTP calls from foreign entity to Indian entity must include an `X-Webhook-Signature` header containing an HMAC-SHA256 signature of the request body using a shared secret
- Indian entity must verify this signature before processing any inbound webhook — reject with 401 if invalid
- The two services must never share a database or import each other's code — communicate only via HTTP

---

## Environment Variables

### Foreign Entity `.env`

```
DATABASE_URL=
REDIS_URL=
MASTER_WALLET_MNEMONIC=
ALCHEMY_API_KEY=
USDC_CONTRACT_POLYGON=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
USDC_CONTRACT_BASE=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
EXCHANGE_API_KEY=
INDIAN_ENTITY_WEBHOOK_URL=
INDIAN_ENTITY_WEBHOOK_SECRET=
PORT=3001
```

### Indian Entity `.env`

```
DATABASE_URL=
REDIS_URL=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
FOREX_API_KEY=
RESEND_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
FEMA_ENTITY_CODE=
ENCRYPTION_KEY=
WEBHOOK_SECRET=
PORT=3002
```

### Dashboard `.env`

```
NEXT_PUBLIC_FOREIGN_API_URL=http://localhost:3001
NEXT_PUBLIC_INDIAN_API_URL=http://localhost:3002
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```

---

## Build Order

Build in this sequence. Each step should be fully working before moving to the next.

1. Monorepo scaffolding — set up workspaces, shared-types package, Docker Compose with Postgres and Redis
2. Foreign entity — Prisma schema, migrations, basic Express server with `/health`
3. Indian entity — Prisma schema, migrations, basic Express server with `/health`
4. Quote API on foreign entity with mocked rates
5. Order creation with HD wallet address generation
6. Chain monitor job using HTTP polling (Alchemy)
7. USDC→USD mock conversion + wire notification to Indian entity
8. Indian entity inbound remittance handler + INR payout via Razorpay sandbox
9. Payment status page (public-facing, polling)
10. Admin dashboard — payments table and new payment wizard
11. Supplier onboarding form and KYC toggle
12. FIRA PDF generation and download
13. Audit logging on all status transitions
14. AML hold logic
15. Supplier portal
16. Replace all mocks with live integrations
17. HMAC webhook signature verification between services

---

## Hard Rules for Implementation

- Never log wallet mnemonics, private keys, account numbers, or PAN numbers anywhere
- All payment status changes must use database transactions — no partial updates
- Every BullMQ job must be idempotent — safe to retry multiple times without side effects
- The foreign entity and Indian entity must be independently deployable
- Do not share code across service boundaries — shared-types package for TypeScript interfaces only
- All encrypted fields (accountNumber, panNumber, upiId) must be encrypted before insert and decrypted after select — never store plaintext
- AuditLog rows are append-only — no update or delete operations permitted on that table