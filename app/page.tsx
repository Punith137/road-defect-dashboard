"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import TopoBackground from "@/components/kokonutui/topo-background";
import { 
  Upload, 
  CheckCircle2, 
  MapPin, 
  HardDrive, 
  Loader2, 
  AlertCircle,
  Activity,
  Layers,
  Sparkles,
  ArrowUpRight
} from "lucide-react";

// Client-only dynamic import for Leaflet (prevents Next.js SSR window errors)
const DefectHeatmap = dynamic(() => import("@/components/defect-heatmap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-zinc-950/60 backdrop-blur-xl text-zinc-400 text-xs">
      <Loader2 className="w-4 h-4 animate-spin text-sky-400 mr-2" />
      Loading GIS Telemetry Matrix...
    </div>
  ),
});

const BACKEND_URL = "https://road-defect-backend-ypnd.onrender.com";

interface DefectItem {
  id: string;
  type: string;
  lat: number;
  lon: number;
  confidence: number;
  image: string;
}

interface AnalyzedDefect extends DefectItem {
  riskScore: number;
  severityLevel: "CRITICAL" | "MODERATE" | "LOW";
  actionRequired: string;
  slaTime: string;
}

export default function Home() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [rawDefects, setRawDefects] = useState<DefectItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const handleSync = async () => {
    setErrorMessage(null);

    // Prompt user to pick their mounted SD Card drive/directory
    const input = document.createElement("input");
    input.type = "file";
    // @ts-ignore
    input.webkitdirectory = true;
    input.multiple = true;

    input.onchange = async (e: any) => {
      const files: File[] = Array.from(e.target.files || []);
      const videoFiles = files.filter((f) =>
        f.name.toLowerCase().match(/\.(mp4|avi|mov|mkv)$/)
      );

      if (videoFiles.length === 0) {
        setErrorMessage("No supported video files (.mp4, .avi, .mov) found in the selected folder.");
        return;
      }

      setIsScanning(true);
      setRawDefects([]);
      setScanStatus(`Uploading & analyzing ${videoFiles.length} video(s)...`);

      try {
        const formData = new FormData();
        videoFiles.forEach((file) => {
          formData.append("files", file);
        });

        const response = await fetch(`${BACKEND_URL}/sync-client-sd`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Inference engine responded with HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.status === "success" && Array.isArray(data.defects)) {
          setRawDefects(data.defects);
          setScanStatus(null);
        } else {
          setErrorMessage(data.message || "No defects returned from the inspection.");
        }
      } catch (err: any) {
        console.error("Sync failure:", err);
        setErrorMessage("Cloud inference error: Unable to complete analysis. Please retry.");
      } finally {
        setIsScanning(false);
        setScanStatus(null);
      }
    };

    input.click();
  };

  // Municipal Pavement Condition Index risk formula
  const defects: AnalyzedDefect[] = useMemo(() => {
    return rawDefects.map((item) => {
      let weight = 1.0;
      const lower = item.type.toLowerCase();

      if (lower.includes("alligator") || lower.includes("pothole") || lower.includes("d20")) {
        weight = 1.6;
      } else if (lower.includes("transverse") || lower.includes("d10")) {
        weight = 1.3;
      } else if (lower.includes("longitudinal") || lower.includes("d00")) {
        weight = 1.0;
      }

      const riskScore = Math.min(100, Math.round((item.confidence * weight) / 1.5));

      let severityLevel: "CRITICAL" | "MODERATE" | "LOW" = "LOW";
      let actionRequired = "Routine Monitoring";
      let slaTime = "Next Audit Cycle";

      if (riskScore >= 75) {
        severityLevel = "CRITICAL";
        actionRequired = "Emergency Patch / Base Milling";
        slaTime = "24-48 Hours";
      } else if (riskScore >= 50) {
        severityLevel = "MODERATE";
        actionRequired = "Crack Sealing & Surface Jointing";
        slaTime = "7 Days";
      }

      return {
        ...item,
        riskScore,
        severityLevel,
        actionRequired,
        slaTime,
      };
    }).sort((a, b) => b.riskScore - a.riskScore);
  }, [rawDefects]);

  return (
    <main className="relative min-h-screen px-6 py-8">
      {/* Pinned background layer across the entire scrollable page */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <TopoBackground />
        <div className="absolute top-10 left-1/4 w-96 h-96 bg-sky-500/10 rounded-full blur-[130px] animate-pulse" />
        <div className="absolute top-1/2 right-1/4 w-[28rem] h-[28rem] bg-indigo-500/10 rounded-full blur-[150px] pointer-events-none" />
        <div className="absolute bottom-10 left-1/3 w-80 h-80 bg-rose-500/10 rounded-full blur-[140px] pointer-events-none" />
      </div>

      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Top Header & Integrated Top-Right GIS Heatmap */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Header Controls (Left 2 Columns) */}
          <div className="lg:col-span-2 space-y-5">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full liquid-glow-pill text-sky-400 text-xs font-semibold tracking-wide">
                <Sparkles className="w-3 h-3 text-sky-400 animate-spin" />
                Autonomous Municipal Road Telemetry
              </span>
              <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)] mt-2">
                Road Defect Surveillance
              </h1>
              <p className="text-zinc-400 text-xs md:text-sm mt-1">
                Autonomous dashcam footage analysis with YOLOv8 anomaly segmentation, real-time heatmaps, and risk ranking.
              </p>
            </div>

            {/* Liquid Glass Hardware Ingestion Bar */}
            <div className="p-6 rounded-2xl liquid-glass flex flex-col sm:flex-row items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border border-sky-400/30 text-sky-300 shadow-[0_0_20px_rgba(56,189,248,0.2)]">
                  <HardDrive className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                    Vehicle Storage Reader
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {isScanning 
                      ? (scanStatus || "Running cloud inference...") 
                      : defects.length > 0 
                      ? `${defects.length} defect zones mapped and prioritized` 
                      : "Select dashcam SD card directory to run AI inspection"}
                  </p>
                </div>
              </div>

              <button 
                disabled={isScanning}
                onClick={handleSync}
                className="relative group overflow-hidden flex items-center gap-2.5 px-6 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 transition-all font-semibold text-xs md:text-sm text-white shadow-[0_0_25px_rgba(14,165,233,0.35)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap border border-white/20"
              >
                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                {isScanning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing Storage...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Sync Hardware Storage
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Liquid Glass Dedicated GIS Heatmap Box */}
          <div className="rounded-2xl liquid-glass p-3.5 shadow-2xl flex flex-col h-[270px]">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-2.5 px-1">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-100">
                <Layers className="w-4 h-4 text-sky-400" />
                <span>Geographic Heatmap HUD</span>
              </div>
              <span className="text-[10px] text-zinc-400 font-mono px-2 py-0.5 rounded-md bg-white/5 border border-white/10">
                {defects.length} Zones Clustered
              </span>
            </div>

            <div className="flex-1 w-full relative">
              <DefectHeatmap 
                defects={defects} 
                activeId={activeId} 
              />
            </div>
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-4 rounded-xl border border-red-500/40 bg-red-500/10 backdrop-blur-md flex items-center gap-3 text-red-300 text-xs shadow-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 2-Column Split: Defect Grid (Left) + Dedicated Risk Priority Column (Right) */}
        {defects.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Left 2 Columns: Defect Cards */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Detected Anomalies ({defects.length} zones)
                </h2>
                <span className="text-xs text-zinc-400">Click a card to focus map</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {defects.map((defect) => {
                  const isSelected = activeId === defect.id;
                  return (
                    <div
                      key={defect.id}
                      onClick={() => setActiveId(defect.id)}
                      onMouseEnter={() => setActiveId(defect.id)}
                      className={`cursor-pointer rounded-2xl liquid-glass p-4.5 transition-all flex flex-col justify-between ${
                        isSelected 
                          ? "!border-sky-400/80 !bg-sky-950/40 ring-2 ring-sky-400/30 shadow-[0_0_30px_rgba(56,189,248,0.25)] scale-[1.01]" 
                          : "hover:border-white/20"
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-400/30 flex items-center gap-1.5">
                            {defect.id}
                            <ArrowUpRight className="w-3 h-3 opacity-70" />
                          </span>
                          <span className="text-xs text-emerald-400 font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                            {defect.confidence}% match
                          </span>
                        </div>

                        <div className="relative aspect-video rounded-xl overflow-hidden mb-3 border border-white/10 bg-zinc-950/80 group">
                          <img
                            src={defect.image}
                            alt={defect.type}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>

                        <h4 className="font-bold text-zinc-100 text-sm mb-1">{defect.type}</h4>
                        <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-rose-500" />
                          <span className="font-mono">Lat: {defect.lat} | Lon: {defect.lon}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right 1 Column: Dedicated Risk Factor & Repair Prioritization Panel */}
            <div className="rounded-2xl liquid-glass p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-sky-400" />
                  <h3 className="font-bold text-sm text-zinc-100">Risk Assessment Queue</h3>
                </div>
                <span className="text-[10px] text-zinc-400 font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10">
                  Priority Sort
                </span>
              </div>

              <div className="space-y-3">
                {defects.map((defect) => {
                  const isSelected = activeId === defect.id;
                  return (
                    <div
                      key={defect.id}
                      onClick={() => setActiveId(defect.id)}
                      onMouseEnter={() => setActiveId(defect.id)}
                      className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
                        defect.severityLevel === "CRITICAL"
                          ? "bg-red-500/10 border-red-500/30 hover:border-red-400"
                          : defect.severityLevel === "MODERATE"
                          ? "bg-amber-500/10 border-amber-500/30 hover:border-amber-400"
                          : "bg-sky-500/10 border-sky-500/30 hover:border-sky-400"
                      } ${isSelected ? "scale-[1.02] ring-2 ring-white/30 shadow-lg" : ""}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-zinc-100">{defect.id}</span>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                          defect.severityLevel === "CRITICAL"
                            ? "bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                            : defect.severityLevel === "MODERATE"
                            ? "bg-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                            : "bg-sky-500 text-white shadow-[0_0_10px_rgba(14,165,233,0.5)]"
                        }`}>
                          {defect.severityLevel}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-zinc-200 font-medium mb-1.5">
                        <span>{defect.type}</span>
                        <span className="font-mono text-zinc-300 font-bold">{defect.riskScore}/100</span>
                      </div>

                      {/* Liquid Glow Progress Bar */}
                      <div className="w-full h-1.5 rounded-full bg-zinc-900/80 border border-white/5 overflow-hidden mb-2">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            defect.severityLevel === "CRITICAL" 
                              ? "bg-gradient-to-r from-orange-500 to-red-500 shadow-[0_0_8px_#ef4444]" 
                              : defect.severityLevel === "MODERATE" 
                              ? "bg-gradient-to-r from-yellow-400 to-amber-500 shadow-[0_0_8px_#f59e0b]" 
                              : "bg-gradient-to-r from-cyan-400 to-sky-500 shadow-[0_0_8px_#0ea5e9]"
                          }`}
                          style={{ width: `${defect.riskScore}%` }}
                        />
                      </div>

                      <div className="text-[11px] text-zinc-400 space-y-0.5">
                        <div>Action: <span className="text-zinc-200 font-semibold">{defect.actionRequired}</span></div>
                        <div>SLA: <span className="text-sky-400 font-semibold">{defect.slaTime}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

      </div>
    </main>
  );
}