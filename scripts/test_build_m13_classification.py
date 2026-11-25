import unittest
from build_m13_classification import classify, fingerprint


class Classification(unittest.TestCase):
    def test_fragments_are_not_forced_to_geographic_other(self):
        source = {'x': 1, 'y': 2, 't': 'THE'}
        decision = {'id': 'ocr:1_2', 'reviewStatus': 'accepted', 'sourceFingerprint': fingerprint(source),
                    'disposition': 'fragment', 'reason': 'Part of the visible sea label'}
        out = classify([source], [], [], [decision])
        self.assertEqual(out[0]['role'], 'fragment')
        self.assertEqual(out[0]['kind'], 'fragment')
        self.assertEqual(source, {'x': 1, 'y': 2, 't': 'THE'})
        with self.assertRaises(ValueError):
            classify([dict(source, t='Changed')], [], [], [decision])

    def test_unreviewed_and_model_review_cannot_become_done(self):
        source = {'x': 1, 'y': 2, 't': 'A'}
        with self.assertRaises(ValueError):
            classify([source], [], [{'id': 'ocr:1_2', 'kind': 'region', 'status': 'review'}], [])
        decision = {'id': 'ocr:1_2', 'disposition': 'feature', 'kind': 'settlement', 'reason': 'x',
                    'sourceFingerprint': fingerprint(source)}
        with self.assertRaises(ValueError):
            classify([source], [], [], [decision])


if __name__ == '__main__':
    unittest.main()
