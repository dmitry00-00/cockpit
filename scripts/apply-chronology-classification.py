"""Apply/check reviewed labels without a wiki download or changes to source facts."""
import argparse
import collections
import glob
import hashlib
import json
from pathlib import Path
from chronology_classification import VERSION, apply_classifications, load_review
ROOT = Path(__file__).resolve().parents[1]


def facts_hash(events):
    facts = [{k: v for k, v in e.items() if k not in ('kind', 'classification')} for e in sorted(events, key=lambda e: e['id'])]
    return hashlib.sha256(json.dumps(facts, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    files = [Path(p) for p in sorted(glob.glob(str(ROOT / 'content/chronology/articles/[0-9].json'))) ]
    source = [(file, json.loads(file.read_text(encoding='utf-8'))) for file in files]
    before = [e for _, data in source for e in data['events']]
    canonical = [e for file in sorted((ROOT/'content/chronology/events').glob('[0-9].json')) for e in json.loads(file.read_text(encoding='utf-8'))['events']]
    rows, counts = apply_classifications(before, load_review(), canonical)
    if facts_hash(before) != facts_hash(rows):
        raise ValueError('Source facts changed while classifying')
    if counts['unclassified']:
        raise ValueError(f"{counts['unclassified']} new/changed records need review; nothing written")
    by_id = {e['id']: e for e in rows}
    if len(by_id) != len(rows):
        raise ValueError('Duplicate chronology event IDs')
    report = {'version': VERSION, 'total': len(rows), **counts,
              'uniqueArticles': sum(not e.get('same') for e in rows),
              'sourceFactsSha256': facts_hash(rows),
              'kinds': dict(sorted(collections.Counter(e['kind'] for e in rows).items())),
              'editorialMiscIds': [e['id'] for e in rows if e['kind']=='misc' and e.get('classification',{}).get('origin')=='editorial']}
    if args.apply:
        for file, data in source:
            data['events'] = [by_id[e['id']] for e in data['events']]
            file.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
        index_path = ROOT / 'content/chronology/articles/index.json'
        index = json.loads(index_path.read_text(encoding='utf-8'))
        index['classification'] = {'version': VERSION, **counts}
        index_path.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
        (ROOT/'research/chronology/classification-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    else:
        if rows != before:
            raise ValueError('Classification artifacts are stale; run --apply')
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
