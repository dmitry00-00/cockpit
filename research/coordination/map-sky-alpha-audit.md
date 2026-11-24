# Map and sky PNG alpha/source QA — 2026-11-03

Read-only check of the 18 selected original PNGs in `design/art/map-and-sky-v1/manifest.json`. Decoded PNG pixels with a temporary Python standard-library parser (`struct`, `zlib`); no Pillow, image edits, or generator runs. All 18 actual dimensions, byte counts, and SHA-256 hashes match their manifest entries. Every file is 1254×1254, RGBA8, non-interlaced.

`bbox≥128` and margins use alpha ≥128. Margins order is left, right, top, bottom in pixels. Alpha median is over nontransparent pixels (`alpha>0`). Alpha≥240/250 totals are included to distinguish antialiasing from nearly opaque pixels.

| ID / file | alpha 0 / 1–254 / 255 | ≥240 / ≥250 | median | bbox>0 / margins; bbox≥128 / margins | SHA-256 |
|---|---:|---:|---:|---|---|
| `codex-pin-quest-v1` · `pin-quest.png` | 913,968 / 658,182 / 366 | 645,151 / 641,166 | 253 | [0,20,1221,1244] / [0,32,20,9]; [168,101,1054,1165] / [168,199,101,88] | `19fbf2b954230604556387d7c4f6482f2d719c85a58b54cec04e5c3a70cad26c` |
| `codex-pin-danger-v1` · `pin-danger.png` | 968,467 / 603,689 / 360 | 586,574 / 580,310 | 253 | [0,22,1245,1253] / [0,8,22,0]; [77,179,1175,1123] / [77,78,179,130] | `6663304e3cdeec08ad50dbb873ffa94d44b0b69fe569adba5fe2554f1cf0a490` |
| `codex-pin-shop-v1` · `pin-shop.png` | 914,698 / 657,520 / 298 | 645,566 / 641,342 | 253 | [0,31,1239,1253] / [0,14,31,0]; [176,113,1058,1158] / [176,195,113,95] | `595e7a65b42f468b2ccda00e1e5a393e894d85425e30d5f18b00aca8e28a4811` |
| `codex-pin-rumor-v1` · `pin-rumor.png` | 854,676 / 717,348 / 492 | 706,205 / 701,967 | 253 | [0,23,1217,1217] / [0,36,23,36]; [153,63,1086,1175] / [153,167,63,78] | `49f09234c7f34e11e2dd9e31f9725a260401a39991debbfcbd911734129ba40b` |
| `codex-pin-camp-v1` · `pin-camp.png` | 858,025 / 714,320 / 171 | 701,354 / 696,904 | 253 | [0,19,1250,1253] / [0,3,19,0]; [150,97,1079,1166] / [150,174,97,87] | `f8b73d19bed785e2ec8e6ec85116f886faecb9aab0ec9e0e2dca52d9f456a76f` |
| `codex-pin-road-v1` · `pin-road.png` | 935,799 / 636,550 / 167 | 623,850 / 618,994 | 252 | [0,19,1230,1253] / [0,23,19,0]; [183,92,1054,1146] / [183,199,92,107] | `e8b711a0930afc791ee57191f5de4e3446b108049b57ad6e1debcd66a3b723d8` |
| `codex-sky-dawn-v1` · `sky-dawn.png` | 568,350 / 1,003,687 / 479 | 391,484 / 381,216 | 1 | [0,21,1253,1253] / [0,0,21,0]; [106,240,1144,998] / [106,109,240,255] | `4e68bc03d354a843899000dbf7713b07ff318890763d0b8a2e7f4095a58d75bb` |
| `codex-sky-day-v1` · `sky-day.png` | 1,011,293 / 560,373 / 850 | 520,776 / 513,042 | 252 | [0,17,1237,1253] / [0,16,17,0]; [67,71,1176,1165] / [67,77,71,88] | `a18762083a49004e89c1b48d34e614fc87aeb3af5ce8b384856af758a9489c7c` |
| `codex-sky-dusk-v1` · `sky-dusk.png` | 1,151,251 / 420,714 / 551 | 376,423 / 369,536 | 253 | [0,33,1233,1237] / [0,20,33,16]; [98,212,1154,1006] / [98,99,212,247] | `ad58662d999983eeb838bb0271abc724f3a30d3a571a0c58206d3560ccf8313f` |
| `codex-sky-night-v1` · `sky-night.png` | 1,135,629 / 436,128 / 759 | 395,012 / 384,549 | 252 | [0,22,1233,1253] / [0,20,22,0]; [151,112,1103,1161] / [151,150,112,92] | `aaf81f36526891e325eca5d779a3bf63c85ec7a1188417196cb78ec4ed953e77` |
| `codex-sky-clear-v1` · `sky-clear.png` | 1,216,120 / 356,153 / 243 | 320,947 / 313,097 | 253 | [0,17,1237,1253] / [0,16,17,0]; [164,165,1043,1015] / [164,210,165,238] | `21719972e5814f09a5ef41560ce68339c4b24870c37b888f90566e12781512d5` |
| `codex-sky-cloudy-v1` · `sky-cloudy.png` | 1,004,557 / 567,346 / 613 | 549,070 / 545,432 | 253 | [0,23,1225,1253] / [0,28,23,0]; [73,253,1179,1009] / [73,74,253,244] | `6de23d09a4812796092d9598b34b4798878f7a4881e5755141bd3f8732d279cc` |
| `codex-sky-rain-v1` · `sky-rain.png` | 947,462 / 624,529 / 525 | 600,625 / 593,201 | 253 | [0,48,1213,1253] / [0,40,48,0]; [70,151,1184,1135] / [70,69,151,118] | `0453dc68e5dc44932a71ffe42530638f2edd6a202fd0ddc663f1ee0d68435462` |
| `codex-sky-storm-v1` · `sky-storm.png` | 1,051,173 / 520,817 / 526 | 496,281 / 489,401 | 253 | [0,19,1227,1243] / [0,26,19,10]; [126,116,1127,1134] / [126,126,116,119] | `63786a9747fa1dc4829985b0ee52185c84392d575a7fa146a98983f0dfc9a7ff` |
| `codex-moon-new-v1` · `moon-new.png` | 833,205 / 738,776 / 535 | 726,171 / 722,583 | 253 | [0,21,1193,1253] / [0,60,21,0]; [142,157,1097,1134] / [142,156,157,119] | `6a4035b5a13a5a40df5c338da08b5b532bd6b7790a0e4008120001cb52eb0e81` |
| `codex-moon-waxing-v1` · `moon-waxing.png` | 841,794 / 730,339 / 383 | 715,581 / 711,666 | 253 | [0,33,1215,1253] / [0,38,33,0]; [143,149,1096,1123] / [143,157,149,130] | `1fe12d112a995f8e3ead2db46f4a130ce1686b431511d2f169d0b8a7525c01fc` |
| `codex-moon-full-v1` · `moon-full.png` | 786,394 / 785,797 / 325 | 765,979 / 761,429 | 253 | [0,57,1239,1213] / [0,14,57,40]; [124,135,1109,1134] / [124,144,135,119] | `535473f8c8034201cf0cf9e9b17ae5d758ce2042b13deee501046c8e9ed8f978` |
| `codex-moon-waning-v1` · `moon-waning.png` | 725,463 / 846,264 / 789 | 831,859 / 827,375 | 253 | [0,19,1239,1213] / [0,14,19,40]; [105,113,1136,1152] / [105,117,113,101] | `16db57b4809e853c702e4da2c2a0ec4ed25a0454384015c2e4ddca73ac04a0e4` |

## Notes

`sky-dawn.png` has nontransparent median alpha 1; alpha≥240 pixels are 391,484 of 1,573,516 nontransparent pixels. This records the PNG data only; it is not by itself a failure or a visual-quality verdict. Other alpha profiles vary by the painted silhouette and atmospheric treatment.

For all 18 files the alpha-positive (`alpha>0`) bounding box reaches at least one canvas edge, while the substantial silhouette (`alpha≥128`) has clear margins (minimum observed: 63 px). The alpha-positive box counts even near-zero antialias/atmospheric pixels and does not itself prove visible clipping; inspect the faint edge haze at actual UI sizes and on both surfaces.

Root reports visual inspection confirms `moon-waxing.png` is right-lit and `moon-waning.png` is left-lit. Alpha statistics cannot establish phase orientation; this report does not derive or independently verify that visual detail.

This audit covers selected source PNGs only. Public derivative-pipeline status is still in progress and was not treated as part of source QA.
