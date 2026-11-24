import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("wiki_field_extract", ROOT / "scripts" / "wiki-field-extract.py")
EXTRACT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXTRACT)


class WikiFieldExtractTests(unittest.TestCase):
    def setUp(self):
        self.profile = {
            "format": 1,
            "id": "fixture-world",
            "sources": {"wiki": {
                "id": "fixture-wiki", "url": "https://example.invalid",
                "dumpId": "fixture-1", "license": "CC-BY-SA-3.0",
                "attribution": "Fixture wiki; CC BY-SA 3.0.",
                "distribution": "internal", "allowInternalExtraction": True,
            }},
            "fieldMaps": {"place": {
                "targetKind": "place", "templates": ["Location"],
                "fields": ["type", "name", "population", "ruler", "nested"],
            }},
        }
        self.dump = """<?xml version="1.0"?>
<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.11/">
  <page><title>Test Town</title><ns>0</ns><id>17</id><revision><text>{{Location
|type = City
|name = [[Test|Test Town]]
|population = 43
|ruler = [[Alice|Queen]]
|nested = {{Other
|name = should not become a top-level field
|inside = pipe | stays nested
}}
|description = unapproved field
}}
[[Category:Cities]]
</text></revision></page>
  <page><title>Old Name</title><ns>0</ns><id>18</id><redirect title="Test Town" /></page>
  <page><title>Ignored namespace</title><ns>10</ns><id>19</id><revision><text>{{Location|type=not-place}}</text></revision></page>
</mediawiki>
"""

    def test_extracts_only_whitelisted_fields_and_keeps_nested_pipes_together(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            dump = base / "fixture.xml"
            output = base / "staging"
            dump.write_text(self.dump, encoding="utf-8")
            result = EXTRACT.extract_profile(self.profile, dump, output)

            records = [json.loads(line) for line in (output / "fixture-world--place.jsonl").read_text(encoding="utf-8").splitlines()]
            redirects = [json.loads(line) for line in (output / "fixture-world--redirects.jsonl").read_text(encoding="utf-8").splitlines()]
            self.assertEqual(result["matchedPages"], 1)
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0]["fields"]["name"], "[[Test|Test Town]]")
            self.assertEqual(records[0]["fields"]["nested"], "{{Other\n|name = should not become a top-level field\n|inside = pipe | stays nested\n}}")
            self.assertNotIn("description", records[0]["fields"])
            self.assertEqual(records[0]["categories"], ["Cities"])
            self.assertEqual(redirects[0]["target"], "Test Town")
            self.assertFalse(result["bodyTextIncluded"])

    def test_refuses_profiles_without_explicit_internal_extraction_permission(self):
        self.profile["sources"]["wiki"]["allowInternalExtraction"] = False
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            dump = base / "fixture.xml"
            dump.write_text(self.dump, encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "не разрешён"):
                EXTRACT.extract_profile(self.profile, dump, base / "staging")

    def test_refuses_unknown_source_license(self):
        self.profile["sources"]["wiki"]["license"] = "unverified"
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            dump = base / "fixture.xml"
            dump.write_text(self.dump, encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "не подтверждена лицензия"):
                EXTRACT.extract_profile(self.profile, dump, base / "staging")

    def test_refuses_overwriting_an_existing_staging_directory(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            dump = base / "fixture.xml"
            output = base / "staging"
            output.mkdir()
            (output / "keep.txt").write_text("keep", encoding="utf-8")
            dump.write_text(self.dump, encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "не перезаписываются"):
                EXTRACT.extract_profile(self.profile, dump, output)
            self.assertEqual((output / "keep.txt").read_text(encoding="utf-8"), "keep")

    def test_refuses_writing_into_the_repository(self):
        with tempfile.TemporaryDirectory() as temp:
            dump = Path(temp) / "fixture.xml"
            dump.write_text(self.dump, encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "за пределами репозитория"):
                EXTRACT.extract_profile(self.profile, dump, ROOT / "content")

    def test_refuses_profile_ids_that_could_escape_the_output_directory(self):
        self.profile["id"] = "../escape"
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            dump = base / "fixture.xml"
            dump.write_text(self.dump, encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "profile.id"):
                EXTRACT.extract_profile(self.profile, dump, base / "staging")


if __name__ == "__main__":
    unittest.main()
