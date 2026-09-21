import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  FileImage,
  HardDrive,
  ImageIcon,
  Layers,
  Link as LinkIcon,
  Megaphone,
  MousePointerClick,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Campaign,
  CampaignAnalytics,
  CampaignPlacement,
  CampaignStatus,
} from "@/lib/campaigns/types";
import { DeepShadowAdShell } from "@/components/ads/DeepShadowAdShell";
import { isCloudinaryConfigured, uploadToCloudinary } from "@/lib/cloudinary";
import { getAdminAuthHeaders } from "@/hooks/useAdminAuth";

const PLACEMENT_LABELS: Record<CampaignPlacement, string> = {
  all: "All Placements",
  reward_popup: "Reward Popup Modal",
  cinema_under_player: "Cinema (Under Video)",
  home_feed: "Home Feed",
  xseries_feed: "X Series Catalog",
  chat_banner: "Live Chat Banner",
};

const SAMPLE_PRESETS = [
  {
    name: "Cyberpunk Action",
    url: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80",
  },
  {
    name: "Midnight Horror",
    url: "https://images.unsplash.com/photo-1509281373149-e957c6296406?w=800&auto=format&fit=crop&q=80",
  },
  {
    name: "Mobile Data / Telecom",
    url: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&auto=format&fit=crop&q=80",
  },
  {
    name: "Cinema Premiere",
    url: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80",
  },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AdminCampaignManager() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [analytics, setAnalytics] = useState<CampaignAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterPlacement, setFilterPlacement] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Pre-Roll VAST Config State
  const [prerollEnabled, setPrerollEnabled] = useState(true);
  const [prerollAdTagUrl, setPrerollAdTagUrl] = useState(
    "https://youradexchange.com/video/select.php?r=12201910",
  );
  const [prerollApplyExternal, setPrerollApplyExternal] = useState(true);
  const [prerollApplyDirect, setPrerollApplyDirect] = useState(true);
  const [isSavingPreroll, setIsSavingPreroll] = useState(false);

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Banner upload mode & file details
  const [bannerUploadMode, setBannerUploadMode] = useState<"device" | "url" | "presets">("device");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadedFileSize, setUploadedFileSize] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form fields
  const [headline, setHeadline] = useState("");
  const [subheadline, setSubheadline] = useState("");
  const [description, setDescription] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [ctaText, setCtaText] = useState("Learn More");
  const [ctaUrl, setCtaUrl] = useState("");
  const [placement, setPlacement] = useState<CampaignPlacement>("reward_popup");
  const [status, setStatus] = useState<CampaignStatus>("active");
  const [priority, setPriority] = useState<number>(80);
  const [sponsorName, setSponsorName] = useState("Xora Sponsor");
  const [badge, setBadge] = useState("Sponsored");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fetchCampaigns = async (showToast = false) => {
    try {
      if (showToast) setLoading(true);
      const res = await fetch("/api/admin/campaigns", {
        headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`Failed to load campaigns (HTTP ${res.status})`);
      }

      const json = await res.json();
      if (json.ok) {
        setCampaigns(json.campaigns || []);
        setAnalytics(json.analytics || null);
        if (showToast) toast.success("Campaigns updated.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error fetching campaigns";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const fetchPrerollConfig = async () => {
    try {
      const res = await fetch("/api/preroll/config");
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.config) {
          setPrerollEnabled(Boolean(json.config.enabled));
          setPrerollAdTagUrl(
            json.config.adTagUrl || "https://youradexchange.com/video/select.php?r=12201910",
          );
          setPrerollApplyExternal(json.config.applyToExternal !== false);
          setPrerollApplyDirect(json.config.applyToDirect !== false);
        }
      }
    } catch {
      // silence
    }
  };

  const handleSavePrerollConfig = async () => {
    setIsSavingPreroll(true);
    try {
      const token = localStorage.getItem("xora_admin_token");
      const res = await fetch("/api/admin/preroll/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          enabled: prerollEnabled,
          adTagUrl: prerollAdTagUrl.trim(),
          applyToExternal: prerollApplyExternal,
          applyToDirect: prerollApplyDirect,
        }),
      });

      const json = await res.json();
      if (json.ok) {
        toast.success("Pre-roll video ad configuration saved successfully!");
      } else {
        toast.error(json.error || "Failed to save pre-roll configuration");
      }
    } catch {
      toast.error("Error connecting to server to save pre-roll configuration");
    } finally {
      setIsSavingPreroll(false);
    }
  };

  useEffect(() => {
    void fetchCampaigns();
    void fetchPrerollConfig();
  }, []);

  const openCreateModal = () => {
    setEditingCampaign(null);
    setHeadline("");
    setSubheadline("");
    setDescription("");
    setBannerUrl("");
    setUploadedFileName("");
    setUploadedFileSize("");
    setBannerUploadMode("device");
    setCtaText("Claim Offer");
    setCtaUrl("/rewards");
    setPlacement("reward_popup");
    setStatus("active");
    setPriority(85);
    setSponsorName("Xora Partner");
    setBadge("Sponsored");
    setStartDate("");
    setEndDate("");
    setIsModalOpen(true);
  };

  const openEditModal = (camp: Campaign) => {
    setEditingCampaign(camp);
    setHeadline(camp.headline);
    setSubheadline(camp.subheadline || "");
    setDescription(camp.description || "");
    setBannerUrl(camp.bannerUrl || "");
    setUploadedFileName("");
    setUploadedFileSize("");
    setBannerUploadMode(camp.bannerUrl?.startsWith("data:") ? "device" : "url");
    setCtaText(camp.ctaText || "Learn More");
    setCtaUrl(camp.ctaUrl || "");
    setPlacement(camp.placement);
    setStatus(camp.status);
    setPriority(camp.priority || 50);
    setSponsorName(camp.sponsorName || "Xora Partner");
    setBadge(camp.badge || "Sponsored");
    setStartDate(camp.startDate ? camp.startDate.split("T")[0] : "");
    setEndDate(camp.endDate ? camp.endDate.split("T")[0] : "");
    setIsModalOpen(true);
  };

  const handleToggleStatus = async (camp: Campaign) => {
    const nextStatus: CampaignStatus = camp.status === "active" ? "paused" : "active";
    try {
      const res = await fetch("/api/admin/campaigns/toggle-status", {
        method: "POST",
        headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ id: camp.id, status: nextStatus }),
      });
      const json = await res.json();
      if (json.ok) {
        toast.success(`Campaign "${camp.headline}" is now ${nextStatus}.`);
        await fetchCampaigns();
      } else {
        toast.error(json.error || "Failed to update campaign status.");
      }
    } catch {
      toast.error("Network error toggling campaign status.");
    }
  };

  const handleDelete = async (camp: Campaign) => {
    if (!confirm(`Are you sure you want to permanently delete "${camp.headline}"?`)) {
      return;
    }

    try {
      const res = await fetch("/api/admin/campaigns/delete", {
        method: "POST",
        headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ id: camp.id }),
      });
      const json = await res.json();
      if (json.ok) {
        toast.success("Campaign deleted.");
        await fetchCampaigns();
      } else {
        toast.error(json.error || "Failed to delete campaign.");
      }
    } catch {
      toast.error("Network error deleting campaign.");
    }
  };

  // Dedicated device image processing with multi-tier upload fallback
  const processDeviceImage = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (PNG, JPG, WebP, GIF, SVG).");
      return;
    }

    // Immediate local object URL for instant UI preview
    const localPreview = URL.createObjectURL(file);
    setBannerUrl(localPreview);
    setUploadedFileName(file.name);
    setUploadedFileSize(formatFileSize(file.size));
    setIsUploadingImage(true);
    setUploadProgress(20);

    try {
      let uploadedUrl = "";

      // Tier 1: Cloudinary direct client upload if configured
      if (isCloudinaryConfigured()) {
        try {
          const result = await uploadToCloudinary(file, {
            resourceType: "image",
            folder: "xora/ads",
            onProgress: (p) => setUploadProgress(Math.max(20, p)),
          });
          if (result.url) {
            uploadedUrl = result.url;
          }
        } catch (cErr) {
          console.warn("[Device Upload] Direct Cloudinary upload fallback:", cErr);
        }
      }

      // Tier 2: Server-side banner upload endpoint
      if (!uploadedUrl) {
        setUploadProgress(60);
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/admin/campaigns/upload-banner", {
          method: "POST",
          headers: getAdminAuthHeaders(),
          credentials: "include",
          body: formData,
        });

        if (res.ok) {
          const json = await res.json();
          if (json.ok && json.url) {
            uploadedUrl = json.url;
          }
        }
      }

      // Tier 3: Local data URI fallback (guarantees device upload never fails)
      if (!uploadedUrl) {
        setUploadProgress(80);
        uploadedUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Failed reading local device file"));
          reader.readAsDataURL(file);
        });
      }

      setBannerUrl(uploadedUrl);
      setUploadProgress(100);
      toast.success(`Banner "${file.name}" uploaded from your device!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Device upload failed";
      toast.error(msg);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processDeviceImage(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processDeviceImage(file);
    }
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!headline.trim() || !ctaText.trim() || !ctaUrl.trim()) {
      toast.error("Please fill in the headline, CTA text, and CTA URL.");
      return;
    }

    if (!bannerUrl.trim()) {
      toast.error("Please upload a banner image from your device or provide a banner image URL.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        headline: headline.trim(),
        subheadline: subheadline.trim() || undefined,
        description: description.trim() || undefined,
        bannerUrl: bannerUrl.trim(),
        ctaText: ctaText.trim(),
        ctaUrl: ctaUrl.trim(),
        placement,
        status,
        priority: Number(priority),
        sponsorName: sponsorName.trim() || undefined,
        badge: badge.trim() || "Sponsored",
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
      };

      const endpoint = editingCampaign
        ? "/api/admin/campaigns/update"
        : "/api/admin/campaigns/create";

      const body = editingCampaign ? { ...payload, id: editingCampaign.id } : payload;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (json.ok) {
        toast.success(editingCampaign ? "Campaign updated." : "Campaign created successfully.");
        setIsModalOpen(false);
        await fetchCampaigns();
      } else {
        toast.error(json.error || "Failed to save campaign.");
      }
    } catch {
      toast.error("Network error while saving campaign.");
    } finally {
      setIsSaving(false);
    }
  };

  const previewCampaign: Campaign = {
    id: editingCampaign?.id || "preview-id",
    headline: headline || "Enter your campaign headline here",
    subheadline: subheadline || "Enter a compelling subheadline or callout",
    description,
    bannerUrl:
      bannerUrl ||
      "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80",
    ctaText: ctaText || "Claim Offer",
    ctaUrl: ctaUrl || "#",
    placement,
    status,
    priority: Number(priority),
    sponsorName: sponsorName || "Xora Partner",
    badge: badge || "Sponsored",
    impressions: editingCampaign?.impressions || 0,
    clicks: editingCampaign?.clicks || 0,
    createdAt: editingCampaign?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Filtered campaigns
  const filteredCampaigns = campaigns.filter((c) => {
    if (filterPlacement !== "all" && c.placement !== filterPlacement && c.placement !== "all") {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchHead = c.headline.toLowerCase().includes(q);
      const matchSponsor = (c.sponsorName || "").toLowerCase().includes(q);
      const matchCta = (c.ctaText || "").toLowerCase().includes(q);
      if (!matchHead && !matchSponsor && !matchCta) return false;
    }
    return true;
  });

  return (
    <section
      id="campaigns"
      aria-label="In-House Campaigns Manager"
      className="space-y-6 rounded-3xl border border-border/80 bg-card p-6 shadow-card sm:p-8"
    >
      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-6">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <Megaphone className="size-3.5" />
            <span>Monetization & Promotion</span>
          </div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            In-House Ad & Campaign Manager
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Configure promotional banners uploaded from your device, reward popup sponsors, and
            partner campaigns.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchCampaigns(true)}
            className="h-9 rounded-xl border-border text-xs"
          >
            <RefreshCw className="size-3.5 mr-1.5" /> Refresh
          </Button>

          <Button
            onClick={openCreateModal}
            size="sm"
            className="h-9 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-lift hover:bg-primary/90"
          >
            <Plus className="size-3.5 mr-1.5" /> New Campaign
          </Button>
        </div>
      </div>

      {/* Analytics Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-border/60 bg-secondary/30 p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium">Total Campaigns</span>
            <Layers className="size-3.5 text-primary" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums">
            {analytics?.totalCampaigns ?? 0}
          </p>
          <span className="text-[10px] text-muted-foreground">All time created</span>
        </div>

        <div className="rounded-2xl border border-border/60 bg-secondary/30 p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium">Active Units</span>
            <Play className="size-3.5 text-emerald-400" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-400 tabular-nums">
            {analytics?.activeCampaigns ?? 0}
          </p>
          <span className="text-[10px] text-muted-foreground">Currently serving</span>
        </div>

        <div className="rounded-2xl border border-border/60 bg-secondary/30 p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium">Total Impressions</span>
            <Eye className="size-3.5 text-blue-400" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums">
            {(analytics?.totalImpressions ?? 0).toLocaleString()}
          </p>
          <span className="text-[10px] text-muted-foreground">Ad views tracked</span>
        </div>

        <div className="rounded-2xl border border-border/60 bg-secondary/30 p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium">Total Clicks</span>
            <MousePointerClick className="size-3.5 text-amber-400" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-amber-400 tabular-nums">
            {(analytics?.totalClicks ?? 0).toLocaleString()}
          </p>
          <span className="text-[10px] text-muted-foreground">CTA engagements</span>
        </div>

        <div className="rounded-2xl border border-border/60 bg-secondary/30 p-4 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium">Average CTR</span>
            <BarChart3 className="size-3.5 text-primary" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-primary tabular-nums">
            {analytics?.averageCtr ?? 0}%
          </p>
          <span className="text-[10px] text-muted-foreground">Click-through rate</span>
        </div>
      </div>

      {/* Pre-Roll VAST Video Advertising Settings Card */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-primary/15 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-[10px] font-bold text-primary uppercase tracking-wider">
                VAST / IMA Pre-Roll
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                Video Pre-Roll System
              </span>
            </div>
            <h3 className="mt-1 text-lg font-bold text-foreground">
              Pre-Roll Video Ads Configuration
            </h3>
            <p className="text-xs text-muted-foreground">
              Configure VAST video pre-roll advertisements played before video playback across Xora.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
              <span>Status:</span>
              <input
                type="checkbox"
                checked={prerollEnabled}
                onChange={(e) => setPrerollEnabled(e.target.checked)}
                className="size-4 rounded border-border text-primary focus:ring-primary"
              />
              <span
                className={prerollEnabled ? "text-emerald-400 font-bold" : "text-muted-foreground"}
              >
                {prerollEnabled ? "Enabled" : "Disabled"}
              </span>
            </label>

            <Button
              onClick={() => void handleSavePrerollConfig()}
              disabled={isSavingPreroll}
              size="sm"
              className="h-8 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              {isSavingPreroll ? "Saving..." : "Save Pre-Roll Settings"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="md:col-span-2 space-y-1.5">
            <Label className="text-xs font-semibold">VAST / IMA Ad Tag URL *</Label>
            <Input
              value={prerollAdTagUrl}
              onChange={(e) => setPrerollAdTagUrl(e.target.value)}
              placeholder="https://youradexchange.com/video/select.php?r=12201910"
              className="h-9 rounded-xl text-xs bg-background/80 font-mono text-foreground"
            />
            <span className="text-[10px] text-muted-foreground block">
              Default tag:{" "}
              <code className="text-primary font-mono">
                https://youradexchange.com/video/select.php?r=12201910
              </code>
            </span>
          </div>

          <div className="space-y-2 flex flex-col justify-center">
            <Label className="text-xs font-semibold">Target Video Types</Label>
            <div className="space-y-1.5 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prerollApplyExternal}
                  onChange={(e) => setPrerollApplyExternal(e.target.checked)}
                  className="size-3.5 rounded border-border text-primary"
                />
                <span className="text-foreground">
                  Apply to External Videos (YouTube / Vimeo / Dailymotion)
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prerollApplyDirect}
                  onChange={(e) => setPrerollApplyDirect(e.target.checked)}
                  className="size-3.5 rounded border-border text-primary"
                />
                <span className="text-foreground">
                  Apply to Direct Streams (MP4 / HLS / Custom)
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "all", label: "All Placements" },
            { id: "reward_popup", label: "Reward Popup" },
            { id: "cinema_under_player", label: "Cinema Player" },
            { id: "home_feed", label: "Home Feed" },
            { id: "xseries_feed", label: "X Series" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterPlacement(tab.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filterPlacement === tab.id
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-9 rounded-xl text-xs bg-background/50"
          />
        </div>
      </div>

      {/* Campaigns List */}
      {loading ? (
        <div className="flex h-36 items-center justify-center">
          <RefreshCw className="size-6 animate-spin text-primary" />
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
          <p className="font-semibold text-sm text-foreground">No campaigns found</p>
          <p className="mt-1">
            {searchQuery
              ? "No campaign matched your query."
              : "Create your first in-house promotional campaign with a custom banner."}
          </p>
          <Button onClick={openCreateModal} size="sm" className="mt-4 rounded-full text-xs">
            <Plus className="size-3 mr-1.5" /> Create Campaign
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCampaigns.map((camp) => {
            const ctr =
              camp.impressions > 0 ? ((camp.clicks / camp.impressions) * 100).toFixed(1) : "0.0";

            return (
              <div
                key={camp.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-background/60 p-4 shadow-card transition hover:border-primary/40"
              >
                <div>
                  {/* Top image & badges */}
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black/40">
                    {camp.bannerUrl ? (
                      <img
                        src={camp.bannerUrl}
                        alt={camp.headline}
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="grid size-full place-items-center bg-secondary/50 text-muted-foreground text-xs">
                        No Banner
                      </div>
                    )}
                    <div className="absolute left-2 top-2 flex gap-1">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                          camp.status === "active"
                            ? "bg-emerald-500/90 text-white"
                            : camp.status === "paused"
                              ? "bg-amber-500/90 text-white"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {camp.status}
                      </span>
                      <span className="rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
                        Pri: {camp.priority}
                      </span>
                    </div>

                    <div className="absolute right-2 top-2">
                      <span className="rounded bg-primary/80 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">
                        {PLACEMENT_LABELS[camp.placement] || camp.placement}
                      </span>
                    </div>
                  </div>

                  {/* Body info */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="font-semibold text-primary">
                        {camp.badge || "Sponsored"}
                      </span>
                      <span>{camp.sponsorName || "Xora Partner"}</span>
                    </div>

                    <h3 className="mt-1 font-display text-sm font-bold text-foreground line-clamp-1">
                      {camp.headline}
                    </h3>

                    {camp.subheadline && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {camp.subheadline}
                      </p>
                    )}
                  </div>
                </div>

                {/* Metrics & Actions */}
                <div className="mt-4 pt-3 border-t border-border/50 space-y-3">
                  <div className="grid grid-cols-3 text-center text-[10px] text-muted-foreground">
                    <div className="border-r border-border/40">
                      <span className="block text-foreground font-semibold">
                        {camp.impressions}
                      </span>
                      <span>Views</span>
                    </div>
                    <div className="border-r border-border/40">
                      <span className="block text-foreground font-semibold">{camp.clicks}</span>
                      <span>Clicks</span>
                    </div>
                    <div>
                      <span className="block text-primary font-semibold">{ctr}%</span>
                      <span>CTR</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleStatus(camp)}
                      className="h-8 rounded-lg px-2.5 text-xs"
                      title={camp.status === "active" ? "Pause Campaign" : "Resume Campaign"}
                    >
                      {camp.status === "active" ? (
                        <>
                          <Pause className="size-3 text-amber-400 mr-1" /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="size-3 text-emerald-400 mr-1" /> Resume
                        </>
                      )}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditModal(camp)}
                      className="h-8 rounded-lg px-2.5 text-xs"
                    >
                      Edit
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(camp)}
                      className="h-8 size-8 p-0 text-muted-foreground hover:text-rose-500 rounded-lg"
                      title="Delete Campaign"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Campaign Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl rounded-3xl border-primary/20 bg-[#0f0c18] p-6 text-foreground shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">
              {editingCampaign ? "Edit In-House Campaign" : "Create In-House Campaign"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Upload custom banner imagery directly from your device, configure copy, CTA link, and
              placements.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveCampaign} className="mt-4 grid gap-6 lg:grid-cols-12">
            {/* Left Column: Form Fields */}
            <div className="space-y-4 lg:col-span-7">
              <div>
                <Label className="text-xs font-semibold">Headline *</Label>
                <Input
                  placeholder="e.g. Stream 4K Horror Cinema on XoraTV"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  className="mt-1 h-9 rounded-xl text-xs bg-background/50"
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Subheadline / Callout</Label>
                <Input
                  placeholder="e.g. Unlimited thrillers and exclusive short films without subscription."
                  value={subheadline}
                  onChange={(e) => setSubheadline(e.target.value)}
                  className="mt-1 h-9 rounded-xl text-xs bg-background/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Sponsor Name</Label>
                  <Input
                    placeholder="e.g. Xora Studios / MTN"
                    value={sponsorName}
                    onChange={(e) => setSponsorName(e.target.value)}
                    className="mt-1 h-9 rounded-xl text-xs bg-background/50"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">Badge Label</Label>
                  <Input
                    placeholder="e.g. Sponsored / Exclusive"
                    value={badge}
                    onChange={(e) => setBadge(e.target.value)}
                    className="mt-1 h-9 rounded-xl text-xs bg-background/50"
                  />
                </div>
              </div>

              {/* Enhanced Banner Media Section with Device Upload */}
              <div className="space-y-2.5 rounded-2xl border border-border/60 bg-secondary/20 p-4">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <ImageIcon className="size-3.5 text-primary" />
                    <span>Banner Media *</span>
                  </Label>

                  {/* Mode switcher tabs */}
                  <div className="flex items-center gap-1 rounded-lg bg-background/60 p-0.5 border border-border/50">
                    <button
                      type="button"
                      onClick={() => setBannerUploadMode("device")}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition ${
                        bannerUploadMode === "device"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <HardDrive className="size-2.5 inline mr-1" />
                      From Device
                    </button>
                    <button
                      type="button"
                      onClick={() => setBannerUploadMode("url")}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition ${
                        bannerUploadMode === "url"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <LinkIcon className="size-2.5 inline mr-1" />
                      Image URL
                    </button>
                    <button
                      type="button"
                      onClick={() => setBannerUploadMode("presets")}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition ${
                        bannerUploadMode === "presets"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Sparkles className="size-2.5 inline mr-1" />
                      Presets
                    </button>
                  </div>
                </div>

                {/* 1. Device Upload Mode */}
                {bannerUploadMode === "device" && (
                  <div className="space-y-2">
                    {/* Hidden Native File Input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml"
                      onChange={handleFileInputChange}
                      disabled={isUploadingImage}
                      className="hidden"
                    />

                    {/* Drag & Drop Dropzone Box */}
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition ${
                        dragActive
                          ? "border-primary bg-primary/10 shadow-lift scale-[1.01]"
                          : "border-border/80 bg-background/40 hover:border-primary/50 hover:bg-background/70"
                      } ${isUploadingImage ? "opacity-75 pointer-events-none" : ""}`}
                    >
                      {isUploadingImage ? (
                        <div className="flex flex-col items-center py-2 space-y-2">
                          <RefreshCw className="size-6 animate-spin text-primary" />
                          <span className="text-xs font-semibold text-foreground">
                            Uploading from device ({uploadProgress}%)...
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Processing and preparing banner
                          </span>
                        </div>
                      ) : bannerUrl ? (
                        <div className="flex w-full items-center justify-between gap-3 text-left">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={bannerUrl}
                              alt="Uploaded banner"
                              className="size-12 shrink-0 rounded-lg object-cover border border-primary/30 shadow-card"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground truncate">
                                <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                                <span className="truncate">
                                  {uploadedFileName || "Device Banner Loaded"}
                                </span>
                              </div>
                              <span className="text-[10px] text-muted-foreground">
                                {uploadedFileSize ? `${uploadedFileSize} • ` : ""}Click or drag to
                                replace
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                fileInputRef.current?.click();
                              }}
                              className="h-7 text-[10px] rounded-lg border-border"
                            >
                              Replace
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setBannerUrl("");
                                setUploadedFileName("");
                                setUploadedFileSize("");
                              }}
                              className="h-7 size-7 p-0 text-muted-foreground hover:text-rose-400 rounded-lg"
                              title="Remove banner"
                            >
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center py-2 space-y-1.5">
                          <div className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary group-hover:bg-primary/25 transition">
                            <UploadCloud className="size-5" />
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-foreground block">
                              Click to choose from your device, or drag & drop here
                            </span>
                            <span className="text-[10px] text-muted-foreground block mt-0.5">
                              Supports PNG, JPG, WebP, GIF, SVG (recommended ratio ~21:9 or 16:9)
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. Direct Image URL Mode */}
                {bannerUploadMode === "url" && (
                  <div className="space-y-1.5">
                    <Input
                      placeholder="https://images.unsplash.com/... or https://..."
                      value={bannerUrl}
                      onChange={(e) => setBannerUrl(e.target.value)}
                      className="h-9 rounded-xl text-xs bg-background/50"
                    />
                    <span className="text-[10px] text-muted-foreground block">
                      Direct HTTP(S) image URL hosted on CDN or image server.
                    </span>
                  </div>
                )}

                {/* 3. Sample Presets Mode */}
                {bannerUploadMode === "presets" && (
                  <div className="grid grid-cols-2 gap-2">
                    {SAMPLE_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setBannerUrl(preset.url);
                          setUploadedFileName(preset.name);
                          toast.success(`Applied "${preset.name}" banner preset.`);
                        }}
                        className={`group relative overflow-hidden rounded-xl border p-2 text-left transition ${
                          bannerUrl === preset.url
                            ? "border-primary bg-primary/10 shadow-sm"
                            : "border-border/60 bg-background/40 hover:border-primary/40"
                        }`}
                      >
                        <img
                          src={preset.url}
                          alt={preset.name}
                          className="h-12 w-full rounded-lg object-cover mb-1.5"
                        />
                        <span className="text-[11px] font-semibold text-foreground block truncate">
                          {preset.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">CTA Button Text *</Label>
                  <Input
                    placeholder="e.g. Claim 1GB Data / View"
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                    className="mt-1 h-9 rounded-xl text-xs bg-background/50"
                    required
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">CTA URL / Link *</Label>
                  <Input
                    placeholder="e.g. /rewards or https://..."
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    className="mt-1 h-9 rounded-xl text-xs bg-background/50"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Placement</Label>
                  <Select
                    value={placement}
                    onValueChange={(val) => setPlacement(val as CampaignPlacement)}
                  >
                    <SelectTrigger className="mt-1 h-9 rounded-xl text-xs bg-background/50">
                      <SelectValue placeholder="Select placement" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Placements</SelectItem>
                      <SelectItem value="home_feed">Homepage Feed</SelectItem>
                      <SelectItem value="xseries_feed">X Series Catalog</SelectItem>
                      <SelectItem value="learn_feed">Learn Feed</SelectItem>
                      <SelectItem value="chat_banner">Chat Banner</SelectItem>
                      <SelectItem value="cinema_popup">Cinema Large Pop-up Banner</SelectItem>
                      <SelectItem value="reward_popup">Reward Popup Modal</SelectItem>
                      <SelectItem value="cinema_under_player">Cinema Player Footer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold">Status</Label>
                  <Select value={status} onValueChange={(val) => setStatus(val as CampaignStatus)}>
                    <SelectTrigger className="mt-1 h-9 rounded-xl text-xs bg-background/50">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active (Live)</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold">Priority (1-100)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="mt-1 h-9 rounded-xl text-xs bg-background/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Start Date (Optional)</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 h-9 rounded-xl text-xs bg-background/50"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">End Date (Optional)</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1 h-9 rounded-xl text-xs bg-background/50"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl text-xs h-9"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving || isUploadingImage}
                  className="rounded-xl text-xs h-9 bg-primary px-5 text-primary-foreground"
                >
                  {isSaving
                    ? "Saving..."
                    : editingCampaign
                      ? "Update Campaign"
                      : "Publish Campaign"}
                </Button>
              </div>
            </div>

            {/* Right Column: Live In-House Ad Shell Preview */}
            <div className="space-y-3 lg:col-span-5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" />
                <span>Live Deep-Shadow Ad Preview</span>
              </div>

              <div className="rounded-2xl border border-border/80 bg-background/80 p-4 shadow-inner">
                <DeepShadowAdShell campaign={previewCampaign} variant="card" />
              </div>

              <p className="text-[11px] text-muted-foreground">
                This shows exactly how the campaign renders in viewer popups and content feeds
                across XoraTV.
              </p>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
