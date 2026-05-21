import { app, shell } from "electron";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync } from "fs";
import { watch, FSWatcher } from "fs";

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

function getWorkspacePath(): string {
  const userDataPath = app.getPath("userData");
  const workspacePath = join(userDataPath, "workspace");
  if (!existsSync(workspacePath)) {
    mkdirSync(workspacePath, { recursive: true });
  }
  return workspacePath;
}

function getMonitoredDir(): string {
  // Default monitored directory - /tmp/workspace for local development
  return "/tmp/workspace";
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

export async function listWorkspaceDocuments(): Promise<WorkspaceDocument[]> {
  const workspacePath = getWorkspacePath();
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

  // Scan external monitored directory
  const externalDir = getMonitoredDir();
  const externalDocs = scanExternalDir(externalDir);

  // Combine internal and external documents
  return [...validInternalDocs, ...externalDocs];
}

export async function saveWorkspaceDocument(
  name: string,
  base64Data: string,
): Promise<{ success: boolean; id?: string; path?: string; error?: string }> {
  try {
    const workspacePath = getWorkspacePath();
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
    const workspacePath = getWorkspacePath();
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
    const externalDir = getMonitoredDir();
    const externalPath = join(externalDir, name);
    if (existsSync(externalPath)) {
      const fileContent = readFileSync(externalPath);
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
    const workspacePath = getWorkspacePath();
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
      const externalDir = getMonitoredDir();
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
    const workspacePath = getWorkspacePath();
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
export function startExternalFileWatcher(
  onChange?: () => void,
): void {
  const externalDir = getMonitoredDir();

  if (!existsSync(externalDir)) {
    console.log(`External workspace directory does not exist: ${externalDir}`);
    return;
  }

  // Stop existing watcher if any
  stopExternalFileWatcher();

  try {
    fileWatcher = watch(externalDir, { recursive: false }, (eventType, filename) => {
      if (filename) {
        console.log(`File ${eventType}: ${filename}`);
        onChange?.();
        notifyWorkspaceChanged();
      }
    });

    console.log(`Started watching external directory: ${externalDir}`);
  } catch (err) {
    console.error(`Failed to start file watcher: ${err}`);
  }
}

// Stop watching the external directory
export function stopExternalFileWatcher(): void {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
    console.log("Stopped watching external directory");
  }
}

// Get the monitored directory path
export function getMonitoredDirPath(): string {
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