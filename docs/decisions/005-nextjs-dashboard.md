# ADR-005: Next.js for Dashboard Frontend

**Date**: 2026-04-09
**Status**: accepted

## Context
Need a web frontend for the pharmacy dashboard. Options: Next.js, Vite+React, plain Thymeleaf (like neo colmado backend).

## Decision
Use Next.js (React) for the dashboard frontend.

## Consequences
- **Positive**: Modern SPA experience. Real-time updates via WebSocket feel native.
- **Positive**: Large ecosystem. Good for charts (recharts), tables, chat UI components.
- **Positive**: SSR option for initial load performance.
- **Negative**: Heavier than Thymeleaf. Requires separate build/deploy.
- **Negative**: Additional RAM on VPS (~200-400MB).
