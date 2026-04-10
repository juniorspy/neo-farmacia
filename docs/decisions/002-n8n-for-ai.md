# ADR-002: n8n for AI Agents, Microservice as Bridge

**Date**: 2026-04-09
**Status**: accepted

## Context
The conversational AI logic requires 5 agents with complex prompts (1500+ lines for the cart agent alone). This exists in n8n for neo colmado and works well. Replicating in code would be extremely complex and lose the visual iteration speed.

## Decision
Keep n8n as the AI orchestrator. The microservice acts as a bridge — handles webhook reception, debounce, Odoo queries, handover, and dashboard API. n8n calls back the microservice for data operations.

## Consequences
- **Positive**: Visual prompt editing without deploys. Fast iteration on AI behavior. Proven pattern from neo colmado.
- **Positive**: Separation of concerns — microservice handles data, n8n handles conversation.
- **Negative**: n8n has concurrency limits. May become bottleneck at scale (20+ simultaneous conversations).
- **Negative**: Additional service to maintain and monitor.
- **Accepted**: Scaling ceiling is acceptable for early stage (1-5 pharmacies). Can migrate AI to microservice later if needed.
