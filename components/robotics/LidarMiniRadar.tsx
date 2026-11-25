'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Radar, Eye } from 'lucide-react';
import { PerceptionStore, PerceptionSnapshot } from '@/lib/perception/lidar';

export default function LidarMiniRadar() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const store = PerceptionStore.getInstance();
  const [lidarCfg, setLidarCfg] = useState(() => store.getLidarConfig());
  const [pipCfg, setPipCfg] = useState(() => store.getPipConfig());
  const [meta, setMeta] = useState({
    minObsDistM: 15.0,
    raycastTimeMs: 0.2,
    rayCount: 48,
  });

  useEffect(() => {
    const drawRadar = (snap: PerceptionSnapshot) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h * 0.62; // Forward-biased polar center
      const maxR = Math.min(w * 0.44, h * 0.56);

      ctx.fillStyle = '#141413';
      ctx.fillRect(0, 0, w, h);

      // Range rings (5m, 10m, maxRange)
      ctx.strokeStyle = 'rgba(253, 251, 247, 0.10)';
      ctx.lineWidth = 1;
      for (const ringFrac of [0.33, 0.66, 1.0]) {
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * ringFrac, 0, Math.PI * 2);
        ctx.stroke();
      }

      // FOV wedge sector
      const halfFov = ((snap.fovDeg * Math.PI) / 180) * 0.5;
      ctx.strokeStyle = 'rgba(142, 164, 140, 0.25)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(-halfFov) * maxR, cy - Math.cos(-halfFov) * maxR);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(halfFov) * maxR, cy - Math.cos(halfFov) * maxR);
      ctx.stroke();

      // Ray beams + hit dots (body +X is UP on radar screen, right is +Z)
      const rangeScale = maxR / Math.max(1, snap.maxRangeM);
      for (let i = 0; i < snap.ranges.length; i++) {
        const d = snap.ranges[i]!;
        const ang = snap.anglesRad[i] ?? 0; // + is left-ish in world cos/sin, flip X cleanly
        const px = cx - Math.sin(ang) * d * rangeScale;
        const py = cy - Math.cos(ang) * d * rangeScale;
        const isObs = snap.isObstacle[i];

        ctx.strokeStyle = isObs ? 'rgba(225, 92, 68, 0.36)' : 'rgba(142, 164, 140, 0.20)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
        ctx.stroke();

        ctx.fillStyle = isObs ? '#f87171' : '#8ea48c';
        ctx.beginPath();
        ctx.arc(px, py, isObs ? 2.1 : 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Robot forward arrow indicator
      ctx.fillStyle = '#fdfbf7';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 5);
      ctx.lineTo(cx - 3.5, cy + 3);
      ctx.lineTo(cx + 3.5, cy + 3);
      ctx.closePath();
      ctx.fill();
    };

    drawRadar(store.getLatestScan());

    let lastMetaMs = 0;
    const unsubScan = store.subscribeScan((snap) => {
      drawRadar(snap);
      const now = performance.now();
      if (now - lastMetaMs > 200) {
        lastMetaMs = now;
        setMeta({
          minObsDistM: snap.minObstacleDistM,
          raycastTimeMs: snap.raycastTimeMs,
          rayCount: snap.rayCount,
        });
      }
    });
    const unsubCfg = store.subscribeConfig(() => {
      setLidarCfg(store.getLidarConfig());
      setPipCfg(store.getPipConfig());
    });

    return () => {
      unsubScan();
      unsubCfg();
    };
  }, [store]);

  return (
    <div className="space-y-2 p-2 rounded-lg bg-charcoal-deep/65 border border-cream/10">
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-bold uppercase text-cream flex items-center space-x-1.5">
          <Radar className="w-3.5 h-3.5 text-sage" />
          <span>Synthetic LiDAR & Onboard Cam</span>
        </span>
        <span className="text-[9px] text-cream-dim tabular-nums">
          Min Obs: <strong className={meta.minObsDistM < 1.2 ? 'text-brick' : 'text-sage'}>{meta.minObsDistM.toFixed(1)}m</strong> · {meta.raycastTimeMs.toFixed(1)}ms
        </span>
      </div>

      <div className="flex items-start space-x-2.5">
        {/* Polar LiDAR Canvas */}
        <canvas
          ref={canvasRef}
          width={148}
          height={118}
          className="rounded border border-cream/10 shrink-0 bg-[#141413]"
        />

        {/* Configurable Perception Parameters */}
        <div className="flex-1 space-y-2 text-[9px]">
          <div className="space-y-0.5">
            <div className="flex justify-between text-cream-dim">
              <span>Rays ({lidarCfg.fovDeg}° FOV)</span>
              <span className="text-cream font-bold">{lidarCfg.rayCount}</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {[36, 48, 72].map((rc) => (
                <button
                  key={rc}
                  type="button"
                  onClick={() => store.setLidarConfig({ rayCount: rc })}
                  className={`py-0.5 rounded font-bold border transition-colors ${
                    lidarCfg.rayCount === rc
                      ? 'bg-sage text-charcoal-deep border-sage'
                      : 'bg-charcoal text-cream-dim border-cream/10 hover:text-cream'
                  }`}
                >
                  {rc}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="flex justify-between text-cream-dim">
              <span>Max Range</span>
              <span className="text-cream font-bold tabular-nums">{lidarCfg.maxRangeM.toFixed(0)} m</span>
            </div>
            <input
              type="range"
              min="5"
              max="25"
              step="1"
              value={lidarCfg.maxRangeM}
              onChange={(e) => store.setLidarConfig({ maxRangeM: parseFloat(e.target.value) })}
              className="w-full accent-sage h-1 bg-charcoal rounded cursor-pointer"
            />
          </div>

          <div className="flex items-center space-x-1 pt-0.5">
            <button
              type="button"
              onClick={() => store.setLidarConfig({ enabled: !lidarCfg.enabled })}
              className={`flex-1 py-1 px-1.5 rounded font-bold uppercase border text-[8px] ${
                lidarCfg.enabled
                  ? 'bg-sage/20 text-sage border-sage/40'
                  : 'bg-charcoal text-cream-dim border-cream/10'
              }`}
            >
              {lidarCfg.enabled ? 'LiDAR ON' : 'LiDAR OFF'}
            </button>
            <button
              type="button"
              onClick={() => store.setPipConfig({ enabled: !pipCfg.enabled })}
              className={`flex-1 py-1 px-1.5 rounded font-bold uppercase border text-[8px] flex items-center justify-center space-x-1 ${
                pipCfg.enabled
                  ? 'bg-sage/20 text-sage border-sage/40'
                  : 'bg-charcoal text-cream-dim border-cream/10'
              }`}
              title="Toggle Onboard Camera Picture-in-Picture Feed"
            >
              <Eye className="w-2.5 h-2.5" />
              <span>PiP</span>
            </button>
            <button
              type="button"
              onClick={() => store.setPipConfig({ depthMode: !pipCfg.depthMode, enabled: true })}
              className={`py-1 px-1.5 rounded font-bold uppercase border text-[8px] ${
                pipCfg.depthMode
                  ? 'bg-sky-400/20 text-sky-300 border-sky-400/40'
                  : 'bg-charcoal text-cream-dim border-cream/10'
              }`}
              title="Toggle Depth Map Shader on Onboard Camera"
            >
              Depth
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
