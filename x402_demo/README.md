# x402 Pay-Per-API-Call Demo

Demonstrates the [x402 HTTP payment protocol](https://github.com/coinbase/x402) using Base Sepolia testnet. The `/api/joke` endpoint costs $0.001 USDC per call — paid automatically via the x402 protocol flow.

## How x402 works

```
Client                    Server                   Facilitator (Coinbase)
  |                          |                              |
  |-- GET /api/joke -------->|                              |
  |<- 402 Payment Required --|                              |
  |   { x402Version, accepts: [{ scheme, payTo, price }] } |
  |                          |                              |
  |  [sign ERC-3009 auth]    |                              |
  |                          |                              |
  |-- GET /api/joke -------->|                              |
  |   X-Payment: <base64>    |-- validate payment -------->|
  |                          |<- settlement proof ----------|
  |<- 200 OK + joke ---------|                              |
  |   X-Payment-Response     |                              |
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Description |
|---|---|
| `WALLET_ADDRESS` | Your Base Sepolia merchant wallet (receives USDC payments) |
| `PAYER_PRIVATE_KEY` | A **test-only** Base Sepolia wallet private key (signs demo payments) |
| `PORT` | Server port (default: 3000) |
| `FACILITATOR_URL` | Coinbase x402 facilitator (default: `https://facilitator.coinbase.com`) |

> **Never** use a mainnet private key. `PAYER_PRIVATE_KEY` is only for demo purposes.

### 3. Get test USDC on Base Sepolia

1. Go to the **Circle USDC faucet**: https://faucet.circle.com/
2. Select **Base Sepolia** as the network
3. Enter your `PAYER_PRIVATE_KEY` wallet address
4. Request test USDC (you need at least $0.001 USDC)

You can also get Base Sepolia ETH (for gas) from: https://www.alchemy.com/faucets/base-sepolia

### 4. Run the server

```bash
npm start
# or for auto-reload during development:
npm run dev
```

Open http://localhost:3000

## Demo flow

1. **Get Joke** — sends `GET /api/joke` with no payment header
2. **402 Response** — server returns payment requirements (network, amount, recipient)
3. **Sign Payment** — server signs an ERC-3009 `transferWithAuthorization` using `PAYER_PRIVATE_KEY`
4. **Retry** — request is retried with the `X-Payment` header containing the signed authorization
5. **200 OK** — Coinbase facilitator validates and settles the payment; server returns the joke

## Stack

- **Node.js / Express** — backend server
- **@x402/express** — x402 payment middleware (Coinbase)
- **@x402/evm** — EVM payment scheme (ERC-3009 / transferWithAuthorization)
- **ethers.js v6** — EIP-712 signing for demo payment creation
- **Base Sepolia** — testnet (chain ID 84532)
- **USDC** — `0x036CbD53842c5426634e7929541eC2318f3dCF7e` on Base Sepolia

## Project structure

```
x402_demo/
├── server.js          # Express server with x402 middleware
├── public/
│   └── index.html     # Frontend demo UI (single file, no framework)
├── .env.example       # Environment variable template
├── package.json
└── README.md
```
