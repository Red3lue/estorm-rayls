import { config } from "../config/index.js";

const BASE = config.backendApi.url;

function userHeaders() {
  return {
    "Authorization": `Bearer ${config.backendApi.userAuthKey}`,
    "Content-Type": "application/json",
  };
}

function operatorHeaders() {
  return {
    "Authorization": `Bearer ${config.backendApi.operatorAuthKey}`,
    "Content-Type": "application/json",
  };
}

async function request(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const body = await res.text();
  let json: unknown;
  try { json = JSON.parse(body); } catch { json = body; }
  if (!res.ok) {
    throw new Error(`[RaylsBackend] ${res.status} ${res.statusText}: ${body}`);
  }
  return json;
}

// ─── User Onboarding ──────────────────────────────────────────────────────────

export interface OnboardingResponse {
  public_chain_address: string;
  private_chain_address: string;
  public_chain_private_key: string;
  private_chain_private_key: string;
  status: number;
  created_at: string;
}

export async function registerUser(externalUserId: string): Promise<OnboardingResponse> {
  return await request(`${BASE}/api/user/onboarding`, {
    method: "POST",
    headers: userHeaders(),
    body: JSON.stringify({ external_user_id: externalUserId }),
  }) as OnboardingResponse;
}

export async function approveUser(
  externalUserId: string,
  publicAddress: string,
  privateAddress: string,
): Promise<unknown> {
  return await request(`${BASE}/api/operator/onboarding/status`, {
    method: "PATCH",
    headers: operatorHeaders(),
    body: JSON.stringify({
      external_user_id: externalUserId,
      public_address: publicAddress,
      private_address: privateAddress,
      new_status: 1,
    }),
  });
}

// ─── Token Registration ───────────────────────────────────────────────────────

/** standard: 1=ERC20, 2=ERC721, 3=ERC1155 */
export async function registerToken(
  name: string,
  symbol: string,
  address: string,
  standard: 1 | 2 | 3,
): Promise<unknown> {
  return await request(`${BASE}/api/user/tokens`, {
    method: "POST",
    headers: userHeaders(),
    body: JSON.stringify({ name, symbol, address, uri: "", standard }),
  });
}

export async function approveToken(address: string): Promise<unknown> {
  return await request(`${BASE}/api/operator/tokens/status`, {
    method: "PATCH",
    headers: operatorHeaders(),
    body: JSON.stringify({ address, status: 1 }),
  });
}
