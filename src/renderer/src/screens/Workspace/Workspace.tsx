import { useState, useEffect, useCallback } from "react";
import { useI18n } from "../../components/useI18n";
import { WorkspacePreview } from "./WorkspacePreview";

interface WorkspaceDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: number;
  path: string;
  base64Data?: string;
}

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"];
const VIDEO_EXTS = ["mp4", "webm", "ogg", "mov", "avi", "m4v"];
const OFFICE_EXTS = ["ppt", "pptx", "doc", "docx", "xls", "xlsx"];
const PDF_EXT = "pdf";
const HTML_EXT = "html";

function getFileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

function DocIcon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}): React.JSX.Element {
  const ext = getFileExt(name);
  const isImage = IMAGE_EXTS.includes(ext);
  const isVideo = VIDEO_EXTS.includes(ext);
  const isOffice = OFFICE_EXTS.includes(ext);
  const isPdf = ext === PDF_EXT;
  const isHtml = ext === HTML_EXT;

  if (isImage) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
    );
  }

  if (isVideo) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </svg>
    );
  }

  if (isPdf) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    );
  }

  if (isHtml) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    );
  }

  if (isOffice) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="16" y2="17" />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

interface WorkspaceProps {
  width?: number;
  collapsed?: boolean;
  onToggle?: () => void;
  onWidthChange?: (width: number) => void;
  profile?: string;
}

export interface WorkspaceDocumentType {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: number;
  path: string;
  base64Data?: string;
}

export function Workspace({
  width = 320,
  collapsed = false,
  onToggle,
  profile: _profile,
}: WorkspaceProps): React.JSX.Element {
  const { t } = useI18n();
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<WorkspaceDocument | null>(null);
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());

  const loadDocuments = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const list = await window.hermesAPI.listWorkspaceDocuments();
      setDocuments(list);
    } catch (err) {
      console.error("Failed to load workspace documents:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  // Listen for workspace changes from file watcher
  useEffect(() => {
    const cleanup = window.hermesAPI.onWorkspaceChanged(() => {
      void loadDocuments();
    });
    return cleanup;
  }, [loadDocuments]);

  const handlePreview = useCallback((doc: WorkspaceDocument): void => {
    setSelectedDoc(doc);
  }, []);

  const handleBack = useCallback((): void => {
    setSelectedDoc(null);
  }, []);

  const handleFavorite = useCallback(
    async (doc: WorkspaceDocument): Promise<void> => {
      try {
        await window.hermesAPI.addAsset(doc.name, doc.base64Data || "");
        setFavoritedIds((prev) => new Set(prev).add(doc.id));
      } catch (err) {
        console.error("Failed to add to favorites:", err);
      }
    },
    [],
  );

  const handleOpen = useCallback(async (doc: WorkspaceDocument): Promise<void> => {
    try {
      // Use the IPC method which handles both internal and external paths
      await window.hermesAPI.openWorkspaceDocument(doc.name);
    } catch (err) {
      console.error("Failed to open document:", err);
    }
  }, []);

  const handleDownload = useCallback(async (doc: WorkspaceDocument): Promise<void> => {
    try {
      let base64Data = doc.base64Data;
      if (!base64Data) {
        base64Data = await window.hermesAPI.getWorkspaceDocument(doc.name) || "";
      }
      if (!base64Data) return;
      const binary = atob(base64Data);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name.split("/").pop() || doc.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download:", err);
    }
  }, []);

  if (selectedDoc) {
    return (
      <WorkspacePreview
        document={selectedDoc}
        onBack={handleBack}
        onOpen={() => handleOpen(selectedDoc)}
        onDownload={() => handleDownload(selectedDoc)}
        onFavorite={() => handleFavorite(selectedDoc)}
        isFavorited={favoritedIds.has(selectedDoc.id)}
      />
    );
  }

  if (collapsed) {
    return (
      <div className="workspace-collapsed" style={{ width: 40 }}>
        <button
          className="workspace-toggle-btn"
          onClick={onToggle}
          title={t("workspace.expand")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ transform: "rotate(180deg)" }}
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="workspace-container" style={{ width }}>
      <div className="workspace-header">
        <h3 className="workspace-title">{t("workspace.title")}</h3>
        <div className="workspace-header-actions">
          <button
            className="workspace-toggle-btn"
            onClick={onToggle}
            title={t("workspace.collapse")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="workspace-loading">
          <div className="loading-spinner" />
        </div>
      ) : documents.length === 0 ? (
        <div className="workspace-empty">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{ opacity: 0.4, marginBottom: 12 }}
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <p>{t("workspace.empty")}</p>
          <p style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>
            {t("workspace.emptyHint")}
          </p>
        </div>
      ) : (
        <div className="workspace-list">
          {documents.map((doc) => (
            <div key={doc.id} className="workspace-item">
              <div
                className="workspace-item-preview"
                onClick={() => void handleOpen(doc)}
              >
                {IMAGE_EXTS.includes(getFileExt(doc.name)) ? (
                  doc.base64Data ? (
                    <img
                      src={`data:image/${getFileExt(doc.name)};base64,${doc.base64Data}`}
                      alt={doc.name}
                      className="workspace-thumb-img"
                    />
                  ) : doc.isExternal && doc.path ? (
                    <img
                      src={`file://${doc.path}`}
                      alt={doc.name}
                      className="workspace-thumb-img"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                        target.parentElement!.innerHTML = `<svg class="workspace-thumb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`;
                      }}
                    />
                  ) : (
                    <DocIcon name={doc.name} className="workspace-thumb-icon" />
                  )
                ) : (
                  <DocIcon name={doc.name} className="workspace-thumb-icon" />
                )}
              </div>
              <div className="workspace-item-info">
                <span className="workspace-item-name" title={doc.name}>
                  {doc.name}
                </span>
                <div className="workspace-item-actions">
                  <button
                    className={`workspace-action-btn ${favoritedIds.has(doc.id) ? "favorited" : ""}`}
                    onClick={() => void handleFavorite(doc)}
                    title={
                      favoritedIds.has(doc.id)
                        ? t("workspace.favorited")
                        : t("workspace.favorite")
                    }
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill={
                        favoritedIds.has(doc.id) ? "currentColor" : "none"
                      }
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </button>
                  <button
                    className="workspace-action-btn"
                    onClick={() => void handleOpen(doc)}
                    title={t("workspace.open")}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </button>
                  <button
                    className="workspace-action-btn"
                    onClick={() => handleDownload(doc)}
                    title={t("workspace.download")}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Workspace;