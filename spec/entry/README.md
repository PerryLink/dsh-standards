# ENTRY

Compatibility surface: can an existing plugin be recognized/installed and at
least run?

- Normative text: [../../31-DSH-ENTRY入门规范.md](../../31-DSH-ENTRY入门规范.md)
- External portrait: [../../99-DSH-ENTRY兼容性画像-对外版.md](../../99-DSH-ENTRY兼容性画像-对外版.md)
- Checker: `node 40-checker/bin/dsh-plugin-verify.mjs <dir> --scope entry --entry-claim static|runtime`
- Current: 18/18 recognized, 0 clean; 18/18 base-only runtime JSON; 10 G3 verified / 8 partial; after gate 8 clean + 2 reject + 8 partial; client 15/15 loaded in the web profile.
