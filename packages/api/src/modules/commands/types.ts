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
}

export interface CommandResult {
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
}
