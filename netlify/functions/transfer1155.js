// netlify/functions/transfer1155.js
// ERC-1155 giveaway (Polygon). Sends AMOUNT_PER_USER of TOKEN_ID from ADMIN_ADDRESS to "to".
// Returns quickly (does NOT wait long for confirmation to avoid Netlify timeouts).

const { ethers } = require("ethers");

// Minimal ERC-1155 ABI
const ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data) external"
];

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

    // ---- parse & validate body ----
    const { to } = JSON.parse(event.body || "{}");
    if (!to || !/^0x[a-fA-F0-9]{40}$/.test(to)) {
      return withCors(400, { error: "Invalid 'to' address" });
    }

    // ---- required env vars ----
    const {
      RPC_URL,
      PRIVATE_KEY,
      CONTRACT_ADDRESS,
      ADMIN_ADDRESS,
      TOKEN_ID,
      AMOUNT_PER_USER = "1",
    } = process.env;

    if (!RPC_URL || !PRIVATE_KEY || !CONTRACT_ADDRESS || !ADMIN_ADDRESS || !TOKEN_ID) {
      return withCors(500, { error: "Missing environment variables" });
    }

    // ---- setup provider/contract ----
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const signer = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

    const id = ethers.BigNumber.from(TOKEN_ID);
    const amt = ethers.BigNumber.from(AMOUNT_PER_USER);

    // ---- one-per-address guard: if user already has >=1, skip ----
    const userBal = await contract.balanceOf(to, id);
    if (userBal.gt(0)) {
      return withCors(200, { status: "already" });
    }

    // ---- check admin supply ----
    const adminBal = await contract.balanceOf(ADMIN_ADDRESS, id);
    if (adminBal.lt(amt)) {
      return withCors(200, { status: "none_available" });
    }

    // ---- send transfer; return quickly with tx hash to avoid timeouts ----
    const tx = await contract.safeTransferFrom(ADMIN_ADDRESS, to, id, amt, "0x");

    // Optional: wait briefly (<=8s) for 1 confirmation; ignore if slow
    try {
      await provider.waitForTransaction(tx.hash, 1, 8000);
    } catch (_) {}

    return withCors(200, {
      status: "sent",
      txHash: tx.hash,
      tokenId: id.toString(),
      amount: amt.toString(),
    });

  } catch (e) {
    // surface useful error text
    return withCors(500, { error: e?.reason || e?.message || String(e) });
  }
};

// ---------- helpers ----------
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}
function withCors(statusCode, bodyObj) {
  return { statusCode, headers: corsHeaders(), body: JSON.stringify(bodyObj) };
}
