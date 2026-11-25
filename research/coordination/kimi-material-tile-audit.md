# Kimi materials and trim source QA — 2026-11-03

Read-only audit of the six selected original PNGs in `design/art/kimi-production-v1/manifest.json` (`kimi-material-*`). Decoded PNG rows with a temporary Python standard-library parser (`struct`, `zlib`); no Pillow, image edits, or generator runs. All six file sizes, SHA-256 hashes, and dimensions match their source-manifest entries. All are 8-bit PNGs.

| ID / file | Size; PNG type | Alpha=0 / 1–254 / 255 | Source SHA-256 |
|---|---|---:|---|
| `kimi-material-material-dark-wood-v1` · `material-dark-wood-v1.png` | 1024×1024; RGB (no alpha channel; decoded opaque) | 0 / 0 / 1,048,576 | `d380ad310d3535ee73860db5154e79f1801ecb9f1784a1e6c7b1e0bc1d07945f` |
| `kimi-material-material-plum-leather-v1` · `material-plum-leather-v1.png` | 1024×1024; RGB (no alpha channel; decoded opaque) | 0 / 0 / 1,048,576 | `332ed3ba27ab462608ddfd6e4bb17c6f88dee9141660ba23e1e4a0cec75618f1` |
| `kimi-material-material-warm-paper-v1` · `material-warm-paper-v1.png` | 1024×1024; RGB (no alpha channel; decoded opaque) | 0 / 0 / 1,048,576 | `f1447b858a774cae371699c9f04c3cad656b1f947077e6573287cfdfb8eec03f` |
| `kimi-material-trim-bronze-strip-v1` · `trim-bronze-strip-v1.png` | 1536×256; RGB (no alpha channel; decoded opaque) | 0 / 0 / 393,216 | `ddd3ca1678fe7170c377cd5f69f4cee6fff42bc98d8371ec353081d8d467753e` |
| `kimi-material-trim-bronze-corner-v1` · `trim-bronze-corner-v1.png` | 1024×1024; RGBA | 844,166 / 204,410 / 0 | `cf5d10b9605d938ee9cc0e3ae0315b8551bffb9020b4c26c9118e5aaccdefa4d` |
| `kimi-material-ornament-wax-seal-v1` · `ornament-wax-seal-v1.png` | 1024×1024; RGBA | 498,076 / 549,876 / 624 | `69c8b3129ddf1dc4b35897041be8422ba1573a0cf4f0ad6b3d9d7fa816771657` |

## Boundary comparison

For each requested wrap direction, compared the RGB colors of the opposite boundary pixels (the wrap pair) against immediate adjacent pixel pairs throughout the image in that same direction. `mean max-channel delta` summarizes boundary difference; ratio is wrap delta divided by the mean of ordinary neighboring pairs. A lower ratio means the seam edge differs less than typical adjacent pixels inside the tile. Exact-match percentage counts boundary pixel pairs with identical RGB. Metrics are diagnostics, not proof of a visually seamless repeat.

| Tile | Direction tested | Wrap mean max-channel delta | Interior-neighbor mean max-channel delta | Ratio | Exact wrap matches | p95 wrap delta |
|---|---|---:|---:|---:|---:|---:|
| Dark wood | horizontal | 1.985 | 2.055 | 0.966 | 3.61% | 4 |
| Dark wood | vertical | 4.523 | 5.164 | 0.876 | 0.98% | 10 |
| Plum leather | horizontal | 7.687 | 8.007 | 0.960 | 0.39% | 19 |
| Plum leather | vertical | 12.178 | 10.596 | 1.149 | 0.20% | 29 |
| Warm paper | horizontal | 4.053 | 4.219 | 0.961 | 0.88% | 9 |
| Warm paper | vertical | 5.175 | 4.585 | 1.129 | 0.10% | 12 |
| Bronze strip | horizontal only | 0.000 | 4.581 | 0.000 | 100% | 0 |

The strip's two horizontal edges match exactly at all 256 RGB samples; it was **not** evaluated for vertical wrapping because only horizontal repetition is required. The two textures with vertical wrap ratios above 1 have more average edge change than the within-image neighbor baseline in that direction. The images still require visual repeat inspection; do not mark any material `seamless` from these pixel metrics alone. `design/art/kimi-production-v1/materials.html` is the provided 2×2 texture / repeat-x review gallery; this audit does not claim its visual inspection.

`trim-bronze-corner-v1.png` and `ornament-wax-seal-v1.png` are isolated transparent elements, not tiles, so no edge-repeat metric applies. Their alpha totals show real transparency and partial antialias/material pixels; neither has a fully opaque pixel everywhere. The source manifest still marks all six `productionReady: false` with tile/visual QA pending.
