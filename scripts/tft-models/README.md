# TFT champion 3D models

Builds the animated `.glb` files used by the 3D boards (`/roll` mini-game and `/builder`) into `public/models/<setKey>/<championKey>.glb`.
No game install is needed: files are read from Riot's patcher CDN (live patchline) with HTTP range requests.

## Run

Requires [uv](https://docs.astral.sh/uv/) and Node (for `npx gltfpack`).

```bash
uv run --python 3.12 --with cdtb --with pyritofile --with numpy --with pillow \
  python scripts/tft-models/build_models.py --set TFTSet18
```

- Champion keys come from Convex `queries:listChampions` (`VITE_CONVEX_URL` from `.env.local`); pass `--keys DA_18_Ahri ...` to rebuild a few.
- Work files (set wad ~110 MB, manifests, hash lists) go to `$TMPDIR/tft-models` (`--work` to change).
- Re-run after a patch that changes models, or when switching `ACTIVE_SET_KEY`.

## What it does

1. Downloads `DATA/FINAL/<setKey>.wad.client` (meshes `.skn`, skeletons `.skl`, animations `.anm`, champion bins).
2. Per champion reads `data/characters/<key>/skins/skin0.bin` (mesh, skeleton, textures, `initialSubmeshToHide`,
   per-submesh material overrides) and `animations/skin0.bin` (clip name -> `.anm`).
   Textures missing from the set wad (base-skin assets) are read in place from `Champions/<name>.wad.client`,
   `TFTCommon` or `Map22`.
3. Writes a skinned glTF with the `idle` and `celebration` clips (X mirrored: League is left-handed), textures
   downscaled to 512 px JPEG.
4. Compresses with `gltfpack -cc` (meshopt); the client loads them with `MeshoptDecoder`.

## Known gaps

- `DA_18_Zyra`: the live skin bin only references a placeholder black texture, so the model is rendered flat green.
- Clips are sampled linearly; League interpolates some tracks with splines, so motion is slightly stiffer.
