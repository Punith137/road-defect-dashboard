"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

interface DefectLocation {
  id: string;
  lat: number;
  lon: number;
  confidence: number;
  riskScore: number;
}

interface HeatmapProps {
  defects: DefectLocation[];
  activeId: string | null;
}

export default function DefectHeatmap({ defects, activeId }: HeatmapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const heatLayerRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Load Leaflet and assign to window so leaflet.heat can find it
    const L = require("leaflet");
    (window as any).L = L;
    require("leaflet.heat");

    const initialLat = defects.length > 0 ? defects[0].lat : 17.6868;
    const initialLon = defects.length > 0 ? defects[0].lon : 83.2185;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([initialLat, initialLon], 14);

    // Free OpenStreetMap Standard Tiles (No API Key Required)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || typeof window === "undefined") return;

    const L = (window as any).L || require("leaflet");

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    if (defects.length === 0) return;

    // Thermal points: [lat, lon, intensity (0.65 to 1.0)]
    const heatData = defects.map((d) => [
      d.lat,
      d.lon,
      Math.max(0.65, (d.riskScore || 75) / 100),
    ]);

    // Wide blur and radius to form overlapping heat blobs
    if (typeof L.heatLayer === "function") {
      heatLayerRef.current = L.heatLayer(heatData, {
        radius: 35,
        blur: 24,
        maxZoom: 16,
        max: 1.0,
        minOpacity: 0.45,
        gradient: {
          0.1: "#1a00ff", // Blue
          0.3: "#00d0ff", // Cyan
          0.5: "#00ff37", // Green
          0.7: "#ffe100", // Yellow
          0.85: "#ff5100", // Orange
          1.0: "#ff0000", // Critical Red Core
        },
      }).addTo(map);
    }

    // Overlay pinpoint markers
    defects.forEach((d) => {
      const isSelected = activeId === d.id;
      const marker = L.circleMarker([d.lat, d.lon], {
        radius: isSelected ? 7 : 4,
        fillColor: "#ff0033",
        color: "#ffffff",
        weight: isSelected ? 2 : 1,
        opacity: 0.9,
        fillOpacity: 0.9,
      }).addTo(map);

      marker.bindTooltip(
        `<b>${d.id}</b><br/>Severity: ${d.riskScore}/100<br/>(${d.lat.toFixed(4)}, ${d.lon.toFixed(4)})`,
        { direction: "top", offset: [0, -5] }
      );

      markersRef.current.push(marker);
    });

    const bounds = L.latLngBounds(defects.map((d) => [d.lat, d.lon]));
    map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
  }, [defects, activeId]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-zinc-800">
      <div ref={mapContainerRef} className="w-full h-full" />
      <div className="absolute bottom-2 left-2 z-[400] bg-zinc-950/85 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-zinc-800 text-[10px] text-zinc-300 flex items-center gap-2">
        <span className="font-semibold text-zinc-400">Distress Density:</span>
        <div className="w-16 h-2 rounded-full bg-gradient-to-r from-blue-600 via-cyan-400 via-green-400 via-yellow-400 to-red-600" />
        <span className="text-red-400 font-bold">Critical</span>
      </div>
    </div>
  );
}