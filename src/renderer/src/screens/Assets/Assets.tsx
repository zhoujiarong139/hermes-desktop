import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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

interface AssetNode {
  name: string;
  path: string;
  type: "file" | "folder";
  size?: number;
  modified: number;
  exists: boolean;
  added_at: number;
  type_?: "image" | "video" | "document" | "other";
}

interface GroupedAssets {
  today: AssetNode[];
  yesterday: AssetNode[];
  thisWeek: AssetNode[];
  earlier: AssetNode[];
}

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"];
const VIDEO_EXTS = ["mp4", "webm", "ogg", "mov", "avi", "m4v"];

function getFileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getTypeIcon(node: AssetNode): React.ReactNode {
  if (node.type === "folder") {
    return (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f5a623" strokeWidth="1.5">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    );
  }
  const ext = getFileExt(node.name);
  const isImage = node.type_ === "image" || IMAGE_EXTS.includes(ext);
  const isVideo = node.type_ === "video" || VIDEO_EXTS.includes(ext);
  if (isImage) {
    return (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "#888" }}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    );
  }
  if (isVideo) {
    return (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "#888" }}>
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </svg>
    );
  }
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "#888" }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

// ── Context Menu ──────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  node: AssetNode;
}

function ContextMenu({
  menu,
  onClose,
  currentFolder,
  profile,
  onRefresh,
}: {
  menu: ContextMenuState;
  onClose: () => void;
  currentFolder: string;
  profile: string;
  onRefresh: () => void;
}): React.JSX.Element {
  const [showMoveTo, setShowMoveTo] = useState(false);
  const [targetFolder, setTargetFolder] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleCopy = useCallback(async (): Promise<void> => {
    const newName = `${currentFolder ? currentFolder + "/" : ""}${menu.node.name} (copy)`;
    const result = await window.hermesAPI.copyAsset(menu.node.path, newName, profile);
    if (result.success) {
      onRefresh();
    }
    onClose();
  }, [menu.node, currentFolder, profile, onRefresh, onClose]);

  const handleMove = useCallback(async (): Promise<void> => {
    if (!targetFolder.trim()) return;
    const newPath = `${targetFolder}/${menu.node.name}`;
    const result = await window.hermesAPI.moveAsset(menu.node.path, newPath, profile);
    if (result.success) {
      onRefresh();
    }
    setShowMoveTo(false);
    setTargetFolder("");
    onClose();
  }, [targetFolder, menu.node, profile, onRefresh, onClose]);

  const handleDelete = useCallback(async (): Promise<void> => {
    if (menu.node.type === "folder") {
      // TODO: recursive delete
      onClose();
      return;
    }
    const result = await window.hermesAPI.removeAsset(menu.node.path, profile);
    if (result) {
      onRefresh();
    }
    onClose();
  }, [menu.node, profile, onRefresh, onClose]);

  const handleUploadToThisFolder = useCallback(async (): Promise<void> => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files) return;
      for (const file of Array.from(input.files)) {
        const sourcePath = window.hermesAPI.getPathForFile(file);
        if (sourcePath) {
          await window.hermesAPI.uploadAssetFile(sourcePath, currentFolder, profile);
        } else {
          const reader = new FileReader();
          reader.onload = async () => {
            const base64 = (reader.result as string).split(",")[1];
            const targetPath = currentFolder ? `${currentFolder}/${file.name}` : file.name;
            await window.hermesAPI.addAsset(targetPath, base64, profile);
          };
          reader.readAsDataURL(file);
        }
      }
      onRefresh();
    };
    input.click();
    onClose();
  }, [currentFolder, profile, onRefresh, onClose]);

  return (
    <>
      <div
        ref={menuRef}
        className="asset-context-menu"
        style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 1000 }}
      >
        {menu.node.type === "folder" ? (
          <>
            <button className="context-menu-item" onClick={handleUploadToThisFolder}>
              上传文件到该文件夹
            </button>
          </>
        ) : (
          <>
            <button className="context-menu-item" onClick={handleCopy}>
              复制
            </button>
            <button className="context-menu-item" onClick={() => setShowMoveTo(true)}>
              移动到...
            </button>
            <button className="context-menu-item" onClick={handleDelete}>
              删除
            </button>
          </>
        )}
      </div>
      {showMoveTo && (
        <div className="modal-overlay" onClick={() => { setShowMoveTo(false); setTargetFolder(""); onClose(); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 300 }}>
            <h3 style={{ margin: "0 0 12px" }}>移动到文件夹</h3>
            <p style={{ margin: "0 0 8px", fontSize: 13, opacity: 0.7 }}>
              当前文件: {menu.node.name}
            </p>
            <input
              className="assets-input"
              placeholder="目标文件夹路径，如: subfolder/images"
              value={targetFolder}
              onChange={(e) => setTargetFolder(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleMove(); }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn-primary" onClick={() => void handleMove()}>确定</button>
              <button className="btn-secondary" onClick={() => { setShowMoveTo(false); setTargetFolder(""); }}>取消</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main Assets Component ─────────────────────────────────────────────────────

function Assets({ profile: _profile }: { profile?: string }): React.JSX.Element {
  const { t } = useI18n();
  const activeProfile = _profile ?? "default";
  const [nodes, setNodes] = useState<AssetNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedType, setSelectedType] = useState<AssetType>("all");
  const [currentFolder, setCurrentFolder] = useState<string>("");
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadNodes = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const list = await window.hermesAPI.listAssetNodes(currentFolder || undefined, activeProfile);
      setNodes(list);

      // Load thumbnails for image files
      const imageNodes = list.filter((n) => n.type === "file" && (n.type_ === "image" || IMAGE_EXTS.includes(getFileExt(n.name))));
      const results = await Promise.allSettled(
        imageNodes.map(async (n) => {
          const base64 = await window.hermesAPI.getAsset(n.path, activeProfile);
          const ext = getFileExt(n.name).toLowerCase();
          const mime =
            ext === "svg" ? "image/svg+xml"
            : ext === "png" ? "image/png"
            : ext === "gif" ? "image/gif"
            : ext === "webp" ? "image/webp"
            : "image/jpeg";
          return { name: n.name, dataUrl: `data:${mime};base64,${base64}` };
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
  }, [activeProfile, currentFolder]);

  useEffect(() => {
    void loadNodes();
  }, [activeProfile, currentFolder, loadNodes]);

  // Close context menu on scroll
  useEffect(() => {
    const handler = () => setContextMenu(null);
    document.addEventListener("scroll", handler, true);
    return () => document.removeEventListener("scroll", handler, true);
  }, []);

  // Close context menu on navigation
  useEffect(() => {
    setContextMenu(null);
  }, [currentFolder]);

  const filteredNodes = useMemo(() => {
    let result = nodes;
    if (selectedType !== "all") {
      result = result.filter((n) => n.type === "file" && n.type_ === selectedType);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((n) => n.name.toLowerCase().includes(query));
    }
    // Folders always shown, files filtered
    const folders = result.filter((n) => n.type === "folder");
    const files = result.filter((n) => n.type === "file");
    return [...folders, ...files];
  }, [nodes, selectedType, searchQuery]);

  const groupedNodes = useMemo((): GroupedAssets => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;
    const weekStart = todayStart - 7 * 86400000;

    const filesOnly = filteredNodes.filter((n) => n.type === "file");
    const groups: GroupedAssets = { today: [], yesterday: [], thisWeek: [], earlier: [] };

    for (const node of filesOnly) {
      const addedAt = node.added_at * 1000;
      if (addedAt >= todayStart) groups.today.push(node);
      else if (addedAt >= yesterdayStart) groups.yesterday.push(node);
      else if (addedAt >= weekStart) groups.thisWeek.push(node);
      else groups.earlier.push(node);
    }
    return groups;
  }, [filteredNodes]);

  const handleNodeClick = useCallback((node: AssetNode): void => {
    if (node.type === "folder") {
      setCurrentFolder(node.name);
    } else {
      const asset: Asset = {
        name: node.path,
        source_path: node.path,
        size: node.size ?? 0,
        modified: node.modified,
        exists: node.exists,
        added_at: node.added_at,
        type: node.type_,
      };
      setSelectedAsset(asset);
    }
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: AssetNode): void => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const handleBack = useCallback((): void => {
    setSelectedAsset(null);
    void loadNodes();
  }, [loadNodes]);

  const handleCreateFolder = useCallback(async (): Promise<void> => {
    const name = newFolderName.trim();
    if (!name) return;
    const fullPath = currentFolder ? `${currentFolder}/${name}` : name;
    const result = await window.hermesAPI.createAssetFolder(fullPath, activeProfile);
    if (result.success) {
      setNewFolderName("");
      setShowNewFolder(false);
      void loadNodes();
    }
  }, [newFolderName, currentFolder, activeProfile, loadNodes]);

  const handleUploadClick = useCallback((): void => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const sourcePath = window.hermesAPI.getPathForFile(file);
        if (sourcePath) {
          await window.hermesAPI.uploadAssetFile(sourcePath, currentFolder, activeProfile);
        } else {
          const reader = new FileReader();
          await new Promise<void>((resolve) => {
            reader.onload = async () => {
              const base64 = (reader.result as string).split(",")[1];
              const targetPath = currentFolder ? `${currentFolder}/${file.name}` : file.name;
              await window.hermesAPI.addAsset(targetPath, base64, activeProfile);
              resolve();
            };
            reader.readAsDataURL(file);
          });
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      void loadNodes();
    }
  }, [currentFolder, activeProfile, loadNodes]);

  const navigateToBreadcrumb = useCallback((folder: string): void => {
    setCurrentFolder(folder);
  }, []);

  const handleBackNav = useCallback((): void => {
    if (!currentFolder) return;
    const parts = currentFolder.split("/");
    parts.pop();
    setCurrentFolder(parts.join("/"));
  }, [currentFolder]);

  const filterTabs: { type: AssetType; label: string }[] = [
    { type: "all", label: t("assets.filters.all") },
    { type: "image", label: t("assets.filters.image") },
    { type: "video", label: t("assets.filters.video") },
    { type: "document", label: t("assets.filters.document") },
  ];

  // Convert AssetNode to Asset for AssetDetail
  const assetForDetail = useMemo((): Asset | null => {
    if (!selectedAsset) return null;
    return { ...selectedAsset, name: selectedAsset.name };
  }, [selectedAsset]);

  if (selectedAsset && assetForDetail) {
    return (
      <AssetDetail
        asset={assetForDetail}
        onBack={handleBack}
        profile={activeProfile}
      />
    );
  }

  if (loading && nodes.length === 0) {
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

  // Breadcrumb parts
  const breadcrumbParts = currentFolder ? currentFolder.split("/") : [];

  return (
    <div className="assets-container">
      {/* Toolbar */}
      <div className="assets-header">
        <div className="assets-toolbar">
          <div className="assets-profile-badge">{activeProfile} assets</div>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            {/* New folder */}
            <button
              className="btn-secondary"
              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}
              onClick={() => setShowNewFolder(true)}
              title="新建文件夹"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <line x1="12" y1="11" x2="12" y2="17" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
              新建文件夹
            </button>
            {/* Upload */}
            <button
              className="btn-primary"
              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}
              onClick={handleUploadClick}
              disabled={uploading}
              title="从本地上传文件"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {uploading ? "上传中..." : "上传文件"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={handleFileInputChange}
            />
          </div>
        </div>

        {/* Breadcrumb navigation */}
        {currentFolder && (
          <div className="assets-breadcrumb">
            <button className="breadcrumb-item breadcrumb-root" onClick={() => setCurrentFolder("")}>
              Assets
            </button>
            {breadcrumbParts.map((part, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center" }}>
                <span className="breadcrumb-sep"> / </span>
                <button
                  className="breadcrumb-item"
                  onClick={() => navigateToBreadcrumb(breadcrumbParts.slice(0, i + 1).join("/"))}
                >
                  {part}
                </button>
              </span>
            ))}
            <button className="breadcrumb-back" onClick={handleBackNav} title="返回上级">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </div>
        )}

        {/* Filter tabs + search */}
        <div className="assets-filter-row">
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
      </div>

      {error && (
        <div className="assets-error" role="alert">{error}</div>
      )}

      {/* Folder / file grid */}
      {filteredNodes.length === 0 ? (
        <div className="assets-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4, marginBottom: 12 }}>
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <p>{nodes.length ? t("assets.noMatch") : t("assets.empty")}</p>
          <p style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>{t("assets.emptyHint")}</p>
        </div>
      ) : (
        <div className="assets-list">
          {(Object.keys(groupLabels) as Array<keyof GroupedAssets>).map((groupKey) => {
            const groupItems = groupedNodes[groupKey];
            if (groupItems.length === 0) return null;
            return (
              <div key={groupKey} className="asset-date-group">
                <div className="asset-date-header">
                  <span>{groupLabels[groupKey]}</span>
                  <span style={{ marginLeft: "auto", fontWeight: 400, opacity: 0.7 }}>{groupItems.length}</span>
                </div>
                <div className="assets-grid">
                  {groupItems.map((node) => (
                    <div
                      key={node.path}
                      className="asset-thumb-card"
                      onClick={() => handleNodeClick(node)}
                      onContextMenu={(e) => handleContextMenu(e, node)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") handleNodeClick(node);
                      }}
                    >
                      <div className="asset-thumb-wrapper">
                        {node.type === "file" && node.type_ === "image" && thumbnails[node.name] ? (
                          <img src={thumbnails[node.name]} alt={node.name} className="asset-thumb-image" />
                        ) : (
                          getTypeIcon(node)
                        )}
                        <div className="asset-thumb-overlay">
                          <span className="asset-thumb-name">{node.name}</span>
                          {node.size && (
                            <span className="asset-thumb-size">{formatSize(node.size)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          currentFolder={currentFolder}
          profile={activeProfile}
          onRefresh={() => void loadNodes()}
        />
      )}

      {/* New folder modal */}
      {showNewFolder && (
        <div className="modal-overlay" onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 300 }}>
            <h3 style={{ margin: "0 0 12px" }}>新建文件夹</h3>
            <input
              className="assets-input"
              placeholder="文件夹名称"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreateFolder(); }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn-primary" onClick={() => void handleCreateFolder()}>创建</button>
              <button className="btn-secondary" onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Assets;