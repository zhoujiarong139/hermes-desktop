import { app, shell } from "electron";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";

interface WorkspaceDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: number;
  path: string;
}

function getWorkspacePath(): string {
  const userDataPath = app.getPath("userData");
  const workspacePath = join(userDataPath, "workspace");
  if (!existsSync(workspacePath)) {
    mkdirSync(workspacePath, { recursive: true });
  }
  return workspacePath;
}

function generateId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
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
  const validDocs = documents.filter((doc) => {
    return existsSync(doc.path);
  });

  return validDocs;
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
    const workspacePath = getWorkspacePath();
    const metadataPath = join(workspacePath, "metadata.json");

    if (!existsSync(metadataPath)) {
      return null;
    }

    const content = readFileSync(metadataPath, "utf-8");
    const documents: WorkspaceDocument[] = JSON.parse(content);
    const doc = documents.find((d) => d.name === name);

    if (!doc || !existsSync(doc.path)) {
      return null;
    }

    const fileContent = readFileSync(doc.path);
    return fileContent.toString("base64");
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

    if (!existsSync(metadataPath)) {
      return { success: false, error: "No documents found" };
    }

    const content = readFileSync(metadataPath, "utf-8");
    const documents: WorkspaceDocument[] = JSON.parse(content);
    const doc = documents.find((d) => d.name === name);

    if (!doc || !existsSync(doc.path)) {
      return { success: false, error: "Document not found" };
    }

    await shell.openPath(doc.path);
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