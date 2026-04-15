/**
 * In-memory store — no database.
 *
 * In conventional cross-border payments, every bank in the chain maintains its own
 * ledger of your transaction. This single in-memory object approximates that: each
 * payment record tracks the state that would normally be scattered across 3-4 bank
 * systems and a SWIFT message trail.
 */

const store = {
  /**
   * Nostro account: a pre-funded pool of MXN held at the Mexican correspondent bank.
   * "Nostro" is Latin for "ours" — it's our money sitting in their bank.
   * UAE remittance companies must pre-fund this account in advance so that payouts
   * can happen immediately on the Mexico side, rather than waiting for SWIFT settlement.
   * Starting balance: 300,000 MXN
   */
  nostro: {
    balanceMXN: 300_000,
    currency: "MXN",
    topups: [], // pending topup requests
  },

  /**
   * payments: keyed by paymentId (UUID).
   * A single record aggregates all state that would normally live in SWIFT MT messages,
   * multiple bank ledger entries, FX desk tickets, and a compliance audit trail.
   */
  payments: {},
};

module.exports = store;
