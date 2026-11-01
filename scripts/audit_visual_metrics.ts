import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

interface VisualMetricsResult {
  imageName: string;
  totalPixels: number;
  crushedBlackFraction: number; // fraction of pixels with luminance < 0.03
  rimRedPixelCount: number;     // count of pixels in rim region with strong brick red hue
  stripeScore: number;          // horizontal edge energy near horizon
  polylineScore: number;        // high-contrast thin line detection in terrain region
  meanLuminance: number;
}

function analyzeScreenshot(filePath: string): VisualMetricsResult {
  const fileData = fs.readFileSync(filePath);
  const png = PNG.sync.read(fileData);
  const { width, height, data } = png;
  const totalPixels = width * height;

  let crushedBlackCount = 0;
  let rimRedCount = 0;
  let sumLuminance = 0;

  // Horizon band: y between 15% and 35% of image height
  const horizonYStart = Math.floor(height * 0.15);
  const horizonYEnd = Math.floor(height * 0.35);
  const rowAvgLum: number[] = new Array(horizonYEnd - horizonYStart).fill(0);

  // Terrain region: y between 35% and 85% of image height
  const terrainYStart = Math.floor(height * 0.35);
  const terrainYEnd = Math.floor(height * 0.85);
  let polylineEdges = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx] / 255.0;
      const g = data[idx + 1] / 255.0;
      const b = data[idx + 2] / 255.0;

      // Relative luminance
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sumLuminance += lum;

      // Crushed black: lum < 0.03
      if (lum < 0.03) {
        crushedBlackCount++;
      }

      // Rim Red detector: check outer 25% of viewport where rim typically projects
      // Brick red hue: r > 0.45 && g < 0.28 && b < 0.25 (ratio r / (g+b) > 1.3)
      if (r > 0.40 && g < 0.25 && b < 0.25 && r > (g + b) * 1.1) {
        rimRedCount++;
      }

      // Horizontal stripe analysis in horizon band
      if (y >= horizonYStart && y < horizonYEnd) {
        rowAvgLum[y - horizonYStart] += lum / width;
      }

      // Polyline / contour contrast check in terrain region
      if (y >= terrainYStart && y < terrainYEnd && x > 0 && x < width - 1) {
        // High local contrast along vertical gradient (horizontal/contour line)
        const prevIdx = ((y - 1) * width + x) * 4;
        const prevLum = (0.2126 * data[prevIdx] + 0.7152 * data[prevIdx + 1] + 0.0722 * data[prevIdx + 2]) / 255.0;
        if (Math.abs(lum - prevLum) > 0.22 && lum > 0.50) {
          polylineEdges++;
        }
      }
    }
  }

  // Calculate stripe score as variance of row luminance differences
  let stripeDiffSum = 0;
  for (let k = 1; k < rowAvgLum.length; k++) {
    const diff = Math.abs(rowAvgLum[k] - rowAvgLum[k - 1]);
    stripeDiffSum += diff;
  }
  const stripeScore = Number((stripeDiffSum / rowAvgLum.length).toFixed(4));
  const polylineScore = Number((polylineEdges / ((terrainYEnd - terrainYStart) * width)).toFixed(4));

  return {
    imageName: path.basename(filePath),
    totalPixels,
    crushedBlackFraction: Number((crushedBlackCount / totalPixels).toFixed(4)),
    rimRedPixelCount: rimRedCount,
    stripeScore,
    polylineScore,
    meanLuminance: Number((sumLuminance / totalPixels).toFixed(4)),
  };
}

async function runAudit() {
  const dir = 'C:\\Users\\Asus\\.gemini\\antigravity\\brain\\b4635c3d-edaf-4d6d-a6c9-488ec4ec977a\\screenshots\\bugfix_baseline';
  if (!fs.existsSync(dir)) {
    console.error('Screenshot directory does not exist yet:', dir);
    return;
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png'));
  console.log(`Analyzing ${files.length} baseline screenshots in ${dir} ...\n`);

  const results: VisualMetricsResult[] = [];
  for (const f of files) {
    try {
      const res = analyzeScreenshot(path.join(dir, f));
      results.push(res);
      console.log(`[${res.imageName}] CrushedBlack: ${(res.crushedBlackFraction * 100).toFixed(2)}%, RimRed: ${res.rimRedPixelCount}px, StripeScore: ${res.stripeScore}, PolylineScore: ${res.polylineScore}`);
    } catch (e: any) {
      console.warn(`Error analyzing ${f}:`, e.message);
    }
  }

  const outPath = path.resolve(process.cwd(), 'docs/visual-metrics-baseline.json');
  fs.writeFileSync(outPath, JSON.stringify({ timestamp: new Date().toISOString(), count: results.length, results }, null, 2));
  console.log(`\nSaved visual metrics to ${outPath}`);
}

runAudit().catch(console.error);
