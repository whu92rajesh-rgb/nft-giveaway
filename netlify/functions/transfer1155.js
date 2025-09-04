// netlify/functions/transfer1155.js
const { ethers } = require("ethers");

// Minimal ERC-1155 ABI
const ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data) external"
];

/**
 * Env vars required (add in Netlify Site settings → Environment variables):
 * - RPC_URL           (Polygon mainnet RPC; e.g., Alchemy)
 * - PRIVATE_KEY       (admin wallet private key; NEVER in frontend)
 * - CONTRACT_ADDRESS  (ERC-1155 contract address)
 * - ADMIN_ADDRESS     (admin wallet address that holds the tokens)
 * - TOKEN_ID          (the ERC-1155 token ID you want to give)
 * - AMOUNT_PER_USER   (optional, default "1")
 */
exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: ""
    };
  }

  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { to } = JSON.parse(event.body || "{}");
    if (!to || !/^0x[a-fA-F0-9]{40}$/.test(to)) {
      return withCors(400, { error: "Invalid address" });
    }

    const {
      RPC_URL,
      PRIVATE_KEY,
      CONTRACT_ADDRESS,
      ADMIN_ADDRESS,
      TOKEN_ID,
      AMOUNT_PER_USER = "1"
    } = process.env;

    if (!RPC_URL || !PRIVATE_KEY || !CONTRACT_ADDRESS || !ADMIN_ADDRESS || !TOKEN_ID) {
      return withCors(500, { error: "Missing env vars" });
    }

    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const signer = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

    const id = ethers.BigNumber.from(TOKEN_ID);
    const amount = ethers.BigNumber.from(AMOUNT_PER_USER);

    // 1) If recipient already has at least one, skip (one-per-address)
    const userBal = await contract.balanceOf(to, id);
    if (userBal.gt(0)) {
      return withCors(200, { status: "already" });
    }

    // 2) Ensure admin has enough to give
    const adminBal = await contract.balanceOf(ADMIN_ADDRESS, id);
    if (adminBal.lt(amount)) {
      return withCors(200, { status: "none_available" });
    }

    // 3) Transfer from admin → user
    const tx = await contract.safeTransferFrom(
      ADMIN_ADDRESS,
      to,
      id,
      amount,
      "0x"
    );
    await tx.wait();

    return withCors(200, { status: "sent", txHash: tx.hash, tokenId: id.toString(), amount: amount.toString() });
  } catch (e) {
    return withCors(500, { error: e.message || String(e) });
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
}
function withCors(statusCode, body) {
  return { statusCode, headers: corsHeaders(), body: JSON.stringify(body) };
}
