import os
import glob
import json
import numpy as np
from PIL import Image

SCREENSHOT_DIR = r"C:\Users\Asus\.gemini\antigravity\brain\b4635c3d-edaf-4d6d-a6c9-488ec4ec977a\screenshots\bugfix_baseline"
OUT_PATH = r"D:\project all\nvidia\docs\visual-metrics-baseline.json"

def analyze_image(path):
    im = Image.open(path).convert("RGB")
    arr = np.array(im, dtype=np.float32) / 255.0
    h, w, _ = arr.shape
    total_pixels = h * w

    # Relative luminance (Rec. 709)
    lum = 0.2126 * arr[:, :, 0] + 0.7152 * arr[:, :, 1] + 0.0722 * arr[:, :, 2]

    # 1. Crushed black fraction (lum < 0.03)
    crushed_black_fraction = float(np.mean(lum < 0.03))

    # 2. Rim red pixels: strong brick red hue
    # r > 0.40, g < 0.25, b < 0.25, r > (g + b) * 1.1
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    red_mask = (r > 0.40) & (g < 0.25) & (b < 0.25) & (r > (g + b) * 1.1)
    rim_red_pixels = int(np.sum(red_mask))

    # 3. Horizon band analysis (y: 15% to 35%)
    horizon_band = lum[int(h * 0.15):int(h * 0.35), :]
    row_means = np.mean(horizon_band, axis=1)
    row_diffs = np.abs(np.diff(row_means))
    stripe_score = float(np.mean(row_diffs) * 1000.0)

    # 4. Polyline contour detector on terrain (y: 35% to 85%)
    terrain_band = lum[int(h * 0.35):int(h * 0.85), :]
    # Vertical gradient to find horizontal/contour polylines
    vert_diff = np.abs(np.diff(terrain_band, axis=0))
    polyline_edges = np.sum((vert_diff > 0.22) & (terrain_band[1:, :] > 0.50))
    polyline_score = float(polyline_edges / (terrain_band.shape[0] * terrain_band.shape[1]) * 100.0)

    # 5. Horizon tilt angle estimation via edge orientation in upper 40%
    sky_ground_band = lum[int(h * 0.10):int(h * 0.40), int(w * 0.10):int(w * 0.90)]
    # Sobel gradients
    gy, gx = np.gradient(sky_ground_band)
    mag = np.hypot(gx, gy)
    strong_edges = mag > np.percentile(mag, 95)
    if np.sum(strong_edges) > 50:
        # Principal angle of strong edge gradients
        edge_angles = np.arctan2(gy[strong_edges], gx[strong_edges])
        # Horizon normal should be mostly vertical (~pi/2). Deviation from pi/2 is tilt:
        tilt_angles_deg = (edge_angles - np.pi/2) * (180.0 / np.pi)
        # Wrap to [-45, 45]
        tilt_angles_deg = (tilt_angles_deg + 180) % 180
        tilt_angles_deg[tilt_angles_deg > 90] -= 180
        horizon_tilt_deg = float(np.median(np.abs(tilt_angles_deg)))
    else:
        horizon_tilt_deg = 0.0

    return {
        "file": os.path.basename(path),
        "crushed_black_fraction": round(crushed_black_fraction, 4),
        "rim_red_pixels": rim_red_pixels,
        "stripe_score": round(stripe_score, 3),
        "polyline_score": round(polyline_score, 3),
        "horizon_tilt_deg": round(horizon_tilt_deg, 2),
        "mean_luminance": round(float(np.mean(lum)), 4)
    }

def main():
    files = sorted(glob.glob(os.path.join(SCREENSHOT_DIR, "*.png")))
    print(f"Analyzing {len(files)} baseline images...")
    results = []
    for f in files:
        res = analyze_image(f)
        results.append(res)
        print(f"[{res['file']}] CrushedBlack: {res['crushed_black_fraction']*100:.1f}%, RimRed: {res['rim_red_pixels']}px, Stripe: {res['stripe_score']:.2f}, Polyline: {res['polyline_score']:.2f}, HorizonTilt: {res['horizon_tilt_deg']}°")

    summary = {
        "count": len(results),
        "crushed_black_p95": float(np.percentile([r["crushed_black_fraction"] for r in results], 95)),
        "max_rim_red_pixels": max(r["rim_red_pixels"] for r in results),
        "avg_stripe_score": float(np.mean([r["stripe_score"] for r in results])),
        "avg_polyline_score": float(np.mean([r["polyline_score"] for r in results])),
        "results": results
    }

    with open(OUT_PATH, "w") as fp:
        json.dump(summary, fp, indent=2)
    print(f"Saved visual report to {OUT_PATH}")

if __name__ == "__main__":
    main()
