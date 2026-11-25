import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('import_people', ROOT / 'import-people.py')
IMPORT_PEOPLE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORT_PEOPLE)


class OrganizationMemberSourceTests(unittest.TestCase):
    def test_keeps_the_exact_category_as_a_cited_source(self):
        pages = {
            'Known member': '[[Category:Members of The Harpers]]',
            'Unmapped member': '[[Category:Members of an unknown group]]',
        }
        follow = IMPORT_PEOPLE.follower({'Harpers': 'The Harpers'})
        sources = IMPORT_PEOPLE.member_category_sources(
            pages, follow, {'The Harpers': 'harpers'}, {'harpers'},
        )
        self.assertEqual(sources, {
            'harpers': {
                'title': 'Category:Members of The Harpers',
                'url': 'https://forgottenrealms.fandom.com/wiki/Category:Members_of_The_Harpers',
                'license': 'CC BY-SA 3.0',
            },
        })

    def test_does_not_emit_a_source_for_an_organization_without_members(self):
        pages = {'Known member': '[[Category:Members of The Harpers]]'}
        follow = IMPORT_PEOPLE.follower({})
        self.assertEqual(IMPORT_PEOPLE.member_category_sources(
            pages, follow, {'The Harpers': 'harpers'}, set(),
        ), {})


if __name__ == '__main__':
    unittest.main()
