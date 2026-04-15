/**
 * UAE → Mexico Conventional Cross-Border FX Payment Simulation
 *
 * This Express API simulates the full lifecycle of a conventional cross-border payment
 * through the correspondent banking network — the system that processes ~$150 trillion
 * in cross-border payments annually via the SWIFT network.
 *
 * Architecture mirrors reality:
 *   - In-memory store  ≈  each bank's proprietary ledger / SWIFT message log
 *   - /payment routes  ≈  originating bank's payment processing system
 *   - /nostro routes   ≈  treasury / liquidity management desk
 *   - fxService        ≈  FX trading desk
 *   - routingService   ≈  SWIFT MT103 correspondent chain
 */

const express = require("express");
const app = express();

app.use(express.json());

// ── Request logging (so you can see the payment journey in the terminal) ──────
app.use((req, res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/payment", require("./routes/payment"));
app.use("/nostro", require("./routes/nostro"));

// ── Root ──────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    service: "UAE → Mexico Conventional FX Payment Simulation",
    description:
      "Simulates the full correspondent banking lifecycle: " +
      "UAE AED → FX desk → SWIFT chain (3 hops) → Mexican SPEI → recipients",
    endpoints: {
      "POST /payment/initiate":         "Start a payment (banking hours + nostro check)",
      "POST /payment/:id/fx-convert":   "Apply FX markup and deduct all pre-routing fees",
      "POST /payment/:id/route":        "Simulate 3-hop correspondent bank journey",
      "POST /payment/:id/disburse":     "Final SPEI payout split across recipients",
      "GET  /payment/:id/summary":      "Full audit trail, fee breakdown, and elapsed time",
      "GET  /nostro/balance":           "Check pre-funded MXN pool balance",
      "POST /nostro/topup":             "Add funds (T+2 business day settlement)",
    },
    startingNostroBalanceMXN: 300000,
    corridor: "UAE (AED) → Mexico (MXN)",
    baseRate: "10 MXN per AED (mid-market)",
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "NOT_FOUND", path: req.path });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n UAE → Mexico FX Payment API running on http://localhost:${PORT}`);
  console.log(` Nostro account pre-funded with 300,000 MXN`);
  console.log(` Visit http://localhost:${PORT} for endpoint list\n`);
});

module.exports = app;
