export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
] as const;

export const ERC721_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function ownerOf(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
  "function balanceOf(address) view returns (uint256)",
] as const;

export const VAULT_LEDGER_ABI = [
  "function getErc20Assets() view returns (tuple(address tokenAddress, string symbol, uint256 allocationPct, uint256 riskScore, uint256 yieldRate)[])",
  "function getErc721Assets() view returns (tuple(address tokenAddress, uint256 tokenId, uint256 valuation, uint8 certificationStatus, uint256 riskScore)[])",
  "function getNAV() view returns (uint256)",
  "function getVaultSnapshot() view returns (tuple(address tokenAddress, string symbol, uint256 allocationPct, uint256 riskScore, uint256 yieldRate)[], tuple(address tokenAddress, uint256 tokenId, uint256 valuation, uint8 certificationStatus, uint256 riskScore)[])",
] as const;
