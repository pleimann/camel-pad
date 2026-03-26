// Shared types for camel-pad

export interface Config {
  device: {
    port?: string;
    vendorId?: number;
    productId?: number;
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
  handedness: 'left' | 'right';
}

export interface KeyMapping {
  press?: ActionMapping;
  doublePress?: ActionMapping;
  longPress?: ActionMapping;
}

export type ActionMapping = ActionAction | KeybindingAction | GlobalAction | FocusAppAction;

export interface ActionAction {
  type: 'action';
  action: string;
  label: string;
}

export interface KeybindingAction {
  type: 'keybinding';
  keybinding: string;
  label: string;
}

export interface GlobalAction {
  type: 'global';
  keybinding: string;
  label: string;
}

export interface FocusAppAction {
  type: 'focus-app';
  app: string;
  label: string;
}

// WebSocket message types
export interface NotificationMessage {
  type: 'notification' | 'test' | 'message';
  id: string;
  text: string;
  category?: string;
  options?: string[];
}

export interface ResponseMessage {
  type: 'response';
  id: string;
  action: string;
  label: string;
  buttonId?: string;
  selectedIndex?: number;
}

export interface ErrorMessage {
  type: 'error';
  id: string;
  error: string;
}

export type OutgoingMessage = ResponseMessage | ErrorMessage;

// Channel ↔ Bridge WebSocket message types

/** Channel client registers with bridge on connect */
export interface RegisterMessage {
  type: 'register';
  role: 'channel';
}

/** Bridge confirms channel registration */
export interface RegisteredMessage {
  type: 'registered';
  status: 'ok';
}

/** Bridge → channel: unsolicited button press (no pending notification) */
export interface ButtonEventMessage {
  type: 'button_event';
  buttonId: string;
  gesture: GestureType;
  label: string;
  timestamp: number;
}

/** Channel → bridge: display a permission prompt on device */
export interface PermissionRequestMessage {
  type: 'permission_request';
  id: string;
  tool: string;
  description: string;
  input_preview: string;
}

/** Bridge → channel: button press as permission verdict */
export interface PermissionVerdictMessage {
  type: 'permission_verdict';
  id: string;
  verdict: 'allow' | 'deny';
}

/** Channel → bridge: display command (text, status, clear, leds, labels) */
export interface DisplayCommandMessage {
  type: 'display_command';
  id: string;
  command: 'text' | 'status' | 'clear' | 'leds' | 'labels';
  payload: any;
}

/** Bridge → channel: display command acknowledgement */
export interface DisplayAckMessage {
  type: 'display_ack';
  id: string;
  success: boolean;
}

/** All messages the bridge can receive from a channel client */
export type ChannelInboundMessage =
  | RegisterMessage
  | PermissionRequestMessage
  | DisplayCommandMessage;

/** All messages the bridge can send to a channel client */
export type ChannelOutboundMessage =
  | RegisteredMessage
  | ButtonEventMessage
  | PermissionVerdictMessage
  | DisplayAckMessage;

// Serial protocol constants (matches firmware config.h)
export const FRAME_START_BYTE = 0xAA;
export const MAX_MSG_LEN = 512;
export const SERIAL_BAUD = 115200;

export const MSG_DISPLAY_TEXT = 0x01;
export const MSG_BUTTON = 0x02;
export const MSG_SET_LEDS = 0x03;
export const MSG_STATUS = 0x04;
export const MSG_CLEAR = 0x05;
export const MSG_SET_LABELS = 0x06;
export const MSG_HEARTBEAT = 0x07;
export const MSG_PING      = 0x08; // Host→Device: keepalive (no payload)

// Monitor log entry
export interface LogEntry {
  seq: number;
  ts: number;
  dir: 'in' | 'out' | 'sys';
  type: string;
  summary: string;
}

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
  options?: string[];
  selectedIndex: number;
  timeoutMs: number;
  timeoutHandle: ReturnType<typeof setTimeout>;
  resolve: (response: ResponseMessage) => void;
  reject: (error: Error) => void;
}
