"""Reviewed editorial primary-topic labels, separate from source facts and campaign events."""
import copy
import hashlib
import json
from pathlib import Path

VERSION = 'chronology-primary-topic/1'
KINDS = frozenset('politics conflicts deaths births misc magic people environment organizations publications migrations deities realmspace abeir wildlife'.split())
REVIEW_PATH = Path(__file__).resolve().parents[1] / 'research/chronology/article-classifications.json'


def fingerprint(event):
    """IDs are import-order dependent. Bind a decision to the complete source record instead."""
    source = {k: v for k, v in event.items() if k not in ('id', 'kind', 'classification')}
    encoded = json.dumps(source, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(encoded).hexdigest()


def matched_fingerprint(event):
    value = {'source': fingerprint(event), 'kind': event.get('kind')}
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def load_review(path=REVIEW_PATH):
    if not Path(path).exists():
        raise ValueError('Reviewed chronology classification file is missing')
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    if data.get('version') != VERSION:
        raise ValueError('Unsupported chronology classification version')
    return data['entries']


def apply_classifications(events, entries, canonical_events=()):
    """Source kind wins. Changed/new records remain unclassified; never guess a replacement."""
    review = {}
    for entry in entries:
        if entry.get('kind') not in KINDS or entry.get('origin') not in ('editorial', 'canonical-match'):
            raise ValueError('Invalid reviewed chronology category/origin')
        if not entry.get('reason') or not entry.get('fingerprint'):
            raise ValueError('Review entry needs a reason and source fingerprint')
        key = entry['fingerprint']
        if key in review and review[key]['kind'] != entry['kind']:
            raise ValueError('Conflicting classifications of the same source')
        review[key] = entry
    canonical = {event['id']: event for event in canonical_events}
    result, counts = [], {'source': 0, 'editorial': 0, 'canonical-match': 0, 'unclassified': 0}
    for original in events:
        event = copy.deepcopy(original)
        previous = event.pop('classification', None)
        if previous and previous.get('version') != VERSION:
            raise ValueError('Unsupported existing classification version; explicit migration required')
        if previous and previous.get('version') == VERSION and event.get('kind') == previous.get('assignedKind'):
            event.pop('kind', None)
        if event.get('kind'):
            if event['kind'] not in KINDS:
                raise ValueError('Unknown source category')
            counts['source'] += 1
        else:
            entry = review.get(fingerprint(event))
            if entry and entry['origin'] == 'canonical-match':
                target = canonical.get(entry.get('matchedEventId'))
                if not target or matched_fingerprint(target) != entry.get('matchedFingerprint'):
                    entry = None
            if entry:
                if entry.get('evidence') and entry['evidence'] not in event['text']:
                    raise ValueError('Reviewed evidence does not occur in source text')
                event['kind'] = entry['kind']
                event['classification'] = {k: v for k, v in entry.items() if k not in ('id', 'kind')}
                event['classification'].update(version=VERSION, assignedKind=entry['kind'])
                counts[entry['origin']] += 1
            else:
                counts['unclassified'] += 1
        result.append(event)
    return result, counts
