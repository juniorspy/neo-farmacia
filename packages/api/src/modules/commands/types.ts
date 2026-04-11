import type { ScopedOdoo } from '../../shared/odoo-scoped.js';
import type { IStore } from '../provisioning/store.model.js';

export interface CommandRequest {
  command: string;
  commandId: string;
  storeId: string;
  chatId?: string;
  usuarioId?: string;
  payload: Record<string, unknown>;
  actor?: string;
}

export interface CommandContext {
  command: string;
  commandId: string;
  storeId: string;
  chatId?: string;
  usuarioId?: string;
  payload: Record<string, unknown>;
  /** Resolved Store doc for this command. Populated by commands.routes. */
  store: IStore;
  /** Scoped Odoo client bound to store.odoo_db. Populated by commands.routes. */
  odoo: ScopedOdoo;
}

export interface CommandResult {
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
}
