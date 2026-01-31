// Shared types for camel-pad

export interface Config {
  device: {
    vendorId: number;
    productId: number;
  };
  server: {
    port: number;
    host: string;
  };
  gestures: {
    longPressMs: number;
    doublePressMs: number;
  };
  keys: Record<string, KeyMapping>;
  defaults: {
    timeoutMs: number;
  };
}

export interface KeyMapping {
  press?: ActionMapping;
  doublePress?: ActionMapping;
  longPress?: ActionMapping;
}

export interface ActionMapping {
  action: string;
  label: string;
}

// WebSocket message types
export interface NotificationMessage {
  type: 'notification' | 'test' | 'message';
  id: string;
  text: string;
  category?: string;
}

export interface ResponseMessage {
  type: 'response';
  id: string;
  action: string;
  label: string;
}

export interface ErrorMessage {
  type: 'error';
  id: string;
  error: string;
}

export type OutgoingMessage = ResponseMessage | ErrorMessage;

// HID protocol constants
export const MSG_DISPLAY_TEXT = 0x01;
export const MSG_BUTTON = 0x02;

// Gesture types
export type GestureType = 'press' | 'doublePress' | 'longPress';

export interface GestureEvent {
  buttonId: string;
  gesture: GestureType;
}

// Pending notification in the queue
export interface PendingNotification {
  id: string;
  text: string;
  category?: string;
  timeoutMs: number;
  timeoutHandle: ReturnType<typeof setTimeout>;
  resolve: (response: ResponseMessage) => void;
  reject: (error: Error) => void;
}
