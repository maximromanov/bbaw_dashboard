#!/usr/bin/env python3
"""Integrate al-Maktaba al-Waqfiyya records into corpus_merged.json.

Filters 194 non-book records (videos, audio, software, news, periodicals),
maps Waqfeya's Dewey-like source_categories onto the existing 14-bucket
discipline_normalized taxonomy, generates 12-char hex record_ids derived
from each row's permanent URL, and appends to corpus_merged.json in the
existing non-indented array format.

Run from repo root: python3 scripts/integrate_waqfeya.py
"""

import csv
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
WAQFEYA_CSV = REPO / "data" / "waqfeya_books_light.csv"
CORPUS_JSON = REPO / "data" / "corpus_merged.json"


# ---- Discipline mapping (Dewey-prefix → 14-bucket) ------------------------

DEWEY_PREFIX_MAP = [
    # (prefix, normalized bucket)
    ("211", "علوم القرآن"),
    ("212", "علوم القرآن"),
    ("210.3", "علوم الحديث"),
    ("213", "علوم الحديث"),
    ("214", "العقيدة والكلام"),
    ("215", "العقيدة والكلام"),
    ("216", "الفقه وأصوله"),
    ("217", "الفقه وأصوله"),
    ("218.4", "الفلسفة والدين (مختلط)"),  # general Islamic culture
    ("218", "الرقاق والدعوة"),
    ("219", "التراجم والسيرة"),
    ("920", "التراجم والسيرة"),
    ("929", "التراجم والسيرة"),
    ("410", "اللغة والمعاجم"),
    ("413", "اللغة والمعاجم"),
    ("414", "اللغة والمعاجم"),
    ("415", "اللغة والمعاجم"),
    ("416", "اللغة والمعاجم"),
    ("810", "الأدب والبلاغة"),
    ("811", "الأدب والبلاغة"),
    ("910", "التاريخ والجغرافيا"),
    ("940", "التاريخ والجغرافيا"),
    ("953", "التاريخ والجغرافيا"),
    ("956", "التاريخ والجغرافيا"),
    ("960", "التاريخ والجغرافيا"),
    ("001", "العلوم الحديثة"),
    ("006", "العلوم الحديثة"),
    ("030", "المراجع والمجاميع"),
    ("070", "العلوم الحديثة"),
    ("150", "العلوم الحديثة"),
    ("160", "العلوم الحديثة"),
    ("180", "العلوم الحديثة"),
    ("301", "العلوم الحديثة"),
    ("310", "العلوم الحديثة"),
    ("320", "العلوم الحديثة"),
    ("330", "العلوم الحديثة"),
    ("340", "العلوم الحديثة"),
    ("350", "العلوم الحديثة"),
    ("355", "العلوم الحديثة"),
    ("370", "العلوم الحديثة"),
    ("500", "العلوم الحديثة"),
    ("600", "العلوم الحديثة"),
    ("610", "العلوم الحديثة"),
    ("630", "العلوم الحديثة"),
    ("700", "العلوم الحديثة"),
    ("008", "المراجع والمجاميع"),
    ("009", "المراجع والمجاميع"),
    ("010", "المراجع والمجاميع"),
    ("020", "المراجع والمجاميع"),
    ("080", "المراجع والمجاميع"),
]
# Sort longer prefixes first so "218.4" wins over "218".
DEWEY_PREFIX_MAP.sort(key=lambda kv: (-len(kv[0]), kv[0]))

# Free-text Arabic category fragments (no Dewey number) that still map cleanly.
FREETEXT_MAP = {
    "فهارس المخطوطات": "المراجع والمجاميع",
    "علوم المخطوط": "المراجع والمجاميع",
    "كتب فقه البيوع والمعاملات": "الفقه وأصوله",
    "كتب فقه الحج والعمرة والزيارة..": "الفقه وأصوله",
    "كتب فقه الطهارة والصلاة": "الفقه وأصوله",
    "الرؤى والأحلام": "الرقاق والدعوة",
    "الذخائر": "المراجع والمجاميع",
}

# Categories that mark a record as non-book — filter these out entirely.
NONBOOK_CATEGORIES = {
    "فيديو",
    "صوتيات",
    "مواقع مفيدة",
    "أخبار الموقع",
    "برامج إسلامية مجانية",
    "برامج خدمية مفيدة",
    "نماذج الذكاء الاصطناعي - بوت، جيم",
    "صدر حديثاً بالأسواق..",
    "قالوا عن موقع المكتبة الوقفية",
    "الدوريات",
}

# Generic catalog wrappers — never useful as primary discipline.
GENERIC_CATEGORIES = {"all-books"}

PERIODICAL_PREFIXES = ("مجلة", "جريدة", "صحيفة", "المجلة", "النشرة")


def is_periodical(cats):
    return any(c.startswith(p) for c in cats for p in PERIODICAL_PREFIXES)


def is_nonbook(cats):
    return any(c in NONBOOK_CATEGORIES for c in cats) or is_periodical(cats)


def dewey_prefix(cat):
    """Extract the Dewey-like number that prefixes a category label.

    Examples: '217.4 كتب الفقه الحنبلي' → '217.4'; '910 كتب الجغرافيا' → '910'.
    Returns None if no number found.
    """
    m = re.match(r"^\s*([\d.]+)", cat)
    return m.group(1) if m else None


def normalize_discipline(cats):
    """Return discipline_normalized for a category list, or None if unmapped.

    Multi-cat records: take the longest category string as primary (favors
    specific subcategories over generic ones like 'all-books').
    """
    candidates = [c for c in cats if c not in GENERIC_CATEGORIES]
    if not candidates:
        candidates = cats
    candidates.sort(key=lambda c: (-len(c), c))

    for c in candidates:
        # Free-text exact match first
        if c in FREETEXT_MAP:
            return FREETEXT_MAP[c], c
        # Dewey prefix
        prefix = dewey_prefix(c)
        if prefix is None:
            continue
        for p, bucket in DEWEY_PREFIX_MAP:
            if prefix.startswith(p):
                return bucket, c
    # Fallback: first candidate becomes discipline_native with no normalized
    return None, candidates[0] if candidates else None


# ---- Per-row parsing ------------------------------------------------------

URL_HEX_RE = re.compile(r"-([0-9a-f]{32})\s*$")


def hex_from_url(url):
    """Extract the trailing 32-char hex slug from a Waqfeya URL."""
    if not url:
        return None
    m = URL_HEX_RE.search(url)
    return m.group(1) if m else None


def parse_pub_year(s):
    """Parse a Gregorian year from publication_date.

    Format is typically 'NNNN - NNNN' (Hijri – Gregorian). Returns the
    Gregorian year if any 4-digit number in [1700, 2030] is present, else None.
    """
    if not s or s == "-":
        return None
    nums = re.findall(r"\d{3,4}", s)
    if not nums:
        return None
    gregorian = [int(n) for n in nums if 1700 <= int(n) <= 2030]
    if gregorian:
        return max(gregorian)
    return None


def to_int(v):
    try:
        n = int(str(v).strip())
        return n
    except (ValueError, TypeError):
        return None


def to_float(v):
    try:
        return float(str(v).strip())
    except (ValueError, TypeError):
        return None


def clean(v):
    """Normalize empty strings / placeholder dashes to None."""
    if v is None:
        return None
    s = str(v).strip()
    if s == "" or s == "-":
        return None
    return s


def first_pdf(download_urls_raw):
    """Pick the first PDF URL from the JSON-array string."""
    if not download_urls_raw:
        return None
    try:
        arr = json.loads(download_urls_raw)
    except json.JSONDecodeError:
        return None
    if not arr:
        return None
    return arr[0]


# ---- Main integration -----------------------------------------------------


def build_record(row, record_id):
    cats_raw = row.get("source_categories") or ""
    try:
        cats = json.loads(cats_raw) if cats_raw else []
    except json.JSONDecodeError:
        cats = []

    bucket, primary_cat = normalize_discipline(cats)

    pdf_url_field = clean(row.get("pdf_url"))
    if not pdf_url_field:
        pdf_url_field = first_pdf(row.get("download_urls"))

    pages = to_int(row.get("pages_site")) or 0
    mb = to_float(row.get("size_mb_site"))
    if mb is not None and mb == 0:
        mb = None

    return {
        "record_id": record_id,
        "source": "waqfeya",
        "internal_id": None,
        "handle": None,
        "title": clean(row.get("title")),
        "title_transliteration": None,
        "author": clean(row.get("author")),
        "editor": clean(row.get("editor")),
        "publisher": clean(row.get("publisher")),
        "pub_year": parse_pub_year(row.get("publication_date")),
        "pub_place": None,
        "pub_date_text": clean(row.get("publication_date")),
        "discipline_native": primary_cat,
        "discipline_normalized": bucket,
        "language": "ara",
        "provider": "المكتبة الوقفية",
        "lc_call_number": None,
        "vol_from": None,
        "vol_to": None,
        "work_id": record_id,  # Waqfeya has no cross-row work grouping
        "pages": pages if pages > 0 else None,
        "mb": mb,
        "filename": None,
        "parent_path": None,
        "permanent_link": clean(row.get("url")),
        "hi_pdf_url": pdf_url_field,
        "extraction_confidence": "high",
    }


def main():
    # 1. Load existing corpus
    with open(CORPUS_JSON, encoding="utf-8") as f:
        corpus = json.load(f)
    existing_ids = {r.get("record_id") for r in corpus if r.get("record_id")}
    print(f"existing records: {len(corpus):,}")
    print(f"existing record_ids: {len(existing_ids):,}")

    # 2. Read Waqfeya CSV
    with open(WAQFEYA_CSV, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    print(f"waqfeya csv rows: {len(rows):,}")

    # 3. Filter non-books
    filtered = []
    n_dropped = 0
    drop_reason = {"nonbook_cat": 0, "periodical": 0}
    for r in rows:
        try:
            cats = json.loads(r["source_categories"]) if r["source_categories"] else []
        except json.JSONDecodeError:
            cats = []
        if any(c in NONBOOK_CATEGORIES for c in cats):
            n_dropped += 1
            drop_reason["nonbook_cat"] += 1
            continue
        if is_periodical(cats):
            n_dropped += 1
            drop_reason["periodical"] += 1
            continue
        filtered.append(r)
    print(f"filtered out: {n_dropped} ({drop_reason})")
    print(f"books to integrate: {len(filtered):,}")

    # 4. Generate record_ids with collision check
    new_ids_12 = set()
    collisions_internal = []
    collisions_cross = []
    waqfeya_records = []
    skipped_no_id = 0

    for r in filtered:
        hex32 = hex_from_url(r["url"])
        if not hex32:
            skipped_no_id += 1
            continue
        rid = hex32[:12]
        if rid in new_ids_12:
            collisions_internal.append((rid, r["url"]))
            continue
        if rid in existing_ids:
            collisions_cross.append((rid, r["url"]))
            continue
        new_ids_12.add(rid)
        waqfeya_records.append(build_record(r, rid))

    print(f"skipped (no URL hex): {skipped_no_id}")
    print(f"internal id collisions @12: {len(collisions_internal)}")
    print(f"cross-source id collisions @12: {len(collisions_cross)}")

    # Per user instruction: if any collisions, escalate to 16 or full 32.
    if collisions_internal or collisions_cross:
        print("\n!! collisions detected — restarting with 16-char ids")
        new_ids_16 = set()
        waqfeya_records = []
        collisions16_internal, collisions16_cross = [], []
        for r in filtered:
            hex32 = hex_from_url(r["url"])
            if not hex32:
                continue
            rid = hex32[:16]
            if rid in new_ids_16:
                collisions16_internal.append((rid, r["url"]))
                continue
            if rid in existing_ids:
                collisions16_cross.append((rid, r["url"]))
                continue
            new_ids_16.add(rid)
            waqfeya_records.append(build_record(r, rid))
        print(f"   16-char internal collisions: {len(collisions16_internal)}")
        print(f"   16-char cross collisions:    {len(collisions16_cross)}")
        if collisions16_internal or collisions16_cross:
            sys.exit("16-char ids also collide — escalate to full 32 manually")

    print(f"\nwaqfeya records built: {len(waqfeya_records):,}")

    # 5. Summary metrics
    n_with_disc = sum(1 for r in waqfeya_records if r["discipline_normalized"])
    n_unmapped = len(waqfeya_records) - n_with_disc
    n_with_pages = sum(1 for r in waqfeya_records if r["pages"])
    total_pages = sum(r["pages"] for r in waqfeya_records if r["pages"])
    n_with_year = sum(1 for r in waqfeya_records if r["pub_year"])
    n_with_mb = sum(1 for r in waqfeya_records if r["mb"])
    total_mb = sum(r["mb"] for r in waqfeya_records if r["mb"])

    print(f"\n--- waqfeya record stats ---")
    print(f"  with discipline_normalized: {n_with_disc:,} ({100*n_with_disc/len(waqfeya_records):.1f}%)")
    print(f"  unmapped to a bucket:       {n_unmapped:,}")
    print(f"  with pages > 0:             {n_with_pages:,} of {len(waqfeya_records):,}")
    print(f"  total pages:                {total_pages:,}")
    print(f"  with pub_year:              {n_with_year:,}")
    print(f"  with file size:             {n_with_mb:,}  ({total_mb/1024:.1f} GB)")

    # 6. Bucket distribution
    from collections import Counter
    bucket_counter = Counter(r["discipline_normalized"] for r in waqfeya_records)
    print(f"\n--- discipline_normalized distribution ---")
    for b, n in bucket_counter.most_common():
        print(f"  {n:>5}  {b}")

    # 7. Append + write back (non-indented, ASCII-disabled to preserve Arabic)
    combined = corpus + waqfeya_records
    print(f"\nfinal corpus size: {len(combined):,}")

    with open(CORPUS_JSON, "w", encoding="utf-8") as f:
        json.dump(combined, f, ensure_ascii=False, separators=(",", ":"))

    print(f"wrote {CORPUS_JSON}")


if __name__ == "__main__":
    main()
