# UAE → Mexico Conventional FX Payment API

Simulates the full lifecycle of a cross-border remittance through the correspondent banking network — from a UAE sender sending AED to Mexican recipients receiving MXN via SWIFT + SPEI.

## What this models

```
UAE Sender (AED)
      │
      ▼
[UAE Bank - FX Desk]          ← AED/MXN conversion at marked-up rate
      │  SWIFT MT103
      ▼
[US Correspondent - New York]  ← Hop 1, 4h, 0.3% fee, EST hours
      │  SWIFT MT103
      ▼
[Mexican Correspondent - CDMX] ← Hop 2, 8h, 0.4% fee, CST hours
      │  SPEI
      ▼
[Local Mexican Bank]           ← Hop 3, 6h, 0.2% fee, CST hours
      │
      ▼
Mexican Recipients (MXN)
```

## Quick start

```bash
npm install
npm start       # runs on http://localhost:3000
# or
PORT=3111 npm start
```

## Fee anatomy for AED 5,000 → 3 recipients

| Fee | Amount | Why it exists |
|-----|--------|---------------|
| SWIFT message fee | AED 25 | Cost of sending the MT103 message over the SWIFT network |
| Correspondent lifting fee | ~AED 24.88 (0.5%) | US correspondent charges for USD liquidity and routing |
| FX markup (hidden) | ~MXN 1,733 | 3.5% spread over mid-market — the bank's main profit centre. Shown as a worse rate, not a fee. |
| Hop 1 fee | ~MXN 143 (0.3%) | US correspondent fee for processing the transfer |
| Hop 2 fee | ~MXN 191 (0.4%) | Mexican correspondent fee for SPEI access |
| Hop 3 fee | ~MXN 95 (0.2%) | Local Mexican bank SPEI credit fee |
| Disbursement fee | MXN 45 (15×3) | Per-recipient SPEI transaction fee |
| **Total effective cost** | **~5.4%** | G20 target: <3%. World Bank target: <5%. |

---

## API reference + curl commands

### Full happy path

All commands use `requestedAt` set to a Wednesday 11am GST (UTC+4) — well within UAE banking hours.

---

#### Step 1: Check nostro balance

```bash
curl http://localhost:3000/nostro/balance
```

Expected response:
```json
{
  "balanceMXN": 300000,
  "currency": "MXN",
  "pendingTopupsMXN": 0,
  "projectedBalanceMXN": 300000,
  "pendingTopups": []
}
```

---

#### Step 2: Initiate payment

```bash
curl -X POST http://localhost:3000/payment/initiate \
  -H 'Content-Type: application/json' \
  -d '{
    "senderAED": 5000,
    "recipientCount": 3,
    "requestedAt": "2026-04-08T07:00:00Z"
  }'
```

Expected response:
```json
{
  "paymentId": "<uuid>",
  "status": "FX_CONVERTING",
  "message": "Payment initiated. Proceed to POST /payment/:id/fx-convert",
  "senderAED": 5000,
  "recipientCount": 3,
  "initiatedAt": "...",
  "nextStep": "POST /payment/<uuid>/fx-convert"
}
```

Copy the `paymentId` and use it in subsequent steps.

---

#### Step 3: FX conversion

```bash
curl -X POST http://localhost:3000/payment/<paymentId>/fx-convert \
  -H 'Content-Type: application/json'
```

Expected response:
```json
{
  "paymentId": "...",
  "status": "IN_TRANSIT",
  "inputAED": 5000,
  "swiftFeeAED": 25,
  "correspondentFeeAED": 24.88,
  "totalFeesAED": 49.88,
  "netAEDConverted": 4950.13,
  "baseRateMXNperAED": 10,
  "fxMarkupPercent": 3.5,
  "appliedRateMXNperAED": 9.65,
  "convertedMXN": 47768.71,
  "swiftFeeMXN": 241.25,
  "correspondentFeeMXN": 240.04,
  "fxMarkupCostMXN": 1732.54,
  "totalFeesMXN": 2213.84,
  "nostroBalanceAfterReservationMXN": 252231.29
}
```

---

#### Step 4: Route through correspondent banks

```bash
curl -X POST http://localhost:3000/payment/<paymentId>/route \
  -H 'Content-Type: application/json'
```

Expected response (abridged):
```json
{
  "status": "HOP_3",
  "startingMXN": 47768.71,
  "totalHopFeesMXN": 428.68,
  "finalMXNAfterRouting": 47340.03,
  "hops": [
    {
      "hopNumber": 1,
      "from": "UAE Bank",
      "to": "US Correspondent (New York)",
      "status": "PROCESSED",
      "delayHours": 4,
      "feePercent": 0.3,
      "feeDeductedMXN": 143.31,
      "processAt": "...",
      "completedAt": "..."
    },
    {
      "hopNumber": 2,
      "from": "US Correspondent (New York)",
      "to": "Mexican Correspondent (Mexico City)",
      "status": "PROCESSED",
      "delayHours": 8,
      "feePercent": 0.4,
      "feeDeductedMXN": 190.5
    },
    {
      "hopNumber": 3,
      "from": "Mexican Correspondent (Mexico City)",
      "to": "Local Mexican Bank (SPEI destination)",
      "status": "QUEUED_UNTIL_BANK_OPEN",
      "delayHours": 6,
      "feePercent": 0.2,
      "feeDeductedMXN": 94.87
    }
  ]
}
```

---

#### Step 5: Disburse to recipients

```bash
curl -X POST http://localhost:3000/payment/<paymentId>/disburse \
  -H 'Content-Type: application/json'
```

Expected response:
```json
{
  "status": "COMPLETED",
  "recipientCount": 3,
  "availableMXNBeforeDisbursement": 47340.03,
  "disbursementFeePerRecipientMXN": 15,
  "totalDisbursementFeesMXN": 45,
  "perRecipientMXN": 15765.01,
  "disbursedAt": "..."
}
```

---

#### Step 6: Full summary

```bash
curl http://localhost:3000/payment/<paymentId>/summary
```

Expected response (abridged):
```json
{
  "status": "COMPLETED",
  "amountSent": { "valueAED": 5000, "midMarketEquivalentMXN": 50000 },
  "amountReceived": { "perRecipientMXN": 15765.01, "totalMXN": 47295.03 },
  "effectiveTotalCostPercent": 5.41,
  "feeBreakdown": [
    { "category": "SWIFT Message Fee",           "amountMXN": 241.25  },
    { "category": "Correspondent Bank Lifting Fee", "amountMXN": 240.04 },
    { "category": "FX Markup (Hidden Cost)",     "amountMXN": 1732.54 },
    { "category": "Hop 1 Fee",                   "amountMXN": 143.31  },
    { "category": "Hop 2 Fee",                   "amountMXN": 190.50  },
    { "category": "Hop 3 Fee",                   "amountMXN": 94.87   },
    { "category": "Disbursement / SPEI Fee",     "amountMXN": 45.00   }
  ],
  "totalFeesMXN": 2687.51,
  "timing": {
    "calendarHoursElapsed": 8.1,
    "businessDaysElapsed": 1
  }
}
```

---

### Failure cases

#### Outside UAE banking hours

UAE follows a **Sunday–Thursday** working week (Friday/Saturday are the UAE weekend). Requests on Friday, Saturday, or before 9am/after 5pm GST (UTC+4) are held.

```bash
# Friday 2pm GST = Friday 10:00 UTC
curl -X POST http://localhost:3000/payment/initiate \
  -H 'Content-Type: application/json' \
  -d '{
    "senderAED": 1000,
    "recipientCount": 1,
    "requestedAt": "2026-04-10T10:00:00Z"
  }'
```

Expected response (`200 OK`, not an error — the payment is queued, not rejected):
```json
{
  "status": "PENDING_BANK_OPEN",
  "message": "The UAE originating bank is currently closed...",
  "requestedAt": "2026-04-10T10:00:00.000Z",
  "nextAvailableWindow": "2026-04-12T05:00:00.000Z",
  "uaeBankingHours": "Sunday–Thursday, 09:00–17:00 GST (UTC+4)",
  "whyThisMatters": "UAE follows a Sun–Thu working week. A payment initiated on Friday afternoon will not be processed until Sunday 9am..."
}
```

The `nextAvailableWindow` is `2026-04-12T05:00:00Z` = Sunday 9:00 GST — nearly 47 hours later.

#### Outside UAE banking hours — Saturday night

```bash
# Saturday 11pm GST = Saturday 19:00 UTC
curl -X POST http://localhost:3000/payment/initiate \
  -H 'Content-Type: application/json' \
  -d '{
    "senderAED": 2000,
    "recipientCount": 2,
    "requestedAt": "2026-04-11T19:00:00Z"
  }'
```

---

#### Insufficient nostro balance

After one payment of AED 5,000 the nostro balance drops to ~252,231 MXN. Try to send AED 40,000 (~400,000 MXN):

```bash
curl -X POST http://localhost:3000/payment/initiate \
  -H 'Content-Type: application/json' \
  -d '{
    "senderAED": 40000,
    "recipientCount": 1,
    "requestedAt": "2026-04-08T07:00:00Z"
  }'
```

Expected response:
```json
{
  "status": "INSUFFICIENT_PREFUNDING",
  "error": "INSUFFICIENT_PREFUNDING",
  "estimatedMXNRequired": 400000,
  "currentNostroBalanceMXN": 252231.29,
  "shortfallMXN": 147769,
  "remedy": "Top up the nostro account via POST /nostro/topup. Note: funds take T+2 business days to settle via SWIFT..."
}
```

To recover, top up the nostro:

```bash
curl -X POST http://localhost:3000/nostro/topup \
  -H 'Content-Type: application/json' \
  -d '{"amountMXN": 200000}'
```

The `availableAt` will be T+2 business days from now. Funds are automatically credited at that time.

---

#### Wrong status (calling steps out of order)

```bash
# Try to route a payment that hasn't been FX-converted yet
curl -X POST http://localhost:3000/payment/<paymentId>/route \
  -H 'Content-Type: application/json'
```

Expected:
```json
{
  "error": "WRONG_STATUS",
  "message": "Cannot route in status: FX_CONVERTING. Expected: IN_TRANSIT",
  "currentStatus": "FX_CONVERTING"
}
```

---

### Nostro top-up

```bash
curl -X POST http://localhost:3000/nostro/topup \
  -H 'Content-Type: application/json' \
  -d '{"amountMXN": 100000}'
```

Expected response:
```json
{
  "topupId": "<uuid>",
  "amountMXN": 100000,
  "status": "PENDING",
  "initiatedAt": "...",
  "availableAt": "...",
  "currentBalanceMXN": 252231.29,
  "message": "Top-up initiated. Funds will be credited after T+2 business day SWIFT settlement.",
  "whyItTakesLong": "Nostro funding goes through the same correspondent banking rails..."
}
```

Pending topups appear in `GET /nostro/balance` under `pendingTopups`.

---

## Design constants

| Constant | Value | Source |
|----------|-------|--------|
| Nostro starting balance | 300,000 MXN | Simulated pre-fund |
| Base FX rate | 10 MXN/AED | Simulated mid-market |
| FX markup | 3.5% | Typical retail remittance spread |
| SWIFT fee | AED 25 | Flat MT103 processing fee |
| Correspondent fee | 0.5% | US correspondent lifting fee |
| Hop 1 (UAE→US) delay | 4h, 0.3% | EST Mon–Fri 9–5 |
| Hop 2 (US→MX corr) delay | 8h, 0.4% | CST Mon–Fri 9–5 |
| Hop 3 (MX corr→local) delay | 6h, 0.2% | CST Mon–Fri 9–5 |
| Disbursement fee | 15 MXN/recipient | SPEI + account credit |
| Nostro topup settlement | T+2 business days | Standard SWIFT settlement |

## Payment status machine

```
PENDING_BANK_OPEN  →  FX_CONVERTING  →  IN_TRANSIT
                                              │
                                           HOP_1 → HOP_2 → HOP_3
                                                               │
                                               DISBURSING → COMPLETED
                                                               
                       FAILED  (can occur at any step)
```

## File structure

```
src/
├── index.js                  # Express app + server
├── store.js                  # In-memory state (payments + nostro)
├── routes/
│   ├── payment.js            # All /payment/* endpoints
│   └── nostro.js             # /nostro/balance and /nostro/topup
├── services/
│   ├── fxService.js          # FX markup + fee calculation
│   └── routingService.js     # 3-hop correspondent bank simulation
└── utils/
    ├── time.js               # Banking hours, timezone logic, business days
    └── id.js                 # UUID generation (UETR equivalent)
```
