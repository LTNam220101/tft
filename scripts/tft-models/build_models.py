"""Build animated .glb models of every shop champion of a TFT set, straight from Riot's CDN.

    uv run --python 3.12 --with cdtb --with pyritofile --with numpy --with pillow \
        python scripts/tft-models/build_models.py --set TFTSet18

Steps: download DATA/FINAL/<set>.wad.client -> per champion read skins/skin0.bin (mesh, skeleton, textures,
hidden submeshes) and animations/skin0.bin (clip -> .anm) -> write a skinned glTF with the idle and celebration
clips -> compress with gltfpack (meshopt) into public/models/<set>/<championKey>.glb.

League data is left-handed and glTF right-handed, so X is mirrored:
vec (x, y, z) -> (-x, y, z), quat (x, y, z, w) -> (x, -y, -z, w), triangle winding reversed.
"""
import argparse
import io
import json
import os
import re
import struct
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import requests
import cdtb.binfile as cdtb_binfile
import cdtb.hashes as cdtb_hashes
from cdtb.binfile import BinFile
from cdtb.export import TexConverter
from PIL import Image
from pyritofile.anm import ANM
from pyritofile.ermmm import Elf
from pyritofile.skl import SKL
from pyritofile.skn import SKN

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
HASHES_URL = "https://raw.communitydragon.org/data/hashes/lol/"
sys.path.insert(0, HERE)
from riot_cdn import LocalWad, RemoteWad, download_file, game_manifest, manifest_file, path_hash  # noqa: E402


def prepare_hashes(work: str) -> None:
    """cdtb names bin fields/types/hash keys from CommunityDragon lists. Entry and game path names are not
    needed (links and hashed paths stay as consistent "{hex}" keys), so those lists stay empty (~1 GB saved)."""
    hdir = os.path.join(work, "hashes")
    os.makedirs(hdir, exist_ok=True)
    for name in ("binfields", "bintypes", "binhashes"):
        path = os.path.join(hdir, f"hashes.{name}.txt")
        if not os.path.exists(path):
            r = requests.get(f"{HASHES_URL}hashes.{name}.txt", timeout=300)
            r.raise_for_status()
            with open(path, "wb") as f:
                f.write(r.content)
    for name in ("binentries", "game"):
        open(os.path.join(hdir, f"hashes.{name}.txt"), "a").close()
    # cdtb resolves its hash directory at import time; point its hash files at ours.
    for hashfile, name in ((cdtb_binfile.hashfile_binfields, "binfields"), (cdtb_binfile.hashfile_bintypes, "bintypes"),
                           (cdtb_binfile.hashfile_binhashes, "binhashes"), (cdtb_binfile.hashfile_binentries, "binentries"),
                           (cdtb_hashes.hashfile_game, "game")):
        hashfile.filename = os.path.join(hdir, f"hashes.{name}.txt")


def read_env_file(path: str) -> dict:
    env = {}
    if os.path.exists(path):
        for line in open(path):
            m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$", line)
            if m:
                env[m.group(1)] = m.group(2).strip().strip('"')
    return env


def champion_keys(convex_url: str, set_key: str) -> list:
    r = requests.post(f"{convex_url}/api/query", json={
        "path": "queries:listChampions", "args": {"setKey": set_key}, "format": "json"}, timeout=60)
    r.raise_for_status()
    return [c["key"] for c in r.json()["value"] if c.get("key")]


def vec(v):
    return [-v.x, v.y, v.z]


def quat(q):
    return [q.x, -q.y, -q.z, q.w]


def trs_matrix(t, r, s):
    x, y, z, w = r
    rot = np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])
    m = np.eye(4)
    m[:3, :3] = rot * np.array(s)
    m[:3, 3] = t
    return m


class GameFiles:
    """Set wad on disk first; base-skin and shared assets come from champion / TFT wads read in place."""

    def __init__(self, work: str, set_key: str):
        self.manifest = game_manifest(work)
        wad_name = f"DATA/FINAL/{set_key}.wad.client"
        pf = manifest_file(self.manifest, wad_name)
        if pf is None:
            sys.exit(f"{wad_name} not found in the live game manifest")
        print(f"downloading {wad_name} ({pf.size / 1e6:.0f} MB)")
        self.local = LocalWad(download_file(pf, os.path.join(work, f"{set_key}.wad.client")))
        self.remote = {}

    def _remote(self, name: str):
        if name not in self.remote:
            pf = manifest_file(self.manifest, name)
            self.remote[name] = RemoteWad(pf) if pf else None
        return self.remote[name]

    def read(self, path: str):
        if not path:
            return None
        data = self.local.read(path)
        if data is not None:
            return data
        m = re.match(r"(?i)assets/characters/([^/]+)/", path)
        for name in ([f"DATA/FINAL/Champions/{m.group(1)}.wad.client"] if m else []) + [
                "DATA/FINAL/TFTCommon.wad.client", "DATA/FINAL/Maps/Shipping/Map22.wad.client"]:
            w = self._remote(name)
            data = w.read(path) if w else None
            if data is not None:
                return data
        return None

    def bin(self, path: str):
        data = self.read(path)
        return None if data is None else BinFile(io.BytesIO(data)).to_serializable()

    def image(self, path: str):
        data = self.read(path)
        if data is None:
            return None
        try:
            img = Image.open(io.BytesIO(TexConverter.tex_to_dds(data))).convert("RGB")
        except Exception as e:
            print(f"  cannot decode {path}: {e}")
            return None
        img.thumbnail((512, 512), Image.LANCZOS)  # units are ~100 px tall on screen
        return img


def material_texture(skin_bin: dict, link):
    mat = skin_bin.get(link) if link else None
    samplers = (mat or {}).get("samplerValues") or []
    for s in samplers:
        if re.search(r"diffuse|main|albedo|^texture$", s.get("TextureName") or s.get("samplerName") or "", re.I):
            return s.get("texturePath")
    return samplers[0].get("texturePath") if samplers else None


def resolve_clip(clips: dict, name: str, depth: int = 0):
    clip = clips.get(name)
    if not clip or depth > 5:
        return None
    path = (clip.get("mAnimationResourceData") or {}).get("mAnimationFilePath")
    if path:
        return path
    for sub in clip.get("mClipNameList") or []:
        found = resolve_clip(clips, sub, depth + 1)
        if found:
            return found
    return None


def pick_clips(anim_bin: dict) -> dict:
    graph = next(iter(anim_bin.values()))
    clips = graph.get("mClipDataMap") or {}
    names = [str(n) for n in clips]
    clips = {str(k): v for k, v in clips.items()}
    idle = next((n for n in names if n.lower() in ("idle1", "idle")), None) \
        or next((n for n in names if re.match(r"(?i)idle\d*$", n)), None) \
        or next((n for n in names if "idle" in n.lower() and "to" not in n.lower()), None)
    celebration = next((n for n in names if n.lower() == "celebration"), None)
    chosen = {}
    for label, name in (("idle", idle), ("celebration", celebration)):
        path = resolve_clip(clips, name) if name else None
        if path:
            chosen[label] = path
    return chosen


class GltfBuilder:
    def __init__(self):
        self.blob = bytearray()
        self.gltf = {"asset": {"version": "2.0", "generator": "t-flex-t build_models.py"}, "buffers": [],
                     "bufferViews": [], "accessors": [], "nodes": [], "meshes": [], "skins": [], "animations": [],
                     "materials": [], "textures": [], "images": [],
                     "samplers": [{"magFilter": 9729, "minFilter": 9987}], "scenes": [{"nodes": []}], "scene": 0}

    def view(self, data: bytes, target=None) -> int:
        while len(self.blob) % 4:
            self.blob.append(0)
        bv = {"buffer": 0, "byteOffset": len(self.blob), "byteLength": len(data)}
        if target:
            bv["target"] = target
        self.blob += data
        self.gltf["bufferViews"].append(bv)
        return len(self.gltf["bufferViews"]) - 1

    def accessor(self, arr: np.ndarray, gltf_type: str, component: int, target=None, minmax=False) -> int:
        acc = {"bufferView": self.view(arr.tobytes(), target), "componentType": component,
               "count": int(arr.shape[0]), "type": gltf_type}
        if minmax:
            flat = arr.reshape(arr.shape[0], -1)
            acc["min"], acc["max"] = flat.min(axis=0).tolist(), flat.max(axis=0).tolist()
        self.gltf["accessors"].append(acc)
        return len(self.gltf["accessors"]) - 1

    def texture(self, img: Image.Image) -> int:
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=88)
        self.gltf["images"].append({"bufferView": self.view(buf.getvalue()), "mimeType": "image/jpeg"})
        self.gltf["textures"].append({"source": len(self.gltf["images"]) - 1, "sampler": 0})
        return len(self.gltf["textures"]) - 1

    def write(self, path: str) -> None:
        while len(self.blob) % 4:
            self.blob.append(0)
        self.gltf["buffers"] = [{"byteLength": len(self.blob)}]
        js = json.dumps({k: v for k, v in self.gltf.items() if v != []}, separators=(",", ":")).encode()
        js += b" " * ((4 - len(js) % 4) % 4)
        with open(path, "wb") as f:
            f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(self.blob)))
            f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
            f.write(struct.pack("<II", len(self.blob), 0x004E4942) + bytes(self.blob))


def convert(files: GameFiles, key: str, out_path: str) -> dict:
    k = key.lower()
    skin_bin = files.bin(f"data/characters/{k}/skins/skin0.bin")
    if not skin_bin:
        raise RuntimeError("skins/skin0.bin not found")
    skin_entry = next(v for v in skin_bin.values() if isinstance(v, dict) and "skinMeshProperties" in v)
    props = skin_entry["skinMeshProperties"]
    skl = SKL(); skl.read("", raw=files.read(props["skeleton"]))
    skn = SKN(); skn.read("", raw=files.read(props["simpleSkin"]))
    hidden = set(re.split(r"[\s,]+", (props.get("initialSubmeshToHide") or "").lower())) - {""}
    overrides = {o["submesh"].lower(): o for o in props.get("materialOverride") or [] if o.get("submesh")}
    default_tex = props.get("texture") or material_texture(skin_bin, props.get("Material"))
    if default_tex and path_hash(default_tex) == path_hash("assets/shared/materials/black.tex"):
        default_tex = None  # placeholder material: render with a flat colour instead of black

    b = GltfBuilder()
    joints = skl.joints
    local = [(vec(j.local_translate), quat(j.local_rotate), [j.local_scale.x, j.local_scale.y, j.local_scale.z])
             for j in joints]
    for j, (t, r, s) in zip(joints, local):
        b.gltf["nodes"].append({"name": j.name, "translation": t, "rotation": r, "scale": s})
    for i, j in enumerate(joints):
        if j.parent >= 0:
            b.gltf["nodes"][j.parent].setdefault("children", []).append(i)
    world = [None] * len(joints)

    def world_of(i):
        if world[i] is None:
            m = trs_matrix(*local[i])
            world[i] = m if joints[i].parent < 0 else world_of(joints[i].parent) @ m
        return world[i]

    ibm = np.array([np.linalg.inv(world_of(i)).T.flatten() for i in range(len(joints))], dtype=np.float32)
    b.gltf["skins"].append({"joints": list(range(len(joints))), "inverseBindMatrices": b.accessor(ibm, "MAT4", 5126)})

    influences = list(skl.influences) if skl.influences else list(range(len(joints)))
    verts = skn.vertices
    pos = np.array([vec(v.position) for v in verts], dtype=np.float32)
    nrm = np.array([vec(v.normal) for v in verts], dtype=np.float32)
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-8)
    uv = np.array([[v.uv.x, v.uv.y] for v in verts], dtype=np.float32)
    jnt = np.array([[influences[i] if i < len(influences) else 0 for i in v.influences] for v in verts], dtype=np.uint16)
    wgt = np.array([list(v.weights) for v in verts], dtype=np.float32)
    sums = wgt.sum(axis=1, keepdims=True)
    wgt = np.where(sums > 0, wgt / np.where(sums > 0, sums, 1), np.array([1, 0, 0, 0], dtype=np.float32))
    indices = np.array(skn.indices, dtype=np.uint32)

    textures = {}

    def texture_index(path):
        if path not in textures:
            img = files.image(path) if path else None
            textures[path] = b.texture(img) if img else None
        return textures[path]

    primitives = []
    for sm in skn.submeshes:
        if sm.name.lower() in hidden:
            continue
        o = overrides.get(sm.name.lower())
        ti = texture_index((o.get("texture") or material_texture(skin_bin, o.get("Material"))) if o else None)
        if ti is None:
            ti = texture_index(default_tex)
        sl = slice(sm.vertex_start, sm.vertex_start + sm.vertex_count)
        tri = indices[sm.index_start:sm.index_start + sm.index_count].reshape(-1, 3)[:, [0, 2, 1]] - sm.vertex_start
        wide = sm.vertex_count >= 65536
        mat = {"name": sm.name, "doubleSided": True,
               "pbrMetallicRoughness": {"metallicFactor": 0, "roughnessFactor": 0.85}}
        if ti is not None:
            mat["pbrMetallicRoughness"]["baseColorTexture"] = {"index": ti}
        else:
            mat["pbrMetallicRoughness"]["baseColorFactor"] = [0.45, 0.6, 0.45, 1]
        b.gltf["materials"].append(mat)
        primitives.append({
            "attributes": {
                "POSITION": b.accessor(pos[sl], "VEC3", 5126, 34962, minmax=True),
                "NORMAL": b.accessor(nrm[sl], "VEC3", 5126, 34962),
                "TEXCOORD_0": b.accessor(uv[sl], "VEC2", 5126, 34962),
                "JOINTS_0": b.accessor(jnt[sl], "VEC4", 5123, 34962),
                "WEIGHTS_0": b.accessor(wgt[sl], "VEC4", 5126, 34962),
            },
            "indices": b.accessor(tri.astype(np.uint32 if wide else np.uint16).reshape(-1), "SCALAR",
                                  5125 if wide else 5123, 34963),
            "material": len(b.gltf["materials"]) - 1,
        })
    mesh_node = len(b.gltf["nodes"])
    b.gltf["meshes"].append({"name": key, "primitives": primitives})
    b.gltf["nodes"].append({"name": key, "mesh": 0, "skin": 0})
    b.gltf["nodes"].append({"name": "armature", "children": [i for i, j in enumerate(joints) if j.parent < 0]})
    b.gltf["scenes"][0]["nodes"] = [mesh_node, mesh_node + 1]

    joint_by_hash = {}
    for i, j in enumerate(joints):
        joint_by_hash[j.hash] = i
        joint_by_hash.setdefault(Elf(j.name), i)
    anim_bin = files.bin(f"data/characters/{k}/animations/skin0.bin")
    clips = pick_clips(anim_bin) if anim_bin else {}
    for label, anm_path in clips.items():
        raw = files.read(anm_path)
        if raw is None:
            continue
        anm = ANM(); anm.read("", raw=raw)
        fps = anm.fps or 30
        samplers, channels = [], []
        for track in anm.tracks:
            ji = joint_by_hash.get(track.joint_hash)
            if ji is None or not track.poses:
                continue
            for prop, conv, gtype, target in (("translate", vec, "VEC3", "translation"),
                                              ("rotate", quat, "VEC4", "rotation"),
                                              ("scale", lambda v: [v.x, v.y, v.z], "VEC3", "scale")):
                keys = sorted((t, getattr(p, prop)) for t, p in track.poses.items() if getattr(p, prop) is not None)
                if not keys:
                    continue
                times = np.array([t / fps for t, _ in keys], dtype=np.float32)
                vals = np.array([conv(v) for _, v in keys], dtype=np.float32)
                if prop == "rotate":
                    vals /= np.maximum(np.linalg.norm(vals, axis=1, keepdims=True), 1e-8)
                    for n in range(1, len(vals)):  # keep quaternions on one hemisphere for LINEAR blending
                        if np.dot(vals[n - 1], vals[n]) < 0:
                            vals[n] = -vals[n]
                samplers.append({"input": b.accessor(times, "SCALAR", 5126, minmax=True),
                                 "output": b.accessor(vals, gtype, 5126), "interpolation": "LINEAR"})
                channels.append({"sampler": len(samplers) - 1, "target": {"node": ji, "path": target}})
        if channels:
            b.gltf["animations"].append({"name": label, "samplers": samplers, "channels": channels})

    b.write(out_path)
    return {"clips": sorted(clips), "textures": sum(1 for v in textures.values() if v is not None)}


def main():
    env = read_env_file(os.path.join(REPO, ".env.local"))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", default="TFTSet18", help="set key, also the wad name (DATA/FINAL/<set>.wad.client)")
    ap.add_argument("--keys", nargs="*", help="champion keys (default: listChampions from Convex)")
    ap.add_argument("--convex-url", default=os.environ.get("VITE_CONVEX_URL") or env.get("VITE_CONVEX_URL"))
    ap.add_argument("--work", default=os.path.join(os.environ.get("TMPDIR", "/tmp"), "tft-models"))
    ap.add_argument("--out", default=os.path.join(REPO, "public", "models"))
    args = ap.parse_args()

    os.makedirs(args.work, exist_ok=True)
    prepare_hashes(args.work)
    keys = args.keys or champion_keys(args.convex_url, args.set)
    files = GameFiles(args.work, args.set)

    raw_dir = os.path.join(args.work, "raw", args.set)
    out_dir = os.path.join(args.out, args.set)
    os.makedirs(raw_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    built = []
    for key in keys:
        try:
            info = convert(files, key, os.path.join(raw_dir, f"{key}.glb"))
            built.append(key)
            print(f"{key:24s} {info}")
        except Exception as e:
            print(f"{key:24s} FAILED: {e}")

    def pack(key):
        subprocess.run(["npx", "-y", "gltfpack@1.3.0", "-cc", "-i", os.path.join(raw_dir, f"{key}.glb"),
                        "-o", os.path.join(out_dir, f"{key}.glb")], check=True, capture_output=True)

    with ThreadPoolExecutor(8) as pool:
        list(pool.map(pack, built))
    total = sum(os.path.getsize(os.path.join(out_dir, f"{k}.glb")) for k in built)
    print(f"packed {len(built)}/{len(keys)} models into {out_dir} ({total / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
