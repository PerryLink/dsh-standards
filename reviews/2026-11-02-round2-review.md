# Round 2 review — 2026-11-02

> 非独立 reviewer · 非官方 · 非认证 · 无 `verified`。Review of `ROUND2-REPORT-2026-11-02.md` and `J3-REPRO.md`.

## What holds

- **J3 is a real, reproducible case**: a bundle entry's wrong-type/enum config was silently accepted, while the same schema parsed directly throws. That is enough to ask the host team a focused question.
- **J5 is real and actionable**: 0/15 READMEs have a dedicated permissions section. Author-kit template is the right response; not an ENTRY gate.
- **B2/B4 now have fixture-level passes**, including a negative control for B4 and pending/optional/replacement for B2.
- **15-plugin entry re-check: 14 pass / 1 incomplete / 0 fail**, which supports C3 flow-only + C6 A7.

## What needs tightening

1. **J3 control is confounded.** The built-in `webserver` row used `port: "not-a-number"` *and* a missing host; the failure was `$.host missing required value`, not `$.port`. That does not prove the built-in port type was validated. Rerun with a valid host and only `port` invalid; expect `$.port`.
2. **J3 boot result is ambiguous.** `dump 0 / boot 0 (timeout kill=124)` mixes "process stayed alive" with "config accepted". Use a harness that waits for the URL, records the config validation result separately, then kills; do not treat timeout 124 as pass/fail.
3. **Unknown key is probably Schemastery semantics**, not a host bug. Keep it as a separate warning/UX issue; do not bundle it with wrong-type/enum.
4. **One plugin / one host / one OS.** Call it "one reproducible case", not "all bundle entries bypass validation".
5. **J5 keyword counts are weak** (network often matches a link). The next step is code-level extraction (fs/network/credentials/child_process) compared with the README; still author aid.
6. **B2/B4 are shape-compatible, not template-executed**; one workaround (`Object.assign(fn,{inject:['counter']})`) was needed. Cross-version stability is not tested.
7. **No edge in the 15 C3 re-check; no hold-out; no independent reviewer.** Do not turn these results into an ecosystem claim.

## Decision

- No standard change from J3. It is a host-side question first; if the host says the behavior is intentional, record a documented host limitation.
- C3 flow-only and C6 A7 stay; no new ENTRY gate from this round.
- J5 stays author aid; B2/B4 stay fixture evidence.

## Next 3

1. J3 clean control (valid host + invalid port) and a private host report.
2. J5 code-level scan on 5–10 plugins; compare with README.
3. B2/B4 dispose/resource-leak counts and B6 prompt-prefix; cross-version only if a second host is available.
