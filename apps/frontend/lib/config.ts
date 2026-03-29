export const PRIVACY_NODE_RPC = "https://privacy-node-1.rayls.com";
export const PUBLIC_CHAIN_RPC = "https://testnet-rpc.rayls.com/";

export const CONTRACTS = {
  // Privacy Node (Chain 800001)
  vaultLedger: "0x9a48eA8DD2E2e66a444cbb60A128104FFd673A51",
  bondGov: "0x916E1AF7B6be4Dc5DaD63976e21ce70aaC825B0E",
  recvAcme: "0x23bA554Ea54a08723AA901C590b29bFBe0da7748",
  recvBeta: "0xa8D0dD3e0FFF072374CcbD608fEf4B6Bb71543C2",
  stableUsdr: "0x7679653255d0128F7553945A917a636C3ed2F7eB",
  picassoNft: "0x24a059519f65659337cDafddc104835C11BCb5ce",
  warholNft: "0xb6ab2e98811bFf69Fc60Fb1Cc83A2E043C096247",
  vaultPolicy: "0x68E9c7Af06CA370241d9567cb16adeB1032d1143",
  // Public Chain (Chain 7295799)
  attestation: "0xc986c24aB18C208883623569f9e2F20179e21CBc",
  vaultShareToken: "0x51155638257ba10d7FC7E6Fba1df1d7315F19a1E",
  receiptToken: "0x6bA9dd9A6019A8EFe380B509FeB15F61493Bc64F",
  marketplace: "0x0fE1670F6dcc18aDF1130C18c360E09dc28FB223",
} as const;

/** Server-only: protocol owner key for signing governance + marketplace transactions */
export const DEPLOYER_KEY =
  process.env.PROTOCOL_OWNER_PRIVATE_KEY ??
  process.env.DEPLOYER_PRIVATE_KEY ??
  "";

/**
 * Server-only: governance manager key used by VaultPolicy write actions.
 * Fallback order intentionally prefers deployer key because VaultPolicy.manager
 * is owned by deployer in current deployments.
 */
export const GOVERNANCE_MANAGER_KEY =
  process.env.GOVERNANCE_MANAGER_PRIVATE_KEY ??
  process.env.DEPLOYER_PRIVATE_KEY ??
  process.env.PROTOCOL_OWNER_PRIVATE_KEY ??
  "";

/** Server-only: attestation owner key used to write Attestation.sol records on Public Chain. */
export const ATTESTATION_WRITER_KEY =
  process.env.ATTESTATION_WRITER_KEY ??
  process.env.PROTOCOL_OWNER_PRIVATE_KEY ??
  process.env.DEPLOYER_PRIVATE_KEY ??
  "";

export const BACKEND_API = "http://localhost:3001";

export const POLL_INTERVAL_MS = 15_000;
