# dsh-standards specification tree

One project, three adoption levels. Each level has its own maturity; they share
the glossary, evidence anchor, and checker.

| Level | Document | Maturity | Evidence |
|---|---|---|---|
| ENTRY | [../31-DSH-ENTRY入门规范.md](../31-DSH-ENTRY入门规范.md) | public-preview | 18/18 recognized; 10/18 base G3, 8 clean after gate; client 15/15 loaded |
| FLOW | [../32-DSH-FLOW顺畅规范.md](../32-DSH-FLOW顺畅规范.md) | draft | J1 real; J2–J8 not-run |
| BOOST | [../33-DSH-BOOST加速实践.md](../33-DSH-BOOST加速实践.md) | draft | LEV-3/6/7 measured (loader / provider-capture / synthetic timer) |

Rules:

- Levels depend on `common` only; do not import each other.
- A level is not a certification, badge, grade, or score.
- `dsh-standard` is an alias; `dsh-standards` is canonical.
