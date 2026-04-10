# ADR-003: No Firebase — Independent Stack

**Date**: 2026-04-09
**Status**: accepted

## Context
Neo colmado uses Firebase extensively (Realtime DB, Cloud Functions, Auth). The user explicitly requested neo farmacia be completely independent — no shared infrastructure, no Firebase.

## Decision
Use MongoDB for chat history/users, Redis for state/cache, Odoo/PostgreSQL for inventory. No Firebase anywhere.

## Consequences
- **Positive**: Clean separation between projects. No accidental data leakage.
- **Positive**: MongoDB is more flexible for complex queries than Firebase RTDB.
- **Positive**: Self-hosted — no vendor lock-in or usage-based pricing.
- **Negative**: Lose Firebase's built-in real-time sync (replaced with WebSocket).
- **Negative**: Lose Firebase Cloud Functions triggers (replaced with microservice logic).
