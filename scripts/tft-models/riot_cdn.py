"""Read League/TFT game files straight from Riot's patcher CDN, without installing the game.

Files are fetched chunk by chunk with HTTP range requests on the release bundles, so only the bytes that are
needed get downloaded (one set wad is ~100 MB; random reads into other wads cost a few chunks each).
"""
import bisect
import os
import struct
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

import requests
from cdtb.patcher import PatcherManifest, PatcherStorage, zstd_decompress
from cdtb.wad import Wad, WadFileHeader
from xxhash import xxh64_intdigest

BUNDLES = "https://lol.dyn.riotcdn.net/channels/public/bundles/"
session = requests.Session()


def game_manifest(cache_dir: str, patchline: str = "live") -> PatcherManifest:
    storage = PatcherStorage(os.path.join(cache_dir, "cdn"), patchline=patchline)
    path = storage.download_manifest(storage.get_latest_game_manifest())
    return PatcherManifest(storage.fspath(path))


def manifest_file(manifest: PatcherManifest, name: str):
    return next((f for f in manifest.files.values() if f.name.lower() == name.lower()), None)


def _fetch(bundle_id: int, start: int, end: int) -> bytes:
    r = session.get(f"{BUNDLES}{bundle_id:016X}.bundle", headers={"Range": f"bytes={start}-{end - 1}"}, timeout=60)
    r.raise_for_status()
    if len(r.content) != end - start:
        raise IOError(f"short range read on bundle {bundle_id:016X}")
    return r.content


def download_file(patcher_file, out_path: str) -> str:
    """Download one release file (e.g. a .wad.client); adjacent chunks of a bundle share one request."""
    if os.path.exists(out_path):
        return out_path
    runs = []
    for c in patcher_file.chunks:
        last = runs[-1] if runs else None
        if last and last[0] == c.bundle.bundle_id and last[2] == c.offset:
            last[2] = c.offset + c.size
            last[3].append(c)
        else:
            runs.append([c.bundle.bundle_id, c.offset, c.offset + c.size, [c]])

    def fetch_run(run):
        bundle_id, start, end, chunks = run
        data = _fetch(bundle_id, start, end)
        return b"".join(zstd_decompress(data[c.offset - start:c.offset - start + c.size]) for c in chunks)

    with ThreadPoolExecutor(16) as pool:
        parts = list(pool.map(fetch_run, runs))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path + ".part", "wb") as f:
        for part in parts:
            f.write(part)
    os.replace(out_path + ".part", out_path)
    return out_path


def path_hash(game_path: str) -> int:
    """Bins store some paths as hashes; cdtb renders unknown ones as "{016x}", which we read back directly."""
    if len(game_path) == 18 and game_path[0] == "{" and game_path[-1] == "}":
        return int(game_path[1:-1], 16)
    return xxh64_intdigest(game_path.lower().encode())


class LocalWad:
    def __init__(self, path: str):
        self.wad = Wad(path, hashes={})
        self.index = {h.path_hash: h for h in self.wad.files}

    def read(self, game_path: str):
        h = self.index.get(path_hash(game_path))
        if h is None:
            return None
        with open(self.wad.path, "rb") as f:
            return self.wad.read_file_data(f, h)


class _RemoteFile:
    """Seekable view over a release file; each chunk is fetched (and cached) on first access."""

    def __init__(self, patcher_file):
        self.chunks = patcher_file.chunks
        self.starts = []
        pos = 0
        for c in self.chunks:
            self.starts.append(pos)
            pos += c.target_size
        self.size = pos
        self.pos = 0

    @lru_cache(maxsize=2048)
    def _chunk(self, i: int) -> bytes:
        c = self.chunks[i]
        return zstd_decompress(_fetch(c.bundle.bundle_id, c.offset, c.offset + c.size))

    def seek(self, pos: int, whence: int = 0):
        self.pos = pos if whence == 0 else self.pos + pos

    def read(self, n: int) -> bytes:
        out = bytearray()
        pos, end = self.pos, min(self.pos + n, self.size)
        while pos < end:
            i = bisect.bisect_right(self.starts, pos) - 1
            data = self._chunk(i)
            take = data[pos - self.starts[i]:pos - self.starts[i] + (end - pos)]
            out += take
            pos += len(take)
        self.pos = pos
        return bytes(out)


class RemoteWad:
    """WAD v3 read in place on the CDN: only the header and the requested entries are downloaded."""

    def __init__(self, patcher_file):
        self.f = _RemoteFile(patcher_file)
        magic, major, minor = struct.unpack("<2sBB", self.f.read(4))
        if magic != b"RW" or major != 3:
            raise ValueError(f"unsupported wad {magic!r} v{major}.{minor}")
        self.f.seek(268)
        count, = struct.unpack("<I", self.f.read(4))
        raw = self.f.read(32 * count)
        self.index = {}
        for k in range(count):
            if minor <= 3:
                h = WadFileHeader(*struct.unpack_from("<QIIIB?HQ", raw, 32 * k))
            else:
                ph, offset, csize, size, typ, hi, lo, checksum = struct.unpack_from("<QIIIBBHQ", raw, 32 * k)
                h = WadFileHeader(ph, offset, csize, size, typ, False, lo + (hi << 16), checksum)
            self.index[h.path_hash] = h

    def read(self, game_path: str):
        h = self.index.get(path_hash(game_path))
        return None if h is None else h.read_data(self.f)
