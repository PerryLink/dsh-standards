# REPO evidence anchors at DSH 0.2.2-rc.3

> **asOf 2026-11-14 14:55 +08 (Asia/Shanghai).** This is the evidence summary for
> the P1-8 item of the 2026-11-14 rc3 audit: the `REPO/<path>:<line>` anchors in
> the standard documents are only as good as the commit they were re-taken at.

## What was checked

`40-checker/scripts/repo-anchor-check.mjs` scans the standard documents for
`REPO/<path>:<line>` and `<line>-<line>` / `<line>,<line>` anchors and resolves
each against a read-only host checkout (`/home/yy/deepseek-harness`) at commit
`38a6a5c965aa99ab525161efb7cc5cf1fe62fced` (`dsh-v0.2.2-rc.3`, 2026-11-13).

For every anchor it proves:

1. the referenced file exists at that commit;
2. every referenced line number is within the file;
3. a single-line anchor does not point at a blank line (a blank line is almost
   always an off-by-one).

It does **not** prove that the line still contains the symbol named around the
anchor — that is a semantic review, and the script prints the current line text
to make it cheap. Do not read this file as "the prose is semantically correct";
read it as "no anchor is broken or off the end of its file at rc.3".

## Result

```
REPO anchors at 38a6a5c965aa (host: /home/yy/deepseek-harness)
  OK 31-DS-C条款.md: 127 anchors, 0 drift, 0 warning
  OK 32-DS-R条款.md: 106 anchors, 0 drift, 0 warning
  OK 33-DS-G条款.md: 125 anchors, 0 drift, 0 warning
  OK 35-三层开发建议与验收清单.md: 0 anchors, 0 drift, 0 warning
  OK 60-权限与标注规范.md: 10 anchors, 0 drift, 0 warning
  OK 93-开发建议-入门.md: 0 anchors, 0 drift, 0 warning
total: 368 anchors, 0 drift, 0 warning
```

- The 6 known drifts from the audit (`plugin-manager/src/index.ts` 873→969,
  `tools.ts` 108→109, `package-manifest/src/types.ts`, `cordis-host-runner/
  sandbox.ts` 8→7, `vendor/README.md` 19→15, `install-spec.ts` 94-95→131) had
  already been fixed in 1.6.11; this run proves nothing else is out of range.
- Three anchors cited `REPO/docs/tool-catalog.md:9`, which is a blank line at
  rc.3 (the sentence "a tool schema is not statically knowable" is on line 8).
  They are corrected to `:8` in `31-DS-C条款.md` (§8.3 table row 56),
  `33-DS-G条款.md` (evidence list + §table row 6) and re-checked clean.

## Reproduce

```bash
node 40-checker/scripts/repo-anchor-check.mjs --host /home/yy/deepseek-harness
# JSON: node 40-checker/scripts/repo-anchor-check.mjs --host /home/yy/deepseek-harness --json
# pin a different commit: --commit <sha>
```

`--host` must be a git checkout with the pinned commit object; the script only
reads (`git show`), it never fetches or writes. `DSH_HOST` / `DSH_COMMIT` set the
same defaults.
