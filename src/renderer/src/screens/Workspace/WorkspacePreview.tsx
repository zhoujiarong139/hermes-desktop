import { useState, useCallback } from "react";
import { useI18n } from "../../components/useI18n";

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

function getFileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

interface WorkspacePreviewProps {
  document: WorkspaceDocument;
  onBack: () => void;
  onOpen: () => void;
  onDownload: () => void;
  onFavorite: () => void;
  isFavorited: boolean;
}

export function WorkspacePreview({
  document: doc,
  onBack,
  onOpen,
  onDownload,
  onFavorite,
  isFavorited,
}: WorkspacePreviewProps): React.JSX.Element {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(100);
  const ext = getFileExt(doc.name);
  const isImage = IMAGE_EXTS.includes(ext);

  const handleZoomIn = useCallback((): void => {
    setZoom((prev) => Math.min(prev + 25, 300));
  }, []);

  const handleZoomOut = useCallback((): void => {
    setZoom((prev) => Math.max(prev - 25, 25));
  }, []);

  const handleResetZoom = useCallback((): void => {
    setZoom(100);
  }, []);

  const sizeStr = doc.size ? formatSize(doc.size) : "";
  const dateStr = doc.createdAt
    ? new Date(doc.createdAt * 1000).toLocaleString()
    : "";

  const renderPreview = (): React.ReactNode => {
    if (isImage && doc.base64Data) {
      return (
        <div
          className="workspace-preview-zoom-container"
          style={{ cursor: "grab" }}
        >
          <img
            src={`data:image/${ext};base64,${doc.base64Data}`}
            alt={doc.name}
            className="workspace-preview-image"
            style={{
              transform: `scale(${zoom / 100})`,
              transition: "transform 0.2s ease",
            }}
            draggable={false}
          />
        </div>
      );
    }

    return (
      <div className="workspace-preview-placeholder">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{ opacity: 0.4, marginBottom: 16 }}
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>
          {ext.toUpperCase()} Document
        </div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          {t("workspace.preview")} {t("workspace.open")} or {t("workspace.download")}
        </div>
      </div>
    );
  };

  return (
    <div className="workspace-preview-container">
      <div className="workspace-preview-header">
        <button
          className="workspace-preview-back-btn"
          onClick={onBack}
          title={t("common.back")}
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
        <div className="workspace-preview-title">{doc.name}</div>
      </div>

      {isImage && (
        <div className="workspace-preview-toolbar">
          <button
            className="workspace-preview-toolbar-btn"
            onClick={handleZoomOut}
            title={t("workspace.zoomOut")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
          <button
            className="workspace-preview-toolbar-btn"
            onClick={handleResetZoom}
            title={t("workspace.resetZoom")}
          >
            <span style={{ fontSize: 11 }}>{zoom}%</span>
          </button>
          <button
            className="workspace-preview-toolbar-btn"
            onClick={handleZoomIn}
            title={t("workspace.zoomIn")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
        </div>
      )}

      <div className="workspace-preview-body">{renderPreview()}</div>

      <div className="workspace-preview-actions">
        <div className="workspace-preview-info">
          <div className="workspace-preview-info-name">{doc.name}</div>
          <div className="workspace-preview-info-meta">
            {sizeStr && <div>Size: {sizeStr}</div>}
            {dateStr && <div>Created: {dateStr}</div>}
          </div>
        </div>

        <div className="workspace-preview-action-row">
          <button
            className={`workspace-preview-action-btn ${isFavorited ? "favorited" : ""}`}
            onClick={onFavorite}
            title={
              isFavorited ? t("workspace.favorited") : t("workspace.favorite")
            }
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill={isFavorited ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span>{isFavorited ? t("workspace.favorited") : t("workspace.favorite")}</span>
          </button>
        </div>

        <div className="workspace-preview-action-row">
          <button
            className="workspace-preview-action-btn"
            onClick={onOpen}
            title={t("workspace.open")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <span>{t("workspace.open")}</span>
          </button>
        </div>

        <div className="workspace-preview-action-row">
          <button
            className="workspace-preview-action-btn"
            onClick={onDownload}
            title={t("workspace.download")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{t("workspace.download")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default WorkspacePreview;