import os
from PIL import Image, ImageDraw, ImageFont

BASE_IMG = r"C:\Users\Asus\.gemini\antigravity\brain\b4635c3d-edaf-4d6d-a6c9-488ec4ec977a\screenshots\fix3_reconciliation\reproduction_1917x881_t36s.png"
OUT_IMG = r"C:\Users\Asus\.gemini\antigravity\brain\b4635c3d-edaf-4d6d-a6c9-488ec4ec977a\screenshots\fix3_reconciliation\reproduction_annotated_1917x881.png"

def create_annotated():
    im = Image.open(BASE_IMG).convert("RGBA")
    overlay = Image.new("RGBA", im.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Color palette
    box_red = (184, 59, 47, 220)      # --brick
    box_yellow = (235, 180, 50, 220)  # accent
    bg_tag = (31, 31, 31, 230)        # --charcoal-deep
    text_cream = (253, 251, 247, 255) # --cream

    annotations = [
        # (box_coords, tag_text, tag_pos)
        ((420, 14, 530, 44), "H1: Chip Overlap (Policy v1 / Prompt)", (420, 50)),
        ((1420, 14, 1590, 44), "H4: Red '2 long tasks' Badge", (1420, 50)),
        ((1670, 55, 1900, 240), "Q1-Q5: Speckle Radar (No scale/legend)", (1500, 250)),
        ((850, 220, 1150, 280), "G3: Thick White Rim Dashes", (850, 190)),
        ((1400, 240, 1550, 380), "G1/G2: Oversized Goal Beacon at Edge", (1400, 200)),
        ((500, 480, 800, 750), "K1/K2: Pure-Black Rocks (No Shadows)", (500, 440)),
        ((880, 460, 1080, 680), "R1-R4: Toy Box Robot (No Sensors)", (880, 420)),
        ((20, 100, 400, 800), "L1/L6: Console (Missing Episode Events)", (20, 70)),
        ((20, 840, 550, 875), "B1/B2: Build Stamp Hardcoded 21842619", (20, 810)),
        ((1800, 390, 1910, 420), "C1: Horizon at 45% (Spec 20-28%)", (1600, 430))
    ]

    for (x1, y1, x2, y2), text, (tx, ty) in annotations:
        draw.rectangle([x1, y1, x2, y2], outline=box_red, width=2)
        # Text badge background
        tag_w = len(text) * 7 + 14
        draw.rectangle([tx, ty, tx + tag_w, ty + 20], fill=bg_tag, outline=box_yellow, width=1)
        draw.text((tx + 6, ty + 3), text, fill=text_cream)
        # Connector line
        draw.line([(tx + 10, ty), ((x1 + x2) // 2, (y1 + y2) // 2)], fill=box_yellow, width=1)

    combined = Image.alpha_composite(im, overlay)
    combined.convert("RGB").save(OUT_IMG)
    print("Saved annotated reproduction to:", OUT_IMG)

if __name__ == "__main__":
    create_annotated()
