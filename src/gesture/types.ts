export type GestureType = 'press' | 'doublePress' | 'longPress';

export interface GestureEvent {
  buttonId: string;
  gesture: GestureType;
}

export interface GestureConfig {
  longPressMs: number;
  doublePressMs: number;
}

export type ButtonState = 'idle' | 'pressed' | 'waitDouble' | 'doublePressed';
