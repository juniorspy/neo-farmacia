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
    message?: {
      conversation?: string;
      extendedTextMessage?: { text: string };
    };
    messageType?: string;
    messageTimestamp?: number;
  };
}

export function extractText(data: EvolutionWebhookPayload['data']): string | null {
  return (
    data.message?.conversation ||
    data.message?.extendedTextMessage?.text ||
    null
  );
}

export function extractPhone(remoteJid: string): string {
  return '+' + remoteJid.replace('@s.whatsapp.net', '');
}
