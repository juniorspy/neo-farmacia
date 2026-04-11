# Architecture Decision Records (ADRs)

Record significant technical decisions here using the format below. Number them sequentially.

## Index

| # | Decision | Date | Status |
|---|---|---|---|
| 001 | [Use Fastify + TypeScript for microservice](001-fastify-typescript.md) | 2026-04-09 | accepted |
| 002 | [n8n for AI agents, microservice as bridge](002-n8n-for-ai.md) | 2026-04-09 | accepted |
| 003 | [No Firebase — independent stack](003-no-firebase.md) | 2026-04-09 | accepted |
| 004 | [Odoo as SSoT for inventory](004-odoo-ssot.md) | 2026-04-09 | accepted |
| 005 | [Next.js for dashboard frontend](005-nextjs-dashboard.md) | 2026-04-09 | accepted |
| 006 | [Web-only, no native app](006-web-only.md) | 2026-04-09 | accepted |
| 007 | [Tiered POS sync-back strategy](007-tiered-pos-sync.md) | 2026-04-11 | designed |

## ADR Template

```markdown
# ADR-NNN: Title

**Date**: YYYY-MM-DD
**Status**: proposed | accepted | deprecated | superseded by ADR-NNN

## Context
What is the issue that we're seeing that is motivating this decision?

## Decision
What is the change that we're proposing?

## Consequences
What becomes easier or more difficult because of this change?
```
