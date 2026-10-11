import json
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pipeline'))


class CrawlResumeTests(unittest.TestCase):
    def test_atomic_save_retries_temporary_windows_file_lock(self):
        from records import atomic_json
        original = Path.replace
        calls = []
        def replace(p, target):
            calls.append(p)
            if len(calls) < 3:
                raise PermissionError('temporary file lock')
            return original(p, target)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'checkpoint.json'
            p.write_text('{"old":true}', encoding='utf-8')
            with patch.object(Path, 'replace', replace), patch('records.time.sleep'):
                atomic_json(p, {'saved': 3})
            self.assertEqual(json.loads(p.read_text(encoding='utf-8')), {'saved': 3})
            self.assertEqual(len(calls), 3)

    def test_complete_records_survive_partial_last_write(self):
        from records import read_records
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'markets.jsonl'
            p.write_text('{"id":1,"slug":"yunnan"}\n{"id":2', encoding='utf-8')
            self.assertEqual(read_records(p), [{'id': 1, 'slug': 'yunnan'}])

    def test_corrupt_middle_record_is_not_silently_dropped(self):
        from records import read_records
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'markets.jsonl'
            p.write_text('{"id":1}\nbroken\n{"id":3}\n', encoding='utf-8')
            with self.assertRaises(json.JSONDecodeError):
                read_records(p)


if __name__ == '__main__':
    unittest.main()
