"""Build accepted OCR classifications without changing OCR, GIS, L1 or campaign state."""
import hashlib
import json
import sys
from pathlib import Path
from audit_m13 import reconcile

ROOT = Path(__file__).resolve().parents[1]
KINDS = set('settlement fortress ruins temple mine mountain hills forest swamp desert lake river sea island pass region road other bay archipelago reef peninsula bridge glacier'.split())


def fingerprint(label):
    value = dict(label, id=f"ocr:{label['x']}_{label['y']}")
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def classify(labels, registry, legacy, decisions):
    reviewed = {}
    for d in decisions:
        if d['id'] in reviewed:
            raise ValueError('Duplicate decision ' + d['id'])
        reviewed[d['id']] = d
    out = []
    used = set()
    for raw, route in zip(labels, reconcile(labels, registry, legacy)):
        id_ = route['id']
        row = {'id': id_, 'text': raw['t'], 'x': raw['x'], 'y': raw['y']}
        decision = reviewed.get(id_)
        if decision:
            if decision.get('reviewStatus') != 'accepted' or decision.get('sourceFingerprint') != fingerprint(raw):
                raise ValueError('Unaccepted/stale decision ' + id_)
            disposition = decision['disposition']
            if disposition not in ('feature', 'fragment'):
                raise ValueError('Unresolved decision ' + id_)
            kind = decision.get('kind') if disposition == 'feature' else 'fragment'
            if disposition == 'feature' and kind not in KINDS:
                raise ValueError('Invalid kind ' + id_)
            row.update(role=disposition, kind=kind, origin='editorial', reason=decision['reason'])
            if decision.get('correctedName') and disposition == 'feature':
                row['name'] = decision['correctedName']
            used.add(id_)
        elif route['route'] == 'gis':
            row.update(role='gis-reference', kind=route['kind'], origin='gis', ref=route['ref'])
        elif route['route'] == 'l1' and route.get('status') == 'done' and route.get('kind') in KINDS:
            row.update(role='feature', kind=route['kind'], origin='legacy-l1')
        else:
            raise ValueError('No accepted classification for ' + id_)
        out.append(row)
    if used != set(reviewed):
        raise ValueError('Review refers to absent OCR labels')
    return out


def main():
    paths = ['maps/ocr/toril-rest.json', 'maps/ocr/toril-registry.json', 'maps/llm/L1.jsonl', 'research/maps/m13-editorial-review.json']
    data = [(ROOT / p).read_bytes() for p in paths]
    labels = json.loads(data[0])['labels']
    rows = classify(labels, json.loads(data[1])['entries'],
                    [json.loads(line) for line in data[2].decode().splitlines() if line.strip()], json.loads(data[3])['decisions'])
    doc = {'map': 'toril', 'version': 'cockpit.ocr-classification/1',
           'note': 'Классификация подписи не активирует место в кампании. Fragment — часть надписи/слияние OCR, не самостоятельный объект.',
           'inputs': {p: hashlib.sha256(b).hexdigest() for p, b in zip(paths, data)}, 'labels': rows}
    path = ROOT / 'content/maps/toril-ocr-classification.json'
    text = json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n'
    if '--check' in sys.argv:
        if not path.exists() or path.read_text() != text:
            raise SystemExit('Classification artifact is stale')
    else:
        path.write_text(text)
    from collections import Counter
    print(json.dumps({'total': len(rows), 'roles': dict(Counter(r['role'] for r in rows)),
                      'origins': dict(Counter(r['origin'] for r in rows))}, indent=2))


if __name__ == '__main__':
    main()
