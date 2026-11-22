'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Info, Maximize2, Minimize2 } from 'lucide-react';
import { TerrainField } from '@/lib/world/terrain/field';
import { DebrisInstance } from '@/lib/world/debris';
import { Waypoint } from '@/lib/control/types';
import { MissionMarker } from '@/lib/missions/missions';
import { RadarSize } from '@/lib/storage/settings';

interface RadarPanelProps {
  size: RadarSize;
  onSizeChange: (size: RadarSize) => void;
  field: TerrainField | null;
  terrainVersion: number;
  debris: readonly DebrisInstance[];
  robotPos: [number, number, number];
  robotYaw: number;
  trailPoints: readonly [number, number][];
  waypoints: readonly Waypoint[];
  missionMarkers: readonly MissionMarker[];
  completedMarkerIds: readonly string[];
  colorblindSafe?: boolean;
}

const SIZE_PX: Record<RadarSize, number> = {
  small: 152,
  medium: 208,
  large: 268,
};

export default function RadarPanel({
  size = 'medium',
  onSizeChange,
  field,
  terrainVersion,
  debris,
  robotPos,
  robotYaw,
  trailPoints,
  waypoints,
  missionMarkers,
  completedMarkerIds,
  colorblindSafe = false,
}: RadarPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [hovered, setHovered] = useState(false);

  const px = hovered && size === 'small' ? 196 : SIZE_PX[size] || 208;

  // 1. Pre-render offscreen terrain hillshade + density heat map whenever terrain/debris updates
  useEffect(() => {
    const off = document.createElement('canvas');
    off.width = 200;
    off.height = 200;
    const ctx = off.getContext('2d');
    if (!ctx) return;

    const w = 200;
    const h = 200;
    const cx = w / 2;
    const cy = h / 2;
    const scale = (w * 0.45) / 20.0; // 20m radius fits inside 90% of canvas

    ctx.fillStyle = '#181816';
    ctx.fillRect(0, 0, w, h);

    // Subtle hillshade from canonical TerrainField
    if (field) {
      const img = ctx.createImageData(w, h);
      const step = 44.0 / w;
      for (let py = 0; py < h; py++) {
        const wz = -22.0 + py * step;
        for (let pxIdx = 0; pxIdx < w; pxIdx++) {
          const wx = -22.0 + pxIdx * step;
          const h0 = field.sampleHeight(wx, wz);
          const hx = field.sampleHeight(wx + 0.35, wz);
          const hz = field.sampleHeight(wx, wz + 0.35);
          const shade = Math.max(0.14, Math.min(0.42, 0.24 + ((hx - h0) * 0.65 + (hz - h0) * 0.45) * 0.8));
          const val = Math.round(shade * 125);
          const idx = (py * w + pxIdx) * 4;
          img.data[idx] = val;
          img.data[idx + 1] = val + 2;
          img.data[idx + 2] = val - 2;
          img.data[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    // Aggregated obstacle density heat layer when > 150 rocks are in range
    const gridN = 20;
    const counts = new Uint16Array(gridN * gridN);
    const hazards: DebrisInstance[] = [];
    for (let i = 0; i < debris.length; i++) {
      const d = debris[i];
      if (Math.abs(d.x) > 20 || Math.abs(d.z) > 20) continue;
      const gx = Math.min(gridN - 1, Math.max(0, Math.floor(((d.x + 20) / 40) * gridN)));
      const gz = Math.min(gridN - 1, Math.max(0, Math.floor(((d.z + 20) / 40) * gridN)));
      counts[gz * gridN + gx]++;
      if (d.scale >= 0.46) hazards.push(d);
    }

    if (debris.length > 150) {
      const cellPx = (40 / gridN) * scale;
      for (let gz = 0; gz < gridN; gz++) {
        for (let gx = 0; gx < gridN; gx++) {
          const c = counts[gz * gridN + gx];
          if (c < 3) continue;
          const wx = -20 + (gx + 0.5) * (40 / gridN);
          const wz = -20 + (gz + 0.5) * (40 / gridN);
          const alpha = Math.min(0.25, (c / 16) * 0.22);
          ctx.fillStyle = colorblindSafe ? `rgba(147, 197, 253, ${alpha})` : `rgba(184, 165, 130, ${alpha})`;
          ctx.fillRect(cx + wx * scale - cellPx / 2, cy + wz * scale - cellPx / 2, cellPx, cellPx);
        }
      }
    }

    // Sparse size-scaled hazard boulders (thin out dots visually so radar stays crisp)
    const stride = hazards.length > 180 ? Math.ceil(hazards.length / 180) : 1;
    ctx.fillStyle = 'rgba(253, 251, 247, 0.42)';
    for (let i = 0; i < hazards.length; i += stride) {
      const d = hazards[i];
      const rx = cx + d.x * scale;
      const ry = cy + d.z * scale;
      const r = Math.max(1.0, Math.min(2.4, d.scale * 2.0));
      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Square arena boundary rim (18m half-extent)
    const halfPx = 18.0 * scale;
    ctx.strokeStyle = 'rgba(253, 251, 247, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(cx - halfPx, cy - halfPx, halfPx * 2, halfPx * 2);
    ctx.setLineDash([]);

    bgCanvasRef.current = off;
  }, [field, terrainVersion, debris, colorblindSafe]);

  // 2. Live frame overlay draw (robot-centered or world-relative with labeled 10m/20m range rings)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const bufferPx = Math.round(px * dpr);
    if (canvas.width !== bufferPx || canvas.height !== bufferPx) {
      canvas.width = bufferPx;
      canvas.height = bufferPx;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const w = px;
    const h = px;
    const cx = w / 2;
    const cy = h / 2;
    const rangeM = 20.0;
    const scale = (w * 0.45) / rangeM;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#141413';
    ctx.fillRect(0, 0, w, h);

    // Clip to circular radar aperture
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.46, 0, Math.PI * 2);
    ctx.clip();

    // Draw cached terrain + obstacles offset relative to robot
    if (bgCanvasRef.current) {
      const bgScale = w / 200;
      const offX = -robotPos[0] * scale;
      const offY = -robotPos[2] * scale;
      ctx.drawImage(bgCanvasRef.current, offX, offY, 200 * bgScale, 200 * bgScale);
    }

    // Range rings at 10m and 20m with tiny labels
    for (const rMeters of [10, 20]) {
      const rPx = rMeters * scale;
      ctx.strokeStyle = 'rgba(253, 251, 247, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(253, 251, 247, 0.55)';
      ctx.font = '9px monospace';
      ctx.fillText(`${rMeters}m`, cx + 3, cy - rPx + 10);
    }

    // Crosshairs
    ctx.strokeStyle = 'rgba(253, 251, 247, 0.08)';
    ctx.beginPath();
    ctx.moveTo(cx, 6);
    ctx.lineTo(cx, h - 6);
    ctx.moveTo(6, cy);
    ctx.lineTo(w - 6, cy);
    ctx.stroke();

    // Fading trail
    if (trailPoints.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < trailPoints.length; i++) {
        const tx = cx + (trailPoints[i][0] - robotPos[0]) * scale;
        const ty = cy + (trailPoints[i][1] - robotPos[2]) * scale;
        if (i === 0) ctx.moveTo(tx, ty);
        else ctx.lineTo(tx, ty);
      }
      ctx.strokeStyle = 'rgba(253, 251, 247, 0.35)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    // Mission objective markers (distinct diamond shape + color)
    const objColor = colorblindSafe ? '#38BDF8' : '#8EA48C';
    for (const m of missionMarkers) {
      if (completedMarkerIds.includes(m.id)) continue;
      const mx = cx + (m.x - robotPos[0]) * scale;
      const my = cy + (m.z - robotPos[2]) * scale;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = objColor;
      ctx.fillRect(-4, -4, 8, 8);
      ctx.strokeStyle = '#FDFBF7';
      ctx.lineWidth = 1;
      ctx.strokeRect(-4, -4, 8, 8);
      ctx.restore();
    }

    // User click-to-move waypoints (distinct amber triangle + path)
    if (waypoints.length > 0) {
      ctx.strokeStyle = colorblindSafe ? '#FBBF24' : '#F59E0B';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (const wp of waypoints) {
        ctx.lineTo(cx + (wp.x - robotPos[0]) * scale, cy + (wp.z - robotPos[2]) * scale);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      for (const wp of waypoints) {
        const wx = cx + (wp.x - robotPos[0]) * scale;
        const wy = cy + (wp.z - robotPos[2]) * scale;
        ctx.fillStyle = colorblindSafe ? '#FBBF24' : '#F59E0B';
        ctx.beginPath();
        ctx.moveTo(wx, wy - 5);
        ctx.lineTo(wx + 4.5, wy + 4);
        ctx.lineTo(wx - 4.5, wy + 4);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Droid heading arrow at center (>= 14px, rotates truthfully with robotYaw)
    // In Single Frame Convention, yaw = 0 faces +X (East / right on radar), +yaw turns CCW toward -Z (North / up)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-robotYaw + Math.PI / 2);
    ctx.fillStyle = '#FDFBF7';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore(); // end clip

    // Outer aperture bezel
    ctx.strokeStyle = 'rgba(253, 251, 247, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.46, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore(); // end DPR scale
  }, [robotPos, robotYaw, trailPoints, waypoints, missionMarkers, completedMarkerIds, colorblindSafe, px]);

  const cycleSize = () => {
    const next: RadarSize = size === 'small' ? 'medium' : size === 'medium' ? 'large' : 'small';
    onSizeChange(next);
  };

  const headingDeg = Math.round((((-robotYaw * 180) / Math.PI + 90) % 360 + 360) % 360);
  const edgeDist = Math.max(0, 18 - Math.max(Math.abs(robotPos[0]), Math.abs(robotPos[2])));
  const ariaSummary = `Lunar Radar: droid at X ${robotPos[0].toFixed(1)}m, Z ${robotPos[2].toFixed(1)}m, heading ${headingDeg} degrees, ${edgeDist.toFixed(1)} meters from arena edge, ${missionMarkers.length - completedMarkerIds.length} objectives remaining, ${waypoints.length} user waypoints.`;

  return (
    <div
      className="relative bg-charcoal-deep/90 backdrop-blur-md border border-hairline rounded-xl p-2 shadow-2xl select-none transition-all duration-200"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="region"
      aria-label={ariaSummary}
    >
      {/* Header row */}
      <div className="flex items-center justify-between text-[10px] font-mono text-cream-dim mb-1.5 px-1">
        <span className="flex items-center space-x-1.5 font-semibold text-cream">
          <span className="w-1.5 h-1.5 rounded-full bg-sage" />
          <span>RADAR 20m</span>
        </span>
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setShowLegend((v) => !v)}
            title="Toggle Radar Legend"
            aria-label="Toggle Radar Legend"
            className="p-0.5 rounded hover:bg-cream/10 text-cream-dim hover:text-cream"
          >
            <Info className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={cycleSize}
            title={`Radar size: ${size} (click to cycle)`}
            aria-label={`Cycle radar size, currently ${size}`}
            className="p-0.5 rounded hover:bg-cream/10 text-cream-dim hover:text-cream"
          >
            {size === 'large' ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Radar Canvas (DPR scaled) */}
      <canvas
        ref={canvasRef}
        style={{ width: `${px}px`, height: `${px}px` }}
        className="block rounded-lg"
      />

      {/* Scale & Heading Footer */}
      <div className="flex items-center justify-between text-[9px] font-mono text-cream-dim mt-1 px-1 tabular-nums">
        <span>HDG {String(headingDeg).padStart(3, '0')}°</span>
        <span>EDGE {edgeDist.toFixed(1)}m</span>
      </div>

      {/* Legend Popover */}
      {showLegend && (
        <div className="absolute right-0 top-full mt-2 w-48 p-2.5 rounded-xl bg-charcoal-deep border border-cream/15 shadow-2xl text-[10px] font-mono space-y-1.5 z-50">
          <div className="text-cream font-bold uppercase tracking-wider border-b border-hairline pb-1">
            Radar Legend
          </div>
          <div className="flex items-center space-x-2 text-cream-dim">
            <span className="inline-block w-2.5 h-2.5 text-center leading-none text-cream">▲</span>
            <span>Droid (Heading)</span>
          </div>
          <div className="flex items-center space-x-2 text-cream-dim">
            <span
              className="inline-block w-2.5 h-2.5 rotate-45 border border-cream"
              style={{ background: colorblindSafe ? '#38BDF8' : '#8EA48C' }}
            />
            <span>Mission Objective</span>
          </div>
          <div className="flex items-center space-x-2 text-cream-dim">
            <span
              className="inline-block w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[7px]"
              style={{ borderBottomColor: colorblindSafe ? '#FBBF24' : '#F59E0B' }}
            />
            <span>Click Waypoint</span>
          </div>
          <div className="flex items-center space-x-2 text-cream-dim">
            <span className="inline-block w-2 h-2 rounded-full bg-cream/60" />
            <span>Boulder / Density</span>
          </div>
          <div className="flex items-center space-x-2 text-cream-dim">
            <span className="inline-block w-3 border-t border-dashed border-cream/60" />
            <span>Arena Rim (18m)</span>
          </div>
        </div>
      )}
    </div>
  );
}
