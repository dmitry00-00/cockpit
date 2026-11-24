#!/usr/bin/env python3
"""Generate the BA17 1:1, two-page A4 paper prototype from the project calendar."""

from __future__ import annotations

import html
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
CALENDAR = ROOT / "content/calendars/harptos.json"

INK = "#302820"
BRASS = "#8c6337"
PLUM = "#4d3548"
PAPER = "#fbf8f0"
MUTED = "#71685c"
RULE = "#b9a98d"


def txt(x: float, y: float, value: str, size: float = 3.5, *, anchor: str = "start", color: str = INK, weight: str = "normal", extra: str = "") -> str:
    return (f'<text x="{x:.2f}" y="{y:.2f}" text-anchor="{anchor}" '
            f'font-size="{size:.2f}" fill="{color}" font-weight="{weight}" {extra}>'
            f'{html.escape(value)}</text>')


def line(x1: float, y1: float, x2: float, y2: float, *, color: str = RULE, width: float = 0.28, dash: str = "") -> str:
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="{color}" stroke-width="{width:.2f}"{d}/>'


def circle(cx: float, cy: float, r: float, *, stroke: str = INK, width: float = 0.35, fill: str = "none", hole: bool = False) -> str:
    cls = ' class="hole"' if hole else ""
    return f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}" stroke="{stroke}" stroke-width="{width:.2f}" fill="{fill}"{cls}/>'


def rect(x: float, y: float, w: float, h: float, *, stroke: str = RULE, width: float = 0.3, fill: str = "none", dash: str = "") -> str:
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" stroke="{stroke}" stroke-width="{width:.2f}" fill="{fill}"{d}/>'


def page_start(title: str, description: str) -> list[str]:
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297" role="img">',
        f'<title>{html.escape(title)}</title>',
        f'<desc>{html.escape(description)}</desc>',
        '<style>text{font-family:Georgia,"Times New Roman",serif}.cut{stroke:#8c6337;stroke-dasharray:1.5 1.2}.hole{fill:#fffdf7;stroke:#8c6337;stroke-width:.35}.tiny{font-size:2.8px}</style>',
        f'<rect x="0" y="0" width="210" height="297" fill="{PAPER}"/>',
    ]


def polar(cx: float, cy: float, radius: float, angle_deg: float) -> tuple[float, float]:
    radians = math.radians(angle_deg)
    return cx + radius * math.sin(radians), cy - radius * math.cos(radians)


def arrow(cx: float, cy: float, length: float, width: float, *, color: str = BRASS) -> str:
    """An upright cutout pointer; its hole is at (cx, cy), tip points to 12 o'clock."""
    shoulder = length - 5.5
    shaft = width * 0.34
    pts = [
        (cx, cy - length),
        (cx + width * 0.55, cy - shoulder),
        (cx + shaft, cy - shoulder),
        (cx + shaft, cy - 3.7),
        (cx + width * 0.95, cy - 1.2),
        (cx + width * 0.72, cy + 1.4),
        (cx - width * 0.72, cy + 1.4),
        (cx - width * 0.95, cy - 1.2),
        (cx - shaft, cy - 3.7),
        (cx - shaft, cy - shoulder),
        (cx - width * 0.55, cy - shoulder),
    ]
    path = " ".join(f'{x:.2f},{y:.2f}' for x, y in pts)
    return f'<polygon points="{path}" fill="{color}" stroke="{INK}" stroke-width=".35"/>' + circle(cx, cy, 1.5, stroke=INK, width=0.35, fill=PAPER, hole=True)


def build_base(calendar: dict) -> str:
    months = calendar["months"]
    festivals = calendar["intercalary"]
    parts = page_start(
        "БА17 — лист 1, основание временного прибора",
        "Лист A4 в масштабе 1:1. Вырезать панель 190 на 145 миллиметров. Два циферблата используют вращающиеся бумажные указатели.",
    )
    parts += [
        txt(10, 15, "БА17 · ЛИСТ 1 ИЗ 2 · ОСНОВАНИЕ", 6.0, color=PLUM, weight="bold"),
        txt(10, 22, "Печать A4, масштаб 100%. Перед сборкой измерьте контрольный квадрат 50 × 50 мм.", 3.3, color=MUTED),
        rect(10, 30, 190, 145, stroke=BRASS, width=0.7, fill="#fffdf8"),
        txt(15, 38, "АСТРОЛЯБИЯ · ГОДОВОЙ КРУГ", 4.1, color=PLUM, weight="bold"),
        txt(195, 38, "ГОД: __________ DR", 3.5, anchor="end"),
        line(15, 41, 195, 41, color=BRASS, width=0.35),
        txt(58, 49, "МЕСЯЦ", 3.1, anchor="middle", color=MUTED),
        txt(151, 49, "ЧАСЫ ХАРПТОСА · 24 ЧАСА", 3.4, anchor="middle", color=PLUM, weight="bold"),
    ]

    acx, acy, ar = 58.0, 88.0, 34.0
    parts += [circle(acx, acy, ar, stroke=BRASS, width=0.65), circle(acx, acy, 29.0, stroke=RULE, width=0.25), circle(acx, acy, 13.0, stroke=RULE, width=0.25)]
    for i, month in enumerate(months):
        angle = i * 30
        x1, y1 = polar(acx, acy, 29.0, angle)
        x2, y2 = polar(acx, acy, 33.8, angle)
        parts.append(line(x1, y1, x2, y2, color=BRASS, width=0.45))
        lx, ly = polar(acx, acy, 24.3, angle)
        # Short codes fit the 30-degree sectors; the complete, sourced names are in the legend below.
        code = month["name"][:3].upper()
        if month["name"] == "Eleasis":
            code = "EAS"
        elif month["name"] == "Eleint":
            code = "EIN"
        parts.append(txt(lx, ly + 1.0, code, 2.65, anchor="middle", color=PLUM, weight="bold"))
    parts += [
        circle(acx, acy, 1.55, stroke=INK, width=0.45, fill=PAPER, hole=True),
        txt(acx, acy + 6.0, "УКАЗАТЕЛЬ", 2.65, anchor="middle", color=MUTED),
        txt(acx, acy + 9.4, "МЕСЯЦА", 2.65, anchor="middle", color=MUTED),
    ]

    cx, cy, r = 151.0, 88.0, 27.0
    parts += [circle(cx, cy, r, stroke=BRASS, width=0.65), circle(cx, cy, 21.1, stroke=RULE, width=0.25)]
    for hour in range(24):
        angle = hour * 15
        x1, y1 = polar(cx, cy, 22.2 if hour % 4 == 0 else 24.2, angle)
        x2, y2 = polar(cx, cy, 26.7, angle)
        parts.append(line(x1, y1, x2, y2, color=BRASS if hour % 4 == 0 else RULE, width=0.42 if hour % 4 == 0 else 0.22))
        lx, ly = polar(cx, cy, 18.9, angle)
        parts.append(txt(lx, ly + 0.85, f"{hour:02d}", 2.45, anchor="middle", color=INK, weight="bold" if hour % 4 == 0 else "normal"))
    parts += [
        circle(cx, cy, 1.55, stroke=INK, width=0.45, fill=PAPER, hole=True),
        txt(cx, cy + 6.1, "МИНУТЫ", 2.55, anchor="middle", color=MUTED),
        line(cx - 7.0, cy + 9.0, cx + 7.0, cy + 9.0, color=INK, width=0.28),
    ]

    parts += [
        txt(15, 127, "ДЕНЬ / ПРАЗДНИК:", 3.1, color=MUTED),
        line(50, 127.4, 91, 127.4, color=INK, width=0.3),
        txt(108, 127, "ВРЕМЯ: поворот указателя · минуты впишите ниже", 2.95, color=MUTED),
        line(15, 131, 195, 131, color=RULE, width=0.25),
    ]

    # Three compact columns keep full names readable on the mounted board.
    columns = [15, 78, 141]
    rows = [137.2, 142.4, 147.6, 152.8]
    for i, month in enumerate(months):
        col = i // 4
        row = i % 4
        parts.append(txt(columns[col], rows[row], f"{i + 1:02d}  {month['name']}", 3.0))
    festival_names = [item["name"] for item in festivals]
    festival_line_1 = " · ".join(festival_names[:3])
    festival_line_2 = " · ".join(festival_names[3:])
    parts += [
        line(15, 156, 195, 156, color=RULE, width=0.25),
        txt(15, 161, f"ДНИ ВНЕ МЕСЯЦЕВ: {festival_line_1}", 2.7, color=PLUM),
        txt(15, 166, f"{festival_line_2}", 2.7, color=PLUM),
        txt(15, 171.3, "* Shieldmeet — используйте только если он есть в календаре выбранного года.", 2.65, color=MUTED),
    ]

    parts += [
        txt(10, 190, "Вырезать по внешней линии; отверстия центров пробить после наклейки на подложку.", 3.2, color=MUTED),
        rect(145, 207, 50, 50, stroke=BRASS, width=0.55, fill="none"),
        txt(170, 264, "КОНТРОЛЬ 50 × 50 мм", 3.1, anchor="middle", color=PLUM, weight="bold"),
        txt(10, 283, "Бумажный макет · без электроники · состояние кампании ведётся отдельно в приложении.", 3.0, color=MUTED),
        '</svg>',
    ]
    return "\n".join(parts)


def build_parts() -> str:
    parts = page_start(
        "БА17 — лист 2, подвижные детали",
        "Лист A4 в масштабе 1:1. Вырезать два указателя и четыре бумажные шайбы; собрать на разрезных канцелярских заклёпках.",
    )
    parts += [
        txt(10, 15, "БА17 · ЛИСТ 2 ИЗ 2 · ПОДВИЖНЫЕ ДЕТАЛИ", 6.0, color=PLUM, weight="bold"),
        txt(10, 22, "Печать A4, масштаб 100%. Контурная линия — рез. Круг в центре указателя — отверстие Ø3 мм.", 3.25, color=MUTED),
        txt(54, 33, "УКАЗАТЕЛЬ МЕСЯЦА", 3.8, anchor="middle", color=PLUM, weight="bold"),
        txt(54, 39, "длина 32 мм", 3.0, anchor="middle", color=MUTED),
        arrow(54, 91, 32.0, 5.2),
        txt(132, 33, "ЧАСОВАЯ СТРЕЛКА", 3.8, anchor="middle", color=PLUM, weight="bold"),
        txt(132, 39, "длина 23 мм", 3.0, anchor="middle", color=MUTED),
        arrow(132, 91, 23.0, 4.7, color="#a9783e"),
        txt(54, 101, "Вырезать по контуру", 2.9, anchor="middle", color=MUTED),
        txt(132, 101, "Вырезать по контуру", 2.9, anchor="middle", color=MUTED),
        txt(10, 121, "БУМАЖНЫЕ ШАЙБЫ · 4 ШТ.", 3.8, color=PLUM, weight="bold"),
    ]
    for i, (x, y) in enumerate([(21, 137), (45, 137), (69, 137), (93, 137)], 1):
        parts.extend([circle(x, y, 5.0, stroke=BRASS, width=0.4), circle(x, y, 1.5, stroke=INK, width=0.35, fill=PAPER, hole=True), txt(x, y + 9, f"{i}", 2.6, anchor="middle", color=MUTED)])

    parts += [
        txt(10, 166, "СБОРКА", 4.0, color=PLUM, weight="bold"),
        txt(10, 174, "1. Напечатайте оба листа на плотной бумаге; квадрат должен быть 50 ± 1 мм.", 3.15),
        txt(10, 181, "2. Лист 1 наклейте на переплётный картон 1–2 мм и вырежьте панель 190 × 145 мм.", 3.15),
        txt(10, 188, "3. Пробейте два отверстия Ø3 мм по центрам циферблатов; вырежьте стрелки и шайбы.", 3.15),
        txt(10, 195, "4. На каждой оси: шайба → стрелка → шайба → разрезная заклёпка; оставьте ход свободным.", 3.15),
        txt(10, 202, "5. Подклейте снизу четыре противоскользящие точки Ø8 мм; при желании заламинируйте матово.", 3.15),
        txt(10, 213, "Проверка: указатель месяца удерживается в секторе; часы проходят 00–23; основание не уезжает при", 3.0, color=MUTED),
        txt(10, 219, "20 поворотах одной рукой (допуск сдвига до 5 мм). Физическую сборку и устойчивость ещё нужно измерить.", 3.0, color=MUTED),
        rect(145, 229, 50, 50, stroke=BRASS, width=0.55, fill="none"),
        txt(170, 286, "КОНТРОЛЬ 50 × 50 мм", 3.1, anchor="middle", color=PLUM, weight="bold"),
        '</svg>',
    ]
    return "\n".join(parts)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    calendar = json.loads(CALENDAR.read_text(encoding="utf-8"))
    (OUT / "BA17-print-1-base.svg").write_text(build_base(calendar), encoding="utf-8")
    (OUT / "BA17-print-2-moving-parts.svg").write_text(build_parts(), encoding="utf-8")
    print(f"Wrote print templates to {OUT}")


if __name__ == "__main__":
    main()
