/**
 * OpenFX Demo — UAE AED → MXN Remittance API
 *
 * Architectural contrast with correspondent banking is annotated throughout.
 * Correspondent banking: 2-5 days, 3-5% cost, requires pre-funded nostro accounts
 *                        at each intermediary, cuts off at weekends/holidays.
 * OpenFX: seconds to minutes, 0.15% all-in, no pre-funding, 24/7/365.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// IN-MEMORY STATE
// ---------------------------------------------------------------------------

// No correspondent bank nostro accounts to pre-fund.
// Sender simply holds AED in their own wallet — liquidity comes from the OpenFX network.
const senderWallet = { currency: 'AED', balance: 100_000 };

const quotes   = new Map(); // quoteId → quote object
const payments = new Map(); // paymentId → payment object

// ---------------------------------------------------------------------------
// FX CONSTANTS
// ---------------------------------------------------------------------------
const BASE_RATE_MXN_PER_AED = 10;   // live mid-market rate, no bank markup
const FEE_PCT               = 0.0015; // 0.15% all-in — no per-hop correspondent fees

// ---------------------------------------------------------------------------
// PAYMENT STAGE TIMELINE
// ---------------------------------------------------------------------------
// In correspondent banking each "hop" adds 1-2 business days and a fee.
// Here the entire journey is measured in seconds.
const STAGES = [
  { name: 'QUOTE_LOCKED',       offsetSec: 0   },
  { name: 'AED_RECEIVED',       offsetSec: 5   },
  { name: 'CONVERTING',         offsetSec: 10  },
  { name: 'ON_NETWORK',         offsetSec: 20  },
  { name: 'ROUTING_TO_SPEI',    offsetSec: 35  },
  { name: 'SPEI_PROCESSING',    offsetSec: 50  },
  { name: 'CREDITED',           offsetSec: 90  }, // ~1.5 minutes total
];

// Derive the current stage purely from elapsed time — no polling a correspondent.
function deriveStage(createdAt) {
  const elapsed = (Date.now() - new Date(createdAt).getTime()) / 1000;
  let current = STAGES[0];
  for (const stage of STAGES) {
    if (elapsed >= stage.offsetSec) current = stage;
    else break;
  }
  const idx     = STAGES.indexOf(current);
  const pct     = Math.min(100, Math.round((idx / (STAGES.length - 1)) * 100));
  const final   = STAGES[STAGES.length - 1];
  const completionAt = new Date(new Date(createdAt).getTime() + final.offsetSec * 1000);
  return { currentStage: current.name, percentComplete: pct, estimatedCompletionAt: completionAt, timeElapsedSeconds: Math.round(elapsed) };
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function nowISO() { return new Date().toISOString(); }
function addSeconds(date, s) { return new Date(new Date(date).getTime() + s * 1000); }

// ---------------------------------------------------------------------------
// 8. GET /health
// ---------------------------------------------------------------------------
// Correspondent banking: no 24/7 — SWIFT batch windows, RTGS operating hours, cut-off times.
// OpenFX: always on, weekends included.
app.get('/health', (req, res) => {
  const now = new Date();
  res.json({
    status: 'operational',
    availability: '24/7/365',
    currentTime: now.toISOString(),
    isWeekend: [0, 6].includes(now.getDay()),
    note: 'Payments process regardless of day, time, or banking holidays.',
  });
});

// ---------------------------------------------------------------------------
// 6. GET /wallet/balance
// ---------------------------------------------------------------------------
app.get('/wallet/balance', (req, res) => {
  res.json({ currency: senderWallet.currency, balance: senderWallet.balance });
});

// ---------------------------------------------------------------------------
// 7. POST /wallet/topup
// ---------------------------------------------------------------------------
// Correspondent banking: topping up a nostro account requires a wire that itself
// takes 1-2 days — you must pre-fund before you know your payment volume.
// OpenFX: sender funds their own wallet instantly; no pre-funding required.
app.post('/wallet/topup', (req, res) => {
  const { amount } = req.body;
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  senderWallet.balance += amount;
  res.json({
    message: 'Wallet topped up instantly — no nostro pre-funding delay.',
    addedAED: amount,
    newBalance: senderWallet.balance,
    currency: 'AED',
  });
});

// ---------------------------------------------------------------------------
// 1. POST /quote
// ---------------------------------------------------------------------------
// Correspondent banking: FX rate from your bank includes a spread (1-3%) on top of
// mid-market, plus each correspondent adds its own markup.  Rate is often only
// valid during business hours.
// OpenFX: one 0.15% all-in fee, live rate, valid 24/7, locked for 30 seconds.
app.post('/quote', (req, res) => {
  const { senderAED, requestedAt } = req.body;
  if (!senderAED || typeof senderAED !== 'number' || senderAED <= 0) {
    return res.status(400).json({ error: 'senderAED must be a positive number' });
  }

  const feeAED        = +(senderAED * FEE_PCT).toFixed(4);
  const netAED        = +(senderAED - feeAED).toFixed(4);
  const feesMXN       = +(feeAED * BASE_RATE_MXN_PER_AED).toFixed(4);
  const estimatedMXN  = +(netAED * BASE_RATE_MXN_PER_AED).toFixed(4);
  const lockedRate    = BASE_RATE_MXN_PER_AED; // no markup on the mid-market rate

  const quoteId   = uuidv4();
  const now       = requestedAt ? new Date(requestedAt) : new Date();
  const expiresAt = addSeconds(now, 30);

  const quote = {
    quoteId,
    senderAED,
    feeAED,
    feesMXN,
    lockedRate,
    estimatedMXN,
    requestedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    feePct: '0.15%',
    _createdAtMs: Date.now(), // real wall-clock for expiry validation
  };
  quotes.set(quoteId, quote);

  res.status(201).json({
    quoteId,
    senderAED,
    feeAED,
    feesMXN,
    lockedRate,
    estimatedMXN,
    requestedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    feePct: '0.15%',
    note: 'Rate locked for 30 seconds. No bank markup — 0.15% all-in.',
  });
});

// ---------------------------------------------------------------------------
// 2. POST /payment/execute
// ---------------------------------------------------------------------------
// Correspondent banking: payment is queued, may wait for next SWIFT batch window,
// requires nostro balance check across multiple accounts, AML screening adds hours.
// OpenFX: immediate debit, single network hop, processing starts in milliseconds.
app.post('/payment/execute', (req, res) => {
  const { quoteId, recipientCount, recipientDetails } = req.body;

  if (!quoteId) return res.status(400).json({ error: 'quoteId is required' });

  const quote = quotes.get(quoteId);
  if (!quote) return res.status(404).json({ error: 'Quote not found' });

  // Expiry is checked against real wall-clock time (30 s from when quote was created).
  const expiredMs = quote._createdAtMs + 30_000;
  if (Date.now() > expiredMs) {
    return res.status(410).json({ error: 'Quote expired — request a new quote', quoteId });
  }

  if (!recipientCount || recipientCount < 1) {
    return res.status(400).json({ error: 'recipientCount must be >= 1' });
  }

  // Single balance check on the sender's own wallet — no distributed nostro check.
  if (senderWallet.balance < quote.senderAED) {
    return res.status(402).json({
      error: 'Insufficient AED balance',
      required: quote.senderAED,
      available: senderWallet.balance,
    });
  }

  // Debit immediately — in OpenFX settlement is atomic with the payment instruction.
  senderWallet.balance = +(senderWallet.balance - quote.senderAED).toFixed(4);

  const paymentId = uuidv4();
  const createdAt = new Date().toISOString();

  const payment = {
    paymentId,
    quoteId,
    senderAED: quote.senderAED,
    feeAED: quote.feeAED,
    feesMXN: quote.feesMXN,
    estimatedMXN: quote.estimatedMXN,
    lockedRate: quote.lockedRate,
    recipientCount: recipientCount || 1,
    recipientDetails: recipientDetails || [],
    createdAt,
    status: 'PROCESSING',
  };
  payments.set(paymentId, payment);

  // Quote is single-use — consumed on execution.
  quotes.delete(quoteId);

  const finalStageOffsetSec = STAGES[STAGES.length - 1].offsetSec;

  res.status(201).json({
    paymentId,
    status: 'PROCESSING',
    senderAED: quote.senderAED,
    estimatedMXN: quote.estimatedMXN,
    createdAt,
    estimatedSettlementMinutes: Math.ceil(finalStageOffsetSec / 60),
    note: 'No correspondent hops — settlement begins immediately on the OpenFX network.',
  });
});

// ---------------------------------------------------------------------------
// 3. GET /payment/:id/status
// ---------------------------------------------------------------------------
// Correspondent banking: status is opaque — you send a SWIFT gpi tracker query and
// wait; intermediate banks may not update for hours.
// OpenFX: stage is deterministic from createdAt — no external query needed.
app.get('/payment/:id/status', (req, res) => {
  const payment = payments.get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  const { currentStage, percentComplete, estimatedCompletionAt, timeElapsedSeconds } =
    deriveStage(payment.createdAt);

  res.json({
    paymentId: payment.paymentId,
    currentStage,
    percentComplete,
    estimatedCompletionAt,
    timeElapsedSeconds,
    stages: STAGES.map(s => s.name),
  });
});

// ---------------------------------------------------------------------------
// 4. POST /payment/:id/disburse
// ---------------------------------------------------------------------------
// Correspondent banking: last-mile delivery via local bank, may require separate
// instruction, per-recipient fees at the beneficiary bank.
// OpenFX: single SPEI instruction covers all recipients, no per-recipient fee.
app.post('/payment/:id/disburse', (req, res) => {
  const payment = payments.get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  const { currentStage } = deriveStage(payment.createdAt);
  if (!['SPEI_PROCESSING', 'CREDITED'].includes(currentStage)) {
    return res.status(409).json({
      error: `Payment not yet ready for disbursal. Current stage: ${currentStage}`,
      hint: 'Wait until SPEI_PROCESSING or CREDITED before disbursing.',
    });
  }

  const perRecipientMXN = +(payment.estimatedMXN / payment.recipientCount).toFixed(4);
  const creditedAt      = new Date().toISOString();

  // Mark as fully credited
  payment.creditedAt        = creditedAt;
  payment.perRecipientMXN   = perRecipientMXN;
  payment.status            = 'CREDITED';

  res.json({
    paymentId: payment.paymentId,
    totalMXN: payment.estimatedMXN,
    recipientCount: payment.recipientCount,
    perRecipientAmount: perRecipientMXN,
    currency: 'MXN',
    creditedAt,
    note: 'No per-recipient SPEI fees — unlike correspondent banks that charge per beneficiary.',
  });
});

// ---------------------------------------------------------------------------
// 5. GET /payment/:id/summary
// ---------------------------------------------------------------------------
app.get('/payment/:id/summary', (req, res) => {
  const payment = payments.get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  const { currentStage, timeElapsedSeconds } = deriveStage(payment.createdAt);
  const elapsedMin = Math.floor(timeElapsedSeconds / 60);
  const elapsedSec = timeElapsedSeconds % 60;

  const openFXCostPct = ((payment.feeAED / payment.senderAED) * 100).toFixed(2) + '%';

  res.json({
    paymentId: payment.paymentId,
    createdAt: payment.createdAt,
    currentStage,

    amountSent:     { amount: payment.senderAED,   currency: 'AED' },
    feesCharged:    { amount: payment.feeAED,       currency: 'AED', pct: '0.15%' },
    amountReceived: { amount: payment.estimatedMXN, currency: 'MXN' },
    exchangeRate:   `1 AED = ${payment.lockedRate} MXN (mid-market, no markup)`,

    timing: {
      totalElapsed: `${elapsedMin}m ${elapsedSec}s`,
      totalElapsedSeconds: timeElapsedSeconds,
    },

    lineItems: [
      {
        description: 'OpenFX all-in fee (0.15%)',
        amountAED: payment.feeAED,
        note: 'Single fee — no correspondent charges, no nostro spread, no SWIFT message fee',
      },
    ],

    // Side-by-side comparison for sales / compliance narratives
    comparison: {
      conventional: {
        estimatedDays:       '2-5',
        totalCostPct:        '3.5%',
        requiresPreFunding:  true,
        fxMarkup:            'Yes — bank spread 1-3% on top of mid-market',
        correspondentFees:   'Yes — each intermediary bank charges a fee',
        availability:        'Business hours / banking days only',
        transparency:        'Opaque — fees deducted in transit, recipient gets less',
      },
      openFX: {
        settledInMinutes:    Math.ceil(STAGES[STAGES.length - 1].offsetSec / 60),
        totalCostPct:        openFXCostPct,
        requiresPreFunding:  false,
        fxMarkup:            'None — mid-market rate passed through',
        correspondentFees:   'None — single network, no hops',
        availability:        '24/7/365 including weekends and holidays',
        transparency:        'Full — fee shown upfront at quote stage',
      },
    },
  });
});

// ---------------------------------------------------------------------------
// START
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`OpenFX Demo API running on http://localhost:${PORT}`);
  console.log('Availability: 24/7/365 — no SWIFT batch windows, no cut-off times.');
});
