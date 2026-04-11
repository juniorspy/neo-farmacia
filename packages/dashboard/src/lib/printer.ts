"use client";

// ESC/POS commands for generic 58mm Bluetooth thermal printers
// Compatible with most Chinese generic printers using the standard
// GATT service 000018f0-0000-1000-8000-00805f9b34fb

const PRINTER_SERVICE_UUID = "000018f0-0000-1000-8000-00805f9b34fb";
const PRINTER_CHARACTERISTIC_UUID = "00002af1-0000-1000-8000-00805f9b34fb";

// Fallback service UUIDs that some printers use
const FALLBACK_SERVICES = [
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

// ─── ESC/POS commands ───
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export class ReceiptBuilder {
  private bytes: number[] = [];

  constructor() {
    // Initialize printer
    this.bytes.push(ESC, 0x40);
  }

  // Text alignment: 0=left, 1=center, 2=right
  align(pos: 0 | 1 | 2): this {
    this.bytes.push(ESC, 0x61, pos);
    return this;
  }

  // Bold on/off
  bold(on: boolean): this {
    this.bytes.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  // Text size: 0=normal, 1=double height, 16=double width, 17=both
  size(n: number): this {
    this.bytes.push(GS, 0x21, n);
    return this;
  }

  // Print text (supports Latin chars via code page 437/850)
  text(str: string): this {
    // Simple ASCII conversion — replace accented chars for max compatibility
    const ascii = str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ñ/g, "n")
      .replace(/Ñ/g, "N");
    for (let i = 0; i < ascii.length; i++) {
      this.bytes.push(ascii.charCodeAt(i));
    }
    return this;
  }

  // Line feed
  newline(n = 1): this {
    for (let i = 0; i < n; i++) this.bytes.push(LF);
    return this;
  }

  // Print a line of characters
  line(char = "-", width = 32): this {
    this.text(char.repeat(width)).newline();
    return this;
  }

  // Print two columns (left-aligned + right-aligned), 32 chars wide
  twoColumns(left: string, right: string, width = 32): this {
    const leftNorm = left
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ñ/g, "n")
      .replace(/Ñ/g, "N");
    const rightNorm = right
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ñ/g, "n")
      .replace(/Ñ/g, "N");

    const leftTrim = leftNorm.length > width - rightNorm.length - 1
      ? leftNorm.slice(0, width - rightNorm.length - 1)
      : leftNorm;
    const spaces = " ".repeat(Math.max(1, width - leftTrim.length - rightNorm.length));
    this.text(leftTrim + spaces + rightNorm).newline();
    return this;
  }

  // Feed paper + cut (full)
  cut(): this {
    this.newline(3);
    this.bytes.push(GS, 0x56, 0x00);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

// ─── Bluetooth connection ───

let connectedDevice: BluetoothDevice | null = null;
let connectedCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

export function isBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export async function pairPrinter(): Promise<string> {
  if (!isBluetoothSupported()) {
    throw new Error("Web Bluetooth no soportado. Usa Chrome o Edge.");
  }

  const device = await navigator.bluetooth.requestDevice({
    // Accept any Bluetooth printer — filter by service discovery
    acceptAllDevices: true,
    optionalServices: [PRINTER_SERVICE_UUID, ...FALLBACK_SERVICES],
  });

  if (!device.gatt) throw new Error("Dispositivo sin GATT");

  const server = await device.gatt.connect();

  // Try the main service first, then fallbacks
  let service;
  try {
    service = await server.getPrimaryService(PRINTER_SERVICE_UUID);
  } catch {
    for (const uuid of FALLBACK_SERVICES) {
      try {
        service = await server.getPrimaryService(uuid);
        break;
      } catch { /* try next */ }
    }
  }

  if (!service) {
    throw new Error("No se encontró servicio de impresora compatible");
  }

  // Find first writable characteristic
  const characteristics = await service.getCharacteristics();
  const writable = characteristics.find(
    (c) => c.properties.write || c.properties.writeWithoutResponse
  );

  if (!writable) {
    throw new Error("Impresora sin característica de escritura");
  }

  connectedDevice = device;
  connectedCharacteristic = writable;

  // Save the device name for reconnection
  localStorage.setItem("printer-name", device.name || "Unknown");
  localStorage.setItem("printer-id", device.id);

  device.addEventListener("gattserverdisconnected", () => {
    connectedDevice = null;
    connectedCharacteristic = null;
  });

  return device.name || "Impresora conectada";
}

export function getPrinterInfo(): { name: string; id: string } | null {
  const name = localStorage.getItem("printer-name");
  const id = localStorage.getItem("printer-id");
  if (!name || !id) return null;
  return { name, id };
}

export function clearPrinter(): void {
  localStorage.removeItem("printer-name");
  localStorage.removeItem("printer-id");
  if (connectedDevice?.gatt?.connected) {
    connectedDevice.gatt.disconnect();
  }
  connectedDevice = null;
  connectedCharacteristic = null;
}

export function isPrinterConnected(): boolean {
  return !!connectedCharacteristic && !!connectedDevice?.gatt?.connected;
}

async function ensureConnected(): Promise<BluetoothRemoteGATTCharacteristic> {
  if (isPrinterConnected() && connectedCharacteristic) {
    return connectedCharacteristic;
  }

  // Reconnect if we have a saved device
  const info = getPrinterInfo();
  if (!info) {
    throw new Error("No hay impresora emparejada. Ve a Configuración para emparejar.");
  }

  // Try to reconnect — this may fail and require re-pairing
  if (connectedDevice) {
    try {
      const server = await connectedDevice.gatt!.connect();
      let service;
      try {
        service = await server.getPrimaryService(PRINTER_SERVICE_UUID);
      } catch {
        for (const uuid of FALLBACK_SERVICES) {
          try { service = await server.getPrimaryService(uuid); break; } catch {}
        }
      }
      if (service) {
        const chars = await service.getCharacteristics();
        const writable = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
        if (writable) {
          connectedCharacteristic = writable;
          return writable;
        }
      }
    } catch { /* fall through */ }
  }

  throw new Error("Impresora desconectada. Vuelve a emparejar desde Configuración.");
}

export async function printBytes(bytes: Uint8Array): Promise<void> {
  const char = await ensureConnected();

  // Write in chunks of 512 bytes max (Bluetooth MTU limit)
  const chunkSize = 512;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    if (char.properties.writeWithoutResponse) {
      await char.writeValueWithoutResponse(chunk);
    } else {
      await char.writeValue(chunk);
    }
    // Small delay between chunks to avoid buffer overflow
    await new Promise((r) => setTimeout(r, 20));
  }
}

// ─── Receipt templates ───

export interface OrderReceiptData {
  orderName: string;
  customer: string;
  date: string;
  lines: { name: string; qty: number; subtotal: number }[];
  total: number;
  storeName?: string;
  storePhone?: string;
  storeAddress?: string;
}

export function buildOrderReceipt(data: OrderReceiptData): Uint8Array {
  const r = new ReceiptBuilder();

  // Header — store info
  r.align(1).bold(true).size(16);
  r.text(data.storeName || "Neo Farmacia").newline();
  r.size(0).bold(false);
  if (data.storeAddress) r.text(data.storeAddress).newline();
  if (data.storePhone) r.text(data.storePhone).newline();
  r.newline();

  // Order info
  r.align(0).line("=");
  r.bold(true).text(`Pedido: ${data.orderName}`).newline();
  r.bold(false).text(`Fecha: ${new Date(data.date).toLocaleString("es-DO")}`).newline();
  r.text(`Cliente: ${data.customer}`).newline();
  r.line("=");

  // Items
  for (const item of data.lines) {
    r.text(`${item.qty}x ${item.name}`).newline();
    r.twoColumns("", `RD$${item.subtotal.toFixed(2)}`);
  }

  r.line("-");

  // Total
  r.bold(true).size(16);
  r.twoColumns("TOTAL", `RD$${data.total.toFixed(2)}`, 16);
  r.size(0).bold(false);

  r.newline(2);
  r.align(1);
  r.text("Gracias por su compra").newline();
  r.text("Vuelva pronto!").newline();

  r.cut();
  return r.build();
}

export async function printOrderReceipt(data: OrderReceiptData): Promise<void> {
  const bytes = buildOrderReceipt(data);
  await printBytes(bytes);
}
