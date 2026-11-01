# Modification notice policy

> **If you modify this repository's text, you must say what you changed.**
> This is the “indicate changes” requirement of CC BY 4.0, made concrete.

## When it applies

You copied or adapted a specification, clause, checklist, README section, or
translation from this repository and publish the result anywhere (repository,
docs site, book, training material, internal handbook, AI prompt library).

## What to publish

Put a clearly visible **Change Notice** next to the title or in the document
header. It must contain:

```text
Source: https://github.com/PerryLink/dsh-standards/<path>@<commit>
License: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
Changes:
- <file/section>: <what changed> (reason)
- <file/section>: <what changed> (reason)
Date: YYYY-MM-DD
Modified version: <URL or “internal document”>
```

Rules:

1. **Be specific.** “Updated” or “minor edits” is not enough. Name the
   section/clause and the actual change (e.g. “§3 J5: removed the permission
   checklist item about network access”).
2. **Name the source commit.** A branch name is not a stable source.
3. **Keep it visible.** A footnote or an image alt text is not enough.
4. **Do not imply endorsement.** Do not use the DSH-ENTRY/FLOW/BOOST marks in a
   way that suggests the modified text is the original.
5. **Do not remove the disclaimer** “非官方 · 非认证 · 非安全审计”.

## Example

```text
Source: https://github.com/PerryLink/dsh-standards/blob/<commit>/31-DSH-ENTRY入门规范.md
License: CC BY 4.0
Changes:
- §2.2: narrowed the blocking rule to G0-G3; removed the G5 sentence (internal policy)
- §5: added an example for a private registry (clarification)
Date: 2026-11-02
Modified version: https://example.com/our-entry-standard
```

## Scope

This policy covers **text**. Code/scripts/schemas remain Apache-2.0 and are
governed by `LICENSE-APACHE`; marks remain under `governance/mark-policy.md`.
