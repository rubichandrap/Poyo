# Issue tracker: GitHub Issues + local planning

GitHub Issues is the authoritative tracker for actionable work. Local files under `.scratch/<feature>/` hold specs, plans, research, and ticket drafts; they are not a second issue queue.

## Conventions

- Create an issue: `gh issue create --title "..." --body "..."`.
- Read an issue: `gh issue view <number> --comments`.
- List issues: `gh issue list --state open --json number,title,body,labels,comments`.
- Comment on an issue: `gh issue comment <number> --body "..."`.
- Apply or remove labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close an issue: `gh issue close <number> --comment "..."`.
- Local feature specs live at `.scratch/<feature-slug>/spec.md`.
- Local ticket drafts live at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`.
- Link local planning files from the authoritative GitHub issue when they are relevant.

Infer the repository from `git remote -v`; `gh` does this automatically inside the clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and pull requests, so resolve an ambiguous `#42` with `gh pr view 42` and then `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue. Create a local `.scratch/<feature>/` file only when the task explicitly calls for a local plan, spec, or research artifact.

## When a skill says "fetch the relevant ticket"

Fetch an authoritative ticket with `gh issue view <number> --comments`. If the user supplies a local path or explicitly requests local planning, read that file instead.

## Wayfinding operations

The GitHub issue is the authoritative map and ticket queue:

- A map is a GitHub issue labelled `wayfinder:map`.
- Child tickets are linked GitHub sub-issues when supported, or task-list entries with `Part of #<map>` when sub-issues are unavailable.
- Blocking edges use GitHub issue dependencies when supported, otherwise `Blocked by: #<n>` lines.
- Local `.scratch/` files may hold supporting notes but do not replace the GitHub map or tickets.
