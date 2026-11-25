import copy
import unittest
from chronology_classification import VERSION, fingerprint, matched_fingerprint, apply_classifications

class ClassificationTests(unittest.TestCase):
    def setUp(self):
        self.event = {'id':'a1','year':1479,'text':'A guild was founded.','src':{'title':'History','how':'timeline'},'links':[{'t':'Guild'}]}
        self.entry = {'id':'a1','fingerprint':fingerprint(self.event),'kind':'organizations','origin':'editorial','reason':'Основание гильдии.','evidence':'guild was founded'}

    def test_source_priority_and_no_mutation(self):
        source = {**self.event,'kind':'politics'}
        original = copy.deepcopy(source)
        rows, counts = apply_classifications([source],[self.entry])
        self.assertEqual(rows,[original]);self.assertEqual(source,original)
        self.assertEqual(counts['source'],1)

    def test_id_shift_is_safe_and_facts_preserved(self):
        changed_id = {**self.event,'id':'a-new-import-position'}
        rows, counts = apply_classifications([changed_id],[self.entry])
        self.assertEqual(rows[0]['kind'],'organizations')
        self.assertEqual(rows[0]['id'],changed_id['id'])
        self.assertEqual({k:v for k,v in rows[0].items() if k not in ('kind','classification')},changed_id)
        self.assertEqual(counts['editorial'],1)
        self.assertNotIn('kind',self.event)
        self.assertEqual(apply_classifications(rows,[self.entry])[0],rows)

    def test_changed_source_or_new_event_never_silently_inherits(self):
        for field,value in [('text','A different event.'),('year',1480),('src',{'title':'Other','how':'history'}),('links',[])]:
            changed = {**self.event,field:value}
            rows, counts = apply_classifications([changed],[self.entry])
            self.assertNotIn('kind',rows[0]);self.assertEqual(counts['unclassified'],1)
        previous = apply_classifications([self.event],[self.entry])[0][0]
        previous['text']='Changed after review.'
        self.assertNotIn('kind',apply_classifications([previous],[self.entry])[0][0])

    def test_changed_canonical_target_cannot_lend_a_stale_category(self):
        target = {'id':'y1479-1','year':1479,'text':'The guild was founded.','kind':'organizations'}
        article = {**self.event,'same':target['id']}
        entry = {**self.entry,'fingerprint':fingerprint(article),'origin':'canonical-match',
                 'matchedEventId':target['id'],'matchedFingerprint':matched_fingerprint(target)}
        self.assertEqual(apply_classifications([article],[entry],[target])[0][0]['kind'],'organizations')
        for changed in [{**target,'kind':'politics'},{**target,'text':'Different source.'}]:
            result, counts = apply_classifications([article],[entry],[changed])
            self.assertNotIn('kind',result[0]);self.assertEqual(counts['unclassified'],1)
        self.assertNotIn('kind',apply_classifications([article],[entry],[])[0][0])

    def test_invalid_or_conflicting_review_is_rejected(self):
        for invalid in [{**self.entry,'kind':'invented'}, {**self.entry,'evidence':'not in source'}]:
            with self.assertRaises(ValueError):apply_classifications([self.event],[invalid])
        with self.assertRaises(ValueError):apply_classifications([self.event],[self.entry,{**self.entry,'kind':'magic'}])

if __name__ == '__main__': unittest.main()
