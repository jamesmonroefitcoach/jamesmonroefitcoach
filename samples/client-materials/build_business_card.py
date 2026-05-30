#!/usr/bin/env python3
"""Generate the Monroe Fit Coach postcard-sized business card.

6" × 4" landscape, two pages (front + back), with 0.125" bleed and corner
crop marks — print-ready for any commercial printer (Moo, Vistaprint, local
shop). "Old-gym editorial" theme matching the app's brand: cream paper, warm
ink, rust accent, condensed display + italic serif statements.

Contact placeholders ([phone] / [email] / @[instagram]) per the side-quest
plan; monroefitcoach.com is the real site domain from SETUP.md.

    python3 build_business_card.py     # -> business-card.pdf
"""
import os
from reportlab.pdfgen import canvas
from reportlab.lib.colors import Color

# ─── palette (matches the app's "old-gym editorial" theme) ───
INK   = Color(0.090, 0.075, 0.067)   # #171311
RUST  = Color(0.659, 0.239, 0.169)   # #a83d2b
CREAM = Color(0.961, 0.937, 0.894)   # #f5efe4
PAPER = Color(0.984, 0.969, 0.937)   # #fbf7ef
MUTED = Color(0.478, 0.435, 0.388)   # #7a6f63
LINE  = Color(0.847, 0.804, 0.722)   # #d8cdb8

# ─── geometry ───
W = 6 * 72                  # trim width  = 432 pt
H = 4 * 72                  # trim height = 288 pt
BLEED = 9                   # 0.125 in
PAGE_W = W + 2 * BLEED      # 450 pt
PAGE_H = H + 2 * BLEED      # 306 pt
TRIM_L = BLEED
TRIM_B = BLEED
TRIM_R = BLEED + W
TRIM_T = BLEED + H
SAFE = 14                   # inset from trim for content
BAR = 10                    # rust design bar (visible inside trim)
BOLD = "Helvetica-Bold"
REG  = "Helvetica"
ITAL = "Times-Italic"

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "business-card.pdf")
c = canvas.Canvas(OUT, pagesize=(PAGE_W, PAGE_H))
c.setTitle("Monroe Fit Coach — Business Card")
c.setAuthor("Monroe Fit Coach")


def fill_bg():
    c.setFillColor(CREAM)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)


def crop_marks():
    c.setStrokeColor(INK); c.setLineWidth(0.4)
    L, G = 7, 4  # tick length, gap from trim
    for (x, y) in [(TRIM_L, TRIM_B), (TRIM_R, TRIM_B), (TRIM_L, TRIM_T), (TRIM_R, TRIM_T)]:
        dx = 1 if x == TRIM_L else -1
        dy = 1 if y == TRIM_B else -1
        # horizontal tick (outside trim)
        c.line(x - dx * G, y, x - dx * (G + L), y)
        # vertical tick (outside trim)
        c.line(x, y - dy * G, x, y - dy * (G + L))


def wordmark(x, y, size, anchor="left"):
    """'MONROE FIT COACH' with rust FIT, drawn at baseline (x, y)."""
    parts = [("MONROE ", INK), ("FIT", RUST), (" COACH", INK)]
    total = sum(c.stringWidth(t, BOLD, size) for t, _ in parts)
    if anchor == "right":
        x -= total
    elif anchor == "center":
        x -= total / 2
    for t, col in parts:
        c.setFillColor(col); c.setFont(BOLD, size); c.drawString(x, y, t)
        x += c.stringWidth(t, BOLD, size)


def double_rule(x1, y, x2):
    c.setStrokeColor(INK); c.setLineWidth(0.6)
    c.line(x1, y, x2, y); c.line(x1, y - 2, x2, y - 2)


# ============================== FRONT ==============================
fill_bg()
# left rust bar (bleeds off the left edge)
c.setFillColor(RUST); c.rect(0, 0, BLEED + BAR, PAGE_H, fill=1, stroke=0)

CX_L = BLEED + BAR + SAFE
CX_R = TRIM_R - SAFE
CY_T = TRIM_T - SAFE
CY_B = TRIM_B + SAFE

# top kicker
c.setFont(BOLD, 7.2); c.setFillColor(MUTED)
c.drawString(CX_L, CY_T - 4, "MONROE FIT COACH")
c.drawRightString(CX_R, CY_T - 4, "MONROEFITCOACH.COM")
double_rule(CX_L, CY_T - 10, CX_R)

# stacked name (editorial portrait pairing)
c.setFillColor(INK); c.setFont(BOLD, 36)
c.drawString(CX_L, 240, "JAMES")
c.drawString(CX_L, 204, "MONROE")

# subtitle — letterspaced, with rust separators
subtitle_segments = ["STRENGTH", "RECOMPOSITION", "BOXING", "EDUCATION"]
sx, sy = CX_L, 184
c.setFont(BOLD, 7.8)
for i, seg in enumerate(subtitle_segments):
    if i > 0:
        c.setFillColor(RUST); c.drawString(sx, sy, "  ·  ")
        sx += c.stringWidth("  ·  ", BOLD, 7.8)
    c.setFillColor(MUTED); c.drawString(sx, sy, seg)
    sx += c.stringWidth(seg, BOLD, 7.8)

# italic quote tagline
c.setFont(ITAL, 11.5); c.setFillColor(INK)
c.drawString(CX_L, 158, "“Keeping the full picture in mind.”")

# ─── portrait placeholder (right side) ───
PHOTO_X1, PHOTO_X2 = 273, 413          # ~140 pt wide (≈ 1.94")
PHOTO_Y1, PHOTO_Y2 = 88, 256           # ~168 pt tall (≈ 2.33") — roughly 4:5
# faint paper fill
c.setFillColor(PAPER)
c.rect(PHOTO_X1, PHOTO_Y1, PHOTO_X2 - PHOTO_X1, PHOTO_Y2 - PHOTO_Y1, fill=1, stroke=0)
# dashed rust border
c.setDash([3, 2])
c.setStrokeColor(RUST); c.setLineWidth(0.6)
c.rect(PHOTO_X1, PHOTO_Y1, PHOTO_X2 - PHOTO_X1, PHOTO_Y2 - PHOTO_Y1, fill=0, stroke=1)
c.setDash([])  # reset solid
# corner brackets (viewfinder feel)
c.setStrokeColor(INK); c.setLineWidth(1.0)
BR = 10
for (cx, cy, dx, dy) in [
    (PHOTO_X1, PHOTO_Y1, +1, +1),
    (PHOTO_X2, PHOTO_Y1, -1, +1),
    (PHOTO_X1, PHOTO_Y2, +1, -1),
    (PHOTO_X2, PHOTO_Y2, -1, -1),
]:
    c.line(cx, cy, cx + dx * BR, cy)
    c.line(cx, cy, cx, cy + dy * BR)
# center labels
mx = (PHOTO_X1 + PHOTO_X2) / 2
my = (PHOTO_Y1 + PHOTO_Y2) / 2
c.setFont(BOLD, 9); c.setFillColor(MUTED)
label = "[ PORTRAIT ]"
c.drawString(mx - c.stringWidth(label, BOLD, 9) / 2, my + 2, label)
c.setFont(REG, 7); c.setFillColor(MUTED)
sub = "drop a photo here"
c.drawString(mx - c.stringWidth(sub, REG, 7) / 2, my - 10, sub)

# bottom rule + contact row
bot_y = CY_B + 22
double_rule(CX_L, bot_y, CX_R)
c.setFont(REG, 8); c.setFillColor(INK)
contact_parts = ["[phone]", "[email]", "monroefitcoach.com", "@[instagram]"]
gap = "    ·    "
contact = gap.join(contact_parts)
# draw with rust dots for kicks
xx = CX_L
sep_w = c.stringWidth(gap, REG, 8)
for i, p in enumerate(contact_parts):
    if i > 0:
        c.setFillColor(RUST); c.drawString(xx, CY_B + 2, gap)
        xx += sep_w
    c.setFillColor(INK); c.drawString(xx, CY_B + 2, p)
    xx += c.stringWidth(p, REG, 8)

crop_marks()
c.showPage()

# ============================== BACK ==============================
fill_bg()
# bottom rust bar (full bleed)
c.setFillColor(RUST); c.rect(0, 0, PAGE_W, BLEED + BAR, fill=1, stroke=0)

CX_L2 = TRIM_L + SAFE
CX_R2 = TRIM_R - SAFE
CY_T2 = TRIM_T - SAFE
CY_B2 = BLEED + BAR + SAFE

# top wordmark + URL right
wordmark(CX_L2, CY_T2 - 12, size=16, anchor="left")
c.setFont(REG, 8); c.setFillColor(MUTED)
c.drawRightString(CX_R2, CY_T2 - 8, "monroefitcoach.com")

# double rule under top
rule_y = CY_T2 - 22
double_rule(CX_L2, rule_y, CX_R2)

# section title HOW I TRAIN
c.setFillColor(RUST); c.setFont(BOLD, 12)
c.drawString(CX_L2, rule_y - 22, "HOW I TRAIN")

# italic intro (two lines)
c.setFont(ITAL, 9.5); c.setFillColor(INK)
intro_y = rule_y - 38
c.drawString(CX_L2, intro_y,        "A generalist by design — I build clients who can do everything well:")
c.drawString(CX_L2, intro_y - 12,   "strong, balanced, well-conditioned, well-fed. Boxing is the one specialty.")


def col_block(x, top, label, items, col_w):
    c.setFont(BOLD, 8); c.setFillColor(RUST)
    c.drawString(x, top, label)
    c.setStrokeColor(LINE); c.setLineWidth(0.5)
    c.line(x, top - 3, x + c.stringWidth(label, BOLD, 8) + 18, top - 3)
    yy = top - 16
    for it in items:
        c.setFillColor(RUST); c.setFont(BOLD, 11)
        c.drawString(x, yy - 1, "·")
        c.setFillColor(INK); c.setFont(REG, 9)
        c.drawString(x + 9, yy, it)
        yy -= 12


# two columns
col_top = intro_y - 30
col_w = (CX_R2 - CX_L2 - 20) / 2
col_block(CX_L2, col_top, "FOUNDATION", [
    "Unilateral & deep core",
    "The six main movements",
    "Movement quality first",
], col_w)
col_block(CX_L2 + col_w + 20, col_top, "PROGRESSION", [
    "Speed · Agility · Quickness",
    "Maximal strength (PR work)",
    "Balance & mobility",
    "Boxing fundamentals",
], col_w)

# centered pull quote (signature sentiment)
quote_y = 95
c.setFont(ITAL, 14); c.setFillColor(INK)
quote = "“I do it because I care.”"
c.drawString((PAGE_W - c.stringWidth(quote, ITAL, 14)) / 2, quote_y, quote)
c.setFont(BOLD, 7); c.setFillColor(MUTED)
sig = "— JAMES MONROE"
c.drawString((PAGE_W - c.stringWidth(sig, BOLD, 7)) / 2, quote_y - 13, sig)

# pillar row above rust bar
pillars = "STRENGTH   ·   CARDIO   ·   NUTRITION   ·   POSTURE   ·   RANGE OF MOTION   ·   MOBILITY"
c.setFont(BOLD, 7.2); c.setFillColor(MUTED)
pw = c.stringWidth(pillars, BOLD, 7.2)
c.drawString((PAGE_W - pw) / 2, CY_B2 - 4, pillars)

crop_marks()
c.showPage()

c.save()
print("wrote", OUT)
