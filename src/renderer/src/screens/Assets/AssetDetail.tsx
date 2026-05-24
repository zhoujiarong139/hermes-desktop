import React from "react";
import { useState, useEffect, useCallback } from "react";
import { useI18n } from "../../components/useI18n";
import type { Asset } from "./Assets";

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

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getFileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

interface AssetComment {
  id: string;
  author: string;
  body: string;
  created_at: number;
}

interface SocialData {
  likes: string[];
  comments: AssetComment[];
  shares: number;
}

function formatTimeAgo(ts: number): string {
  const now = Date.now() / 1000;
  const diff = now - ts;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(ts * 1000).toLocaleDateString("zh-CN");
}

// Generate a stable device/user ID for likes
function getUserId(): string {
  let id = localStorage.getItem("asset-user-id");
  if (!id) {
    id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem("asset-user-id", id);
  }
  return id;
}

interface ShareModalProps {
  asset: Asset;
  onClose: () => void;
  profile?: string;
}

function ShareModal({ asset, onClose, profile }: ShareModalProps): React.JSX.Element {
  const shareUrl = `hermes-asset://${encodeURIComponent(asset.name)}`;
  const mailBody = encodeURIComponent(`推荐文件: ${asset.name}\n链接: ${shareUrl}`);

  const handleCopyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // fallback
    }
    void window.hermesAPI.incrementAssetShare(asset.name, profile);
    onClose();
  };

  const handleMailShare = (): void => {
    void window.hermesAPI.incrementAssetShare(asset.name, profile);
    window.location.href = `mailto:?subject=${encodeURIComponent("推荐文件: " + asset.name)}&body=${mailBody}`;
    onClose();
  };

  const handleWechatTip = (): void => {
    void window.hermesAPI.incrementAssetShare(asset.name, profile);
    // On desktop we can't open WeChat directly — show copy tip
    void navigator.clipboard.writeText(shareUrl).catch(() => {});
    onClose();
  };

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="share-modal-header">
          <h3>分享</h3>
          <button className="share-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="share-modal-body">
          <button className="share-option" onClick={handleWechatTip}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M8 10c0-2.21 1.79-4 4-4s4 1.79 4 4" stroke="#07C160" strokeWidth="2" strokeLinecap="round"/>
              <rect x="4" y="10" width="16" height="12" rx="3" stroke="#07C160" strokeWidth="2"/>
              <circle cx="9" cy="15" r="1" fill="#07C160"/>
              <circle cx="15" cy="15" r="1" fill="#07C160"/>
            </svg>
            <span>复制链接</span>
            <span className="share-option-sub">分享到微信/复制链接</span>
          </button>
          <button className="share-option" onClick={handleMailShare}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1A73E8" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <span>邮件</span>
            <span className="share-option-sub">通过邮件发送</span>
          </button>
          <button className="share-option" onClick={handleCopyLink}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <span>复制链接</span>
            <span className="share-option-sub">{shareUrl.slice(0, 40)}...</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface AssetDetailProps {
  asset: Asset;
  onBack: () => void;
  profile?: string;
}

export function AssetDetail({
  asset,
  onBack,
  profile,
}: AssetDetailProps): React.JSX.Element {
  const { t } = useI18n();
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

  // Social state
  const [social, setSocial] = useState<SocialData>({ likes: [], comments: [], shares: 0 });
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const userId = getUserId();
  const isLiked = social.likes.includes(userId);

  const ext = getFileExt(asset.name);
  const isImage = asset.type === "image" || IMAGE_EXTS.includes(ext);
  const isVideo = asset.type === "video" || VIDEO_EXTS.includes(ext);
  const isOffice = OFFICE_EXTS.includes(ext);
  const isPdf = ext === PDF_EXT;
  const isMd = MD_EXT === ext;
  const isText = TEXT_EXTS.includes(ext);

  // Load social data
  useEffect(() => {
    void window.hermesAPI
      .getAssetSocial(asset.name, profile)
      .then(setSocial)
      .catch(() => {});
  }, [asset.name, profile]);

  useEffect(() => {
    if (isMd || isText) {
      setContentLoading(true);
      void window.hermesAPI
        .getAsset(asset.name, profile)
        .then((base64) => {
          const binaryStr = atob(base64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const decoder = new TextDecoder("utf-8", { fatal: false });
          setContent(decoder.decode(bytes));
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to load content");
        })
        .finally(() => {
          setContentLoading(false);
        });
    }
  }, [asset.name, isMd, isText, profile]);

  // Load image as data URL
  useEffect(() => {
    if (!isImage || !asset.exists) return;
    setImageLoading(true);
    setImageDataUrl(null);
    void window.hermesAPI
      .getAsset(asset.name, profile)
      .then((base64) => {
        const ext = getFileExt(asset.name).toLowerCase();
        const mime = ext === "svg" ? "image/svg+xml"
          : ext === "png" ? "image/png"
          : ext === "gif" ? "image/gif"
          : ext === "webp" ? "image/webp"
          : ext === "bmp" ? "image/bmp"
          : ext === "ico" ? "image/x-icon"
          : "image/jpeg";
        setImageDataUrl(`data:${mime};base64,${base64}`);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load image");
      })
      .finally(() => {
        setImageLoading(false);
      });
  }, [asset.name, isImage, asset.exists, profile]);

  const handleDownload = useCallback((): void => {
    void window.hermesAPI
      .getAsset(asset.name, profile)
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
  }, [asset.name, profile]);

  const handleRemove = useCallback(async (): Promise<void> => {
    try {
      await window.hermesAPI.removeAsset(asset.name, profile);
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove asset");
    }
  }, [asset.name, profile, onBack]);

  const handleToggleLike = useCallback(async (): Promise<void> => {
    try {
      const result = await window.hermesAPI.toggleAssetLike(asset.name, userId, profile);
      setSocial((prev) => ({
        ...prev,
        likes: result.liked
          ? [...prev.likes, userId]
          : prev.likes.filter((id) => id !== userId),
      }));
    } catch {
      // silently fail
    }
  }, [asset.name, userId, profile]);

  const handleSubmitComment = useCallback(async (): Promise<void> => {
    const body = commentText.trim();
    if (!body) return;
    setSubmittingComment(true);
    try {
      const comment = await window.hermesAPI.addAssetComment(asset.name, userId, body, profile);
      setSocial((prev) => ({
        ...prev,
        comments: [...prev.comments, comment],
      }));
      setCommentText("");
    } catch {
      // silently fail
    } finally {
      setSubmittingComment(false);
    }
  }, [commentText, asset.name, userId, profile]);

  const handleDeleteComment = useCallback(async (commentId: string): Promise<void> => {
    try {
      await window.hermesAPI.deleteAssetComment(asset.name, commentId, profile);
      setSocial((prev) => ({
        ...prev,
        comments: prev.comments.filter((c) => c.id !== commentId),
      }));
    } catch {
      // silently fail
    }
  }, [asset.name, profile]);

  const handleShareClick = useCallback((): void => {
    setShowShare(true);
    void window.hermesAPI.incrementAssetShare(asset.name, profile);
  }, [asset.name, profile]);

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
        <div className="asset-preview-image-wrapper">
          {imageLoading ? (
            <div className="asset-preview-loading"><div className="loading-spinner" /></div>
          ) : imageDataUrl ? (
            <img
              src={imageDataUrl}
              alt={asset.name}
              className="asset-preview-image"
            />
          ) : (
            <div className="asset-preview-placeholder">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
          )}
          {asset.dimensions && (
            <div className="asset-preview-dimensions">
              {asset.dimensions.width} × {asset.dimensions.height}
            </div>
          )}
        </div>
      );
    }

    if (isVideo && asset.exists) {
      return (
        <div className="asset-preview-video-wrapper">
          <div className="asset-preview-placeholder">
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" />
            </svg>
            {asset.duration && (
              <span className="asset-video-duration-large">
                {formatDuration(asset.duration)}
              </span>
            )}
          </div>
        </div>
      );
    }

    if (isPdf) {
      return (
        <div className="asset-preview-placeholder">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <div style={{ fontWeight: 500 }}>PDF Document</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
            Preview not available
          </div>
        </div>
      );
    }

    if (isOffice) {
      return (
        <div className="asset-preview-placeholder">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
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
      return <pre className="asset-preview-code">{content}</pre>;
    }

    return (
      <div className="asset-preview-placeholder">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <div style={{ fontWeight: 500 }}>{ext.toUpperCase()} File</div>
      </div>
    );
  };

  return (
    <div className="asset-detail-container">
      <div className="asset-detail-header">
        <button
          className="asset-back-btn"
          onClick={onBack}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>{t("common.back")}</span>
        </button>
      </div>

      {error && (
        <div className="asset-detail-error" role="alert">
          {error}
        </div>
      )}

      <div className="asset-detail-layout">
        <div className="asset-preview-section">
          {renderPreview()}
        </div>

        <div className="asset-info-section">
          <div className="asset-info-header">
            <h2 className="asset-info-name">{asset.name}</h2>
          </div>

          {asset.prompt && (
            <div className="asset-info-block">
              <h3 className="asset-info-label">{t("assets.detail.prompt")}</h3>
              <div className="asset-prompt-content">
                {asset.prompt}
              </div>
            </div>
          )}

          {asset.model && (
            <div className="asset-info-block">
              <h3 className="asset-info-label">{t("assets.detail.parameters")}</h3>
              <div className="asset-info-meta">
                <div className="asset-info-row">
                  <span className="asset-info-key">{t("assets.detail.model")}</span>
                  <span className="asset-info-value">{asset.model}</span>
                </div>
                {asset.dimensions && (
                  <div className="asset-info-row">
                    <span className="asset-info-key">{t("assets.detail.dimensions")}</span>
                    <span className="asset-info-value">
                      {asset.dimensions.width} × {asset.dimensions.height}
                    </span>
                  </div>
                )}
                {asset.duration && (
                  <div className="asset-info-row">
                    <span className="asset-info-key">{t("assets.detail.duration")}</span>
                    <span className="asset-info-value">{formatDuration(asset.duration)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="asset-info-block">
            <h3 className="asset-info-label">{t("assets.detail.info")}</h3>
            <div className="asset-info-meta">
              {sizeStr && (
                <div className="asset-info-row">
                  <span className="asset-info-key">{t("assets.detail.size")}</span>
                  <span className="asset-info-value">{sizeStr}</span>
                </div>
              )}
              {dateStr && (
                <div className="asset-info-row">
                  <span className="asset-info-key">{t("assets.detail.modified")}</span>
                  <span className="asset-info-value">{dateStr}</span>
                </div>
              )}
              {asset.source_path && (
                <div className="asset-info-row">
                  <span className="asset-info-key">{t("assets.detail.source")}</span>
                  <span className="asset-info-value asset-info-path" title={asset.source_path}>
                    {asset.source_path}
                  </span>
                </div>
              )}
            </div>
          </div>

          {!asset.prompt && !asset.model && (
            <div className="asset-info-block asset-info-empty">
              <p>{t("assets.detail.noInfo")}</p>
            </div>
          )}
        </div>
      </div>

      <div className="asset-detail-actions">
        {asset.exists && (
          <button className="asset-action-btn primary" onClick={handleDownload}>
            <svg
              width="16"
              height="16"
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
          </button>
        )}
        <button className="asset-action-btn danger" onClick={handleRemove}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0 2-1 2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 1 2 2 2v2" />
          </svg>
          <span>{t("assets.remove")}</span>
        </button>
      </div>

      {/* Social bar */}
      <div className="asset-social-bar">
        {/* Like */}
        <button
          className={`asset-social-btn like-btn ${isLiked ? "liked" : ""}`}
          onClick={handleToggleLike}
          title={isLiked ? "取消点赞" : "点赞"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span>{social.likes.length > 0 ? social.likes.length : "赞"}</span>
        </button>

        {/* Comment */}
        <button
          className={`asset-social-btn comment-btn ${showComments ? "active" : ""}`}
          onClick={() => setShowComments((v) => !v)}
          title="评论"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>{social.comments.length > 0 ? social.comments.length : "评论"}</span>
        </button>

        {/* Share */}
        <button
          className="asset-social-btn share-btn"
          onClick={handleShareClick}
          title="分享"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="18" cy="5" r="3"/>
            <circle cx="6" cy="12" r="3"/>
            <circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          <span>{social.shares > 0 ? social.shares : "分享"}</span>
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="asset-comments-section">
          <div className="asset-comments-header">
            <span>评论 {social.comments.length}</span>
            <button className="asset-comments-close" onClick={() => setShowComments(false)}>✕</button>
          </div>

          {/* Comment list */}
          {social.comments.length === 0 ? (
            <div className="asset-comments-empty">还没有评论，来说两句吧~</div>
          ) : (
            <div className="asset-comments-list">
              {social.comments.map((comment) => (
                <div key={comment.id} className="asset-comment-item">
                  <div className="asset-comment-author">
                    <span className="asset-comment-avatar">{comment.author.slice(-4)}</span>
                    <span className="asset-comment-name">{comment.author}</span>
                    <span className="asset-comment-time">{formatTimeAgo(comment.created_at)}</span>
                    {comment.author === userId && (
                      <button
                        className="asset-comment-delete"
                        onClick={() => handleDeleteComment(comment.id)}
                        title="删除"
                      >
                        删除
                      </button>
                    )}
                  </div>
                  <div className="asset-comment-body">{comment.body}</div>
                </div>
              ))}
            </div>
          )}

          {/* Comment input */}
          <div className="asset-comment-input-row">
            <input
              className="asset-comment-input"
              placeholder="写下你的评论..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmitComment();
                }
              }}
            />
            <button
              className="asset-comment-submit"
              onClick={() => void handleSubmitComment()}
              disabled={submittingComment || !commentText.trim()}
            >
              {submittingComment ? "..." : "发送"}
            </button>
          </div>
        </div>
      )}

      {/* Share modal */}
      {showShare && (
        <ShareModal
          asset={asset}
          onClose={() => setShowShare(false)}
          profile={profile}
        />
      )}
    </div>
  );
}