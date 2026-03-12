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

    // If a plain notification (no options) arrives while there is already an active
    // selection question at the head of the queue, auto-dismiss it immediately.
    // This prevents a concurrent Notification hook (e.g. "Claude needs your attention")
    // from overwriting the selection menu on the device.
    const activeId = this.notificationQueue[0];
    const activeHasOptions = activeId
      ? (this.pending.get(activeId)?.options?.length ?? 0) > 0
      : false;

    if (!message.options?.length && activeHasOptions) {
      const autoResponse: ResponseMessage = {
        type: 'response',
        id: message.id,
        action: 'acknowledge',
        label: '',
      };
      try {
        ws.send(JSON.stringify(autoResponse));
      } catch (err) {
        console.error(`Failed to auto-dismiss notification ${message.id}:`, err);
      }
      return;
    }

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
      // Selection mode: auto-dismiss any plain notifications that arrived before this
      // question (e.g. a concurrent "Claude needs your attention") so they don't block
      // the selection from being at the head of the queue.
      this.autoDismissLeadingPlain(message.id);
      this.emitSelectionDisplay(pending);
      this.emit('labelsUpdate', ['\u25BC', '\u25B2', '\u2713', '\u2717']);
    } else {
      this.emit('notification', message);
    }
  }

  // Resolve and remove all plain (no-options) notifications that precede `keepId`
  // in the queue by sending an automatic acknowledgement response to their callers.
  private autoDismissLeadingPlain(keepId: string): void {
    const toRemove: string[] = [];
    for (const id of this.notificationQueue) {
      if (id === keepId) break;
      const p = this.pending.get(id);
      if (p && (!p.options || p.options.length === 0)) {
        toRemove.push(id);
      }
    }
    if (toRemove.length === 0) return;
    for (const id of toRemove) {
      const p = this.pending.get(id)!;
      clearTimeout(p.timeoutHandle);
      this.pending.delete(id);
      const response: ResponseMessage = {
        type: 'response',
        id,
        action: 'acknowledge',
        label: '',
      };
      p.resolve(response);
    }
    this.notificationQueue = this.notificationQueue.filter(id => !toRemove.includes(id));
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
    // Look up the configured action for this button + gesture first, so that
    // special actions (like "clear") can fire even with no pending notifications.
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

    // "reset" action: dismiss all pending notifications and reset the display.
    // Works whether or not there are pending notifications.
    if (actionMapping.action.toLowerCase() === 'reset') {
      for (const id of [...this.notificationQueue]) {
        const p = this.pending.get(id);
        if (!p) continue;
        clearTimeout(p.timeoutHandle);
        this.pending.delete(id);
        const response: ResponseMessage = {
          type: 'response',
          id,
          action: 'cancel',
          label: actionMapping.label,
          buttonId,
        };
        p.resolve(response);
      }
      this.notificationQueue = [];
      this.emit('clear');
      return true;
    }

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
