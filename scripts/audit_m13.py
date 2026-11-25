"""Reconcile every OCR label with L1 or its GIS/fragment route; no guessing or world edits."""
import hashlib
import json
import math
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def reconcile(labels, registry, classifications):
    ids = [f"ocr:{r['x']}_{r['y']}" for r in labels]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate OCR coordinates')
    by_id = {e['id']: e for e in registry}
    rows = {}
    for r in classifications:
        if r['id'] in rows:
            raise ValueError('Duplicate L1 id: ' + r['id'])
        rows[r['id']] = r
    out = []
    for raw, id_ in zip(labels, ids):
        row = {'id': id_, 'text': raw['t'], 'x': raw['x'], 'y': raw['y']}
        if id_ in rows:
            r = rows[id_]
            row.update(route='l1', status=r.get('status'), kind=r.get('kind'), how=r.get('how'))
        elif by_id.get(id_, {}).get('status') == 'fragment':
            row.update(route='fragment', status='needs_editorial_acceptance')
        else:
            matches = []
            for e in registry:
                if (e.get('ocr') == raw['t'] or e.get('name') == raw['t']) and 'x' in e and 'y' in e and e.get('class'):
                    distance = math.hypot(e['x'] - raw['x'], e['y'] - raw['y'])
                    if distance <= 48:
                        matches.append((distance, e['id'], e))
            if matches:
                distance, ref, e = min(matches, key=lambda v: (v[0], v[1]))
                row.update(route='gis', status='linked', ref=ref, name=e['name'], kind=e['class'], distance=distance)
            else:
                row.update(route='unaccounted', status='review')
        out.append(row)
    return out


def main():
    paths = ['maps/ocr/toril-rest.json', 'maps/ocr/toril-registry.json', 'maps/llm/L1.jsonl']
    data = [(ROOT / p).read_bytes() for p in paths]
    labels = json.loads(data[0])['labels']
    registry = json.loads(data[1])['entries']
    classes = [json.loads(line) for line in data[2].decode().splitlines() if line.strip()]
    rows = reconcile(labels, registry, classes)
    routes = Counter(r['route'] for r in rows)
    statuses = Counter(r['status'] for r in rows if r['route'] == 'l1')
    report = {'version': 'cockpit.m13-audit/1',
              'inputs': {p: hashlib.sha256(b).hexdigest() for p, b in zip(paths, data)},
              'total': len(rows), 'routes': dict(routes), 'l1Statuses': dict(statuses),
              'accountingComplete': not routes['unaccounted'],
              'legacyL1QueueComplete': not statuses.get('review', 0),
              'note': 'Legacy statuses are preserved. Accepted editorial resolutions are verified separately by build_m13_classification.py --check.',
              'labels': rows}
    path = ROOT / 'research/maps/m13-coverage.json'
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if '--check' in sys.argv:
        if not path.exists() or path.read_text() != rendered:
            raise SystemExit('M13 audit is stale; run python3 scripts/audit_m13.py')
    else:
        path.write_text(rendered)
    print(json.dumps({k: v for k, v in report.items() if k not in ('labels', 'inputs')}, ensure_ascii=False, indent=2))
    if routes['unaccounted']:
        raise SystemExit('Unaccounted OCR labels remain')


if __name__ == '__main__':
    main()
