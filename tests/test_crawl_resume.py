import json
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pipeline'))


class CrawlResumeTests(unittest.TestCase):
    def test_locked_record_replacement_preserves_original_and_pending_data(self):
        from records import replace_with_retry
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / 'markets.jsonl'
            pending = Path(d) / 'markets.jsonl.tmp'
            target.write_text('{"id":1}\n', encoding='utf-8')
            pending.write_text('{"id":1}\n{"id":2}\n', encoding='utf-8')
            with patch.object(Path, 'replace', side_effect=PermissionError('file lock')) as replace, patch('records.time.sleep'):
                with self.assertRaises(PermissionError):
                    replace_with_retry(pending, target)
            self.assertEqual(replace.call_count, 12)
            self.assertEqual(target.read_text(encoding='utf-8'), '{"id":1}\n')
            self.assertEqual(pending.read_text(encoding='utf-8'), '{"id":1}\n{"id":2}\n')

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
