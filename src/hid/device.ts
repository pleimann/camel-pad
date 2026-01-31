import HID from 'node-hid';
import { EventEmitter } from 'events';
import { MSG_DISPLAY_TEXT, MSG_BUTTON } from '../types.js';
import { findDevice } from './discovery.js';

export interface HIDDeviceConfig {
  vendorId: number;
  productId: number;
}

export interface ButtonEvent {
  buttonId: string;
  pressed: boolean;
}

export class HIDDevice extends EventEmitter {
  private config: HIDDeviceConfig;
  private device: HID.HID | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly RECONNECT_INTERVAL = 2000;
  private readonly REPORT_SIZE = 64;

  constructor(config: HIDDeviceConfig) {
    super();
    this.config = config;
  }

  connect(): boolean {
    const info = findDevice(this.config.vendorId, this.config.productId);
    if (!info) {
      console.error(`Device not found: vendor=0x${this.config.vendorId.toString(16)} product=0x${this.config.productId.toString(16)}`);
      this.scheduleReconnect();
      return false;
    }

    try {
      // Open by path to use the specific interface found by discovery
      // (discovery prefers vendor-specific usage pages accessible on macOS)
      this.device = new HID.HID(info.path);
      this.device.on('data', (data: Buffer) => this.handleData(data));
      this.device.on('error', (err: Error) => this.handleError(err));

      const usageInfo = info.usagePage ? ` (usagePage=0x${info.usagePage.toString(16)})` : '';
      console.log(`Connected to ${info.product || 'HID device'} at ${info.path}${usageInfo}`);
      this.emit('connected');
      return true;
    } catch (err) {
      console.error('Failed to open device:', err);
      this.scheduleReconnect();
      return false;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('Attempting to reconnect...');
      this.connect();
    }, this.RECONNECT_INTERVAL);
  }

  private handleData(data: Buffer): void {
    if (data.length < 3) return;

    const msgType = data[0];
    if (msgType === MSG_BUTTON) {
      const buttonId = `key${data[1]}`;
      const pressed = data[2] === 1;
      this.emit('button', { buttonId, pressed } as ButtonEvent);
    }
  }

  private handleError(err: Error): void {
    console.error('HID error:', err.message);
    this.emit('error', err);
    this.disconnect();
    this.scheduleReconnect();
  }

  sendText(text: string): boolean {
    if (!this.device) {
      console.error('Device not connected');
      return false;
    }

    try {
      const buffer = Buffer.alloc(this.REPORT_SIZE);
      buffer[0] = MSG_DISPLAY_TEXT;
      const textBytes = Buffer.from(text.slice(0, this.REPORT_SIZE - 1), 'utf8');
      textBytes.copy(buffer, 1);

      // node-hid expects array for write
      this.device.write([...buffer]);
      return true;
    } catch (err) {
      console.error('Failed to send text:', err);
      return false;
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.device) {
      try {
        this.device.close();
      } catch {
        // Ignore close errors
      }
      this.device = null;
      this.emit('disconnected');
    }
  }

  isConnected(): boolean {
    return this.device !== null;
  }
}
