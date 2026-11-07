import os
import json
import numpy as np
from PIL import Image

IMAGE_PATH = r"C:\Users\Asus\.gemini\antigravity\brain\b4635c3d-edaf-4d6d-a6c9-488ec4ec977a\screenshots\fix3_reconciliation\reproduction_1917x881_t36s.png"
OUT_JSON = r"D:\project all\nvidia\docs\fix3_reconciliation_metrics.json"

def analyze():
    im = Image.open(IMAGE_PATH).convert("RGB")
    arr = np.array(im, dtype=np.float32) / 255.0
    h, w, _ = arr.shape
    print(f"Loaded image: {w}x{h}")

    lum = 0.2126 * arr[:, :, 0] + 0.7152 * arr[:, :, 1] + 0.0722 * arr[:, :, 2]

    # 1. 3D Canvas area (excluding 48px header and 36px playback bar)
    canvas_lum = lum[48:h-36, :]
    crushed_black = np.mean(canvas_lum < 0.03)

    # 2. Rock pixels: Debris is near-black (lum < 0.04) in the terrain region
    terrain_region = lum[int(h * 0.40):int(h * 0.85), int(w * 0.15):int(w * 0.85)]
    rock_dark_pixels = np.mean(terrain_region < 0.04)

    # 3. Horizon detection: gradient in upper half
    sky_ground_slice = lum[int(h * 0.15):int(h * 0.50), int(w * 0.50)]
    grad = np.abs(np.diff(sky_ground_slice))
    horizon_idx = int(h * 0.15) + int(np.argmax(grad))
    horizon_pct = (horizon_idx / h) * 100.0

    # 4. White dashes at horizon (y: 200 to 400)
    horizon_band = canvas_lum[int(h * 0.20):int(h * 0.45), :]
    bright_white_dashes = np.sum(horizon_band > 0.85)

    # 5. Goal beacon detection: Green/sage cone (g > r and g > b) extending high into sky (y < 200)
    r, g, b = arr[:int(h * 0.35), :, 0], arr[:int(h * 0.35), :, 1], arr[:int(h * 0.35), :, 2]
    beacon_pixels = np.sum((g > r * 1.1) & (g > b * 1.05) & (g > 0.25))

    # 6. Radar box (top right: y: 48 to 220, x: w - 240 to w)
    radar_area = lum[48:220, w - 240:w]
    radar_white_speckles = np.sum(radar_area > 0.80)

    results = {
        "viewport": f"{w}x{h}",
        "crushed_black_percent": round(float(crushed_black * 100), 2),
        "rock_dark_percent": round(float(rock_dark_pixels * 100), 2),
        "horizon_position_percent": round(float(horizon_pct), 1),
        "bright_white_dash_pixels": int(bright_white_dashes),
        "oversized_beacon_high_pixels": int(beacon_pixels),
        "radar_speckle_pixels": int(radar_white_speckles),
        "mean_canvas_luminance": round(float(np.mean(canvas_lum)), 4)
    }

    print(json.dumps(results, indent=2))
    with open(OUT_JSON, "w") as fp:
        json.dump(results, fp, indent=2)

if __name__ == "__main__":
    analyze()
