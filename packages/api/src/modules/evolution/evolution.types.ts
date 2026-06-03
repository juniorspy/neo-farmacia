/** A WhatsApp message node as forwarded by Evolution/Baileys. Text can live
 *  directly here, or nested inside an "envelope" (disappearing/view-once/edit). */
export interface WhatsAppMessage {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: { caption?: string };
  videoMessage?: { caption?: string };
  documentMessage?: { caption?: string };
  buttonsResponseMessage?: { selectedDisplayText?: string };
  templateButtonReplyMessage?: { selectedDisplayText?: string };
  listResponseMessage?: {
    title?: string;
    singleSelectReply?: { selectedRowId?: string };
  };
  // Envelopes that wrap the real message one level deeper.
  ephemeralMessage?: { message?: WhatsAppMessage };
  viewOnceMessage?: { message?: WhatsAppMessage };
  viewOnceMessageV2?: { message?: WhatsAppMessage };
  viewOnceMessageV2Extension?: { message?: WhatsAppMessage };
  documentWithCaptionMessage?: { message?: WhatsAppMessage };
  editedMessage?: { message?: WhatsAppMessage };
}

export interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    pushName?: string;
    message?: WhatsAppMessage;
    messageType?: string;
    messageTimestamp?: number;
  };
}

/** Unwrap envelope messages (disappearing, view-once, edited) to reach the
 *  real content. Bounded depth to avoid pathological nesting. */
function unwrap(msg: WhatsAppMessage | undefined): WhatsAppMessage | undefined {
  for (let depth = 0; depth < 4 && msg; depth++) {
    const inner =
      msg.ephemeralMessage?.message ||
      msg.viewOnceMessage?.message ||
      msg.viewOnceMessageV2?.message ||
      msg.viewOnceMessageV2Extension?.message ||
      msg.documentWithCaptionMessage?.message ||
      msg.editedMessage?.message;
    if (!inner) break;
    msg = inner;
  }
  return msg;
}

/** Extract user-visible text from any common WhatsApp message shape.
 *  Returns null only when there is genuinely no text (e.g. a sticker). */
export function extractText(data: EvolutionWebhookPayload['data']): string | null {
  const msg = unwrap(data.message);
  if (!msg) return null;

  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedDisplayText ||
    msg.templateButtonReplyMessage?.selectedDisplayText ||
    msg.listResponseMessage?.title ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    null
  );
}

export function extractPhone(remoteJid: string): string {
  return '+' + remoteJid.replace('@s.whatsapp.net', '');
}
