/**
 * Asset social features: likes, comments, shares.
 * Stores metadata in a JSON file alongside the assets directory.
 */
import { app } from "electron";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

export interface AssetComment {
  id: string;
  author: string;
  body: string;
  created_at: number;
}

export interface AssetMeta {
  likes: string[]; // user identifiers who liked
  comments: AssetComment[];
  shares: number;
}

type MetaStore = Record<string, AssetMeta>;

function safeName(name: string): string {
  return name.replace(/\//g, " - ");
}

function getMetaPath(profile?: string): string {
  const profileName = profile ?? "default";
  const basePath = join(
    app.getPath("home"),
    "Library",
    "Application Support",
    "hermes-desktop",
    "assets",
    profileName,
  );
  if (!existsSync(basePath)) {
    mkdirSync(basePath, { recursive: true });
  }
  return join(basePath, "_meta.json");
}

function readStore(profile?: string): MetaStore {
  try {
    const metaPath = getMetaPath(profile as any);
    if (existsSync(metaPath)) {
      return JSON.parse(readFileSync(metaPath, "utf-8"));
    }
  } catch {}
  return {};
}

function writeStore(store: MetaStore, profile?: string): void {
  const metaPath = getMetaPath(profile as any);
  writeFileSync(metaPath, JSON.stringify(store, null, 2), "utf-8");
}

function getAssetMeta(assetName: string, profile?: string): AssetMeta {
  const store = readStore(profile);
  const key = safeName(assetName);
  if (!store[key]) {
    store[key] = { likes: [], comments: [], shares: 0 };
  }
  return store[key];
}

export async function getAssetLikes(assetName: string, profile?: string): Promise<string[]> {
  return getAssetMeta(assetName, profile).likes;
}

export async function toggleAssetLike(
  assetName: string,
  userId: string,
  profile?: string,
): Promise<{ liked: boolean; count: number }> {
  const store = readStore(profile);
  const key = safeName(assetName);
  if (!store[key]) {
    store[key] = { likes: [], comments: [], shares: 0 };
  }
  const likes = store[key].likes;
  const idx = likes.indexOf(userId);
  let liked: boolean;
  if (idx === -1) {
    likes.push(userId);
    liked = true;
  } else {
    likes.splice(idx, 1);
    liked = false;
  }
  store[key] = { ...store[key], likes };
  writeStore(store, profile);
  return { liked, count: likes.length };
}

export async function getAssetComments(
  assetName: string,
  profile?: string,
): Promise<AssetComment[]> {
  return getAssetMeta(assetName, profile).comments;
}

export async function addAssetComment(
  assetName: string,
  author: string,
  body: string,
  profile?: string,
): Promise<AssetComment> {
  const store = readStore(profile);
  const key = safeName(assetName);
  if (!store[key]) {
    store[key] = { likes: [], comments: [], shares: 0 };
  }
  const comment: AssetComment = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    author,
    body,
    created_at: Math.floor(Date.now() / 1000),
  };
  store[key].comments.push(comment);
  writeStore(store, profile);
  return comment;
}

export async function deleteAssetComment(
  assetName: string,
  commentId: string,
  profile?: string,
): Promise<boolean> {
  const store = readStore(profile);
  const key = safeName(assetName);
  if (!store[key]) return false;
  const comments = store[key].comments;
  const idx = comments.findIndex((c) => c.id === commentId);
  if (idx === -1) return false;
  comments.splice(idx, 1);
  writeStore(store, profile);
  return true;
}

export async function incrementAssetShare(
  assetName: string,
  profile?: string,
): Promise<number> {
  const store = readStore(profile);
  const key = safeName(assetName);
  if (!store[key]) {
    store[key] = { likes: [], comments: [], shares: 0 };
  }
  store[key].shares = (store[key].shares || 0) + 1;
  writeStore(store, profile);
  return store[key].shares;
}

export async function getAssetSocial(
  assetName: string,
  profile?: string,
): Promise<{ likes: string[]; comments: AssetComment[]; shares: number }> {
  const meta = getAssetMeta(assetName, profile);
  return { likes: meta.likes, comments: meta.comments, shares: meta.shares };
}