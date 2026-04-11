import { User } from '../../users/user.model.js';
import { logger } from '../../../shared/logger.js';
import type { CommandContext, CommandResult } from '../types.js';

// usuario.lookupCombined — find user by chatId or phone
export async function usuarioLookupCombined(ctx: CommandContext): Promise<CommandResult> {
  const { chatId, telefono } = ctx.payload as { chatId?: string; telefono?: string };
  const { storeId } = ctx;

  if (!chatId && !telefono) {
    return { ok: false, error: 'chatId or telefono required' };
  }

  const query: Record<string, unknown> = { store_id: storeId };
  if (chatId) query.chat_id = chatId;
  else if (telefono) query.phone = telefono;

  const user = await User.findOne(query).lean();

  if (!user) {
    return {
      ok: true,
      result: {
        exists: false,
        usuario: null,
      },
    };
  }

  return {
    ok: true,
    result: {
      exists: true,
      usuarioId: String(user._id),
      usuario: {
        id: String(user._id),
        chatId: user.chat_id,
        telefono: user.phone,
        nombre: user.name,
        direccion: user.address,
        registered: user.registered,
      },
    },
  };
}

// usuario.ensure — create or update user
export async function usuarioEnsure(ctx: CommandContext): Promise<CommandResult> {
  const { chatId, telefono, nombre, direccion } = ctx.payload as {
    chatId?: string;
    telefono?: string;
    nombre?: string;
    direccion?: string;
  };
  const { storeId } = ctx;

  if (!chatId) {
    return { ok: false, error: 'chatId required' };
  }

  // Look up existing
  let user = await User.findOne({ store_id: storeId, chat_id: chatId });
  let created = false;

  if (!user) {
    user = await User.create({
      store_id: storeId,
      chat_id: chatId,
      phone: telefono || '',
      name: nombre || '',
      address: direccion || '',
      registered: !!(nombre && direccion),
    });
    created = true;
    logger.info({ storeId, chatId, usuarioId: String(user._id) }, 'User created via command');
  } else {
    // Merge updates
    let changed = false;
    if (nombre && user.name !== nombre) { user.name = nombre; changed = true; }
    if (direccion && user.address !== direccion) { user.address = direccion; changed = true; }
    if (telefono && user.phone !== telefono) { user.phone = telefono; changed = true; }
    if (nombre && direccion && !user.registered) { user.registered = true; changed = true; }
    if (changed) {
      user.updated_at = new Date();
      await user.save();
      logger.info({ storeId, chatId, usuarioId: String(user._id) }, 'User updated via command');
    }
  }

  return {
    ok: true,
    result: {
      usuarioId: String(user._id),
      created,
      usuario: {
        id: String(user._id),
        chatId: user.chat_id,
        telefono: user.phone,
        nombre: user.name,
        direccion: user.address,
        registered: user.registered,
      },
    },
  };
}
