import "dotenv/config";

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const config = {
  privacyNode: {
    rpcUrl: required("PRIVACY_NODE_RPC_URL"),
    chainId: Number(optional("PRIVACY_NODE_CHAIN_ID", "800001")),
  },
  publicChain: {
    rpcUrl: optional("PUBLIC_CHAIN_RPC_URL", "https://testnet-rpc.rayls.com/"),
    chainId: Number(optional("PUBLIC_CHAIN_ID", "7295799")),
  },
  backendApi: {
    url: optional("BACKEND_URL", "https://rayls-backend-privacy-node-1.rayls.com"),
    userAuthKey: optional("USER_AUTH_KEY", ""),
    operatorAuthKey: optional("OPERATOR_AUTH_KEY", ""),
  },
  keys: {
    deployer: required("DEPLOYER_PRIVATE_KEY"),
    registered: optional("REGISTERED_PRIVATE_KEY", ""),
    /** Protocol owner — hackathon: single key for agent, attestation writer, and Public Chain ops. */
    protocolOwner: optional("PROTOCOL_OWNER_PRIVATE_KEY", ""),
    /** Falls back to PROTOCOL_OWNER_PRIVATE_KEY for hackathon (same wallet for everything). */
    attestationWriter: optional("ATTESTATION_WRITER_KEY", "") || optional("PROTOCOL_OWNER_PRIVATE_KEY", "") || optional("PUBLIC_DEPLOYER_KEY", ""),
  },
  contracts: {
    bondGov: optional("BOND_GOV_ADDRESS", ""),
    recvAcme: optional("RECV_ACME_ADDRESS", ""),
    recvBeta: optional("RECV_BETA_ADDRESS", ""),
    stableUsdr: optional("STABLE_USDR_ADDRESS", ""),
    picassoNft: optional("PICASSO_NFT_ADDRESS", ""),
    warholNft: optional("WARHOL_NFT_ADDRESS", ""),
    vaultLedger: optional("VAULT_LEDGER_ADDRESS", ""),
    vaultPolicy: optional("VAULT_POLICY_ADDRESS", ""),
    dvpExchange: optional("DVP_EXCHANGE_ADDRESS", ""),
    mockDex: optional("MOCK_DEX_ADDRESS", ""),
    attestation: optional("ATTESTATION_ADDRESS", ""),
    vaultShareToken: optional("VAULT_SHARE_TOKEN_ADDRESS", ""),
    receiptToken: optional("RECEIPT_TOKEN_ADDRESS", ""),
    marketplace: optional("MARKETPLACE_ADDRESS", ""),
  },
  agent: {
    loopIntervalMs: Number(optional("LOOP_INTERVAL_MS", "30000")),
  },
} as const;
