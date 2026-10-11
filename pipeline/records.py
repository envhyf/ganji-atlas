"""Checkpoint IO shared by long-running collection and export jobs."""
import json
import os
import time
from contextlib import contextmanager
from pathlib import Path


def read_records(path):
    if not path.exists():
        return []
    lines = path.read_text(encoding='utf-8').splitlines()
    out = []
    for i, line in enumerate(lines):
        if not line.strip():
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            if i != len(lines) - 1:
                raise
            # A reader may catch the writer midway through its final append.
    return out


def atomic_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + f'.{os.getpid()}.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    # Windows sync/indexing tools can briefly hold the destination open.
    # Keep the old checkpoint intact and retry replacing the same temp file.
    for attempt in range(12):
        try:
            tmp.replace(path)
            return
        except PermissionError:
            if attempt == 11:
                raise
            time.sleep(min(0.25 * (2 ** attempt), 2))


@contextmanager
def job_lock(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a+b') as handle:
        handle.write(b'0')
        handle.flush()
        handle.seek(0)
        if os.name == 'nt':
            import msvcrt
            try:
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError:
                raise RuntimeError('This collection job is already running.') from None
            try:
                yield
            finally:
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            try:
                yield
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)
