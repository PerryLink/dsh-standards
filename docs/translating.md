# Translation rules

> Translations are derived text; the Chinese source is normative until the
> organizer says otherwise.

1. Keep clause IDs, gate IDs, and status words unchanged.
2. Do not translate `not-run`, `blocked`, `measured`, `manual`, `stale` into
   words that imply pass/fail.
3. Add `Translation-Of: <commit>` to the commit trailer.
4. One PR per language; do not bundle a wording change with a translation.
5. A translation that changes meaning is a bug; link the source line.
6. Machine translation is allowed with human review; disclose it.
