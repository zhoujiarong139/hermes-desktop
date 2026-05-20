import { useState, useEffect, useCallback, useMemo } from "react";
import { useI18n } from "../../components/useI18n";
import { AssetDetail } from "./AssetDetail";

interface Asset {
  name: string;
  source_path: string;
  size: number;
  modified: number;
  exists: boolean;
  added_at: number;
}

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

function AssetIcon({
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
  const isMd = ext === MD_EXT;

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

  if (isMd) {
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
        <path d="M8 13h2M8 17h2M14 13h2M14 17h2" />
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

function Assets(_props: { profile?: string }): React.JSX.Element {
  const { t } = useI18n();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const loadAssets = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const list = await window.hermesAPI.listAssets();
      setAssets(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const filteredAssets = useMemo(() => {
    if (!searchQuery.trim()) return assets;
    const query = searchQuery.toLowerCase();
    return assets.filter(
      (a) =>
        a.name.toLowerCase().includes(query) ||
        a.source_path.toLowerCase().includes(query),
    );
  }, [assets, searchQuery]);

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

  const handleRemove = useCallback(async (): Promise<void> => {
    if (!selectedAsset) return;
    try {
      await window.hermesAPI.removeAsset(selectedAsset.name);
      setSelectedAsset(null);
      void loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove asset");
    }
  }, [selectedAsset, loadAssets]);

  if (selectedAsset) {
    return (
      <AssetDetail
        asset={selectedAsset}
        onBack={handleBack}
        onRemove={handleRemove}
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
        <h2 className="assets-title">{t("assets.title")}</h2>
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
            {t(
              "assets.emptyHint",
            )}
          </p>
        </div>
      ) : (
        <div className="assets-list">
          {(Object.keys(groupLabels) as Array<keyof GroupedAssets>).map(
            (groupKey) => {
              const groupAssets = groupedAssets[groupKey];
              if (groupAssets.length === 0) return null;
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
                      {groupAssets.length}
                    </span>
                  </div>
                  {!isCollapsed && (
                    <div className="assets-grid">
                      {groupAssets.map((asset) => (
                        <div
                          key={asset.name}
                          className="asset-grid-item"
                          onClick={() => handleAssetClick(asset)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              handleAssetClick(asset);
                            }
                          }}
                        >
                          {IMAGE_EXTS.includes(getFileExt(asset.name)) &&
                          asset.exists ? (
                            <img
                              src={`data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3C/svg%3E`}
                              alt={asset.name}
                              className="asset-thumb asset-thumb-placeholder"
                              data-asset-name={asset.name}
                            />
                          ) : (
                            <AssetIcon
                              name={asset.name}
                              className="asset-thumb asset-thumb-icon"
                            />
                          )}
                          <span className="asset-name">{asset.name}</span>
                        </div>
                      ))}
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