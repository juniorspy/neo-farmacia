# ADR-006: Web-Only, No Native App

**Date**: 2026-04-09
**Status**: accepted

## Context
Neo colmado has an Android app for store operations (orders, printing, chat) and a separate web backend for admin/reporting. For neo farmacia, the user wants everything in one web interface.

## Decision
No native app. All functionality (operations + admin + reporting) lives in the Next.js dashboard accessible via browser.

## Consequences
- **Positive**: One codebase for all functionality. No app store distribution hassle.
- **Positive**: Faster iteration — deploy web changes instantly.
- **Positive**: Works on any device with a browser (phone, tablet, desktop).
- **Negative**: Thermal printing from browser is harder than native (WebUSB, Web Bluetooth, or print dialog).
- **Negative**: No push notifications unless PWA is implemented.
- **Accepted**: Printing solution to be decided during Stage 5. PWA can be added later if needed.
