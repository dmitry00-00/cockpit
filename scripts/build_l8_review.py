#!/usr/bin/env python3
"""Build a provenance-preserving L8 review queue from extracted candidates.

This is an annotation handoff, not a fact importer: no generated record is
accepted into campaign/world state. Existing pilot review rows are carried
forward only when their page revision, page hash, amount and excerpt match.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PILOT_PATH = ROOT / "research/simulation/l8-pilot-review.json"
OUTPUT_PATH = ROOT / "maps/llm/L8.jsonl"

FORCE_HINTS = {
    "army": "land_force",
    "armies": "land_force",
    "troop": "land_force",
    "troops": "land_force",
    "soldier": "land_force",
    "soldiers": "land_force",
    "warrior": "land_force",
    "warriors": "land_force",
    "knight": "land_force",
    "knights": "land_force",
    "cavalry": "land_force",
    "legion": "land_force",
    "legions": "land_force",
    "battalion": "land_force",
    "company": "land_force",
    "companies": "land_force",
    "militia": "local_defense_or_guard",
    "guard": "local_defense_or_guard",
    "guards": "local_defense_or_guard",
    "garrison": "local_defense_or_guard",
    "fleet": "naval_force",
    "navy": "naval_force",
    "ship": "naval_force_or_vessel_count",
    "ships": "naval_force_or_vessel_count",
    "warship": "naval_force_or_vessel_count",
    "warships": "naval_force_or_vessel_count",
    "dragonship": "naval_force_or_vessel_count",
    "dragonships": "naval_force_or_vessel_count",
    "archer": "troop_category",
    "archers": "troop_category",
    "spearmen": "troop_category",
    "captain": "command_personnel",
    "captains": "command_personnel",
    "men-at-arms": "troop_category",
}


def load_pilot() -> dict[tuple[str, str, str, str], dict]:
    pilot = json.loads(PILOT_PATH.read_text(encoding="utf-8"))
    index = {}
    for item in pilot["manual_review_candidates"]:
        source = item["source"]
        key = (source["title"], str(source["revision_id"]),
               source["raw_page_wikitext_sha256"], item["amount_raw"])
        index[key] = item
    return index


def parse_args(argv: list[str] | None = None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True,
                        help="JSONL output from extract_military_candidates.py")
    parser.add_argument("--out", type=Path, default=OUTPUT_PATH,
                        help="review JSONL destination (default: maps/llm/L8.jsonl)")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        args.out.resolve().relative_to(ROOT.resolve())
    except ValueError:
        pass
    else:
        try:
            args.out.resolve().relative_to((ROOT / "maps/llm").resolve())
        except ValueError:
            print("--out inside the repository is restricted to maps/llm/", file=sys.stderr)
            return 2

    pilot = load_pilot()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    rows_written = 0
    mentions_written = 0
    pilot_matches = set()

    with args.input.open(encoding="utf-8") as source, args.out.open("w", encoding="utf-8") as target:
        for raw_line in source:
            if not raw_line.strip():
                continue
            source_row = json.loads(raw_line)
            nearby = source_row.get("quantity_candidates", [])
            unresolved = [m for m in source_row.get("number_mentions", [])
                          if m.get("mention_kind") == "unresolved_number"]
            if not unresolved:
                continue

            source_meta = source_row["source"]
            quantity_rows = []
            term_mentions = source_row.get("military_term_mentions", [])
            for index, mention in enumerate(unresolved):
                amount_raw = mention["text"]
                quantity_candidate = next((q for q in nearby
                                           if q.get("start") == mention.get("start")
                                           and q.get("end") == mention.get("end")), None)
                nearest = min(term_mentions, key=lambda t: min(
                    abs(t["start"] - mention["end"]),
                    abs(mention["start"] - t["end"]),
                ))
                if mention["end"] <= nearest["start"]:
                    gap = nearest["start"] - mention["end"]
                    relation = "number_before_term"
                else:
                    gap = max(0, mention["start"] - nearest["end"])
                    relation = "term_before_number"
                proximity = "adjacent" if gap <= 3 else "nearby" if gap <= 40 else "far"
                match_key = (source_meta["title"], str(source_meta["revision_id"]),
                             source_meta["raw_page_wikitext_sha256"], amount_raw)
                reviewed = pilot.get(match_key)
                # Older manual reviews sometimes span several sentence-sized
                # extractor rows. Carry them forward only when the page title,
                # revision, whole-page hash and exact reported amount match,
                # and that amount still appears in the extracted source text.
                if reviewed and amount_raw not in source_row["snippet"]:
                    reviewed = None
                if reviewed:
                    pilot_matches.add(reviewed["review_id"])

                term = (quantity_candidate or {}).get("nearest_military_term", nearest["text"])
                quantity_rows.append({
                    "mention_id": f"{source_row['source_location']['line']}:{source_row['source_location']['column']}:{index + 1}",
                    "amount_raw": reviewed["amount_raw"] if reviewed else amount_raw,
                    "number_in": (reviewed["amount_raw"] if reviewed else amount_raw) in source_row["snippet"],
                    "number_in_basis": "exact substring of extracted source excerpt",
                    "unit_raw": reviewed.get("unit_raw") if reviewed else None,
                    "unit_candidate": term or None,
                    "unit_candidate_basis": "nearest lexical military term; not a confirmed count relation",
                    "term_relation": quantity_candidate.get("term_relation", relation) if quantity_candidate else relation,
                    "proximity": quantity_candidate.get("proximity", proximity) if quantity_candidate else proximity,
                    "term_distance_chars": quantity_candidate.get("term_distance_chars", gap) if quantity_candidate else gap,
                    "extractor_quantity_candidate": quantity_candidate is not None,
                    "force_type": reviewed.get("force_type") if reviewed else None,
                    "force_type_candidate": FORCE_HINTS.get(term.lower()),
                    "subject": reviewed.get("subject") if reviewed else None,
                    "subject_candidate": source_meta["title"],
                    "subject_status": reviewed.get("subject_status") if reviewed else "source_page_only_unresolved",
                    "year": reviewed.get("year") if reviewed else None,
                    "year_precision": reviewed.get("year_precision") if reviewed else "unreviewed",
                    "reported_time_text": reviewed.get("reported_time_text") if reviewed else None,
                    "status": reviewed.get("status") if reviewed else "review",
                    "source_quote_verified": bool(reviewed and reviewed.get("source_excerpt_verified")),
                    "source_citations": reviewed.get("source_citations", []) if reviewed else [],
                    "review_notes": reviewed.get("review_notes", []) if reviewed else [],
                    "accepted_fact": False,
                    "review_reasons": [] if reviewed else [
                        "Extractor candidate only: verify that this number counts the nearby military term.",
                        "Resolve the force subject, unit, temporal scope, and whether the mention is a force total, subgroup, event, or organizational rule.",
                        "The cited primary book/source has not been independently checked.",
                    ],
                })
                mentions_written += 1

            title = source_meta["title"]
            location = source_row["source_location"]
            stable_id = f"wiki:{title}#{source_meta['revision_id']}:{location['line']}:{location['column']}"
            output_row = {
                "id": stable_id,
                "task": "L8",
                "article": title,
                "text": source_row["snippet"],
                "url": source_meta["url"],
                "license": source_meta["license_id"] + " (Forgotten Realms Wiki)",
                "revision_id": source_meta["revision_id"],
                "timestamp": source_meta["timestamp"],
                "section": source_meta["section"],
                "source_page_wikitext_sha256": source_meta["raw_page_wikitext_sha256"],
                "source_location": location,
                "status": "review" if not all(q["source_quote_verified"] for q in quantity_rows) else "source_quote_verified_candidate",
                "how": "human-pilot-plus-lexical-triage",
                "prompt": "L8-review/1",
                "accepted_fact": False,
                "quantities": quantity_rows,
            }
            target.write(json.dumps(output_row, ensure_ascii=False, separators=(",", ":")) + "\n")
            rows_written += 1

    print(json.dumps({
        "output": str(args.out),
        "review_rows": rows_written,
        "quantity_mentions": mentions_written,
        "pilot_rows_matched": len(pilot_matches),
        "pilot_rows_unmatched": sorted(set(row["review_id"] for row in json.loads(PILOT_PATH.read_text(encoding="utf-8"))["manual_review_candidates"]) - pilot_matches),
        "accepted_facts": 0,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
