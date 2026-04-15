/**
 * FX conversion service — simulates the FX desk at the originating UAE bank.
 *
 * In conventional remittance, the sending bank's treasury desk quotes an exchange rate
 * that embeds a markup over the interbank (mid-market) rate. This markup is the primary
 * profit centre for traditional banks on cross-border payments — it is often NOT shown
 * as a line-item fee, making it invisible to the customer. The true cost is only visible
 * when comparing the received amount against the mid-market rate.
 *
 * Fee anatomy for a UAE→Mexico corridor:
 *   1. FX Markup     — hidden spread over mid-market (most expensive, least visible)
 *   2. SWIFT Fee     — flat fee charged for the MT103 SWIFT message
 *   3. Correspondent — charged by the US correspondent for providing USD liquidity and
 *      Bank Fee         routing to Mexico. Banks often call this a "lifting fee."
 */

// Mid-market rate. In a real system this comes from a Reuters/Bloomberg feed.
const BASE_RATE_MXN_PER_AED = 10;

// FX markup: 3.5% over mid-market. Industry average for retail remittance is 2–5%.
// The World Bank tracks these markups as "remittance costs" in its Remittance Prices
// Worldwide database — the G20 target is <3%, but traditional banks routinely exceed it.
const FX_MARKUP_PERCENT = 3.5;

// SWIFT MT103 message fee — flat per-transaction cost. This covers SWIFT network access,
// message validation, and the bank's SWIFT bureau processing.
const SWIFT_FEE_AED = 25;

// Correspondent bank fee: 0.5% of the transaction value (also called a "lifting fee").
// The US correspondent charges this for providing dollar liquidity and routing the
// payment onward into the Mexican banking system via SPEI or local rails.
const CORRESPONDENT_FEE_PERCENT = 0.5;

/**
 * Convert AED to MXN with all fees applied.
 * @param {number} senderAED - gross amount sent by customer (before any fees)
 * @returns {object} conversion breakdown
 */
function convertAEDtoMXN(senderAED) {
  // --- Step 1: Deduct the SWIFT fee upfront (it's charged before conversion) ---
  const afterSwiftFeeAED = senderAED - SWIFT_FEE_AED;

  // --- Step 2: Deduct the correspondent bank fee ---
  // Applied on the remaining AED value — it's percentage-based.
  const correspondentFeeAED = (afterSwiftFeeAED * CORRESPONDENT_FEE_PERCENT) / 100;
  const afterAllFeesAED = afterSwiftFeeAED - correspondentFeeAED;

  // --- Step 3: Apply FX markup ---
  // The applied rate is the mid-market rate MINUS the markup (customer gets fewer MXN).
  // A 3.5% markup means the customer receives 3.5% less MXN than they would at mid-market.
  const appliedRateMXNperAED = BASE_RATE_MXN_PER_AED * (1 - FX_MARKUP_PERCENT / 100);

  // --- Step 4: Convert net AED to MXN ---
  const convertedMXN = afterAllFeesAED * appliedRateMXNperAED;

  // --- Step 5: Express all fees in MXN for transparency ---
  const swiftFeeMXN = SWIFT_FEE_AED * appliedRateMXNperAED;
  const correspondentFeeMXN = correspondentFeeAED * appliedRateMXNperAED;

  // FX markup cost: the MXN lost due to the spread vs. mid-market
  const atMidMarketMXN = afterAllFeesAED * BASE_RATE_MXN_PER_AED;
  const fxMarkupCostMXN = atMidMarketMXN - convertedMXN;

  const totalFeesAED = SWIFT_FEE_AED + correspondentFeeAED;
  const totalFeesMXN = swiftFeeMXN + correspondentFeeMXN + fxMarkupCostMXN;

  return {
    inputAED: senderAED,
    swiftFeeAED: round2(SWIFT_FEE_AED),
    correspondentFeeAED: round2(correspondentFeeAED),
    totalFeesAED: round2(totalFeesAED),
    netAEDConverted: round2(afterAllFeesAED),
    baseRateMXNperAED: BASE_RATE_MXN_PER_AED,
    fxMarkupPercent: FX_MARKUP_PERCENT,
    appliedRateMXNperAED: round4(appliedRateMXNperAED),
    convertedMXN: round2(convertedMXN),
    swiftFeeMXN: round2(swiftFeeMXN),
    correspondentFeeMXN: round2(correspondentFeeMXN),
    fxMarkupCostMXN: round2(fxMarkupCostMXN),
    totalFeesMXN: round2(totalFeesMXN),
  };
}

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }

module.exports = { convertAEDtoMXN, BASE_RATE_MXN_PER_AED };
