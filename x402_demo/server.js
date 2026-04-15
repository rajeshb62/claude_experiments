require('dotenv').config();
const express = require('express');
const path = require('path');
const { ethers } = require('ethers');
const { paymentMiddleware, x402ResourceServer } = require('@x402/express');
const { HTTPFacilitatorClient } = require('@x402/core/server');
const { ExactEvmScheme } = require('@x402/evm/exact/server');

const app = express();
const PORT = process.env.PORT || 3000;
const WALLET_ADDRESS = process.env.WALLET_ADDRESS || '0x0000000000000000000000000000000000000000';
const PAYER_PRIVATE_KEY = process.env.PAYER_PRIVATE_KEY;
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://x402.org/facilitator';

// Setup x402 resource server with Coinbase facilitator
const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register('eip155:84532', new ExactEvmScheme());

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Apply x402 payment middleware — intercepts GET /api/joke
// syncFacilitatorOnStart=false avoids a crash if the facilitator is unreachable at boot time
app.use(
  paymentMiddleware(
    {
      'GET /api/joke': {
        accepts: [
          {
            scheme: 'exact',
            price: '$0.001',
            network: 'eip155:84532', // Base Sepolia
            payTo: WALLET_ADDRESS,
          },
        ],
        description: 'One programming joke',
        mimeType: 'application/json',
      },
    },
    resourceServer,
    undefined, // paywallConfig
    undefined, // paywall
    true,      // syncFacilitatorOnStart — fetch supported kinds from facilitator at boot
  ),
);

const jokes = [
  "Why do programmers prefer dark mode? Because light attracts bugs!",
  "A SQL query walks into a bar, walks up to two tables and asks... 'Can I join you?'",
  "Why do Java developers wear glasses? Because they don't C#!",
  "How many programmers does it take to change a light bulb? None — that's a hardware problem.",
  "Why did the developer go broke? Because he used up all his cache!",
  "A programmer's wife says: 'Go to the store, get a loaf of bread, and if they have eggs, get a dozen.' He returns with 12 loaves of bread.",
  "!false — It's funny because it's true.",
  "Why did the programmer quit his job? Because he didn't get arrays.",
  "There are 10 types of people in the world: those who understand binary, and those who don't.",
  "I would tell you a UDP joke, but you might not get it.",
];

// Protected joke endpoint — only reached if x402 middleware passes
app.get('/api/joke', (req, res) => {
  const joke = jokes[Math.floor(Math.random() * jokes.length)];
  res.json({
    joke,
    timestamp: new Date().toISOString(),
    protocol: 'x402',
    network: 'base-sepolia',
  });
});

// Demo endpoint: sign a payment using PAYER_PRIVATE_KEY from .env
// In production, this would happen in the client's wallet (e.g. MetaMask)
app.post('/api/demo-payment', async (req, res) => {
  if (!PAYER_PRIVATE_KEY) {
    return res.status(500).json({
      error: 'PAYER_PRIVATE_KEY not set in .env — add a Base Sepolia test wallet private key.',
    });
  }

  // paymentRequirements is the decoded object from the `payment-required` response header
  // Shape: { x402Version, error, resource, accepts: [{ scheme, network, amount, asset, payTo, maxTimeoutSeconds, extra }] }
  const { paymentRequirements } = req.body;
  if (!paymentRequirements || !paymentRequirements.accepts?.length) {
    return res.status(400).json({ error: 'Missing paymentRequirements in request body.' });
  }

  try {
    const wallet = new ethers.Wallet(PAYER_PRIVATE_KEY);
    const req402 = paymentRequirements.accepts[0];

    // amount is already in base units (e.g. "1000" = 0.001 USDC with 6 decimals)
    const amount = BigInt(req402.amount);

    const now = Math.floor(Date.now() / 1000);
    const validAfter = BigInt(now - 600); // 10 min grace window (mirrors SDK)
    const validBefore = BigInt(now + (req402.maxTimeoutSeconds || 300));
    const nonce = ethers.hexlify(ethers.randomBytes(32));

    // Chain ID is encoded in the network field as "eip155:<chainId>"
    const chainId = parseInt(req402.network.split(':')[1], 10);

    // EIP-712 domain — name/version come from requirements.extra (USDC metadata)
    const domain = {
      name: req402.extra?.name || 'USD Coin',
      version: req402.extra?.version || '2',
      chainId,
      verifyingContract: req402.asset, // contract address (no prefix)
    };

    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };

    const message = {
      from: wallet.address,
      to: req402.payTo,
      value: amount,
      validAfter,
      validBefore,
      nonce,
    };

    const signature = await wallet.signTypedData(domain, types, message);

    // Payment payload format for @x402/express v2:
    // Must include `accepted` = deep-equal copy of the chosen payment requirements
    // so the middleware can match it to the server's configured requirements.
    const paymentPayload = {
      x402Version: paymentRequirements.x402Version || 2,
      accepted: req402, // the selected requirements from accepts[]
      payload: {
        authorization: {
          from: wallet.address,
          to: req402.payTo,
          value: amount.toString(),
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce,
        },
        signature,
      },
    };

    const encoded = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

    res.json({
      paymentHeader: encoded,
      paymentPayload,
      payerAddress: wallet.address,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Expose non-sensitive config for the frontend
app.get('/api/config', (req, res) => {
  res.json({
    walletAddress: WALLET_ADDRESS,
    network: 'base-sepolia',
    chainId: 84532,
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    hasDemoPayerKey: !!PAYER_PRIVATE_KEY,
    facilitatorUrl: FACILITATOR_URL,
  });
});

async function start() {
  try {
    await resourceServer.initialize();
    console.log('Facilitator sync: ✓');
  } catch (err) {
    console.error('Facilitator sync failed:', err.message);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`\nx402 Demo server running at http://localhost:${PORT}`);
    console.log(`Merchant wallet : ${WALLET_ADDRESS}`);
    console.log(`Demo payer key  : ${PAYER_PRIVATE_KEY ? 'configured ✓' : 'not configured (add PAYER_PRIVATE_KEY to .env)'}`);
    console.log(`Facilitator     : ${FACILITATOR_URL}\n`);
  });
}

start();
