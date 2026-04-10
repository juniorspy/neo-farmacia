# ADR-001: Use Fastify + TypeScript for Microservice

**Date**: 2026-04-09
**Status**: accepted

## Context
Need a Node.js framework for the central microservice. Options considered: Express, Fastify, Hono.

## Decision
Use Fastify with TypeScript.

## Consequences
- **Positive**: Faster than Express, built-in schema validation (JSON Schema), plugin system, good TypeScript support, async by default.
- **Positive**: TypeScript catches bugs at compile time, essential for a multi-module project.
- **Negative**: Slightly steeper learning curve than Express. Team (user) is familiar with Express from whatsapp-service.
- **Accepted**: The performance and validation benefits outweigh the learning curve.
