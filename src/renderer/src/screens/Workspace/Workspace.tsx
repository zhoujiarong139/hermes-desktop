import { useState, useEffect, useCallback, useMemo } from "react";
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
  isExternal?: boolean;
}

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"];
const VIDEO_EXTS = ["mp4", "webm", "ogg", "mov", "avi", "m4v"];
const OFFICE_EXTS = ["ppt", "pptx", "doc", "docx", "xls", "xlsx"];
const PDF_EXT = "pdf";
const HTML_EXT = "html";
const PAGE_SIZE = 10;

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
  /** Called when user clicks the Send (paper plane) button on a file item */
  onSendToChat?: (doc: WorkspaceDocument) => void;
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
  profile,
  onSendToChat,
}: WorkspaceProps): React.JSX.Element {
  const { t } = useI18n();
  const activeProfile = profile ?? "default";
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<WorkspaceDocument | null>(null);
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);

  // Pagination calculations
  const totalPages = useMemo(() => Math.ceil(documents.length / PAGE_SIZE), [documents.length]);
  const paginatedDocs = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return documents.slice(start, start + PAGE_SIZE);
  }, [documents, currentPage]);

  // Reset to page 1 when documents change
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  // Reload documents when profile changes
  const loadDocuments = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [list, assetsList] = await Promise.all([
        window.hermesAPI.listWorkspaceDocuments(),
        window.hermesAPI.listAssets(activeProfile),
      ]);
      setDocuments(list);
      setCurrentPage(1);
      // Derive favorited state from which docs already exist in assets (match by doc.name)
      const assetNames = new Set(assetsList.map((a: { name: string }) => a.name));
      setFavoritedIds(new Set(list.filter((d: WorkspaceDocument) => assetNames.has(d.name)).map((d: WorkspaceDocument) => d.id)));
    } catch (err) {
      console.error("Failed to load workspace documents:", err);
    } finally {
      setLoading(false);
    }
  }, [activeProfile]);

  useEffect(() => {
    void loadDocuments();
  }, [activeProfile, loadDocuments]);

  // Listen for workspace changes from file watcher
  useEffect(() => {
    const cleanup = window.hermesAPI.onWorkspaceChanged(() => {
      void loadDocuments();
    });
    return cleanup;
  }, [activeProfile, loadDocuments]);

  const handleBack = useCallback((): void => {
    setSelectedDoc(null);
  }, []);

  const handleFavorite = useCallback(
    async (doc: WorkspaceDocument): Promise<void> => {
      try {
        // For external files, base64Data may be empty — always fetch fresh content
        let data = doc.base64Data || "";
        if (!data && (doc.isExternal || !doc.path.startsWith("metadata:"))) {
          data = (await window.hermesAPI.getWorkspaceDocument(doc.name)) || "";
        }
        await window.hermesAPI.addAsset(doc.name, data, activeProfile);
        setFavoritedIds((prev) => new Set(prev).add(doc.id));
      } catch (err) {
        console.error("Failed to add to favorites:", err);
      }
    },
    [activeProfile],
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

  const handleDelete = useCallback(async (doc: WorkspaceDocument): Promise<void> => {
    if (!confirm(`Delete "${doc.name}"?`)) return;
    try {
      if (doc.isExternal) {
        await window.hermesAPI.deleteExternalFile(doc.path);
      } else {
        await window.hermesAPI.deleteWorkspaceDocument(doc.name);
      }
      await loadDocuments();
    } catch (err) {
      console.error("Failed to delete:", err);
      alert(`Failed to delete "${doc.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [loadDocuments]);

  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  }, [totalPages]);

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
            onClick={() => void loadDocuments()}
            title={t("workspace.refresh")}
            disabled={loading}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ animation: loading ? "spin 1s linear infinite" : "none" }}
            >
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
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
        <>
          <div className="workspace-list">
            {paginatedDocs.map((doc) => (
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
                      onClick={() => onSendToChat?.(doc)}
                      title={t("workspace.sendToChat") ?? "Send to chat"}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
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
                      onClick={() => void handleDownload(doc)}
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
                    <button
                      className="workspace-action-btn danger"
                      onClick={() => void handleDelete(doc)}
                      title={t("workspace.delete")}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 2 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="workspace-pagination">
              <button
                className="workspace-page-btn"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                title="Previous page"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              <div className="workspace-page-numbers">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  // Show first, last, current, and adjacent pages
                  const showPage = page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
                  const showEllipsis = page > 1 && page < totalPages && Math.abs(page - currentPage) === 2;
                  
                  if (showEllipsis) {
                    return <span key={`ellipsis-${page}`} className="workspace-page-ellipsis">...</span>;
                  }
                  if (!showPage) return null;
                  
                  return (
                    <button
                      key={page}
                      className={`workspace-page-num ${page === currentPage ? "active" : ""}`}
                      onClick={() => goToPage(page)}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>

              <button
                className="workspace-page-btn"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                title="Next page"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              <span className="workspace-page-info">
                {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, documents.length)} / {documents.length}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Workspace;