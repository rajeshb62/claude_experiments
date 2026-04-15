const { randomUUID } = require("crypto");

/**
 * Generate a payment ID.
 * In real SWIFT payments the equivalent identifier is the UETR
 * (Unique End-to-End Transaction Reference) — a UUID introduced by gpi (global payments
 * innovation) in 2017 to allow real-time payment tracking across the correspondent chain.
 * Before gpi, payments were essentially untraceable once they left the originating bank.
 */
function generatePaymentId() {
  return randomUUID();
}

module.exports = { generatePaymentId };
