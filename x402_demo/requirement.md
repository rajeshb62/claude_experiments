Project: x402 Pay-Per-API-Call Demo
Build a Node.js/Express app demonstrating the x402 payment protocol flow. The app should have a backend server and a simple frontend UI.
Stack: Node.js, Express, plain HTML/CSS/JS (no framework needed)

Server (server.js)

Serve static files from a public/ directory
Protect GET /api/joke with x402 middleware:

If no X-Payment header → return HTTP 402 with a JSON body following the x402 spec:



json    {
      "x402Version": 1,
      "error": "Payment required",
      "accepts": [{
        "scheme": "exact",
        "network": "base-sepolia",
        "maxAmountRequired": "0.001",
        "resource": "<full URL>",
        "description": "One programming joke",
        "payTo": "<your wallet address>",
        "maxTimeoutSeconds": 300,
        "asset": "eip155:84532/erc20:0x036CbD53842c5426634e7929541eC2318f3dCF7e"
      }]
    }

If X-Payment header is present → decode it (base64 JSON), validate it via the Coinbase x402 facilitator at https://facilitator.coinbase.com, then return the joke if valid. Include a X-Payment-Response header in the success response.
Use the official @x402/express middleware package from the coinbase/x402 GitHub repo

Frontend (public/index.html)
Single HTML file with embedded CSS/JS that visually demonstrates the full x402 flow:

A "Get Joke" button triggers GET /api/joke with no payment header
The UI shows the raw 402 response and payment requirements
A "Pay & Retry" button simulates creating a signed payment payload and retries the request with the X-Payment header
The UI shows the successful response with the joke and transaction metadata

The UI should clearly visualize each step of the protocol: Request → 402 → Sign → Retry → Response. Show the actual raw HTTP request/response data at each step so users understand what's happening under the hood.
Notes:

Use Base Sepolia testnet (no real money)
Reference the official SDK docs: npm install @x402/express @x402/core
Use dotenv for wallet address / private key config
Include a README.md with setup steps and how to get test USDC from the Circle faucet