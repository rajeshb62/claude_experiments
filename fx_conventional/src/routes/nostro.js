/**
 * Nostro account management routes.
 *
 * The nostro ("our money at your bank") account is a pre-funded pool of MXN held
 * at the Mexican correspondent bank. The UAE remittance company must wire funds into
 * this account before it can pay out to recipients.
 *
 * Pre-funding is a fundamental inefficiency of the correspondent banking model:
 *  - Capital is locked up and idle while awaiting payment requests.
 *  - The company earns no yield on this float.
 *  - If depleted faster than expected, payments fail until replenished (T+2 days).
 * This is one of the core problems that real-time gross settlement systems (like
 * RippleNet, or blockchain-based on-demand liquidity solutions) aim to solve.
 */

const express = require("express");
const router = express.Router();
const store = require("../store");
const { addBusinessDays } = require("../utils/time");
const { generatePaymentId } = require("../utils/id");

/**
 * GET /nostro/balance
 * Return the current pre-funded MXN pool balance.
 * In the real world, you'd reconcile this against the correspondent bank's
 * daily statement (MT940/MT950 SWIFT messages) — discrepancies must be investigated.
 */
router.get("/balance", (req, res) => {
  const { balanceMXN, topups } = store.nostro;

  // Pending topups: real wire transfers that haven't settled yet
  const pendingTopups = topups.filter((t) => t.status === "PENDING");
  const pendingMXN = pendingTopups.reduce((sum, t) => sum + t.amountMXN, 0);

  res.json({
    balanceMXN,
    currency: "MXN",
    pendingTopupsMXN: pendingMXN,
    projectedBalanceMXN: balanceMXN + pendingMXN,
    pendingTopups: pendingTopups.map((t) => ({
      topupId: t.topupId,
      amountMXN: t.amountMXN,
      initiatedAt: t.initiatedAt,
      availableAt: t.availableAt,
      note: t.note,
    })),
  });
});

/**
 * POST /nostro/topup
 * Simulate a wire transfer to top up the nostro account.
 *
 * Body: { amountMXN: number }
 *
 * In practice, the UAE company wires AED to a conversion bank which converts to MXN
 * and credits the nostro account. This settlement takes T+2 business days via SWIFT —
 * the same slow rails that the payment itself uses. This creates a bootstrapping problem:
 * you need the slow system to fund the slow system.
 */
router.post("/topup", (req, res) => {
  const { amountMXN } = req.body;

  if (!amountMXN || typeof amountMXN !== "number" || amountMXN <= 0) {
    return res.status(400).json({
      error: "INVALID_AMOUNT",
      message: "amountMXN must be a positive number",
    });
  }

  const now = new Date();
  // T+2 business days: standard SWIFT correspondent settlement timeline
  const availableAt = addBusinessDays(now, 2);

  const topup = {
    topupId: generatePaymentId(),
    amountMXN,
    initiatedAt: now.toISOString(),
    // The funds are credited to the nostro account only after the correspondent
    // bank confirms receipt — hence the 2-business-day delay.
    availableAt: availableAt.toISOString(),
    status: "PENDING",
    note: "Wire transfer sent. Funds available after T+2 business day SWIFT settlement.",
  };

  store.nostro.topups.push(topup);

  // Simulate async settlement: in a real system, a reconciliation job would run
  // nightly to match incoming MT910 credit confirmation messages and update the balance.
  // Here we use a simple timer to credit after the delay.
  const delayMs = availableAt.getTime() - now.getTime();
  setTimeout(() => {
    topup.status = "SETTLED";
    store.nostro.balanceMXN += amountMXN;
    topup.settledAt = new Date().toISOString();
  }, Math.min(delayMs, 2147483647)); // clamp to max JS timer value

  res.status(202).json({
    topupId: topup.topupId,
    amountMXN,
    status: "PENDING",
    initiatedAt: topup.initiatedAt,
    availableAt: topup.availableAt,
    currentBalanceMXN: store.nostro.balanceMXN,
    message:
      "Top-up initiated. Funds will be credited after T+2 business day SWIFT settlement.",
    whyItTakesLong:
      "Nostro funding goes through the same correspondent banking rails — " +
      "there is no faster mechanism in the conventional system to move large amounts cross-border.",
  });
});

module.exports = router;
