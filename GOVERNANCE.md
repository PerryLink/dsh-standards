# Governance (one page)

> **Non-official.** This is a community draft maintained by one person plus AI
> staff. There is no legal entity, no council, no accreditation, and no
> independent certification body. The long-form design is `44`; the machine
> rules are `governance/roles.json`.

## Roles

| Role | Who | Can | Cannot |
|---|---|---|---|
| **Organizer** | PerryLink (creator) | set scope/names; issue or revoke records; approve mark policy; speak externally; appoint people | independently review own plugins; claim official status |
| **Maintainer** | appointed human | merge/release in an area; propose reviewers; update registry/portal | issue/revoke records alone; change level semantics alone |
| **Reviewer** | invited human | write review records; shadow reviews; declare COI | merge; issue records; review with an undisclosed conflict |
| **Contributor** | anyone | PRs, samples, translations, counterexamples | merge; self-approve; speak for the project |
| **AI staff** | bot accounts | triage, draft, run checks, register, translate | sign DCO; issue records; decide semantics; decide appeals; speak externally; merge spec/governance/checker |

## Decisions

| Class | Examples | Who |
|---|---|---|
| **A** | level definitions, issue/revoke a record, mark policy, legal statements, appointments | Organizer, recorded |
| **B** | clause text, gate semantics, scheme | 7-day comment, then Organizer; `provisional` 90 days |
| **C** | checker, schemas, portal, CI | one human maintainer |
| **D** | triage, links, read-only sync, reports | AI, logged, reversible |

- AI never counts toward quorum.
- A green CI is necessary, not sufficient.
- While solo, nothing is “consensus”; everything is `provisional` and expires
  after 90 days unless re-confirmed.

## Contributing

Use DCO 1.1 (`git commit -s`) + the DSH Contribution Terms v1 (`dsh-ct/1`).
No copyright assignment. Entity CLA only for on-behalf-of, >300 non-doc lines,
or a new normative clause. See `CONTRIBUTING.md` and
`governance/contribution-terms.md`.

## Conflicts and appeals

Declare employer/funding/own plugins in `governance/coi.json`. Recuse when you
share an org, employer, funder, or paid relationship with the subject. Appeals:
`governance/appeals.md`; AI can intake and re-run, only a human decides.

## Stage 0 / 1 / 2

- **Stage 0 (now)**: 1 human + AI. No council, no fees, no contracts.
- **Stage 1**: 2–3 human maintainers. Two-person review, path-scoped CODEOWNERS.
- **Stage 2**: ≥5 maintainers from ≥3 organizations, or money/contracts/entity.
  Only then revisit `80/84/86` (council, entity, insurance, formal appeals panel).

Nothing in this file is legal advice. Before relying on the terms, have a lawyer
review them in your jurisdiction.
