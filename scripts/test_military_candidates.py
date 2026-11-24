import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from extract_military_candidates import extract_mentions, scan_dump

NS = 'http://www.mediawiki.org/xml/export-0.11/'


class MilitaryCandidateTests(unittest.TestCase):
    def test_refs_are_not_removed_or_joined_into_new_numbers(self):
        snippet = 'An army of 1<ref>citation 99</ref>2 soldiers.'
        terms, numbers, dates, candidates = extract_mentions(snippet)
        self.assertEqual([row['text'] for row in numbers], ['1', '99', '2'])
        self.assertNotIn('12', [row['text'] for row in numbers])
        self.assertEqual([row['mention_kind'] for row in numbers], [
            'unresolved_number', 'inside_reference_markup', 'unresolved_number'])
        self.assertEqual([row['text'] for row in candidates], ['1', '2'])
        self.assertIn('<ref>citation 99</ref>', snippet)

    def test_bare_numeric_wiki_link_is_kept_as_date_like(self):
        _, numbers, dates, candidates = extract_mentions('In [[1372]], the city had an army of 300 soldiers.')
        self.assertEqual([row['text'] for row in dates], ['1372'])
        self.assertEqual([row['text'] for row in candidates], ['300'])

    def test_calendar_day_after_forgotten_realms_month_is_not_force_quantity(self):
        snippet = 'Menzoberranzan was besieged by the invading army on [[Uktar]] 15, [[1372 DR]].'
        _, numbers, dates, candidates = extract_mentions(snippet)
        self.assertEqual([row['text'] for row in dates], ['15', '1372'])
        self.assertEqual([row['text'] for row in numbers if row['mention_kind'] == 'date_like'], ['15', '1372'])
        self.assertEqual(candidates, [])

    def test_years_are_separate_and_not_quantity_candidates(self):
        _, numbers, dates, candidates = extract_mentions('In 1370 DR, Luskan had an army of 300 spearmen.')
        self.assertEqual([row['text'] for row in dates], ['1370'])
        self.assertEqual([row['text'] for row in numbers if row['mention_kind'] == 'date_like'], ['1370'])
        self.assertEqual([row['text'] for row in candidates], ['300'])

    def test_spelled_quantity_and_adjacent_year_are_not_confused(self):
        _, numbers, dates, candidates = extract_mentions('As of 1370 DR, the navy had 19 dragonships, each with seventy archers.')
        self.assertEqual([row['text'] for row in dates], ['1370'])
        self.assertEqual([row['text'] for row in candidates], ['19', 'seventy'])

    def test_half_dozen_is_preserved_as_a_spelled_candidate(self):
        _, _, _, candidates = extract_mentions('The Grand Dukes commanded a navy of a half dozen ships.')
        self.assertEqual([row['text'] for row in candidates], ['a half dozen'])
        self.assertEqual(candidates[0]['nearest_military_term'], 'ships')
        self.assertEqual(candidates[0]['term_relation'], 'number_before_term')
        self.assertFalse(candidates[0].get('accepted_fact', False))

    def test_dozen_approximation_is_preserved_without_normalizing(self):
        _, _, _, candidates = extract_mentions('A patrol had two dozen or so soldiers.')
        self.assertEqual([row['text'] for row in candidates], ['two dozen or so'])

    def test_decade_range_is_not_a_quantity(self):
        _, numbers, dates, candidates = extract_mentions('In late 1350s and 1360s DR, garrison had 2,020 men.')
        self.assertEqual([row['text'] for row in dates], ['1350', '1360'])
        self.assertEqual([row['text'] for row in candidates], ['2,020'])

    def test_range_approximation_and_unit_context_are_preserved(self):
        _, numbers, _, candidates = extract_mentions('The garrison numbered around 4,500–5,000 soldiers.')
        self.assertEqual(len(candidates), 1)
        self.assertIn('around 4,500–5,000', candidates[0]['text'])
        self.assertIn('soldiers', candidates[0]['context'])
        self.assertEqual(candidates[0]['term_relation'], 'number_before_term')
        self.assertEqual(candidates[0]['proximity'], 'adjacent')

    def test_numeric_plus_qualifier_is_not_lost(self):
        _, _, _, candidates = extract_mentions('The Flaming Fist had 1,700-plus soldiers.')
        self.assertEqual([row['text'] for row in candidates], ['1,700-plus'])

    def test_source_typo_more_then_is_preserved(self):
        _, _, _, candidates = extract_mentions('The Dragons numbered at more then 12.000 soldiers.')
        self.assertEqual([row['text'] for row in candidates], ['more then 12.000'])

    def test_nearby_number_is_not_mistaken_for_an_adjacent_unit(self):
        _, _, _, candidates = extract_mentions('He served eight days before the allied army arrived.')
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]['text'], 'eight')
        self.assertEqual(candidates[0]['nearest_military_term'], 'army')
        self.assertEqual(candidates[0]['term_relation'], 'number_before_term')
        self.assertEqual(candidates[0]['proximity'], 'nearby')
        self.assertFalse(candidates[0].get('accepted_fact', False))

    def test_compound_vessel_unit_is_recognized_as_adjacent(self):
        _, _, _, candidates = extract_mentions('The navy had 19 dragonships.')
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]['nearest_military_term'], 'dragonships')
        self.assertEqual(candidates[0]['term_relation'], 'number_before_term')
        self.assertEqual(candidates[0]['proximity'], 'adjacent')

    def test_xml_scan_emits_provenance_and_never_claims_accepted_facts(self):
        with tempfile.TemporaryDirectory() as temp:
            temp = Path(temp)
            wikitext = '== Militia ==\nIn 1370 DR, Luskan had an army of 300 spearmen.<ref name="x">Book|7</ref>\n'
            xml = temp / 'dump.xml'
            xml.write_text(f'''<mediawiki xmlns="{NS}"><page><title>Luskan</title><ns>0</ns><id>1</id><revision><id>8</id><timestamp>2026-08-08T18:59:31Z</timestamp><text>{wikitext.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')}</text></revision></page></mediawiki>''', encoding='utf-8')
            kingdoms = temp / 'kingdoms.json'
            kingdoms.write_text(json.dumps({'attribution':'wiki authors; CC BY-SA 3.0','kingdoms':[{'title':'Luskan'}]}), encoding='utf-8')
            rows = list(scan_dump(xml, kingdoms))
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row['source']['revision_id'], '8')
        self.assertEqual(row['source']['timestamp'], '2026-08-08T18:59:31Z')
        self.assertEqual(row['source']['section'], 'Militia')
        self.assertEqual(row['source']['raw_page_wikitext_sha256'], hashlib.sha256(wikitext.encode()).hexdigest())
        self.assertEqual(row['source']['license'], 'wiki authors; CC BY-SA 3.0')
        self.assertFalse(row['accepted_fact'])
        self.assertIsNone(row['subject'])
        self.assertIsNone(row['year'])
        self.assertEqual(row['quantity_candidates'][0]['text'], '300')


    def test_manual_review_file_never_marks_facts_accepted(self):
        review_path = Path(__file__).resolve().parents[1] / 'research/simulation/l8-pilot-review.json'
        review = json.loads(review_path.read_text(encoding='utf-8'))
        rows = review['manual_review_candidates']
        self.assertGreaterEqual(len(rows), 3)
        self.assertTrue(all(row['accepted_fact'] is False for row in rows))
        self.assertTrue(all(row['source']['raw_page_wikitext_sha256'] for row in rows))
        self.assertTrue(all(row['excerpt'] for row in rows))
        for row in rows:
            if 'unknown' in row['year_precision']:
                self.assertIsNone(row['year'])

    def test_cormyr_count_preserves_source_number_format_and_century_scope(self):
        review_path = Path(__file__).resolve().parents[1] / 'research/simulation/l8-pilot-review.json'
        review = json.loads(review_path.read_text(encoding='utf-8'))
        row = next(row for row in review['manual_review_candidates']
                   if row['review_id'] == 'CORMYR_PURPLE_DRAGONS_14TH_CENTURY')
        self.assertFalse(row['accepted_fact'])
        self.assertEqual(row['subject'], 'Purple Dragons')
        self.assertEqual(row['subject_status'], 'source_explicit_in_same_paragraph')
        self.assertEqual(row['force_type'], 'standing army')
        self.assertEqual(row['amount_raw'], 'more then 12.000')
        self.assertEqual(row['unit_raw'], 'soldiers')
        self.assertIsNone(row['year'])
        self.assertEqual(row['year_precision'], 'century')
        self.assertIn('In the 14th century DR', row['excerpt'])
        self.assertIn('12.000', row['excerpt'])
        self.assertEqual(row['quantity_match']['start'], 58)
        self.assertEqual(row['source']['revision_id'], '1087344')
        self.assertEqual(row['source']['raw_page_wikitext_sha256'],
                         '92ac742956a2ca5271903e50e848135f989085300033c7e942ce71bbdef52f7e')
        self.assertEqual(len(row['source_citations']), 4)


if __name__ == '__main__':
    unittest.main()
