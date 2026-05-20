import { app } from "electron";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { getApiUrl, getRemoteAuthHeader } from "./hermes";

interface Asset {
  name: string;
  source_path: string;
  size: number;
  modified: number;
  exists: boolean;
  added_at: number;
}

function getAssetsPath(): string {
  const userDataPath = app.getPath("userData");
  const assetsPath = join(userDataPath, "assets");
  if (!existsSync(assetsPath)) {
    mkdirSync(assetsPath, { recursive: true });
  }
  return assetsPath;
}

async function remoteFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    ...getRemoteAuthHeader(),
    ...((init.headers as Record<string, string>) || {}),
  };
  return fetch(`${getApiUrl()}${path}`, { ...init, headers });
}

export async function listAssets(): Promise<Asset[]> {
  const res = await remoteFetch("/api/assets");
  if (!res.ok) {
    throw new Error(`Failed to list assets: ${res.status}`);
  }
  const data = (await res.json()) as { assets: Asset[] };
  return data.assets || [];
}

export async function getAsset(name: string): Promise<string> {
  const encodedName = encodeURIComponent(name);
  const res = await remoteFetch(`/api/assets/${encodedName}`);
  if (!res.ok) {
    throw new Error(`Failed to get asset: ${res.status}`);
  }
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove data URL prefix if present
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read asset blob"));
    reader.readAsDataURL(blob);
  });
}

export async function removeAsset(name: string): Promise<boolean> {
  const res = await remoteFetch("/api/assets/remove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(`Failed to remove asset: ${res.status}`);
  }
  return true;
}

export async function addAssetToChat(
  name: string,
  _sessionId: string,
): Promise<{ success: boolean; error?: string }> {
  const encodedName = encodeURIComponent(name);
  const res = await remoteFetch(`/api/assets/${encodedName}`);
  if (!res.ok) {
    return { success: false, error: `Failed to fetch asset: ${res.status}` };
  }
  // For now, just confirm the asset exists - actual chat integration
  // would need to stage the file and add it as an attachment
  return { success: true };
}

export async function addAsset(
  name: string,
  base64Data: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const assetsPath = getAssetsPath();
    const filePath = join(assetsPath, name);

    // Convert base64 to binary and save
    const binary = Buffer.from(base64Data, "base64");
    writeFileSync(filePath, binary);

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to add asset",
    };
  }
}