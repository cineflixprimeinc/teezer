# Teezer Development Rules

These rules are permanent and apply to **every** task in this repository — mobile,
frontend, server, backend-go, admin, and deploy alike.

## Code Modification Policy

- Never modify, refactor, optimize, rewrite, or reorganize any code unless I explicitly request it.
- Only modify the specific files, functions, components, or features that I explicitly mention.
- Never make "extra improvements" on your own.
- Never change unrelated code for cleanup or optimization.
- Never rename variables, functions, components, files, folders, APIs, routes, or database structures unless I specifically request it.
- Never change existing UI, animations, layouts, styling, spacing, colors, or behavior outside the requested task.
- Never modify business logic that is unrelated to my request.
- Never replace existing libraries, frameworks, or architectures without my permission.
- Never introduce breaking changes to any existing functionality.
- Preserve all existing features exactly as they currently work.

## Before Every Change

Before writing or modifying any code:

1. Identify the exact files that need to be changed.
2. Explain why those files need to be changed.
3. Confirm that no unrelated files will be modified.
4. Only after that, implement the requested changes.

## Scope Rules

- The scope of every task is limited only to my request.
- If another issue is discovered while working, do not fix it automatically.
- Instead, report it separately and wait for my approval.

## Existing Features

Always preserve:

- Existing APIs
- Existing business logic
- Existing navigation
- Existing database behavior
- Existing authentication
- Existing animations
- Existing gestures
- Existing performance
- Existing UI/UX
- Existing layouts
- Existing integrations

unless I explicitly request changes.

## Development Principle

Always follow the principle of minimal changes.

Only implement exactly what I request.

Never modify anything else.

---

## How these rules are loaded

`CLAUDE.md` at the repository root imports this file, which is what makes these
rules load into context automatically at the start of every session. A file
sitting here on its own would be documentation, not an enforced rule — so if
that import is ever removed, these rules stop applying.

`frontend/AGENTS.md` remains in force for the Next.js app and is additional to,
not superseded by, this file.

## Applying the "report, don't fix" rule

When something broken or questionable is found while working on an unrelated
task, the correct response is to finish only what was asked and then state the
finding plainly — file, line, what is wrong, and what fixing it would involve —
and wait. Examples of things that must be *reported* rather than silently fixed:
dead code left behind by a change, a stale comment, a latent bug noticed in a
neighbouring function, an inconsistent style, or an unused import.

The single exception is when the requested change **cannot work** without the
other change. In that case, say so before writing code, name the dependency, and
get agreement first.
