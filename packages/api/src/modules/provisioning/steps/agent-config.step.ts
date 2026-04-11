import type { ProvisioningStep, StepContext } from '../step.types.js';

/**
 * Agent config lives on the Store document itself (pre-seeded with defaults
 * at Store creation). This step exists so the dashboard has an explicit
 * "agent config seeded" milestone, and to leave room for future work that
 * materializes compiled prompts in Redis.
 */
export const agentConfigStep: ProvisioningStep = {
  name: 'agent_config',
  async run(ctx: StepContext): Promise<void> {
    const { store } = ctx;
    if (!store.agent_config.agent_name) {
      store.agent_config.agent_name = 'Sofía';
      await store.save();
    }
    ctx.step.data = { agent_name: store.agent_config.agent_name };
  },
};
