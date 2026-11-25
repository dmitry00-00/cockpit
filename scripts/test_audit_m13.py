import unittest
from audit_m13 import reconcile


class Coverage(unittest.TestCase):
    def test_routes_are_distinct_and_source_preserved(self):
        labels = [{'x': 1, 'y': 1, 't': 'Sea'}, {'x': 10, 'y': 10, 't': 'THE'},
                  {'x': 20, 'y': 20, 't': 'Forest'}, {'x': 90, 'y': 90, 't': 'Far'}]
        reg = [{'id': 'ocr:10_10', 'status': 'fragment'},
               {'id': 'gis:forest', 'ocr': 'Forest', 'name': 'Wood', 'class': 'Forest', 'x': 21, 'y': 20},
               {'id': 'gis:far', 'name': 'Far', 'class': 'Region', 'x': 900, 'y': 900}]
        rows = reconcile(labels, reg, [{'id': 'ocr:1_1', 'status': 'review', 'kind': 'sea'}])
        self.assertEqual([r['route'] for r in rows], ['l1', 'fragment', 'gis', 'unaccounted'])
        self.assertEqual(rows[0]['status'], 'review')
        self.assertEqual(rows[2]['ref'], 'gis:forest')
        self.assertEqual(labels[2]['t'], 'Forest')

    def test_nearby_unrelated_name_does_not_count_as_coverage(self):
        self.assertEqual(reconcile([{'x': 1, 'y': 1, 't': 'Missing'}],
                                  [{'id': 'a', 'name': 'Other', 'class': 'City', 'x': 1, 'y': 1}], [])[0]['route'], 'unaccounted')

    def test_duplicates_rejected(self):
        with self.assertRaises(ValueError):
            reconcile([{'x': 1, 'y': 1, 't': 'A'}] * 2, [], [])
        with self.assertRaises(ValueError):
            reconcile([], [], [{'id': 'same'}, {'id': 'same'}])


if __name__ == '__main__':
    unittest.main()
