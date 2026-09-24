# Domain Docs

This repository uses a single-context domain documentation layout.

## Before exploring, read these

- `CONTEXT.md` at the repository root for the canonical vocabulary and project boundaries.
- Relevant ADRs under `docs/adr/` for the area being changed.
- Read an ADR's status and supersession notes before relying on its decision.

If a relevant file is absent, proceed without inventing a replacement. The domain-modeling workflow can add vocabulary or an ADR when a real gap is identified.

## Layout

```text
/
├── CONTEXT.md
├── docs/adr/
└── packages/
```

The monorepo is one product context. Package directories do not define separate domain contexts unless the root documentation explicitly says otherwise.

## Use the glossary's vocabulary

When output names a domain concept, use the term defined in `CONTEXT.md`: for example, Page data, Routes registry, Route, Dynamic navigation, Server core, Framework package, Template, and Scaffolder. Do not drift to synonyms the glossary explicitly avoids.

If a needed concept is absent, either reconsider the wording or note the gap for domain modeling.

## Flag ADR conflicts

If proposed work contradicts an accepted ADR, surface the conflict explicitly rather than silently overriding it:

> Contradicts ADR-0007, but worth reopening because…
