import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  NotificationMessage,
  ResponseMessage,
  ErrorMessage,
  PendingNotification,
  Config,
  GestureType,
} from '../types.js';

export class NotificationServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private config: Config;
  private pending: Map<string, PendingNotification> = new Map();
  private notificationQueue: string[] = []; // Order of pending notifications

  constructor(config: Config) {
    super();
    this.config = config;
  }

  updateConfig(config: Config): void {
    this.config = config;
  }

  start(): void {
    if (this.wss) return;

    this.wss = new WebSocketServer({
      port: this.config.server.port,
      host: this.config.server.host,
    });

    this.wss.on('connection', (ws) => this.handleConnection(ws));
    this.wss.on('error', (err) => {
      console.error('WebSocket server error:', err);
    });

    console.log(`WebSocket server listening on ws://${this.config.server.host}:${this.config.server.port}`);
  }

  private handleConnection(ws: WebSocket): void {
    console.log('Client connected');

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as NotificationMessage;
        this.handleMessage(ws, message);
      } catch (err) {
        console.error('Invalid message:', err);
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
    });

    ws.on('error', (err) => {
      console.error('WebSocket client error:', err);
    });
  }

  private handleMessage(ws: WebSocket, message: NotificationMessage): void {
    if (!message.id || !message.type) {
      console.error('Invalid message format:', message);
      return;
    }

    const timeoutMs = this.config.defaults.timeoutMs;

    // Create pending notification
    const pending: PendingNotification = {
      id: message.id,
      text: message.text,
      category: message.category,
      options: message.options,
      selectedIndex: 0,
      timeoutMs,
      timeoutHandle: setTimeout(() => {
        this.handleTimeout(ws, message.id);
      }, timeoutMs),
      resolve: (response) => {
        try {
          console.log(`Sending response for ${message.id}: ${JSON.stringify(response)}`);
          ws.send(JSON.stringify(response));
        } catch (err) {
          console.error(`Failed to send response for ${message.id}:`, err);
        }
      },
      reject: (error) => {
        const errorMsg: ErrorMessage = {
          type: 'error',
          id: message.id,
          error: error.message,
        };
        ws.send(JSON.stringify(errorMsg));
      },
    };

    this.pending.set(message.id, pending);
    this.notificationQueue.push(message.id);

    // Emit event to display on device
    if (pending.options && pending.options.length > 0) {
      // Selection mode: show formatted options and update button labels
      this.emitSelectionDisplay(pending);
      this.emit('labelsUpdate', ['\u25BC', '\u25B2', '\u2713', '\u2717']);
    } else {
      this.emit('notification', message);
    }
  }

  private handleTimeout(ws: WebSocket, id: string): void {
    const pending = this.pending.get(id);
    if (!pending) return;

    const hadOptions = pending.options && pending.options.length > 0;

    this.pending.delete(id);
    this.notificationQueue = this.notificationQueue.filter(nid => nid !== id);

    pending.reject(new Error(`Timeout after ${pending.timeoutMs}ms`));

    if (hadOptions) {
      this.emit('labelsRestore');
    }
  }

  handleGesture(buttonId: string, gesture: GestureType): boolean {
    // Get the oldest pending notification
    if (this.notificationQueue.length === 0) {
      return false;
    }

    const oldestId = this.notificationQueue[0];
    const pending = this.pending.get(oldestId);
    if (!pending) {
      this.notificationQueue.shift();
      return false;
    }

    // Selection mode: fixed key assignments for navigation
    if (pending.options && pending.options.length > 0 && gesture === 'press') {
      return this.handleSelectionGesture(pending, oldestId, buttonId);
    }

    // Normal mode: look up action for this button + gesture in config
    const keyMapping = this.config.keys[buttonId];
    if (!keyMapping) {
      console.warn(`No mapping for button: ${buttonId}`);
      return false;
    }

    const actionMapping = keyMapping[gesture];
    if (!actionMapping) {
      console.warn(`No mapping for gesture: ${buttonId}.${gesture}`);
      return false;
    }

    // Clear timeout and remove from queue
    clearTimeout(pending.timeoutHandle);
    this.pending.delete(oldestId);
    this.notificationQueue.shift();

    // Send response
    const response: ResponseMessage = {
      type: 'response',
      id: oldestId,
      action: actionMapping.action,
      label: actionMapping.label,
      buttonId,
    };

    pending.resolve(response);
    this.showNextOrClear();

    return true;
  }

  private handleSelectionGesture(pending: PendingNotification, id: string, buttonId: string): boolean {
    const idx = pending.selectedIndex;
    const maxIdx = pending.options!.length - 1;
    console.log(`Selection gesture: ${buttonId} (current index: ${idx}/${maxIdx})`);

    switch (buttonId) {
      case 'key0': // Down
        pending.selectedIndex = Math.min(idx + 1, maxIdx);
        this.emitSelectionDisplay(pending);
        return true;

      case 'key1': // Up
        pending.selectedIndex = Math.max(idx - 1, 0);
        this.emitSelectionDisplay(pending);
        return true;

      case 'key2': { // Enter — select current option
        clearTimeout(pending.timeoutHandle);
        this.pending.delete(id);
        this.notificationQueue.shift();

        const selected = pending.options![pending.selectedIndex];
        const response: ResponseMessage = {
          type: 'response',
          id,
          action: 'select',
          label: selected,
          buttonId,
          selectedIndex: pending.selectedIndex,
        };
        pending.resolve(response);
        this.emit('labelsRestore');
        this.showNextOrClear();
        return true;
      }

      case 'key3': { // Cancel
        clearTimeout(pending.timeoutHandle);
        this.pending.delete(id);
        this.notificationQueue.shift();

        const response: ResponseMessage = {
          type: 'response',
          id,
          action: 'cancel',
          label: 'Cancel',
          buttonId,
        };
        pending.resolve(response);
        this.emit('labelsRestore');
        this.showNextOrClear();
        return true;
      }

      default:
        return false;
    }
  }

  private emitSelectionDisplay(pending: PendingNotification): void {
    const idx = pending.selectedIndex;
    const lines = pending.options!.map((opt, i) =>
      i === idx ? `\u25B6 ${opt}` : `  ${opt}`
    );
    const text = `${pending.text}\n\n${lines.join('\n')}`;
    this.emit('notification', {
      type: 'notification' as const,
      id: pending.id,
      text,
      category: pending.category,
    });
  }

  private showNextOrClear(): void {
    if (this.notificationQueue.length > 0) {
      const nextId = this.notificationQueue[0];
      const next = this.pending.get(nextId);
      if (next) {
        if (next.options && next.options.length > 0) {
          this.emitSelectionDisplay(next);
          this.emit('labelsUpdate', ['\u25BC', '\u25B2', '\u2713', '\u2717']);
        } else {
          this.emit('notification', {
            type: 'notification',
            id: next.id,
            text: next.text,
            category: next.category,
          });
        }
      }
    } else {
      this.emit('clear');
    }
  }

  hasPending(): boolean {
    return this.notificationQueue.length > 0;
  }

  stop(): void {
    // Clear all pending timeouts
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutHandle);
    }
    this.pending.clear();
    this.notificationQueue = [];

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}
