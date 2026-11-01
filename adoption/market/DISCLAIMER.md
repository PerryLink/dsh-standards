# Market disclaimer (fixed text)

Use this text **in the same view** as any DSH-ENTRY / DSH-FLOW / DSH-BOOST
label. Do not put it only in a linked page or an image alt.

## Chinese

```text
非官方 · 非认证 · 非安全审计 · 非背书 · 不提供任何担保
层级 = 采用深度，不是质量等级；A–D 是另一条轴，不可换算。
证据与日期见链接；过期或撤回的记录显示为 stale / withdrawn，不显示为通过。
```

## English

```text
Not official. Not a certification. Not a security audit. Not an endorsement.
No warranty. The level is adoption depth, not a quality grade; A–D is a separate
axis and must not be converted. See the evidence link and date; expired or
withdrawn records show stale / withdrawn, never “passed”.
```

## What the market must not do

- Compute the level itself; only render the record.
- Turn the label into a ranking weight or a paid placement.
- Hide `not-run`, `stale`, or `withdrawn`.
- Say “certified”, “approved”, “secure”, or “recommended”.
- Keep a label after the author or the project withdraws it.

## Revocation

| Trigger | Display | Timing |
|---|---|---|
| `expiresAt` passed | `stale` | immediately |
| author withdraws | `withdrawn` + history | next sync |
| certificate/record revoked | `withdrawn` + reason | next sync |
| misuse | notice, 30-day cure, removal | 7-day notice |

The market is responsible for **faithful rendering**, not for the truth of the
evidence. The project is responsible for the record, not for the market’s
ranking.
