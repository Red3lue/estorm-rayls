import { ethers } from "ethers";
import { config } from "../../config/index.js";
import { getAttestationWriterWallet } from "../../clients/publicChain.js";
import { VAULT_SHARE_TOKEN_ABI, RECEIPT_TOKEN_ABI, MARKETPLACE_ABI, ATTESTATION_ABI } from "../../abis/index.js";
import type { VaultSnapshot } from "../../types/vault.js";
import type { QuorumResult, QuorumAction, IssueDecision } from "../../types/think.js";
import type { IssueAction, IssueResult } from "../../types/issue.js";

async function updateNAV(snapshot: VaultSnapshot): Promise<IssueAction | null> {
  if (!config.contracts.vaultShareToken) return null;

  try {
    const wallet = getAttestationWriterWallet();
    const contract = new ethers.Contract(config.contracts.vaultShareToken, VAULT_SHARE_TOKEN_ABI, wallet);

    const currentNAV = Number(await contract.getNAV());
    const newNAV = Math.round(snapshot.nav * 100); // cents

    if (currentNAV === newNAV) {
      console.log("[ISSUE] NAV unchanged — skipping update");
      return null;
    }

    console.log(`[ISSUE] Updating NAV: ${currentNAV} → ${newNAV} cents`);
    const tx = await contract.updateNAV(newNAV, { gasLimit: 500_000 });
    await tx.wait();
    console.log(`[ISSUE] NAV updated — tx: ${tx.hash}`);
    return { type: "update_nav", asset: "VAULT-SHARE", txHash: tx.hash };
  } catch (err) {
    console.error("[ISSUE] updateNAV failed:", (err as Error).message);
    return null;
  }
}

async function mintReceiptToken(
  nftSymbol: string,
  snapshot: VaultSnapshot,
): Promise<IssueAction | null> {
  if (!config.contracts.receiptToken || !config.contracts.attestation) return null;

  try {
    const wallet = getAttestationWriterWallet();

    // Check if attestation exists for this NFT
    const attestContract = new ethers.Contract(config.contracts.attestation, ATTESTATION_ABI, wallet);
    const nft = snapshot.nonFungibles.find(n => n.symbol === nftSymbol);
    if (!nft) return null;

    const count = await attestContract.getAttestationCountForToken(nft.address);
    if (Number(count) === 0) {
      console.log(`[ISSUE] No attestation for ${nftSymbol} — skipping mint`);
      return null;
    }

    const receiptContract = new ethers.Contract(config.contracts.receiptToken, RECEIPT_TOKEN_ABI, wallet);
    const supply = Number(await receiptContract.totalSupply());
    const cap = Number(await receiptContract.supplyCap());

    if (supply >= cap) {
      console.log(`[ISSUE] Receipt token at supply cap (${supply}/${cap}) — skipping`);
      return null;
    }

    // Mint 1000 receipt tokens to the agent
    const mintAmount = ethers.parseUnits("1000", 18);
    console.log(`[ISSUE] Minting receipt tokens for ${nftSymbol}`);
    const tx = await receiptContract.mint(wallet.address, mintAmount, { gasLimit: 500_000 });
    await tx.wait();
    console.log(`[ISSUE] Receipt tokens minted — tx: ${tx.hash}`);
    return { type: "mint_receipt", asset: nftSymbol, txHash: tx.hash };
  } catch (err) {
    console.error(`[ISSUE] mintReceipt for ${nftSymbol} failed:`, (err as Error).message);
    return null;
  }
}

async function listOnMarketplace(
  tokenAddress: string,
  asset: string,
  amount: bigint,
  price: bigint,
): Promise<IssueAction | null> {
  if (!config.contracts.marketplace) return null;

  try {
    const wallet = getAttestationWriterWallet();
    const marketplace = new ethers.Contract(config.contracts.marketplace, MARKETPLACE_ABI, wallet);

    // Approve marketplace to spend tokens
    const tokenContract = new ethers.Contract(tokenAddress, ["function approve(address,uint256) external returns (bool)"], wallet);
    const approveTx = await tokenContract.approve(config.contracts.marketplace, amount, { gasLimit: 200_000 });
    await approveTx.wait();

    console.log(`[ISSUE] Listing ${asset} on marketplace`);
    const tx = await marketplace.list(tokenAddress, 0, 0, amount, price, { gasLimit: 500_000 });
    await tx.wait();
    console.log(`[ISSUE] Listed — tx: ${tx.hash}`);
    return { type: "list", asset, txHash: tx.hash };
  } catch (err) {
    console.error(`[ISSUE] list ${asset} failed:`, (err as Error).message);
    return null;
  }
}

async function delistFromMarketplace(listingId: number, asset: string): Promise<IssueAction | null> {
  if (!config.contracts.marketplace) return null;

  try {
    const wallet = getAttestationWriterWallet();
    const marketplace = new ethers.Contract(config.contracts.marketplace, MARKETPLACE_ABI, wallet);

    console.log(`[ISSUE] Delisting ${asset} (listing #${listingId})`);
    const tx = await marketplace.delist(listingId, { gasLimit: 200_000 });
    await tx.wait();
    console.log(`[ISSUE] Delisted — tx: ${tx.hash}`);
    return { type: "delist", asset, txHash: tx.hash };
  } catch (err) {
    console.error(`[ISSUE] delist ${asset} failed:`, (err as Error).message);
    return null;
  }
}

/**
 * ISSUE MODULE — Public Token Management
 *
 * Updates vault share NAV, mints receipt tokens for certified NFTs,
 * and manages marketplace listings on the Public Chain.
 */
export async function issue(
  quorum: QuorumResult,
  snapshot: VaultSnapshot,
): Promise<IssueResult> {
  console.log("\n[ISSUE] ========================================");
  const t0 = Date.now();

  const actions: IssueAction[] = [];

  // Always update NAV if it changed
  const navAction = await updateNAV(snapshot);
  if (navAction) actions.push(navAction);

  // Process quorum-approved issue decisions
  const approvedIssues = quorum.issue.filter(a => a.approved);

  for (const qa of approvedIssues) {
    const a = qa.action;

    if (a.action === "mint_receipt") {
      const result = await mintReceiptToken(a.asset, snapshot);
      if (result) actions.push(result);
    }

    if (a.action === "delist") {
      // Find active listing for this asset
      if (config.contracts.marketplace) {
        try {
          const wallet = getAttestationWriterWallet();
          const marketplace = new ethers.Contract(config.contracts.marketplace, MARKETPLACE_ABI, wallet);
          const activeIds = await marketplace.getActiveListings();
          for (const id of activeIds) {
            const listing = await marketplace.getListing(id);
            const nft = snapshot.nonFungibles.find(n => n.symbol === a.asset);
            const fungible = snapshot.fungibles.find(f => f.symbol === a.asset);
            const targetAddr = nft?.address ?? fungible?.address;
            if (targetAddr && listing.token.toLowerCase() === targetAddr.toLowerCase()) {
              const result = await delistFromMarketplace(Number(id), a.asset);
              if (result) actions.push(result);
            }
          }
        } catch (err) {
          console.error(`[ISSUE] delist scan failed:`, (err as Error).message);
        }
      }
    }
  }

  const elapsed = Date.now() - t0;
  console.log(`[ISSUE] Done: ${actions.length} action(s) in ${elapsed}ms`);
  console.log("[ISSUE] ========================================\n");

  return { actions, durationMs: elapsed };
}
