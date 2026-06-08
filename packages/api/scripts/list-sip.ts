/**
 * Lists the LiveKit SIP trunks (outbound + inbound) of the configured project,
 * so we can read the real provisioning state instead of guessing.
 *
 * Usage (creds come from the env — they are NOT committed; take them from the
 * Dokploy voice-agent / api service Environment panel):
 *
 *   LIVEKIT_URL=wss://<proj>.livekit.cloud \
 *   LIVEKIT_API_KEY=<key> LIVEKIT_API_SECRET=<secret> \
 *   npx tsx scripts/list-sip.ts
 *
 * Output for an outbound trunk includes its SIP_TRUNK_ID (Mode 1), address and
 * numbers — exactly what consult.py needs to place outbound calls.
 */
import { SipClient } from 'livekit-server-sdk';

const url = process.env.LIVEKIT_URL || '';
const key = process.env.LIVEKIT_API_KEY || '';
const secret = process.env.LIVEKIT_API_SECRET || '';

if (!url || !key || !secret) {
  console.error(
    'Faltan creds: exporta LIVEKIT_URL, LIVEKIT_API_KEY y LIVEKIT_API_SECRET antes de correr.',
  );
  process.exit(1);
}

// SipClient quiere el host HTTP(S); LIVEKIT_URL suele venir como wss://
const host = url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
const sip = new SipClient(host, key, secret);

function line(label: string, value: unknown) {
  console.log(`    ${label.padEnd(11)} ${value ?? '(n/a)'}`);
}

async function main() {
  console.log(`LiveKit host: ${host}\n`);

  const outbound = await sip.listSipOutboundTrunk();
  console.log(`== OUTBOUND trunks (${outbound.length}) — los de llamadas salientes ==`);
  for (const t of outbound as any[]) {
    console.log(`- SIP_TRUNK_ID=${t.sipTrunkId}`);
    line('name:', t.name);
    line('address:', t.address);
    line('transport:', t.transport);
    line('numbers:', (t.numbers || []).join(', ') || '(ninguno)');
    line('auth_user:', t.authUsername || '(ninguno)');
  }
  if (!outbound.length) {
    console.log(
      '  ⚠️  No hay trunk OUTBOUND. Sin uno no hay llamadas salientes.\n' +
        '     Créalo: LiveKit dashboard → Telephony → SIP Trunks → Outbound.',
    );
  }

  const inbound = await sip.listSipInboundTrunk();
  console.log(`\n== INBOUND trunks (${inbound.length}) ==`);
  for (const t of inbound as any[]) {
    console.log(`- ${t.sipTrunkId}  name: ${t.name || '(sin nombre)'}  numbers: ${(t.numbers || []).join(', ') || '(ninguno)'}`);
  }
}

main().catch((e) => {
  console.error('Error llamando a la API de LiveKit:', e?.message || e);
  process.exit(1);
});
