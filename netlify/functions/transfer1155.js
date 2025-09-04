// netlify/functions/transfer1155.js
const { ethers } = require("ethers");

// Minimal ERC-1155 ABI
const ERC1155_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)"
];

// CORS helpers
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
}
const ok = (code, obj) => ({
  statusCode: code,
  headers: corsHeaders(),
  body: JSON.stringify(obj)
});

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return ok(200, {});

  try {
    if (event.httpMethod !== "POST") return ok(405, { error: "Method Not Allowed" });

    const { to } = JSON.parse(event.body || "{}");
    if (!to) return ok(400, { error: "Missing 'to' address in body." });

    // --- env vars (set in Netlify > Site settings > Environment)
    const {
      RPC_URL,
      PRIVATE_KEY,
      CONTRACT_ADDRESS,
      ADMIN_ADDRESS,
      TOKEN_ID,
      AMOUNT_PER_USER = "1"
    } = process.env;

    // Basic validation + normalization
    const contractAddr = ethers.utils.getAddress(CONTRACT_ADDRESS);
    const adminAddr    = ethers.utils.getAddress(ADMIN_ADDRESS);
    const toAddr       = ethers.utils.getAddress(to);

    // Provider + network check (MUST be Polygon PoS = 137)
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const network  = await provider.getNetwork();
    if (network.chainId !== 137) {
      return ok(400, {
        error: "Wrong RPC network. Use Polygon PoS mainnet.",
        expectedChainId: 137,
        got: { chainId: network.chainId, name: network.name }
      });
    }

    // Gas price + admin POL balance (for diagnostics)
    const gasPrice = await provider.getGasPrice().catch(() => null);
    const adminPOL = await provider.getBalance(adminAddr).catch(() => null);

    // Signer check
    const signer      = new ethers.Wallet(PRIVATE_KEY, provider);
    const signerAddr  = await signer.getAddress();
    if (signerAddr.toLowerCase() !== adminAddr.toLowerCase()) {
      return ok(400, { error: "Signer address ≠ ADMIN_ADDRESS", signerAddr, adminAddr });
    }

    // ERC-1155 setup
    const contract = new ethers.Contract(contractAddr, ERC1155_ABI, signer);
    const tokenId  = ethers.BigNumber.from(TOKEN_ID || "1");
    const amount   = ethers.BigNumber.from(AMOUNT_PER_USER);

    // Admin must have enough supply of that token id
    const adminBal = await contract.balanceOf(adminAddr, tokenId);
    if (adminBal.lt(amount)) {
      return ok(400, {
        error: "Admin holds insufficient token balance",
        adminBal: adminBal.toString(),
        required: amount.toString(),
        tokenId: tokenId.toString()
      });
    }

    // Preflight: ensure it won’t revert on-chain
    try {
      await contract.callStatic.safeTransferFrom(adminAddr, toAddr, tokenId, amount, "0x");
    } catch (e) {
      return ok(400, { error: "Transfer would revert", reason: e?.reason || e?.message });
    }

    // --- Broadcast the tx and RETURN IMMEDIATELY (do NOT wait for confirmations)
    const overrides = gasPrice ? { gasPrice, gasLimit: 200000 } : { gasLimit: 200000 };
    const tx = await contract.safeTransferFrom(adminAddr, toAddr, tokenId, amount, "0x", overrides);

    // Try a short mempool/propagation wait (12s) WITHOUT blocking your response
    // We still return instantly below; this is just to mark 'propagated' truthy when possible.
    let propagated = false;
    provider.waitForTransaction(tx.hash, 1, 12000).then((r) => {
      if (r) propagated = true;
    }).catch(() => { /* ignore */ });

    // Respond fast to avoid Netlify function timeout
    return ok(200, {
      status: "submitted",
      message: "Transaction broadcast—track on Polygonscan or OKLink.",
      txHash: tx.hash,
      network: { chainId: network.chainId, name: network.name },
      gasPrice: gasPrice ? gasPrice.toString() : null,
      adminPOL: adminPOL ? adminPOL.toString() : null,
      contract: contractAddr,
      tokenId: tokenId.toString(),
      amount: amount.toString(),
      propagated
    });

  } catch (e) {
    console.error("transfer1155 error:", e);
    return ok(500, { error: e.message || String(e) });
  }
};
