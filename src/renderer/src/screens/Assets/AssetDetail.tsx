import { useState, useEffect, useCallback } from "react";
import { useI18n } from "../../components/useI18n";

interface Asset {
  name: string;
  source_path: string;
  size: number;
  modified: number;
  exists: boolean;
  added_at: number;
}

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"];
const VIDEO_EXTS = ["mp4", "webm", "ogg", "mov", "avi", "m4v"];
const OFFICE_EXTS = ["ppt", "pptx", "doc", "docx", "xls", "xlsx"];
const PDF_EXT = "pdf";
const MD_EXT = "md";
const TEXT_EXTS = ["txt", "py", "js", "ts", "json", "csv", "sh", "css", "yaml", "yml", "toml", "log", "env"];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getFileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

interface AssetDetailProps {
  asset: Asset;
  onBack: () => void;
  onRemove: () => void;
}

export function AssetDetail({
  asset,
  onBack,
  onRemove,
}: AssetDetailProps): React.JSX.Element {
  const { t } = useI18n();
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ext = getFileExt(asset.name);
  const isImage = IMAGE_EXTS.includes(ext);
  const isVideo = VIDEO_EXTS.includes(ext);
  const isOffice = OFFICE_EXTS.includes(ext);
  const isPdf = ext === PDF_EXT;
  const isMd = MD_EXT === ext;
  const isText = TEXT_EXTS.includes(ext);

  useEffect(() => {
    if (isMd || isText) {
      setContentLoading(true);
      void window.hermesAPI
        .getAsset(asset.name)
        .then((base64) => {
          const binary = atob(base64);
          setContent(binary);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to load content");
        })
        .finally(() => {
          setContentLoading(false);
        });
    }
  }, [asset.name, isMd, isText]);

  const handleDownload = useCallback((): void => {
    void window.hermesAPI
      .getAsset(asset.name)
      .then((base64) => {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = asset.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to download");
      });
  }, [asset.name]);

  const sizeStr = asset.size ? formatSize(asset.size) : "";
  const dateStr = asset.modified
    ? new Date(asset.modified * 1000).toLocaleString()
    : "";

  const renderPreview = (): React.ReactNode => {
    if (contentLoading) {
      return (
        <div className="asset-preview-loading">
          <div className="loading-spinner" />
        </div>
      );
    }

    if (isImage && asset.exists) {
      return (
        <img
          src={`data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3C/svg%3E`}
          alt={asset.name}
          className="asset-preview-image"
          data-asset-name={asset.name}
          data-asset-ext={ext}
        />
      );
    }

    if (isVideo && asset.exists) {
      return (
        <video
          src={`data:video/${ext};base64,${content || ""}`}
          controls
          className="asset-preview-video"
        />
      );
    }

    if (isPdf) {
      return (
        <div className="asset-preview-placeholder">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{ opacity: 0.5, marginBottom: 12 }}
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <div style={{ fontWeight: 500 }}>PDF Document</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
            Preview not available. Use Download to save.
          </div>
        </div>
      );
    }

    if (isOffice) {
      return (
        <div className="asset-preview-placeholder">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{ opacity: 0.5, marginBottom: 12 }}
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <div style={{ fontWeight: 500 }}>{ext.toUpperCase()} Document</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
            Preview not available
          </div>
        </div>
      );
    }

    if (isMd && content) {
      return (
        <div className="asset-preview-markdown">
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {content}
          </pre>
        </div>
      );
    }

    if (isText && content) {
      return (
        <pre className="asset-preview-code">{content}</pre>
      );
    }

    return (
      <div className="asset-preview-placeholder">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{ opacity: 0.4, marginBottom: 10 }}
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <div style={{ fontWeight: 500 }}>{ext.toUpperCase()} File</div>
        <div style={{ fontSize: 12 }}>Use Download to save this file.</div>
      </div>
    );
  };

  return (
    <div className="asset-detail-container">
      <div className="asset-detail-header">
        <button
          className="asset-action-btn"
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
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="asset-detail-name">{asset.name}</div>
          <div className="asset-detail-path">
            {asset.source_path && `${asset.source_path}`}
            {sizeStr && ` · ${sizeStr}`}
          </div>
        </div>
      </div>

      {error && (
        <div className="asset-detail-error" role="alert">
          {error}
        </div>
      )}

      <div className="asset-detail-body">
        <div className="asset-detail-preview">{renderPreview()}</div>

        <div className="asset-detail-actions">
          <div className="asset-info-block">
            <div className="asset-info-name">{asset.name}</div>
            <div className="asset-info-meta">
              {sizeStr && <div>Size: {sizeStr}</div>}
              {dateStr && <div>Modified: {dateStr}</div>}
              {asset.source_path && <div>Source: {asset.source_path}</div>}
            </div>
          </div>

          {asset.exists && (
            <>
              <div
                className="asset-action-row"
                onClick={handleDownload}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleDownload();
                  }
                }}
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
                <span>{t("assets.download")}</span>
              </div>
            </>
          )}

          <div
            className="asset-action-row danger"
            onClick={onRemove}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                onRemove();
              }
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 1 2 2 2v2" />
            </svg>
            <span>{t("assets.remove")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}