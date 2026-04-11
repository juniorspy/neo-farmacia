# Bluetooth Thermal Printing

How the dashboard prints receipts to 58mm Bluetooth thermal printers.

## Overview

Printing happens **entirely in the browser** — no backend involvement. The dashboard:
1. Generates ESC/POS bytes in JavaScript
2. Opens a Web Bluetooth GATT connection to a paired printer
3. Writes the bytes over BLE in small chunks

This means adding or updating the receipt format is a frontend-only change, and there's no print queue or server to manage.

## Browser support

| Browser | Support |
|---|---|
| Chrome (desktop + Android) | ✅ |
| Edge (desktop) | ✅ |
| Opera | ✅ |
| Firefox | ❌ |
| Safari | ❌ |

Requires **HTTPS** (works because the dashboard is served via Traefik + Let's Encrypt).

## Hardware compatibility

Targets generic 58mm Bluetooth thermal printers (the cheap Chinese ones you find on Amazon / MercadoLibre). They all speak a subset of ESC/POS and expose a GATT service with a raw-write characteristic.

The code tries three service UUIDs in order:
1. `000018f0-0000-1000-8000-00805f9b34fb` (most common)
2. `0000ff00-0000-1000-8000-00805f9b34fb`
3. `e7810a71-73ae-499d-8c15-faa9aef0c3f2`

If none match, it shows an error. For a specific unsupported printer, add its service UUID to the `FALLBACK_SERVICES` array in `lib/printer.ts`.

## ESC/POS

ESC/POS is a set of byte-level commands that thermal printers interpret. The `ReceiptBuilder` class wraps the common ones:

```ts
const receipt = new ReceiptBuilder()
  .align(1).bold(true).size(16)        // center, bold, double
  .text("Neo Farmacia").newline()
  .size(0).bold(false)
  .text("Calle Principal #45").newline()
  .line("=")                            // divider
  .bold(true).text("Pedido: S00021").newline().bold(false)
  .twoColumns("Paracetamol 500mg x2", "RD$170")
  .line("-")
  .bold(true).size(16)
  .twoColumns("TOTAL", "RD$170", 16)
  .cut();

const bytes = receipt.build();  // Uint8Array
```

Commands used (see `ESC`, `GS`, `LF` constants):

| Command | Bytes | Purpose |
|---|---|---|
| Initialize | `ESC @` | Reset printer state |
| Align | `ESC a n` | 0=left, 1=center, 2=right |
| Bold | `ESC E n` | 0=off, 1=on |
| Text size | `GS ! n` | 0=normal, 16=2x width, 17=both |
| Line feed | `LF` | Advance one line |
| Cut | `GS V 0` | Full cut |

## Character encoding

Thermal printers use code pages (437, 850, etc.) that don't support full UTF-8. The `text()` method normalizes accented characters:

```ts
"Acción" → "Accion"
"Niño" → "Nino"
```

This is done with `String.normalize("NFD")` + character stripping. Good enough for Spanish receipts in Dominican Republic.

## Pairing flow

1. User opens Settings → Impresora Bluetooth
2. Clicks "Emparejar impresora"
3. Browser shows native Bluetooth device picker
4. User selects the printer
5. Code connects to GATT server, discovers the first compatible service, finds a writable characteristic
6. Device ID + name saved in `localStorage` (`printer-id`, `printer-name`)

The actual BLE reference is kept in a module-level variable (`connectedDevice`). If the browser tab is closed or disconnects, the next print attempt throws a clear error asking to re-pair.

**Web Bluetooth limitation**: even though the device ID is persisted, the browser requires a user gesture to reconnect. So re-pairing always involves a click.

## Chunked writes

Bluetooth has a small MTU (usually ~20-512 bytes depending on the device). The code writes in 512-byte chunks with a 20ms delay:

```ts
for (let i = 0; i < bytes.length; i += chunkSize) {
  const chunk = bytes.slice(i, i + chunkSize);
  await characteristic.writeValueWithoutResponse(chunk);
  await sleep(20);
}
```

Without this, long receipts overflow the printer buffer and print garbage.

## Receipt template

`buildOrderReceipt(data)` in `lib/printer.ts` generates a standard pharmacy receipt:

```
        Neo Farmacia
    Calle Principal #45
     +1809-555-1000

================================
Pedido: S00021
Fecha: 10/04/2026 11:30
Cliente: María López
================================
2x Paracetamol 500mg
                      RD$170.00
1x Ibuprofeno 400mg
                       RD$85.00
--------------------------------
TOTAL              RD$255.00


      Gracias por su compra
           Vuelva pronto!

     [paper feed + cut]
```

Customize by editing the `buildOrderReceipt` function. Store name/address/phone come from the caller (orders page uses the current store from context).

## Test printing

The Settings page has a "Prueba" button that prints a sample receipt without going through the orders API. Useful for verifying pairing worked.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Web Bluetooth no soportado" | Use Chrome or Edge on a Bluetooth-enabled machine |
| Device picker is empty | Turn on the printer, make sure it's in pairing mode |
| "No se encontró servicio compatible" | Add the printer's service UUID to `FALLBACK_SERVICES` |
| Prints garbage / cuts early | Buffer overflow — reduce chunk size or increase delay |
| "Impresora desconectada" | Click re-pair — Web Bluetooth requires a user gesture to reconnect |
| Accents print as ? | Already normalized; if still broken, check printer's code page setting |
