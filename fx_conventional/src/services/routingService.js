/**
 * Correspondent banking routing service.
 *
 * The UAE→Mexico corridor has no direct banking relationship — there is no single
 * bank with a presence in both countries. Instead, the payment hops through a chain
 * of correspondent banks that DO have bilateral relationships with each other.
 *
 * This is the "correspondent banking network" — a web of bilateral accounts (nostro/vostro)
 * built up over decades. Each hop adds delay, fees, and a point of potential failure.
 *
 * Typical UAE→Mexico path:
 *   UAE Bank ──SWIFT MT103──► US Correspondent ──SWIFT MT103──► Mexican Correspondent
 *                                                                        │
 *                                                              ──SPEI──► Local Mexican Bank
 *
 * "SPEI" (Sistema de Pagos Electrónicos Interbancarios) is Mexico's domestic real-time
 * gross settlement system operated by Banco de México. The final hop uses SPEI, not SWIFT.
 *
 * Each hop processes ONLY during that country's banking hours. Payments arriving after
 * cut-off time sit in a queue overnight — a major contributor to multi-day settlement.
 */

const { isHopBankingHours } = require("../utils/time");

/**
 * Correspondent hop configuration.
 * delayHours: processing time once the hop starts (business hours only)
 * feePercent: fee charged on the incoming MXN value at each hop
 */
const HOPS = [
  {
    hopNumber: 1,
    from: "UAE Bank",
    to: "US Correspondent (New York)",
    timezone: "America/New_York (EST, UTC-5)",
    delayHours: 4,
    // The US correspondent charges for FX liquidity provision (they momentarily
    // hold USD before converting to MXN) and for SWIFT message handling.
    feePercent: 0.3,
  },
  {
    hopNumber: 2,
    from: "US Correspondent (New York)",
    to: "Mexican Correspondent (Mexico City)",
    timezone: "America/Mexico_City (CST, UTC-6)",
    delayHours: 8,
    // The Mexican correspondent charges for local market access, compliance
    // screening, and for maintaining the account relationship with the local bank.
    feePercent: 0.4,
  },
  {
    hopNumber: 3,
    from: "Mexican Correspondent (Mexico City)",
    to: "Local Mexican Bank (SPEI destination)",
    timezone: "America/Mexico_City (CST, UTC-6)",
    delayHours: 6,
    // Final SPEI settlement fee — the local Mexican bank charges for crediting
    // the recipient's account and for SPEI message processing.
    feePercent: 0.2,
  },
];

/**
 * Process all three hops sequentially, simulating the time-aware queue.
 *
 * For each hop:
 *  - If we're within business hours, the hop processes immediately (for simulation).
 *  - If we're outside hours, we record when it will process (next open window for that hop).
 *  - Fee is deducted from the running MXN total at each hop.
 *
 * @param {number} startingMXN - MXN amount entering the correspondent chain
 * @param {Date} startTime - when routing begins (after FX conversion)
 * @returns {object} { hops: [...], finalMXN }
 */
function routePayment(startingMXN, startTime) {
  const hops = [];
  let runningMXN = startingMXN;
  // We simulate wall-clock hop timing by advancing a virtual clock.
  // Each hop starts when the previous one completes.
  let currentTime = new Date(startTime);

  for (const hopDef of HOPS) {
    // Check if the receiving bank is open right now
    const bankOpen = isHopBankingHours(hopDef.hopNumber, currentTime);

    // Calculate when this hop will actually be processed.
    // If the bank is closed, we advance to the next open window for that hop.
    let processAt = new Date(currentTime);
    if (!bankOpen) {
      processAt = nextHopOpenWindow(hopDef.hopNumber, currentTime);
    }

    // Deduct this hop's correspondent fee from the running MXN total
    const feeDeductedMXN = round2((runningMXN * hopDef.feePercent) / 100);
    const mxnBeforeHop = runningMXN;
    runningMXN = round2(runningMXN - feeDeductedMXN);

    // Hop completes after delayHours of processing time
    const completedAt = new Date(processAt.getTime() + hopDef.delayHours * 60 * 60 * 1000);

    hops.push({
      hopNumber: hopDef.hopNumber,
      from: hopDef.from,
      to: hopDef.to,
      timezone: hopDef.timezone,
      status: bankOpen ? "PROCESSED" : "QUEUED_UNTIL_BANK_OPEN",
      bankOpenAtProcessing: bankOpen,
      queuedAt: bankOpen ? null : currentTime.toISOString(),
      processAt: processAt.toISOString(),
      completedAt: completedAt.toISOString(),
      delayHours: hopDef.delayHours,
      feePercent: hopDef.feePercent,
      mxnEntering: mxnBeforeHop,
      feeDeductedMXN: feeDeductedMXN,
      mxnExiting: runningMXN,
    });

    // The next hop starts when this hop completes
    currentTime = completedAt;
  }

  return {
    hops,
    finalMXN: runningMXN,
    routingCompletedAt: currentTime.toISOString(),
  };
}

/**
 * Find the next moment when a given hop's bank will be open.
 * Advances minute-by-minute (clear and correct for simulation purposes).
 */
function nextHopOpenWindow(hopNumber, fromDate) {
  const candidate = new Date(fromDate.getTime());
  for (let i = 0; i < 60 * 24 * 7; i++) {
    candidate.setTime(candidate.getTime() + 60 * 1000);
    if (isHopBankingHours(hopNumber, candidate)) return candidate;
  }
  return null;
}

function round2(n) { return Math.round(n * 100) / 100; }

module.exports = { routePayment, HOPS };
