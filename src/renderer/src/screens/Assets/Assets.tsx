import { useState, useEffect, useCallback, useMemo } from "react";
import { useI18n } from "../../components/useI18n";
import { AssetDetail } from "./AssetDetail";

export interface Asset {
  name: string;
  source_path: string;
  size: number;
  modified: number;
  exists: boolean;
  added_at: number;
  type?: "image" | "video" | "document" | "other";
  prompt?: string;
  model?: string;
  dimensions?: { width: number; height: number };
  duration?: number;
  thumbnail?: string;
}

export type AssetType = "all" | "image" | "video" | "document";

interface GroupedAssets {
  today: Asset[];
  yesterday: Asset[];
  thisWeek: Asset[];
  earlier: Asset[];
}

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"];
const VIDEO_EXTS = ["mp4", "webm", "ogg", "mov", "avi", "m4v"];
const OFFICE_EXTS = ["ppt", "pptx", "doc", "docx", "xls", "xlsx"];
const PDF_EXT = "pdf";
const MD_EXT = "md";

function getFileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

function getAssetType(name: string): "image" | "video" | "document" | "other" {
  const ext = getFileExt(name);
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (VIDEO_EXTS.includes(ext)) return "video";
  if (OFFICE_EXTS.includes(ext) || ext === PDF_EXT || ext === MD_EXT) return "document";
  return "other";
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function Assets({ profile: _profile }: { profile?: string }): React.JSX.Element {
  const { t } = useI18n();
  const activeProfile = _profile ?? "default";
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedType, setSelectedType] = useState<AssetType>("all");
  // Per-asset thumbnail data URLs
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  const loadAssets = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const list = await window.hermesAPI.listAssets(activeProfile);
      // Ensure type field is populated
      const typedList = list.map((a) => ({
        ...a,
        type: a.type ?? getAssetType(a.name),
      }));
      setAssets(typedList);

      // Load thumbnails for all image assets in parallel
      const imageAssets = typedList.filter((a) => a.type === "image" && a.exists);
      const results = await Promise.allSettled(
        imageAssets.map(async (a) => {
          const base64 = await window.hermesAPI.getAsset(a.name, activeProfile);
          const ext = getFileExt(a.name).toLowerCase();
          const mime = ext === "svg" ? "image/svg+xml"
            : ext === "png" ? "image/png"
            : ext === "gif" ? "image/gif"
            : ext === "webp" ? "image/webp"
            : ext === "bmp" ? "image/bmp"
            : "image/jpeg";
          return { name: a.name, dataUrl: `data:${mime};base64,${base64}` };
        }),
      );
      const newThumbs: Record<string, string> = {};
      for (const r of results) {
        if (r.status === "fulfilled") {
          newThumbs[r.value.name] = r.value.dataUrl;
        }
      }
      setThumbnails(newThumbs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assets");
    } finally {
      setLoading(false);
    }
  }, [activeProfile]);

  useEffect(() => {
    void loadAssets();
  }, [activeProfile, loadAssets]);

  const filteredAssets = useMemo(() => {
    let result = assets;

    // Filter by type
    if (selectedType !== "all") {
      result = result.filter((a) => a.type === selectedType);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(query) ||
          a.source_path.toLowerCase().includes(query),
      );
    }

    return result;
  }, [assets, selectedType, searchQuery]);

  const groupedAssets = useMemo((): GroupedAssets => {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const yesterdayStart = todayStart - 86400000;
    const weekStart = todayStart - 7 * 86400000;

    const groups: GroupedAssets = {
      today: [],
      yesterday: [],
      thisWeek: [],
      earlier: [],
    };

    for (const asset of filteredAssets) {
      const addedAt = asset.added_at * 1000;
      if (addedAt >= todayStart) {
        groups.today.push(asset);
      } else if (addedAt >= yesterdayStart) {
        groups.yesterday.push(asset);
      } else if (addedAt >= weekStart) {
        groups.thisWeek.push(asset);
      } else {
        groups.earlier.push(asset);
      }
    }

    return groups;
  }, [filteredAssets]);

  const toggleGroup = useCallback((group: string): void => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }, []);

  const handleAssetClick = useCallback((asset: Asset): void => {
    setSelectedAsset(asset);
  }, []);

  const handleBack = useCallback((): void => {
    setSelectedAsset(null);
    void loadAssets();
  }, [loadAssets]);

  const filterTabs: { type: AssetType; label: string }[] = [
    { type: "all", label: t("assets.filters.all") },
    { type: "image", label: t("assets.filters.image") },
    { type: "video", label: t("assets.filters.video") },
    { type: "document", label: t("assets.filters.document") },
  ];

  if (selectedAsset) {
    return (
      <AssetDetail
        asset={selectedAsset}
        onBack={handleBack}
        profile={activeProfile}
      />
    );
  }

  if (loading) {
    return (
      <div className="assets-container">
        <div className="assets-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  const groupLabels: Record<keyof GroupedAssets, string> = {
    today: t("assets.today"),
    yesterday: t("assets.yesterday"),
    thisWeek: t("assets.thisWeek"),
    earlier: t("assets.earlier"),
  };

  return (
    <div className="assets-container">
      <div className="assets-header">
        <div className="assets-profile-badge">{activeProfile} assets</div>
        <div className="assets-filter-tabs">
          {filterTabs.map((tab) => (
            <button
              key={tab.type}
              className={`assets-filter-tab ${selectedType === tab.type ? "active" : ""}`}
              onClick={() => setSelectedType(tab.type)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          className="assets-search"
          placeholder={t("assets.search")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {error && (
        <div className="assets-error" role="alert">
          {error}
        </div>
      )}

      {filteredAssets.length === 0 ? (
        <div className="assets-empty">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{ opacity: 0.4, marginBottom: 12 }}
          >
            <rect x="2" y="3" width="20" height="18" rx="2" />
            <path d="M8 12h8M12 8v8" />
          </svg>
          <p>
            {assets.length
              ? t("assets.noMatch")
              : t("assets.empty")}
          </p>
          <p style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>
            {t("assets.emptyHint")}
          </p>
        </div>
      ) : (
        <div className="assets-list">
          {(Object.keys(groupLabels) as Array<keyof GroupedAssets>).map(
            (groupKey) => {
              const groupItems = groupedAssets[groupKey];
              if (groupItems.length === 0) return null;
              const isCollapsed = collapsedGroups.has(groupKey);

              return (
                <div key={groupKey} className="asset-date-group">
                  <div
                    className="asset-date-header"
                    onClick={() => toggleGroup(groupKey)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        toggleGroup(groupKey);
                      }
                    }}
                  >
                    <span
                      className={`asset-date-caret ${isCollapsed ? "collapsed" : ""}`}
                    >
                      {isCollapsed ? "▸" : "▾"}
                    </span>
                    <span>{groupLabels[groupKey]}</span>
                    <span style={{ marginLeft: "auto", fontWeight: 400, opacity: 0.7 }}>
                      {groupItems.length}
                    </span>
                  </div>
                  {!isCollapsed && (
                    <div className="assets-grid">
                      {groupItems.map((asset) => {
                        const ext = getFileExt(asset.name);
                        const isImage = asset.type === "image" || IMAGE_EXTS.includes(ext);
                        const isVideo = asset.type === "video" || VIDEO_EXTS.includes(ext);

                        return (
                          <div
                            key={asset.name}
                            className="asset-thumb-card"
                            onClick={() => handleAssetClick(asset)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                handleAssetClick(asset);
                              }
                            }}
                          >
                            <div className="asset-thumb-wrapper">
                              {isImage && asset.exists ? (
                                thumbnails[asset.name] ? (
                                  <img
                                    src={thumbnails[asset.name]}
                                    alt={asset.name}
                                    className="asset-thumb-image"
                                  />
                                ) : (
                                  <div className="asset-thumb-icon-wrapper" style={{ color: "#888" }}>
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                      <rect x="3" y="3" width="18" height="18" rx="2" />
                                      <circle cx="8.5" cy="8.5" r="1.5" />
                                      <polyline points="21 15 16 10 5 21" />
                                    </svg>
                                  </div>
                                )
                              ) : isVideo ? (
                                <div className="asset-thumb-icon-wrapper">
                                  <svg
                                    width="32"
                                    height="32"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                  >
                                    <polygon points="23 7 16 12 23 17 23 7" />
                                    <rect x="1" y="5" width="15" height="14" rx="2" />
                                  </svg>
                                  {asset.duration && (
                                    <span className="asset-video-duration">
                                      {formatDuration(asset.duration)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="asset-thumb-icon-wrapper">
                                  <svg
                                    width="32"
                                    height="32"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                  >
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                  </svg>
                                </div>
                              )}
                              <div className="asset-thumb-overlay">
                                <span className="asset-thumb-name">{asset.name}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}

export default Assets;