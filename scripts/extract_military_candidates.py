#!/usr/bin/env python3
"""Stream military-number mentions from a MediaWiki XML dump as review-only candidates.

No candidate produced here is a fact. The extractor intentionally keeps raw wikitext,
references, dates, subjects, and amounts unresolved for human review.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
XML_NS = '{http://www.mediawiki.org/xml/export-0.11/}'
MILITARY_TERMS = re.compile(
    r'\b(?:arm(?:y|ies)|troops?|soldiers?|warriors?|knights?|legions?|militia|guard|guards|'
    r'fleet|navy|ships?|warships?|dragonships?|spearmen|archers?|cavalry|garrison|regiment|battalion|'
    r'company|companies|captains?|men[- ]at[- ]arms)\b', re.I)
NUMBER = re.compile(
    r'(?<![\w])(?:about|around|approximately|approx\.?|some|nearly|over|more than|more then|up to|at least)?\s*'
    r'(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?'
    r'(?:\s*(?:[-–—]|to)\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)?'
    r'(?:\+|-plus)?%?', re.I)
SECTION = re.compile(r'^\s*(={2,6})\s*(.*?)\s*\1\s*$')
REF_TAG = re.compile(r'<\s*/?\s*ref\b[^>]*>', re.I)
HTML_TAG = re.compile(r'<[^>]*>')
NUMBER_WORD_ATOM = r'(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|dozen)'
NUMBER_WORD = re.compile(
    rf'\b(?:a\s+half\s+(?:a\s+)?dozen|half\s+(?:a\s+)?dozen|a\s+dozen|'
    rf'{NUMBER_WORD_ATOM}(?:[- ]{NUMBER_WORD_ATOM})*)(?:\s+or\s+so)?\b', re.I)
REALMS_MONTH = re.compile(
    r'(?:hammer|alturiak|ches|tarsakh|mirtul|kythorn|flamerule|eleasis|eleint|'
    r'marpenoth|uktar|nightal)', re.I)


def load_kingdom_titles(path: Path) -> list[str]:
    data = json.loads(path.read_text(encoding='utf-8'))
    return sorted({str(row['title']) for row in data['kingdoms'] if row.get('title')})


def sentence_spans(text: str):
    """Yield sentence-ish spans without stripping markup or joining characters."""
    start = 0
    for match in re.finditer(r'(?<=[.!?])\s+(?=[A-Z\[\'\"“(])', text):
        end = match.start()
        if text[start:end].strip():
            yield start, end, text[start:end]
        start = match.end()
    if text[start:].strip():
        yield start, len(text), text[start:]


def date_like(raw: str, text: str, start: int, end: int) -> bool:
    before = text[max(0, start - 55):start]
    after = text[end:min(len(text), end + 35)]
    month = REALMS_MONTH.pattern
    if re.search(rf'(?:\[\[\s*{month}(?:\|[^\]]+)?\]\]|{month})\s*$', before, re.I):
        return True
    if re.search(r'\{\{\s*YearlinkName\s*\|\s*$', before, re.I):
        return True
    if re.search(r'\[\[\s*$', before) and re.match(r'\s*\]\]', after):
        return True
    if re.match(r'\s*(?:DR\b|Dalereckoning\b|centur(?:y|ies)\b|(?:st|nd|rd|th)\s+centur(?:y|ies)\b|\{\{(?:st|nd|rd|th)\}\}\s+centur(?:y|ies)\b)', after, re.I):
        return True
    if re.match(r'\s*\|[^}]*\}\}\s*(?:DR)?', after, re.I) and re.search(r'\{\{\s*YearlinkName\s*\|', before, re.I):
        return True
    if re.match(r'\s*\]\]\s*(?:DR|Dalereckoning)', after, re.I):
        return True
    if re.search(r'\b(?:in|during|circa|c\.)\s*(?:\[\[)?$', before, re.I) and re.match(r'\s*(?:DR|Dalereckoning)\b', after, re.I):
        return True
    if re.match(r's\b(?:(?![.!?]).){0,55}\bDR\b', after, re.I):
        return True
    if re.match(r's\s+(?:and|[-–—])\s*\d{3,4}s?\s+DR\b', after, re.I):
        return True
    return False


def mention_kind(text: str, start: int, end: int, raw: str) -> str:
    if any(tag.start() <= start < tag.end() for tag in HTML_TAG.finditer(text)):
        return 'inside_markup'
    ref_depth = 0
    for tag in REF_TAG.finditer(text[:start]):
        token = tag.group().lower()
        if token.startswith('</'):
            ref_depth = max(0, ref_depth - 1)
        elif not token.rstrip().endswith('/>'):
            ref_depth += 1
    if ref_depth:
        return 'inside_reference_markup'
    if date_like(raw, text, start, end):
        return 'date_like'
    for opening, closing in (('{{', '}}'), ('[[', ']]')):
        if text.rfind(opening, 0, start) > text.rfind(closing, 0, start) and text.find(closing, end) >= 0:
            return 'inside_wikitext_markup'
    return 'unresolved_number'


def extract_mentions(snippet: str) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    military = [{'text': m.group(), 'start': m.start(), 'end': m.end()} for m in MILITARY_TERMS.finditer(snippet)]
    numbers, dates, candidates = [], [], []
    numeric_matches = list(NUMBER.finditer(snippet))
    occupied = [(m.start(), m.end()) for m in numeric_matches]
    numeric_matches.extend(m for m in NUMBER_WORD.finditer(snippet)
                           if not any(a < m.end() and m.start() < b for a, b in occupied))
    for m in sorted(numeric_matches, key=lambda match: match.start()):
        raw = m.group().strip()
        if not raw:
            continue
        kind = mention_kind(snippet, m.start(), m.end(), raw)
        date_row = {'text': raw, 'start': m.start(), 'end': m.end(), 'context': snippet[max(0,m.start()-45):min(len(snippet),m.end()+45)]}
        if kind == 'date_like':
            dates.append(date_row)
        number_row = {'text': raw, 'start': m.start(), 'end': m.end(), 'mention_kind': kind,
                      'context': snippet[max(0,m.start()-45):min(len(snippet),m.end()+45)]}
        numbers.append(number_row)
        if kind == 'unresolved_number' and military:
            nearest = min(military, key=lambda t: min(abs(t['start']-m.end()),abs(m.start()-t['end'])))
            gap = min(abs(nearest['start']-m.end()), abs(m.start()-nearest['end']))
            number_row['nearest_military_term'] = nearest['text']
            number_row['term_distance_chars'] = gap
            number_row['quantity_candidate'] = gap <= 40
            if gap <= 40:
                # Proximity is evidence for triage, not proof that the number counts this term.
                # Preserve direction so reviewers can separate "300 soldiers" from an earlier
                # count that merely shares a sentence with an army mention.
                number_row['term_relation'] = 'number_before_term' if m.end() <= nearest['start'] else 'term_before_number'
                number_row['proximity'] = 'adjacent' if gap <= 3 else 'nearby'
                candidates.append(number_row.copy())
    return military, numbers, dates, candidates


def source_url(title: str) -> str:
    return 'https://forgottenrealms.fandom.com/wiki/' + urllib.parse.quote(title.replace(' ', '_'), safe="()'_,.-")


def scan_dump(xml_path: Path, kingdoms_path: Path, extra_titles: list[str] | None = None):
    kingdom_data = json.loads(kingdoms_path.read_text(encoding='utf-8'))
    license_attribution = kingdom_data.get('attribution', 'CC BY-SA 3.0')
    requested = set(load_kingdom_titles(kingdoms_path))
    requested.update(extra_titles or [])
    found = set()
    context = ET.iterparse(str(xml_path), events=('start', 'end'))
    _, root = next(context)
    for event, page in context:
        if event != 'end' or page.tag != XML_NS + 'page':
            continue
        title = page.findtext(XML_NS + 'title')
        if title not in requested:
            page.clear()
            continue
        revision = page.find(XML_NS + 'revision')
        if revision is None:
            page.clear()
            continue
        revision_id = revision.findtext(XML_NS + 'id')
        timestamp = revision.findtext(XML_NS + 'timestamp')
        text_node = revision.find(XML_NS + 'text')
        raw = text_node.text or '' if text_node is not None else ''
        digest = hashlib.sha256(raw.encode('utf-8')).hexdigest()
        section = '(lead)'
        lines = raw.splitlines()
        for line_no, line in enumerate(lines, 1):
            heading = SECTION.match(line)
            if heading:
                section = heading.group(2).strip()
                continue
            for offset, _, snippet in sentence_spans(line):
                terms, numbers, dates, quantities = extract_mentions(snippet)
                if not terms or not numbers:
                    continue
                if not quantities and not dates:
                    continue
                yield {
                    'record_type': 'military_candidate',
                    'status': 'candidate_review_required',
                    'accepted_fact': False,
                    'source': {
                        'title': title,
                        'revision_id': revision_id,
                        'timestamp': timestamp,
                        'license': license_attribution,
                        'license_id': 'CC BY-SA 3.0',
                        'url': source_url(title),
                        'section': section,
                        'raw_page_wikitext_sha256': digest,
                    },
                    'source_location': {'line': line_no, 'column': offset + 1},
                    'snippet': snippet.strip(),
                    'subject': None,
                    'year': None,
                    'amount': None,
                    'unit': None,
                    'force_type': None,
                    'military_term_mentions': terms,
                    'unit_mentions': [term for term in terms if any(abs(term['start'] - q['start']) <= 100 for q in quantities)],
                    'number_mentions': numbers,
                    'date_mentions': dates,
                    'quantity_candidates': quantities,
                    'review_reasons': [
                        'Candidate mention only; verify subject, quantity, unit, force type, and temporal scope against the exact source.',
                        'Numbers inside reference markup and date-like numbers are not accepted as force counts.',
                    ],
                }
        found.add(title)
        root.clear()
    missing = sorted(requested - found)
    if missing:
        raise ValueError('Titles missing from XML dump: ' + ', '.join(missing))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--xml', type=Path, required=True, help='Full MediaWiki XML dump (streamed; never copied)')
    parser.add_argument('--kingdoms', type=Path, default=ROOT / 'content/world/kingdoms.json')
    parser.add_argument('--extra-title', action='append', default=[], help='Additional exact wiki page title; repeatable')
    parser.add_argument('--out', type=Path, help='Optional JSONL output path; default stdout')
    args = parser.parse_args(argv)
    if args.out:
        try:
            args.out.resolve().relative_to(ROOT.resolve())
        except ValueError:
            pass
        else:
            parser.error('--out must be outside the repository; default stdout is safe')
    stream = args.out.open('w', encoding='utf-8') if args.out else sys.stdout
    try:
        for row in scan_dump(args.xml, args.kingdoms, args.extra_title):
            stream.write(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n')
    finally:
        if args.out:
            stream.close()


if __name__ == '__main__':
    main()
