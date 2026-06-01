#!/usr/bin/env python3
"""Pre-compute Tier-1 aggregates for the dashboard's fast-load path.

Layer 1 (breakdown table, histogram, top works/volumes) and Layer 2
(discipline charts for all four sources) render entirely from
`data/summary.json` — no need to load the full 35 MB corpus on boot.

Mirrors the rendering logic in app.js so the precomputed output matches
what the browser would have produced from the raw corpus. Re-run after
any change to corpus_merged.json.

Run from repo root: python3 scripts/build_summary.py
"""

import json
import re
import statistics
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CORPUS_PATH = REPO / "data" / "corpus_merged.json"
SUMMARY_PATH = REPO / "data" / "summary.json"

SOURCE_LABELS = {
    "aco":            "ACO",
    "shamela_ay":     "Shamela PDFs",
    "waqfeya":        "Waqfeya",
    "personal_other": "Personal / Other",
}
SOURCE_ORDER = ["aco", "shamela_ay", "waqfeya", "personal_other"]
SOURCES_WITH_WORKS = {"aco", "shamela_ay", "waqfeya"}
DISCIPLINE_SOURCES = ["aco", "shamela_ay", "waqfeya"]  # personal_other has no disciplines

ARABIC_RE = re.compile(r"[؀-ۿݐ-ݿ]")
NUMERIC_PUNCT_RE = re.compile(r"^[0-9\s_\-.]+$")

HISTOGRAM_BINS = [
    ("0 – 100",       0,    100),
    ("101 – 300",     101,  300),
    ("301 – 500",     301,  500),
    ("501 – 1,000",   501,  1000),
    ("1,001 – 3,000", 1001, 3000),
    ("3,001 +",       3001, float("inf")),
]


def looks_like_junk_title(t):
    """Mirror of looksLikeJunkTitle() in app.js."""
    if t is None:
        return True
    s = str(t).strip()
    if len(s) < 6:
        return True
    if not ARABIC_RE.search(s):
        return True
    if NUMERIC_PUNCT_RE.match(s):
        return True
    return False


def median_int(xs):
    if not xs:
        return None
    return int(round(statistics.median(xs)))


def main():
    data = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    print(f"loaded {len(data):,} records from {CORPUS_PATH.name}")

    # ── Per-source breakdown ──────────────────────────────────────
    per_source = []
    all_pages_global = []
    total_records = total_works = total_pages = 0

    for src in SOURCE_ORDER:
        recs = [r for r in data if r.get("source") == src]
        with_pages = [r["pages"] for r in recs if isinstance(r.get("pages"), int) and r["pages"] > 0]
        work_ids = {r["work_id"] for r in recs if r.get("work_id")}
        sum_pages = sum(with_pages)

        per_source.append({
            "source":    src,
            "label":     SOURCE_LABELS[src],
            "records":   len(recs),
            "works":     len(work_ids),
            "pages":     sum_pages,
            "avg_pp":    round(sum_pages / len(with_pages)) if with_pages else None,
            "median_pp": median_int(with_pages),
            "has_works": src in SOURCES_WITH_WORKS,
        })
        total_records += len(recs)
        total_works   += len(work_ids)
        total_pages   += sum_pages
        all_pages_global.extend(with_pages)

    totals = {
        "records":   total_records,
        "works":     total_works,
        "pages":     total_pages,
        "avg_pp":    round(total_pages / len(all_pages_global)) if all_pages_global else None,
        "median_pp": median_int(all_pages_global),
    }

    # ── Histogram (pages-per-volume distribution) ─────────────────
    histogram = [{"label": label, "count": 0} for label, _, _ in HISTOGRAM_BINS]
    for r in data:
        p = r.get("pages")
        if not isinstance(p, int) or p <= 0:
            continue
        for i, (_, lo, hi) in enumerate(HISTOGRAM_BINS):
            if lo <= p <= hi:
                histogram[i]["count"] += 1
                break

    # ── Top works (grouped by work_id) ────────────────────────────
    by_work = {}
    for r in data:
        wid = r.get("work_id")
        if not wid:
            continue
        w = by_work.setdefault(wid, {"count": 0, "pages": 0, "titles": [], "author": ""})
        w["count"] += 1
        if isinstance(r.get("pages"), int) and r["pages"] > 0:
            w["pages"] += r["pages"]
        if r.get("title"):
            w["titles"].append(r["title"])
        if not w["author"] and r.get("author"):
            w["author"] = r["author"]

    works_list = []
    for w in by_work.values():
        clean = [t for t in w["titles"] if not looks_like_junk_title(t)]
        if not clean:
            continue
        title = max(clean, key=len)  # mirror JS reduce((a, b) => b.length > a.length ? b : a)
        works_list.append({
            "title":  title,
            "author": w["author"] or "",
            "count":  w["count"],
            "pages":  w["pages"],
        })
    works_list.sort(key=lambda w: (-w["count"], -w["pages"]))
    top_works = works_list[:10]

    # ── Top individual volumes (by pages) ─────────────────────────
    vol_list = [
        {"title": r.get("title", ""), "author": r.get("author") or "", "pages": r["pages"]}
        for r in data
        if isinstance(r.get("pages"), int) and r["pages"] > 0
        and not looks_like_junk_title(r.get("title"))
    ]
    vol_list.sort(key=lambda v: -v["pages"])
    top_volumes = vol_list[:10]

    # ── Discipline aggregates (per source, native + unified axis) ─
    def make_disc_entries(field, src):
        """Return [{label, pdfs, works}] sorted by pdfs descending."""
        c = Counter()
        works_for = {}
        for r in data:
            if r.get("source") != src:
                continue
            v = r.get(field)
            if not v:
                continue
            c[v] += 1
            wid = r.get("work_id")
            if wid:
                works_for.setdefault(v, set()).add(wid)
        return [
            {"label": k, "pdfs": pdfs, "works": len(works_for.get(k, set()))}
            for k, pdfs in c.most_common()
        ]

    disciplines = {
        "aco_native":      make_disc_entries("discipline_native",     "aco"),
        "shamela_native":  make_disc_entries("discipline_native",     "shamela_ay"),
        "waqfeya_native":  make_disc_entries("discipline_native",     "waqfeya"),
        "aco_unified":     make_disc_entries("discipline_normalized", "aco"),
        "shamela_unified": make_disc_entries("discipline_normalized", "shamela_ay"),
        "waqfeya_unified": make_disc_entries("discipline_normalized", "waqfeya"),
        "totals": {
            # Match the legacy chart-totals shape used by buildUnifiedPayload.
            "aco":     next(p for p in per_source if p["source"] == "aco"),
            "shamela": next(p for p in per_source if p["source"] == "shamela_ay"),
            "waqfeya": next(p for p in per_source if p["source"] == "waqfeya"),
        },
    }
    # Trim totals to just {pdfs, works}.
    for k, v in list(disciplines["totals"].items()):
        disciplines["totals"][k] = {"pdfs": v["records"], "works": v["works"]}

    # ── Discipline-filter dropdown counts (for browser-panel) ─────
    disc_counter = Counter()
    for r in data:
        disc_counter[r.get("discipline_normalized") or "(unmapped)"] += 1
    discipline_filter_options = [
        {"label": k, "count": n} for k, n in disc_counter.most_common()
    ]

    # ── Source-filter counts (for browser-panel, free perf win) ───
    source_filter_options = [
        {"value": p["source"], "label": p["label"], "count": p["records"]}
        for p in per_source
    ]

    out = {
        "version": 1,
        "totals": totals,
        "per_source": per_source,
        "histogram": histogram,
        "top_works": top_works,
        "top_volumes": top_volumes,
        "disciplines": disciplines,
        "discipline_filter_options": discipline_filter_options,
        "source_filter_options": source_filter_options,
    }

    SUMMARY_PATH.write_text(
        json.dumps(out, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    raw_bytes = SUMMARY_PATH.stat().st_size
    import gzip
    gz_bytes = len(gzip.compress(SUMMARY_PATH.read_bytes()))

    print(f"wrote {SUMMARY_PATH}")
    print(f"  raw:  {raw_bytes:,} bytes")
    print(f"  gzip: {gz_bytes:,} bytes")
    print(f"  records covered: {totals['records']:,}")
    print(f"  pages covered:   {totals['pages']:,}")


if __name__ == "__main__":
    main()
