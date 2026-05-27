#!/usr/bin/env python3
"""Generate a fillable AcroForm PDF version of the Monroe Fit Coach workout
sheet — the format to text/email to clients (opens + types in any native PDF
viewer, unlike the interactive HTML).

Fixed layout (PDF can't add rows/days on the fly like the HTML): a client
header once, then DAYS day blocks, each with a Date/Weight/Sleep bar and a
movement table — Movement & Equipment, Set 1..SETS (Reps + Wt), Load/Notes.

    python3 build_workout_pdf.py            # -> workout-sheet.pdf
"""
import os
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import Color, transparent

# ─── palette (matches the app's "old-gym editorial" theme) ───
INK   = Color(0.090, 0.075, 0.067)   # #171311
RUST  = Color(0.659, 0.239, 0.169)   # #a83d2b
BAR   = Color(0.937, 0.906, 0.843)   # #efe7d7
GRID  = Color(0.725, 0.678, 0.596)   # #b9ad98
ZEBRA = Color(0.980, 0.965, 0.933)   # #faf6ee
MUTED = Color(0.478, 0.435, 0.388)   # #7a6f63

PAGE_W, PAGE_H = letter
M = 36
CONTENT_L = M
CONTENT_R = PAGE_W - M
CONTENT_W = CONTENT_R - CONTENT_L          # 540

# columns: Movement | (Reps,Wt) x3 | Load/Notes
COL_W = [170, 42, 48, 42, 48, 42, 48, 100]
assert sum(COL_W) == CONTENT_W, sum(COL_W)
COL_X = [CONTENT_L]
for w in COL_W:
    COL_X.append(COL_X[-1] + w)

DAYS = 3
ROWS = 10
SETS = 3
ROW_H = 22
HDR_GROUP_H = 15
HDR_SUB_H = 13
HDR_H = HDR_GROUP_H + HDR_SUB_H            # 28
BAR_H = 24
BLOCK_GAP = 16
SERIF = "Times-Roman"
SANS = "Helvetica-Bold"

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "workout-sheet.pdf")

c = canvas.Canvas(OUT, pagesize=letter)
c.setTitle("Monroe Fit Coach — Workout Sheet")
c.setAuthor("Monroe Fit Coach")


def field(name, x, y, w, h, fs=10, center=False, tooltip=None):
    kwargs = dict(
        name=name, x=x, y=y, width=w, height=h,
        borderWidth=0, forceBorder=False,
        fontName=SERIF, fontSize=fs,
        textColor=INK, fillColor=transparent, relative=False,
    )
    if tooltip:
        kwargs["tooltip"] = tooltip
    # `center` kept for call-site clarity; this reportlab build left-aligns.
    _ = center
    c.acroForm.textfield(**kwargs)


def masthead(top):
    c.setFont(SANS, 20)
    x = CONTENT_L
    c.setFillColor(INK); c.drawString(x, top - 18, "MONROE ")
    w1 = c.stringWidth("MONROE ", SANS, 20)
    c.setFillColor(RUST); c.drawString(x + w1, top - 18, "FIT")
    w2 = c.stringWidth("FIT", SANS, 20)
    c.setFillColor(INK); c.drawString(x + w1 + w2, top - 18, " COACH")
    c.setFont(SANS, 8); c.setFillColor(MUTED)
    c.drawRightString(CONTENT_R, top - 15, "WORKOUT SHEET")
    c.setStrokeColor(INK); c.setLineWidth(1)
    c.line(CONTENT_L, top - 24, CONTENT_R, top - 24)
    c.line(CONTENT_L, top - 26.5, CONTENT_R, top - 26.5)
    return top - 33


def labeled_field(x, top, w, label, fname, fs=11):
    c.setFont(SANS, 6.5); c.setFillColor(MUTED)
    c.drawString(x, top - 7, label.upper())
    fh = 15
    fld_bottom = top - 9 - fh
    field(fname, x, fld_bottom + 2, w, fh - 2, fs=fs, tooltip=label)
    c.setStrokeColor(INK); c.setLineWidth(0.7)
    c.line(x, fld_bottom + 1, x + w, fld_bottom + 1)
    return fld_bottom


def client_header(top):
    half = CONTENT_W / 2 - 8
    b1a = labeled_field(CONTENT_L, top, half, "Client Name", "client_name")
    b1b = labeled_field(CONTENT_L + CONTENT_W / 2 + 8, top, half, "Goal", "goal")
    b1 = min(b1a, b1b)
    b2 = labeled_field(CONTENT_L, b1 - 6, CONTENT_W, "Deficit / Nutrition", "nutrition")
    c.setFont(SERIF, 7.5); c.setFillColor(MUTED)
    c.drawString(CONTENT_L, b2 - 11,
                 "Fillable — type in any field, then save/share the PDF; or print blank to handwrite.")
    return b2 - 18


def day_bar(top, day_num):
    bottom = top - BAR_H
    c.setFillColor(BAR); c.rect(CONTENT_L, bottom, CONTENT_W, BAR_H, fill=1, stroke=0)
    c.setStrokeColor(INK); c.setLineWidth(0.7); c.rect(CONTENT_L, bottom, CONTENT_W, BAR_H, fill=0, stroke=1)
    c.setFont(SANS, 9); c.setFillColor(RUST)
    c.drawString(CONTENT_L + 6, bottom + 8, "DAY %d" % day_num)
    tag_w = 44
    segs = [("DATE", "date"), ("CURRENT WEIGHT", "weight"), ("SLEEP (HRS)", "sleep")]
    seg = (CONTENT_W - tag_w - 12) / len(segs)
    x = CONTENT_L + tag_w + 8
    for label, key in segs:
        c.setFont(SANS, 6.5); c.setFillColor(MUTED)
        c.drawString(x, bottom + 14, label)
        fw = seg - 10
        field("d%d_%s" % (day_num, key), x, bottom + 3.5, fw, 9, fs=9, tooltip="Day %d %s" % (day_num, label.title()))
        c.setStrokeColor(INK); c.setLineWidth(0.5); c.line(x, bottom + 3, x + fw, bottom + 3)
        x += seg
    return bottom


def table_header(top):
    group_bottom = top - HDR_GROUP_H
    sub_bottom = group_bottom - HDR_SUB_H
    c.setFillColor(BAR)
    c.rect(COL_X[0], sub_bottom, COL_W[0], HDR_H, fill=1, stroke=0)
    c.rect(COL_X[7], sub_bottom, COL_W[7], HDR_H, fill=1, stroke=0)
    for s in range(SETS):
        gx = COL_X[1 + 2 * s]; gw = COL_W[1 + 2 * s] + COL_W[2 + 2 * s]
        c.rect(gx, group_bottom, gw, HDR_GROUP_H, fill=1, stroke=0)
    for ci in range(1, 7):
        c.rect(COL_X[ci], sub_bottom, COL_W[ci], HDR_SUB_H, fill=1, stroke=0)
    c.setStrokeColor(INK); c.setLineWidth(0.7)
    c.rect(COL_X[0], sub_bottom, COL_W[0], HDR_H, fill=0, stroke=1)
    c.rect(COL_X[7], sub_bottom, COL_W[7], HDR_H, fill=0, stroke=1)
    for s in range(SETS):
        gx = COL_X[1 + 2 * s]; gw = COL_W[1 + 2 * s] + COL_W[2 + 2 * s]
        c.rect(gx, group_bottom, gw, HDR_GROUP_H, fill=0, stroke=1)
    for ci in range(1, 7):
        c.rect(COL_X[ci], sub_bottom, COL_W[ci], HDR_SUB_H, fill=0, stroke=1)
    c.setFillColor(INK)
    c.setFont(SANS, 7)
    c.drawString(COL_X[0] + 4, sub_bottom + HDR_H / 2 - 3, "MOVEMENT & EQUIPMENT")
    c.drawString(COL_X[7] + 4, sub_bottom + HDR_H / 2 - 3, "LOAD / NOTES")
    for s in range(SETS):
        gx = COL_X[1 + 2 * s]; gw = COL_W[1 + 2 * s] + COL_W[2 + 2 * s]
        c.setFont(SANS, 7)
        c.drawCentredString(gx + gw / 2, group_bottom + 4, "SET %d" % (s + 1))
        c.setFont(SANS, 6.5)
        c.drawCentredString(COL_X[1 + 2 * s] + COL_W[1 + 2 * s] / 2, sub_bottom + 4, "REPS")
        c.drawCentredString(COL_X[2 + 2 * s] + COL_W[2 + 2 * s] / 2, sub_bottom + 4, "WT")
    return sub_bottom


def body_rows(top, day):
    y = top
    for r in range(ROWS):
        rb = y - ROW_H
        zebra = (r % 2 == 1)
        for ci in range(8):
            if zebra:
                c.setFillColor(ZEBRA); c.rect(COL_X[ci], rb, COL_W[ci], ROW_H, fill=1, stroke=0)
            c.setStrokeColor(GRID); c.setLineWidth(0.5)
            c.rect(COL_X[ci], rb, COL_W[ci], ROW_H, fill=0, stroke=1)
            is_text_col = ci in (0, 7)
            field("d%d_r%d_c%d" % (day, r, ci), COL_X[ci] + 2, rb + 3, COL_W[ci] - 4, ROW_H - 6,
                  fs=10 if is_text_col else 9, center=not is_text_col)
        y = rb
    return y


# ─── layout ───
y = PAGE_H - M
y = masthead(y)
y = client_header(y)

for day in range(1, DAYS + 1):
    needed = BLOCK_GAP + BAR_H + HDR_H + ROWS * ROW_H
    if y - needed < M:
        c.showPage()
        y = PAGE_H - M
        y = masthead(y)
    y -= BLOCK_GAP
    y = day_bar(y, day)
    y = table_header(y)
    y = body_rows(y, day)

c.showPage()
c.save()
print("wrote", OUT)
