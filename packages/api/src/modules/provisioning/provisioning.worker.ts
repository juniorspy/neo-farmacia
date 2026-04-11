import type { AppConfig } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import { runNextJobStep } from './provisioning.service.js';

const TICK_MS = 5000;
let running = false;
let stopping = false;

export function startProvisioningWorker(config: AppConfig): void {
  if (running) return;
  running = true;
  logger.info({ tickMs: TICK_MS }, 'Provisioning worker started');

  const tick = async () => {
    if (stopping) return;
    try {
      const didWork = await runNextJobStep(config);
      // If there's work to do, loop again immediately; otherwise wait.
      if (didWork) {
        setImmediate(tick);
        return;
      }
    } catch (err) {
      logger.error({ err }, 'Provisioning worker tick error');
    }
    setTimeout(tick, TICK_MS);
  };

  setTimeout(tick, TICK_MS);
}

export function stopProvisioningWorker(): void {
  stopping = true;
  logger.info('Provisioning worker stop requested');
}
