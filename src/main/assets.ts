import { app } from "electron";
import { join, dirname, basename } from "path";
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, readFileSync, unlinkSync, copyFileSync, renameSync } from "fs";
import { getActiveProfileName } from "./profiles";

interface Asset {
  name: string;
  source_path: string;
  size: number;
  modified: number;
  exists: boolean;
  added_at: number;
  type?: "image" | "video" | "document" | "other";
}

async function getAssetsPath(profile?: string): Promise<string> {
  const profileName = profile ?? await getActiveProfileName();
  // Always use a fixed canonical path for assets storage
  const assetsPath = join(app.getPath("home"), "Library", "Application Support", "hermes-desktop", "assets", profileName);
  if (!existsSync(assetsPath)) {
    mkdirSync(assetsPath, { recursive: true });
  }
  return assetsPath;
}

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"];
const VIDEO_EXTS = ["mp4", "webm", "ogg", "mov", "avi", "m4v"];
const OFFICE_EXTS = ["ppt", "pptx", "doc", "docx", "xls", "xlsx"];
const PDF_EXT = "pdf";
const MD_EXT = "md";

function getFileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

function inferAssetType(name: string): "image" | "video" | "document" | "other" {
  const ext = getFileExt(name);
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (VIDEO_EXTS.includes(ext)) return "video";
  if (OFFICE_EXTS.includes(ext) || ext === PDF_EXT || ext === MD_EXT) return "document";
  return "other";
}

export async function listAssets(profile?: string): Promise<Asset[]> {
  // Use local file system listing
  const assetsPath = await getAssetsPath(profile);

  try {
    const files = readdirSync(assetsPath);

    const assets: Asset[] = [];
    for (const file of files) {
      const filePath = join(assetsPath, file);
      try {
        const stat = statSync(filePath);
        if (stat.isFile()) {
          assets.push({
            name: file,
            source_path: filePath,
            size: stat.size,
            modified: Math.floor(stat.mtimeMs / 1000),
            exists: true,
            added_at: Math.floor(stat.ctimeMs / 1000),
            type: inferAssetType(file),
          });
        }
      } catch {
        // Skip files we can't stat
      }
    }

    return assets.sort((a, b) => b.added_at - a.added_at);
  } catch {
    return [];
  }
}

export async function getAsset(name: string, profile?: string): Promise<string> {
  const assetsPath = await getAssetsPath(profile);
  const filePath = join(assetsPath, name);

  try {
    const data = readFileSync(filePath);
    return data.toString("base64");
  } catch (err) {
    throw new Error(`Failed to get asset: ${(err as Error).message}`);
  }
}

export async function removeAsset(name: string, profile?: string): Promise<boolean> {
  const assetsPath = await getAssetsPath(profile);
  const filePath = join(assetsPath, name);

  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
    return true;
  } catch (err) {
    throw new Error(`Failed to remove asset: ${(err as Error).message}`);
  }
}

export async function addAssetToChat(
  name: string,
  _sessionId: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  const assetsPath = await getAssetsPath(profile);
  const filePath = join(assetsPath, name);

  if (!existsSync(filePath)) {
    return { success: false, error: "Asset not found" };
  }
  return { success: true };
}

export async function addAsset(
  name: string,
  base64Data: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const assetsPath = await getAssetsPath(profile);
    // Support subfolder paths like "subfolder/file.png"
    const safeName = name.replace(/\//g, " - ");
    const filePath = join(assetsPath, safeName);
    const parentDir = dirname(filePath);
    if (parentDir !== assetsPath && !existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

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

// ── Folders ──────────────────────────────────────────────────────────────────

export interface AssetFolder {
  name: string;
  path: string; // relative to assets root, e.g. "subfolder" or "a/b"
  fileCount: number;
}

export interface AssetNode {
  name: string;
  path: string; // full relative path from assets root
  type: "file" | "folder";
  size?: number;
  modified: number;
  exists: boolean;
  added_at: number;
  type_?: "image" | "video" | "document" | "other";
}

export async function listAssetNodes(
  folder?: string,
  profile?: string,
): Promise<AssetNode[]> {
  const assetsPath = await getAssetsPath(profile);
  const baseDir = folder ? join(assetsPath, folder) : assetsPath;

  if (!existsSync(baseDir)) return [];

  try {
    const entries = readdirSync(baseDir, { withFileTypes: true });
    return entries.map((entry) => {
      const relPath = folder ? `${folder}/${entry.name}` : entry.name;
      const fullPath = join(baseDir, entry.name);
      const stat = statSync(fullPath);
      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: relPath,
          type: "folder" as const,
          modified: Math.floor(stat.mtimeMs / 1000),
          exists: true,
          added_at: Math.floor(stat.ctimeMs / 1000),
        };
      }
      return {
        name: entry.name,
        path: relPath,
        type: "file" as const,
        size: stat.size,
        modified: Math.floor(stat.mtimeMs / 1000),
        exists: true,
        added_at: Math.floor(stat.ctimeMs / 1000),
        type_: inferAssetType(entry.name),
      };
    });
  } catch {
    return [];
  }
}

export async function createAssetFolder(
  name: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const assetsPath = await getAssetsPath(profile);
    const folderPath = join(assetsPath, name);
    if (existsSync(folderPath)) {
      return { success: false, error: "Folder already exists" };
    }
    mkdirSync(folderPath, { recursive: true });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create folder",
    };
  }
}

export async function moveAsset(
  fromPath: string,
  toPath: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const assetsPath = await getAssetsPath(profile);
    const src = join(assetsPath, fromPath);
    const dst = join(assetsPath, toPath);
    if (!existsSync(src)) {
      return { success: false, error: "Source not found" };
    }
    const dstDir = dirname(dst);
    if (!existsSync(dstDir)) {
      mkdirSync(dstDir, { recursive: true });
    }
    renameSync(src, dst);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to move asset",
    };
  }
}

export async function copyAsset(
  fromPath: string,
  toPath: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const assetsPath = await getAssetsPath(profile);
    const src = join(assetsPath, fromPath);
    const dst = join(assetsPath, toPath);
    if (!existsSync(src)) {
      return { success: false, error: "Source not found" };
    }
    const dstDir = dirname(dst);
    if (!existsSync(dstDir)) {
      mkdirSync(dstDir, { recursive: true });
    }
    copyFileSync(src, dst);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to copy asset",
    };
  }
}

export async function uploadAssetFile(
  sourcePath: string,
  targetFolder: string,
  profile?: string,
): Promise<{ success: boolean; error?: string; name?: string }> {
  try {
    const assetsPath = await getAssetsPath(profile);
    const fileName = basename(sourcePath);
    const targetDir = targetFolder
      ? join(assetsPath, targetFolder)
      : assetsPath;
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }
    const destPath = join(targetDir, fileName);
    copyFileSync(sourcePath, destPath);
    return { success: true, name: targetFolder ? `${targetFolder}/${fileName}` : fileName };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to upload file",
    };
  }
}