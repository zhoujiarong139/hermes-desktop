import { shell } from "electron";
import { join } from "path";
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, unlinkSync, watch, FSWatcher } from "fs";
import { getActiveProfileName, resolvedProfilesRoot, HERMES_HOME } from "./profiles";
import * as yaml from "js-yaml";

interface WorkspaceDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: number;
  path: string;
  base64Data?: string;
  isExternal?: boolean;
}

let fileWatcher: FSWatcher | null = null;
let agentWatcher: FSWatcher | null = null;

// profilesRoot: resolvedProfilesRoot is imported from ./profiles.
// It uses the same detection logic so workspace paths always match profile list paths.
// Named profiles are under ~/.hermes/profiles/{name}, default is under ~/.hermes/.
const profilesRoot = resolvedProfilesRoot;
console.error("[DEBUG workspace.ts] HERMES_HOME:", HERMES_HOME, "→ profilesRoot:", profilesRoot);

async function getWorkspacePath(): Promise<string> {
  const profileName = await getActiveProfileName();
  const profileHome = profileName === "default"
    ? profilesRoot
    : join(profilesRoot, "profiles", profileName);
  const workspacePath = join(profileHome, "workspace");
  if (!existsSync(workspacePath)) {
    mkdirSync(workspacePath, { recursive: true });
  }
  return workspacePath;
}

// ── Helper: add a wiki volume to dirs (avoids duplication in logic) ──
function addWikiWorkspace(hostPath: string, dirs: string[]): void {
  if (!hostPath) return;
  // Check /wiki/workspace subdir first
  const withWorkspace = join(hostPath, "workspace");
  if (existsSync(withWorkspace)) {
    dirs.push(withWorkspace);
    return;
  }
  // Fall back to /wiki itself
  if (existsSync(hostPath)) {
    dirs.push(hostPath);
  }
}

// ── Helper: deep search for docker_volumes arrays in a YAML object ──
function extractDockerVolumesDeep(obj: unknown, depth = 0): string[] {
  if (depth > 8 || obj == null) return [];
  if (Array.isArray(obj)) {
    const results: string[] = [];
    for (const item of obj) {
      results.push(...extractDockerVolumesDeep(item, depth + 1));
    }
    return results;
  }
  if (typeof obj === "object") {
    const results: string[] = [];
    for (const [, value] of Object.entries(obj)) {
      results.push(...extractDockerVolumesDeep(value, depth + 1));
    }
    return results;
  }
  if (typeof obj === "string" && obj.includes(":/wiki")) {
    return [obj]; // return found wiki volumes
  }
  return [];
}

// Re-export getActiveProfileName and getMonitoredDirs for debug IPC
export { getActiveProfileName };

export async function getMonitoredDirs(): Promise<string[]> {
  const profileName = await getActiveProfileName();
  const profileHome = profileName === "default"
    ? profilesRoot
    : join(profilesRoot, "profiles", profileName);
  console.error("[DEBUG getMonitoredDirs] profile:", profileName, "profilesRoot:", profilesRoot, "profileHome:", profileHome);

  const dirs: string[] = [];

  // 1. Profile's own workspace-external/
  const workspaceExternal = join(profileHome, "workspace-external");
  if (existsSync(workspaceExternal)) dirs.push(workspaceExternal);

  // 2. Profile's hermes-agent/workspace/ (agent output dir)
  const agentDir = join(profileHome, "hermes-agent");
  if (existsSync(agentDir)) {
    const agentWorkspace = join(agentDir, "workspace");
    if (existsSync(agentWorkspace)) dirs.push(agentWorkspace);
  }

  // 3. Profile's hermes-agent/wiki/ (user wiki root)
  if (existsSync(agentDir)) {
    const wikiDir = join(agentDir, "wiki");
    if (existsSync(wikiDir)) dirs.push(wikiDir);
  }

  // 4. Docker volume wiki paths — read dynamically from config.yaml
  // docker_volumes can be at: top-level, terminal.docker_volumes, agent.docker_volumes, etc.
  const configPaths = [join(profileHome, "config.yaml"), join(profilesRoot, "config.yaml")];
  for (const configPath of configPaths) {
    if (!existsSync(configPath)) continue;
    try {
      const config = yaml.load(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      let volumes: string[] = [];

      // Top-level docker_volumes (most common)
      if (Array.isArray(config?.docker_volumes)) {
        volumes = config.docker_volumes as string[];
      }

      // Nested docker_volumes (e.g. terminal.docker_volumes in ecloud-om/brotec-design)
      if (volumes.length === 0) {
        volumes = extractDockerVolumesDeep(config).filter(
          (v): v is string => typeof v === "string" && v.includes(":/wiki"),
        );
      }

      for (const vol of volumes) {
        const colonIdx = vol.indexOf(":");
        if (colonIdx < 0) continue;
        const hostPath = vol.slice(0, colonIdx);
        const containerPath = vol.slice(colonIdx + 1);
        if (containerPath.startsWith("/wiki") || containerPath === "/wiki") {
          addWikiWorkspace(hostPath, dirs);
        }
      }
    } catch {
      // ignore parse errors
    }
    break; // one valid config is enough
  }

  console.error("[DEBUG getMonitoredDirs] profile:", profileName, "→ dirs:", dirs.length > 0 ? dirs : "(none)");
  return dirs;
}

// Legacy single-dir getter for callers that still expect one path
async function getMonitoredDir(): Promise<string> {
  const dirs = await getMonitoredDirs();
  return dirs[0] || join(profilesRoot, "workspace-external");
}

// Hermes Agent's workspace directory (profile-specific)
// default profile uses ~/.hermes/workspace/, others use ~/.hermes/workspace/{profileName}/
async function getAgentWorkspaceDir(): Promise<string> {
  const profileName = await getActiveProfileName();
  const dir = profileName === "default"
    ? join(profilesRoot, "workspace")
    : join(profilesRoot, "workspace", profileName);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function generateId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function scanExternalDir(dirPath: string, basePath?: string): WorkspaceDocument[] {
  const documents: WorkspaceDocument[] = [];
  const rootPath = basePath || dirPath;

  if (!existsSync(dirPath)) {
    return documents;
  }

  const SUPPORTED_EXTS = [
    "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico",
    "mp4", "webm", "ogg", "mov", "avi", "m4v",
    "pdf", "md", "txt", "html", "htm",
    "ppt", "pptx", "doc", "docx", "xls", "xlsx",
  ];

  try {
    const files = readdirSync(dirPath);
    for (const file of files) {
      const filePath = join(dirPath, file);
      try {
        const stat = statSync(filePath);
        if (stat.isFile()) {
          const ext = file.split(".").pop()?.toLowerCase() || "";

          if (SUPPORTED_EXTS.includes(ext)) {
            // Calculate relative path from monitored root
            const relativePath = filePath.replace(rootPath + "/", "");
            documents.push({
              id: `ext-${relativePath.replace(/[\/\\]/g, "_")}`,
              name: relativePath, // Show full relative path including subdirectory
              type: ext,
              size: stat.size,
              createdAt: Math.floor(stat.mtimeMs / 1000),
              path: filePath,
              isExternal: true,
            });
          }
        } else if (stat.isDirectory()) {
          // Recursively scan subdirectories
          const subDocs = scanExternalDir(filePath, rootPath);
          documents.push(...subDocs);
        }
      } catch {
        // Skip files we can't stat
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return documents;
}

// Scan Hermes Agent's main workspace directory (flat, no subdirectory recursion)
function scanAgentWorkspaceDir(dirPath: string): WorkspaceDocument[] {
  const documents: WorkspaceDocument[] = [];

  if (!existsSync(dirPath)) {
    return documents;
  }

  const SUPPORTED_EXTS = [
    "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico",
    "mp4", "webm", "ogg", "mov", "avi", "m4v",
    "pdf", "md", "txt", "html", "htm",
    "ppt", "pptx", "doc", "docx", "xls", "xlsx",
  ];

  try {
    const files = readdirSync(dirPath);
    for (const file of files) {
      const filePath = join(dirPath, file);
      try {
        const stat = statSync(filePath);
        if (stat.isFile()) {
          const ext = file.split(".").pop()?.toLowerCase() || "";

          if (SUPPORTED_EXTS.includes(ext)) {
            documents.push({
              id: `agent-${file.replace(/[\/\\]/g, "_")}`,
              name: file,
              type: ext,
              size: stat.size,
              createdAt: Math.floor(stat.mtimeMs / 1000),
              path: filePath,
              isExternal: true,
            });
          }
        }
        // Skip subdirectories - only scan flat files in agent workspace
      } catch {
        // Skip files we can't stat
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return documents;
}

export async function listWorkspaceDocuments(): Promise<WorkspaceDocument[]> {
  const workspacePath = await getWorkspacePath();
  const metadataPath = join(workspacePath, "metadata.json");

  let documents: WorkspaceDocument[] = [];
  if (existsSync(metadataPath)) {
    try {
      const content = readFileSync(metadataPath, "utf-8");
      documents = JSON.parse(content);
    } catch {
      documents = [];
    }
  }

  // Filter out documents whose files no longer exist
  const validInternalDocs = documents.filter((doc) => {
    return existsSync(doc.path);
  });

  // Scan all monitored directories (workspace-external, hermes-agent/workspace, wiki)
  const monitoredDirs = await getMonitoredDirs();
  console.error("[DEBUG listWorkspaceDocuments] start | monitoredDirs:", monitoredDirs.join(", "));
  const allExternalDocs: WorkspaceDocument[] = [];
  for (const dir of monitoredDirs) {
    allExternalDocs.push(...scanExternalDir(dir));
  }

  // Scan Hermes Agent's workspace (profile-specific via getAgentWorkspaceDir)
  const agentWorkspaceDir = await getAgentWorkspaceDir();
  const agentWorkspaceDocs = scanAgentWorkspaceDir(agentWorkspaceDir);

  // Only return current profile's documents - no mixing with other profiles
  return [...validInternalDocs, ...allExternalDocs, ...agentWorkspaceDocs];
}

export async function saveWorkspaceDocument(
  name: string,
  base64Data: string,
): Promise<{ success: boolean; id?: string; path?: string; error?: string }> {
  try {
    const workspacePath = await getWorkspacePath();
    const id = generateId();
    const filePath = join(workspacePath, `${id}_${name}`);

    // Convert base64 to binary and save
    const binary = Buffer.from(base64Data, "base64");
    writeFileSync(filePath, binary);

    const document: WorkspaceDocument = {
      id,
      name,
      type: name.split(".").pop()?.toLowerCase() || "",
      size: binary.length,
      createdAt: Math.floor(Date.now() / 1000),
      path: filePath,
    };

    // Update metadata
    const metadataPath = join(workspacePath, "metadata.json");
    let documents: WorkspaceDocument[] = [];
    if (existsSync(metadataPath)) {
      try {
        const content = readFileSync(metadataPath, "utf-8");
        documents = JSON.parse(content);
      } catch {
        documents = [];
      }
    }
    documents.push(document);
    writeFileSync(metadataPath, JSON.stringify(documents, null, 2));

    return { success: true, id, path: filePath };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save document",
    };
  }
}

export async function getWorkspaceDocument(
  name: string,
): Promise<string | null> {
  try {
    // First check internal workspace
    const workspacePath = await getWorkspacePath();
    const metadataPath = join(workspacePath, "metadata.json");

    if (existsSync(metadataPath)) {
      const content = readFileSync(metadataPath, "utf-8");
      const documents: WorkspaceDocument[] = JSON.parse(content);
      const doc = documents.find((d) => d.name === name);

      if (doc && existsSync(doc.path)) {
        const fileContent = readFileSync(doc.path);
        return fileContent.toString("base64");
      }
    }

    // Then check external monitored directory
    const externalDir = await getMonitoredDir();
    const externalPath = join(externalDir, name);
    if (existsSync(externalPath)) {
      const fileContent = readFileSync(externalPath);
      return fileContent.toString("base64");
    }

    // Finally check Hermes Agent's main workspace directory
    const agentDir = await getAgentWorkspaceDir();
    const agentPath = join(agentDir, name);
    if (existsSync(agentPath)) {
      const fileContent = readFileSync(agentPath);
      return fileContent.toString("base64");
    }

    return null;
  } catch {
    return null;
  }
}

export async function openWorkspaceDocument(
  name: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const workspacePath = await getWorkspacePath();
    const metadataPath = join(workspacePath, "metadata.json");
    let foundPath: string | null = null;

    // First check internal workspace
    if (existsSync(metadataPath)) {
      const content = readFileSync(metadataPath, "utf-8");
      const documents: WorkspaceDocument[] = JSON.parse(content);
      const doc = documents.find((d) => d.name === name);

      if (doc && existsSync(doc.path)) {
        foundPath = doc.path;
      }
    }

    // Then check external monitored directory
    if (!foundPath) {
      const externalDir = await getMonitoredDir();
      // For relative paths like "子目录/文件.html", join works correctly
      const externalPath = join(externalDir, name);
      console.log(`[Workspace] Looking for external file: ${externalPath}`);
      if (existsSync(externalPath)) {
        foundPath = externalPath;
        console.log(`[Workspace] Found external file at: ${foundPath}`);
      } else {
        console.log(`[Workspace] External file not found at: ${externalPath}`);
      }
    }

    // Finally check Hermes Agent's main workspace directory
    if (!foundPath) {
      const agentDir = await getAgentWorkspaceDir();
      const agentPath = join(agentDir, name);
      console.log(`[Workspace] Looking for agent workspace file: ${agentPath}`);
      if (existsSync(agentPath)) {
        foundPath = agentPath;
        console.log(`[Workspace] Found agent workspace file at: ${foundPath}`);
      }
    }

    if (!foundPath) {
      return { success: false, error: "Document not found" };
    }

    await shell.openPath(foundPath);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to open document",
    };
  }
}

export async function deleteWorkspaceDocument(
  name: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const workspacePath = await getWorkspacePath();
    const metadataPath = join(workspacePath, "metadata.json");

    if (!existsSync(metadataPath)) {
      return { success: false, error: "No documents found" };
    }

    const content = readFileSync(metadataPath, "utf-8");
    let documents: WorkspaceDocument[] = JSON.parse(content);
    const docIndex = documents.findIndex((d) => d.name === name);

    if (docIndex === -1) {
      return { success: false, error: "Document not found" };
    }

    const doc = documents[docIndex];
    if (existsSync(doc.path)) {
      unlinkSync(doc.path);
    }

    documents.splice(docIndex, 1);
    writeFileSync(metadataPath, JSON.stringify(documents, null, 2));

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete document",
    };
  }
}

export async function addAsset(
  name: string,
  base64Data: string,
): Promise<{ success: boolean; error?: string }> {
  // This function adds a document to the Assets collection
  // by calling the assets module functions
  try {
    const { addAsset: addAssetToAssets } = await import("./assets");
    return await addAssetToAssets(name, base64Data);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to add asset",
    };
  }
}

// Trigger a workspace refresh notification to all windows
export function notifyWorkspaceChanged(): void {
  const { BrowserWindow } = require("electron");
  BrowserWindow.getAllWindows().forEach((win: Electron.BrowserWindow) => {
    win.webContents.send("workspace-changed");
  });
}

// Start watching the external directory for changes
export async function startExternalFileWatcher(
  onChange?: () => void,
): Promise<void> {
  const externalDir = await getMonitoredDir();

  // Stop existing watchers
  stopExternalFileWatcher();

  // Watch external monitored directory (profile-specific)
  if (existsSync(externalDir)) {
    try {
      fileWatcher = watch(externalDir, { recursive: true }, (eventType, filename) => {
        if (filename) {
          console.log(`External workspace file ${eventType}: ${filename}`);
          onChange?.();
          notifyWorkspaceChanged();
        }
      });
      console.log(`Started watching external directory: ${externalDir}`);
    } catch (err) {
      console.error(`Failed to watch external directory: ${err}`);
    }
  } else {
    console.log(`External workspace directory does not exist: ${externalDir}`);
  }

  // Watch Hermes Agent's main workspace directory
  const agentDir = await getAgentWorkspaceDir();
  if (existsSync(agentDir)) {
    try {
      agentWatcher = watch(agentDir, { recursive: false }, (eventType, filename) => {
        if (filename) {
          console.log(`Agent workspace file ${eventType}: ${filename}`);
          onChange?.();
          notifyWorkspaceChanged();
        }
      });
      console.log(`Started watching agent workspace directory: ${agentDir}`);
    } catch (err) {
      console.error(`Failed to watch agent workspace directory: ${err}`);
    }
  }
}

// Stop watching the external directory
export function stopExternalFileWatcher(): void {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
  if (agentWatcher) {
    agentWatcher.close();
    agentWatcher = null;
  }
  console.log("Stopped watching workspace directories");
}

// Restart the external file watcher (call after profile switch)
export async function restartExternalFileWatcher(): Promise<void> {
  stopExternalFileWatcher();
  await startExternalFileWatcher();
}

// Get the monitored directory path
export async function getMonitoredDirPath(): Promise<string> {
  return getMonitoredDir();
}

// Delete an external file by its full path
export async function deleteExternalFile(
  filePath: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!existsSync(filePath)) {
      return { success: false, error: "File not found" };
    }
    unlinkSync(filePath);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete file",
    };
  }
}