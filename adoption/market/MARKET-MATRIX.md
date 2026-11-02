# Market check matrix (v0.1, 2026-11-02)

> 非官方 · 非认证 · 非排名 · 非安全审计。市场规则是各自领域的权威；本表只做差异/重叠/谁负责，不做“谁更合理”。

| 标准条款 | awesome | dsh-market | hub | dsh-web | TUI | sidebar | radar | 0xsline | handbook | skillhub |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C1 public + `dsh-plugin` topic | = | = | = | = | = | = | = | = | 0 | = |
| C2 `dsh.bundle` + patch | = | = | = | = | = | = | 0 | = | 0 | 0 |
| C3 tested compose/install | 0 | + | + | + | + | + | + | 0 | 0 | + |
| C4 `engines.dsh`/peer | 0 | + | + | + | + | + | + | 0 | 0 | 0 |
| C5 `./client` export | 0 | ? | ? | + | 0 | + | 0 | 0 | 0 | 0 |
| C6 entry + metadata | - | = | + | + | + | 0 | = | = | 0 | + |
| C7 version/commit/freshness | - | = | + | = | = | = | = | 0 | 0 | = |
| C8 no grade/rank | 0 | 0 | - | 0 | 0 | 0 | 0 | 0 | 0 | - |
| J1–J8 | 0 | + | + | + | + | + | + | 0 | 0 | ? |
| B1–B8 | 0 | 0 | 0 | ? | ? | ? | + | 0 | 0 | ? |

Legend: `=` equivalent/covered, `+` market has a stricter or independent check, `-` market is looser/partial, `0` no requirement, `?` not public/applicable. `+` does not mean the same artifact.

## Reading

- **C1/C2 are common** across the installable markets; keep them as entry.
- **C3 is self-created as an author-tested compose line**: markets require installability/verified install, not a tested compose line. Treat C3 as a **FLOW hypothesis**, not an entry gate.
- **C4/C5 are market/host-specific**: dsh-market/TUI/web need them; awesome/0xsline/handbook do not. Use warnings or host profiles.
- **C6 license/repository is not universal**: license is a market/legal profile; repository is optional; entry declaration/description/category is the common part.
- **C7 commit/freshness is a market-side signal**: version is common; commit/freshness is a warning.
- **C8 is our label policy**: dshfind/hub/dshbase/dsh-plugin.market have their own scores/Verified labels; we cannot require them to drop their labels.
- **J/B are profiles**, not a universal “highest level”; do not rank.

## Use

Show this table to a market maintainer as “your rule vs our checklist”, not as a market score. If a market requires something we do not, add a profile; if we require something the market does not, downgrade it to warning/profile. Never change a market’s schema/UX.
