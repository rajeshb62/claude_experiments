# OpenFX Demo — UAE AED → MXN Remittance API

A Node.js simulation of the OpenFX cross-border payment product for a UAE remittance company.

**Key differences vs correspondent banking, visible throughout this demo:**

| | Correspondent banking | OpenFX |
|---|---|---|
| Settlement time | 2–5 business days | ~90 seconds |
| All-in cost | ~3.5% (FX spread + per-hop fees) | 0.15% |
| Pre-funding required | Yes — nostro accounts at every correspondent | No |
| Availability | Business hours, banking days only | 24/7/365 |
| FX transparency | Opaque — spread baked into rate | Mid-market rate, fee shown upfront |
| Last-mile fees | Per-recipient beneficiary bank charges | None |

---

## Setup

```bash
npm install
node server.js
```

API runs on `http://localhost:3000`.

---

## Full Happy Path — Friday 9 PM (after banking hours)

This scenario deliberately initiates at 21:00 on a Friday to illustrate that OpenFX processes regardless of day or time.  
A conventional wire at this hour would not begin processing until Monday morning.

### Step 0 — Verify the system is running on a Friday night

```bash
curl -s http://localhost:3000/health | jq
```

Expected: `isWeekend: true` (if run on a Sat/Sun) or note that payments process regardless.

---

### Step 1 — Check sender wallet balance

```bash
curl -s http://localhost:3000/wallet/balance | jq
```

Starts at AED 100,000.

---

### Step 2 — Request a live FX quote

```bash
curl -s -X POST http://localhost:3000/quote \
  -H "Content-Type: application/json" \
  -d '{
    "senderAED": 5000,
    "requestedAt": "2026-04-10T21:00:00.000Z"
  }' | jq
```

> **Conventional banking contrast:** Your bank would be closed at 9 PM Friday.  
> Even if an online portal accepted the instruction, it would queue until Monday.  
> The FX rate shown would include a 1–3% bank spread on top of mid-market.

**Save the `quoteId` from the response** — you have 30 seconds to execute.

---

### Step 3 — Execute the payment

Replace `<QUOTE_ID>` with the value from Step 2.

```bash
curl -s -X POST http://localhost:3000/payment/execute \
  -H "Content-Type: application/json" \
  -d '{
    "quoteId": "<QUOTE_ID>",
    "recipientCount": 3,
    "recipientDetails": [
      { "name": "Maria García",   "clabe": "002180700149023547" },
      { "name": "Carlos Mendoza", "clabe": "012180015600183218" },
      { "name": "Ana López",      "clabe": "706180001400041688" }
    ]
  }' | jq
```

> **Conventional banking contrast:** The bank would check its nostro account balance  
> at the correspondent in Mexico — if the account is low, the payment is held until  
> a top-up wire (itself 1-2 days) settles. Here there is no nostro: the OpenFX network  
> provides liquidity on demand.

**Save the `paymentId` from the response.**

---

### Step 4 — Poll status immediately after execution

```bash
curl -s http://localhost:3000/payment/<PAYMENT_ID>/status | jq
```

---

### Step 5 — Check status 20 seconds later

```bash
sleep 20 && curl -s http://localhost:3000/payment/<PAYMENT_ID>/status | jq
```

You'll see the payment progressing through `CONVERTING → ON_NETWORK → ROUTING_TO_SPEI`.

---

### Step 6 — Check status at 60 seconds

```bash
sleep 40 && curl -s http://localhost:3000/payment/<PAYMENT_ID>/status | jq
```

Expected stage: `SPEI_PROCESSING` or `CREDITED`.

> **Conventional banking contrast:** At this point in a correspondent payment, your  
> message has barely left your originating bank. It may be waiting in a SWIFT queue  
> for the next batch window.

---

### Step 7 — Disburse to recipients via SPEI

Once the payment reaches `SPEI_PROCESSING` or `CREDITED`:

```bash
curl -s -X POST http://localhost:3000/payment/<PAYMENT_ID>/disburse \
  -H "Content-Type: application/json" \
  -d '{}' | jq
```

MXN is split equally across the 3 recipients with no per-recipient fee.

> **Conventional banking contrast:** The beneficiary bank in Mexico would typically  
> charge a receiving fee per recipient, deducted silently from the amount credited.

---

### Step 8 — Full payment summary with cost comparison

```bash
curl -s http://localhost:3000/payment/<PAYMENT_ID>/summary | jq
```

Look at the `comparison` block — it shows the side-by-side between OpenFX and  
a conventional correspondent bank wire.

---

### Step 9 — Verify wallet was debited

```bash
curl -s http://localhost:3000/wallet/balance | jq
```

Balance should be AED 95,000 (100,000 − 5,000 sent).

---

### Step 10 — Top up the wallet (instant, no pre-funding delay)

```bash
curl -s -X POST http://localhost:3000/wallet/topup \
  -H "Content-Type: application/json" \
  -d '{ "amount": 10000 }' | jq
```

> **Conventional banking contrast:** Topping up a nostro account requires a wire  
> transfer from your correspondent relationship bank — typically 1-2 business days.  
> You must pre-fund *before* you know your payment volume, tying up capital.  
> OpenFX has no nostro: you top up your own wallet and it's available immediately.

---

## All Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/health` | System health + 24/7 availability status |
| `GET`  | `/wallet/balance` | Sender AED wallet balance |
| `POST` | `/wallet/topup` | Instantly add AED |
| `POST` | `/quote` | Request locked FX quote (30s expiry) |
| `POST` | `/payment/execute` | Execute against a quote |
| `GET`  | `/payment/:id/status` | Real-time stage tracking |
| `POST` | `/payment/:id/disburse` | Split MXN to recipients via SPEI |
| `GET`  | `/payment/:id/summary` | Full summary + cost comparison |

---

## Payment Stage Timeline

```
QUOTE_LOCKED      →  0s
AED_RECEIVED      →  5s
CONVERTING        → 10s
ON_NETWORK        → 20s
ROUTING_TO_SPEI   → 35s
SPEI_PROCESSING   → 50s
CREDITED          → 90s  (~1.5 minutes total)
```

Compare to correspondent banking: each hop adds 1–2 **days**, not seconds.
