/**
 * Payment routes — the core of the conventional cross-border FX payment simulation.
 *
 * Status machine:
 *   PENDING_BANK_OPEN → FX_CONVERTING → IN_TRANSIT → HOP_1 → HOP_2 → HOP_3
 *                                                                         ↓
 *                                                              DISBURSING → COMPLETED
 *                                                                               ↑
 *                                                                           FAILED (any step)
 *
 * Each status transition maps to a real event in the SWIFT payment lifecycle:
 *   PENDING_BANK_OPEN  = Payment instruction held because originating bank is closed
 *   FX_CONVERTING      = FX desk has accepted the deal ticket
 *   IN_TRANSIT         = MT103 "single customer credit transfer" message sent via SWIFT
 *   HOP_1/2/3          = Each correspondent bank's processing queue
 *   DISBURSING         = Mexican bank is splitting and crediting recipient accounts
 *   COMPLETED          = All MT910 credit confirmations received
 *   FAILED             = Any hop or compliance check rejected the payment
 */

const express = require("express");
const router = express.Router();
const store = require("../store");
const { generatePaymentId } = require("../utils/id");
const {
  isUAEBankingHours,
  nextUAEBankingWindow,
  businessDaysBetween,
} = require("../utils/time");
const { convertAEDtoMXN } = require("../services/fxService");
const { routePayment } = require("../services/routingService");

// ──────────────────────────────────────────────────────────────────────────────
// POST /payment/initiate
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Initiate a cross-border payment from UAE (AED) to Mexico (MXN).
 * Body: { senderAED: number, recipientCount: number, requestedAt?: ISO8601 }
 *
 * requestedAt defaults to now if not supplied. It's exposed as a parameter so
 * you can test time-based rules (e.g. submit a request outside banking hours).
 *
 * Two compliance checks before a payment is accepted:
 *  1. UAE banking hours — the originating bank must be open to release the SWIFT message.
 *  2. Nostro balance — the company must have sufficient pre-funded MXN in Mexico
 *     to cover the payout. Without this check, payouts would fail at disbursement
 *     and have to be reversed — a costly, multi-week process in correspondent banking.
 */
router.post("/initiate", (req, res) => {
  const { senderAED, recipientCount, requestedAt } = req.body;

  // Input validation
  if (!senderAED || typeof senderAED !== "number" || senderAED <= 0) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "senderAED must be a positive number" });
  }
  if (!recipientCount || !Number.isInteger(recipientCount) || recipientCount < 1) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "recipientCount must be a positive integer" });
  }

  const requestTime = requestedAt ? new Date(requestedAt) : new Date();
  if (isNaN(requestTime.getTime())) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "requestedAt must be a valid ISO8601 timestamp" });
  }

  // ── Check 1: UAE Banking Hours ────────────────────────────────────────────
  // SWIFT messages can only be released when the originating bank's back office
  // is open to authorise the transaction. Outside these hours, the payment instruction
  // sits in a "pending authorisation" queue and is released at the next open window.
  if (!isUAEBankingHours(requestTime)) {
    const nextWindow = nextUAEBankingWindow(requestTime);
    return res.status(200).json({
      status: "PENDING_BANK_OPEN",
      message:
        "The UAE originating bank is currently closed. Your payment will be queued and released at the next business window.",
      requestedAt: requestTime.toISOString(),
      nextAvailableWindow: nextWindow ? nextWindow.toISOString() : null,
      uaeBankingHours: "Sunday–Thursday, 09:00–17:00 GST (UTC+4)",
      whyThisMatters:
        "UAE follows a Sun–Thu working week. A payment initiated on Friday afternoon " +
        "will not be processed until Sunday 9am — adding nearly 2 calendar days of delay " +
        "before the SWIFT message is even sent.",
    });
  }

  // ── Check 2: Nostro Balance ───────────────────────────────────────────────
  // Estimate the MXN required for this payment (rough pre-check, before full FX calc).
  // We do a conservative estimate: senderAED × base rate (no markup deduction) as the
  // upper bound. If even this can't be covered, the payment will definitely fail.
  // The real nostro deduction happens at FX conversion after the exact amount is known.
  const estimatedMXNRequired = senderAED * 10; // 10 MXN/AED base rate, conservative upper bound
  if (estimatedMXNRequired > store.nostro.balanceMXN) {
    return res.status(200).json({
      status: "INSUFFICIENT_PREFUNDING",
      error: "INSUFFICIENT_PREFUNDING",
      message: "The nostro account does not have sufficient MXN to cover this payment.",
      estimatedMXNRequired: Math.round(estimatedMXNRequired),
      currentNostroBalanceMXN: store.nostro.balanceMXN,
      shortfallMXN: Math.round(estimatedMXNRequired - store.nostro.balanceMXN),
      remedy:
        "Top up the nostro account via POST /nostro/topup. " +
        "Note: funds take T+2 business days to settle via SWIFT. " +
        "This is why companies pre-fund their nostro accounts weeks in advance.",
    });
  }

  // ── Create Payment Record ─────────────────────────────────────────────────
  const paymentId = generatePaymentId();
  const payment = {
    paymentId,
    status: "FX_CONVERTING", // Bank is open, nostro funded — ready for FX desk
    senderAED,
    recipientCount,
    requestedAt: requestTime.toISOString(),
    initiatedAt: new Date().toISOString(),
    // These are populated by subsequent endpoints
    fxConversion: null,
    routing: null,
    disbursement: null,
    statusHistory: [
      { status: "FX_CONVERTING", timestamp: new Date().toISOString() },
    ],
  };

  store.payments[paymentId] = payment;

  res.status(201).json({
    paymentId,
    status: payment.status,
    message: "Payment initiated. Proceed to POST /payment/:id/fx-convert",
    senderAED,
    recipientCount,
    initiatedAt: payment.initiatedAt,
    nextStep: `POST /payment/${paymentId}/fx-convert`,
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /payment/:id/fx-convert
// ──────────────────────────────────────────────────────────────────────────────
/**
 * FX desk conversion — apply rate markup and all pre-conversion fees.
 *
 * The FX desk is a treasury function at the originating bank. They:
 *  1. Agree a rate with the customer (marked up from interbank rate)
 *  2. Hedge their FX exposure (buy MXN in the interbank market)
 *  3. Deduct their fees
 *  4. Release the net MXN amount to be routed through the correspondent chain
 *
 * This step is also when the nostro account is "reserved" — the MXN is earmarked
 * so it can't be double-spent on another payment while this one is in transit.
 */
router.post("/:id/fx-convert", (req, res) => {
  const payment = store.payments[req.params.id];

  if (!payment) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Payment not found" });
  }
  if (payment.status !== "FX_CONVERTING") {
    return res.status(409).json({
      error: "WRONG_STATUS",
      message: `Cannot apply FX conversion in status: ${payment.status}. Expected: FX_CONVERTING`,
      currentStatus: payment.status,
    });
  }

  // Run the full FX conversion with all fees
  const conversion = convertAEDtoMXN(payment.senderAED);

  // Verify the nostro balance can cover the converted MXN (exact check)
  if (conversion.convertedMXN > store.nostro.balanceMXN) {
    payment.status = "FAILED";
    payment.failureReason = "INSUFFICIENT_PREFUNDING_EXACT";
    pushStatus(payment, "FAILED");
    return res.status(400).json({
      error: "INSUFFICIENT_PREFUNDING_EXACT",
      message: "Exact MXN amount after conversion exceeds nostro balance.",
      convertedMXN: conversion.convertedMXN,
      nostroBalanceMXN: store.nostro.balanceMXN,
    });
  }

  // Reserve the MXN in the nostro account (deduct now, before routing)
  store.nostro.balanceMXN = Math.round((store.nostro.balanceMXN - conversion.convertedMXN) * 100) / 100;

  // Advance status to IN_TRANSIT (SWIFT MT103 message sent)
  payment.fxConversion = {
    ...conversion,
    convertedAt: new Date().toISOString(),
  };
  payment.status = "IN_TRANSIT";
  pushStatus(payment, "IN_TRANSIT");

  res.json({
    paymentId: payment.paymentId,
    status: payment.status,
    ...conversion,
    convertedAt: payment.fxConversion.convertedAt,
    nostroBalanceAfterReservationMXN: store.nostro.balanceMXN,
    message: "FX conversion complete. MXN reserved from nostro. Proceed to POST /payment/:id/route",
    nextStep: `POST /payment/${req.params.id}/route`,
    note:
      "The FX markup (3.5%) is where traditional banks earn most of their remittance revenue. " +
      "It appears as a worse exchange rate rather than an explicit fee, making it opaque to customers.",
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /payment/:id/route
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Simulate the three-hop correspondent banking journey.
 *
 * In the real SWIFT network, each hop is an independent bank that:
 *  - Receives the MT103 message
 *  - Screens it against OFAC/AML watchlists (can add 1–2 days if flagged for review)
 *  - Deducts its fee ("lifting fee")
 *  - Sends a new MT103 to the next bank in the chain
 *
 * The sending bank has limited visibility into this process — before SWIFT gpi (2017),
 * the only way to track a payment was to call each correspondent bank's helpdesk.
 */
router.post("/:id/route", (req, res) => {
  const payment = store.payments[req.params.id];

  if (!payment) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Payment not found" });
  }
  if (payment.status !== "IN_TRANSIT") {
    return res.status(409).json({
      error: "WRONG_STATUS",
      message: `Cannot route in status: ${payment.status}. Expected: IN_TRANSIT`,
      currentStatus: payment.status,
    });
  }

  // Use the actual conversion time as the routing start time, or now if not available
  const routingStartTime = payment.fxConversion
    ? new Date(payment.fxConversion.convertedAt)
    : new Date();

  const { hops, finalMXN, routingCompletedAt } = routePayment(
    payment.fxConversion.convertedMXN,
    routingStartTime
  );

  // Record each hop status in the payment
  payment.routing = {
    hops,
    startingMXN: payment.fxConversion.convertedMXN,
    finalMXN,
    routingStartedAt: routingStartTime.toISOString(),
    routingCompletedAt,
  };

  // Advance through hop statuses in history
  payment.status = "HOP_3"; // final hop
  pushStatus(payment, "HOP_1");
  pushStatus(payment, "HOP_2");
  pushStatus(payment, "HOP_3");

  const totalHopFeesMXN = Math.round(
    (payment.fxConversion.convertedMXN - finalMXN) * 100
  ) / 100;

  res.json({
    paymentId: payment.paymentId,
    status: payment.status,
    routingStartedAt: routingStartTime.toISOString(),
    routingCompletedAt,
    startingMXN: payment.fxConversion.convertedMXN,
    totalHopFeesMXN,
    finalMXNAfterRouting: finalMXN,
    hops,
    message: "Correspondent banking routing complete. Proceed to POST /payment/:id/disburse",
    nextStep: `POST /payment/${req.params.id}/disburse`,
    note:
      "Each correspondent bank processes only during its local business hours. " +
      "Hops arriving outside those windows are queued — this is the primary cause of " +
      "multi-day settlement times in conventional cross-border payments.",
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /payment/:id/disburse
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Final payout to Mexican recipients.
 *
 * At this stage, the local Mexican bank has received the MXN via SPEI from
 * the Mexican correspondent. It splits the total across all recipients and
 * credits their accounts. Each credit incurs a small SPEI/processing fee.
 *
 * In practice, disbursement to multiple recipients would use a bulk SPEI batch
 * file — the bank processes it and credits all accounts simultaneously.
 * The 15 MXN per recipient fee approximates the SPEI transaction fee plus
 * the bank's account maintenance surcharge.
 */
router.post("/:id/disburse", (req, res) => {
  const payment = store.payments[req.params.id];

  if (!payment) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Payment not found" });
  }
  if (payment.status !== "HOP_3") {
    return res.status(409).json({
      error: "WRONG_STATUS",
      message: `Cannot disburse in status: ${payment.status}. Expected: HOP_3`,
      currentStatus: payment.status,
    });
  }

  const { recipientCount } = payment;
  const availableMXN = payment.routing.finalMXN;

  // Disbursement fee: 15 MXN per recipient — covers SPEI message + account credit processing
  const DISBURSEMENT_FEE_PER_RECIPIENT_MXN = 15;
  const totalDisbursementFeesMXN = DISBURSEMENT_FEE_PER_RECIPIENT_MXN * recipientCount;

  const netMXNForRecipients = availableMXN - totalDisbursementFeesMXN;

  if (netMXNForRecipients <= 0) {
    payment.status = "FAILED";
    payment.failureReason = "INSUFFICIENT_MXN_FOR_DISBURSEMENT";
    pushStatus(payment, "FAILED");
    return res.status(400).json({
      error: "INSUFFICIENT_MXN_FOR_DISBURSEMENT",
      message:
        "After correspondent bank fees, insufficient MXN remains to cover disbursement fees. " +
        "This can happen with very small transfers where cumulative fees exceed the principal — " +
        "a known failure mode of fixed-fee correspondent banking chains.",
      availableMXN,
      totalDisbursementFeesMXN,
    });
  }

  const perRecipientMXN = Math.round((netMXNForRecipients / recipientCount) * 100) / 100;
  const disbursedAt = new Date().toISOString();

  payment.disbursement = {
    recipientCount,
    availableMXNBeforeDisbursement: availableMXN,
    disbursementFeePerRecipientMXN: DISBURSEMENT_FEE_PER_RECIPIENT_MXN,
    totalDisbursementFeesMXN,
    netMXNForRecipients: Math.round(netMXNForRecipients * 100) / 100,
    perRecipientMXN,
    disbursedAt,
  };

  payment.status = "COMPLETED";
  pushStatus(payment, "DISBURSING");
  pushStatus(payment, "COMPLETED");

  res.json({
    paymentId: payment.paymentId,
    status: "COMPLETED",
    recipientCount,
    availableMXNBeforeDisbursement: availableMXN,
    disbursementFeePerRecipientMXN: DISBURSEMENT_FEE_PER_RECIPIENT_MXN,
    totalDisbursementFeesMXN,
    perRecipientMXN,
    disbursedAt,
    message: `Successfully disbursed ${perRecipientMXN} MXN to each of ${recipientCount} recipient(s).`,
    nextStep: `GET /payment/${req.params.id}/summary`,
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /payment/:id/summary
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Full payment audit trail and cost summary.
 *
 * This is the kind of report the remittance company's operations team would
 * produce to answer: "How much did the customer send, how much did the recipient
 * receive, and where did the rest go?"
 *
 * In the conventional system, assembling this report requires reconciling records
 * from the originating bank, the FX desk, every correspondent bank's SWIFT messages,
 * and the final credit notification. This is why reconciliation teams at traditional
 * banks are large — there is no single source of truth.
 */
router.get("/:id/summary", (req, res) => {
  const payment = store.payments[req.params.id];

  if (!payment) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Payment not found" });
  }

  // ── Fee Breakdown ─────────────────────────────────────────────────────────
  const fx = payment.fxConversion;
  const routing = payment.routing;
  const disbursement = payment.disbursement;

  const feeBreakdown = [];

  if (fx) {
    feeBreakdown.push(
      { category: "SWIFT Message Fee", amountAED: fx.swiftFeeAED, amountMXN: fx.swiftFeeMXN,
        explanation: "Flat fee per SWIFT MT103 cross-border credit transfer message" },
      { category: "Correspondent Bank Lifting Fee", amountAED: fx.correspondentFeeAED, amountMXN: fx.correspondentFeeMXN,
        explanation: "0.5% charged by US correspondent for liquidity provision and routing" },
      { category: "FX Markup (Hidden Cost)", amountAED: null, amountMXN: fx.fxMarkupCostMXN,
        explanation: `3.5% spread over mid-market rate (${fx.baseRateMXNperAED} MXN/AED). Not shown as a fee — appears as a worse exchange rate.` }
    );
  }

  if (routing) {
    routing.hops.forEach((hop) => {
      feeBreakdown.push({
        category: `Hop ${hop.hopNumber} Fee (${hop.from} → ${hop.to})`,
        amountAED: null,
        amountMXN: hop.feeDeductedMXN,
        explanation: `${hop.feePercent}% correspondent fee charged by ${hop.to}`,
      });
    });
  }

  if (disbursement) {
    feeBreakdown.push({
      category: "Disbursement / SPEI Fee",
      amountAED: null,
      amountMXN: disbursement.totalDisbursementFeesMXN,
      explanation: `15 MXN × ${disbursement.recipientCount} recipient(s) — SPEI transaction + account credit fee`,
    });
  }

  // ── Total Fees ────────────────────────────────────────────────────────────
  const totalFeesMXN = feeBreakdown.reduce(
    (sum, f) => sum + (f.amountMXN || 0), 0
  );
  const totalFeesAED = feeBreakdown.reduce(
    (sum, f) => sum + (f.amountAED || 0), 0
  );

  // ── Elapsed Time ──────────────────────────────────────────────────────────
  const startDate = new Date(payment.requestedAt);
  const endDate = disbursement ? new Date(disbursement.disbursedAt) : new Date();
  const calendarMs = endDate - startDate;
  const calendarHours = Math.round(calendarMs / (1000 * 60 * 60) * 10) / 10;
  const businessDays = businessDaysBetween(startDate, endDate);

  // ── Effective Cost % ──────────────────────────────────────────────────────
  // How much did the customer lose as a percentage of what they sent?
  // Expressed in MXN terms at mid-market for a fair comparison.
  const sentValueAtMidMarketMXN = payment.senderAED * 10;
  const receivedMXN = disbursement ? disbursement.perRecipientMXN * disbursement.recipientCount : 0;
  const effectiveCostPercent = fx
    ? Math.round(((sentValueAtMidMarketMXN - receivedMXN) / sentValueAtMidMarketMXN) * 10000) / 100
    : null;

  res.json({
    paymentId: payment.paymentId,
    status: payment.status,

    amountSent: {
      valueAED: payment.senderAED,
      midMarketEquivalentMXN: sentValueAtMidMarketMXN,
      midMarketRate: "10 MXN/AED",
    },

    amountReceived: disbursement
      ? {
          perRecipientMXN: disbursement.perRecipientMXN,
          totalMXN: Math.round(disbursement.perRecipientMXN * disbursement.recipientCount * 100) / 100,
          recipientCount: disbursement.recipientCount,
        }
      : null,

    effectiveTotalCostPercent: effectiveCostPercent,
    effectiveCostNote:
      effectiveCostPercent !== null
        ? `${effectiveCostPercent}% of the mid-market value was lost to fees. ` +
          "G20 target for remittance cost is <3%. The World Bank target is <5%."
        : null,

    feeBreakdown,
    totalFeesMXN: Math.round(totalFeesMXN * 100) / 100,
    totalFeesAED: Math.round(totalFeesAED * 100) / 100,

    timing: {
      requestedAt: payment.requestedAt,
      initiatedAt: payment.initiatedAt,
      fxConvertedAt: fx ? fx.convertedAt : null,
      routingCompletedAt: routing ? routing.routingCompletedAt : null,
      disbursedAt: disbursement ? disbursement.disbursedAt : null,
      calendarHoursElapsed: calendarHours,
      businessDaysElapsed: businessDays,
      routingHops: routing
        ? routing.hops.map((h) => ({
            hop: h.hopNumber,
            from: h.from,
            to: h.to,
            processAt: h.processAt,
            completedAt: h.completedAt,
            status: h.status,
          }))
        : [],
    },

    statusHistory: payment.statusHistory,
  });
});

// ── Helper ─────────────────────────────────────────────────────────────────
function pushStatus(payment, status) {
  payment.statusHistory.push({ status, timestamp: new Date().toISOString() });
}

module.exports = router;
