const { ethers } = require("ethers");

const ERC1155_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)"
];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
}
const ok = (code, obj) => ({ statusCode: code, headers: corsHeaders(), body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return ok(200, {});

  try {
    if (event.httpMethod !== "POST") return ok(405, { error: "Method Not Allowed" });

    const { to } = JSON.parse(event.body || "{}");
    if (!to) return ok(400, { error: "Missing 'to' address in body." });

    const {
      RPC_URL, PRIVATE_KEY, CONTRACT_ADDRESS,
      ADMIN_ADDRESS, TOKEN_ID, AMOUNT_PER_USER = "1"
    } = process.env;

    const contractAddr = ethers.utils.getAddress(CONTRACT_ADDRESS);
    const adminAddr = ethers.utils.getAddress(ADMIN_ADDRESS);
    const toAddr = ethers.utils.getAddress(to);

    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const signer = new ethers.Wallet(PRIVATE_KEY, provider);
    const signerAddr = await signer.getAddress();

    const contract = new ethers.Contract(contractAddr, ERC1155_ABI, signer);
    const tokenId = ethers.BigNumber.from(TOKEN_ID || "1");
    const amount = ethers.BigNumber.from(AMOUNT_PER_USER);

    console.log("=== transfer1155 invoked ===", { contractAddr, adminAddr, signerAddr, toAddr, tokenId: tokenId.toString(), amount: amount.toString() });

    if (signerAddr.toLowerCase() !== adminAddr.toLowerCase()) {
      return ok(400, { error: "Signer address ≠ ADMIN_ADDRESS", signerAddr, adminAddr });
    }

    const adminBal = await contract.balanceOf(adminAddr, tokenId);
    if (adminBal.lt(amount)) {
      return ok(400, { error: "Not enough tokens", adminBal: adminBal.toString(), required: amount.toString() });
    }

    try {
      await contract.callStatic.safeTransferFrom(adminAddr, toAddr, tokenId, amount, "0x");
    } catch (e) {
      return ok(400, { error: "Transfer would revert", reason: e?.reason || e?.message });
    }

    const tx = await contract.safeTransferFrom(adminAddr, toAddr, tokenId, amount, "0x", { gasLimit: 200000 });
    const receipt = await tx.wait();

    const userBalAfter = await contract.balanceOf(toAddr, tokenId);
    const adminBalAfter = await contract.balanceOf(adminAddr, tokenId);

    return ok(200, {
      status: "sent",
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      contract: contractAddr,
      tokenId: tokenId.toString(),
      amount: amount.toString(),
      adminBalBefore: adminBal.toString(),
      adminBalAfter: adminBalAfter.toString(),
      userBalAfter: userBalAfter.toString()
    });

  } catch (e) {
    console.error("Transfer failed:", e);
    return ok(500, { error: e.message || String(e) });
  }
};
