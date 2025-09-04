# NFT Giveaway (Netlify Functions)

This repo contains two Netlify Functions:
- `ping.js` – returns `{ ok: true }` to confirm functions are deployed
- `transfer1155.js` – sends an ERC-1155 token from ADMIN_ADDRESS to a recipient (debug logging enabled)

## Environment Variables (set in Netlify → Site configuration → Environment variables)
- `RPC_URL` – Polygon mainnet endpoint (Alchemy/Infura)
- `PRIVATE_KEY` – private key of ADMIN_ADDRESS (no 0x)
- `ADMIN_ADDRESS` – wallet that holds the NFTs
- `CONTRACT_ADDRESS` – ERC-1155 contract address
- `TOKEN_ID` – token id to send (e.g., `1` or `2`)
- `AMOUNT_PER_USER` – defaults to `1` if omitted

## Deploy
1. Push this repo to GitHub.
2. Import repo into Netlify and deploy.
3. After deploy, you can call:
   - `/.netlify/functions/ping` → should return `{ ok: true }`
   - `/.netlify/functions/transfer1155` with JSON body `{ "to": "0x..." }`
