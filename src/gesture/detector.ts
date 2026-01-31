import { EventEmitter } from 'events';
import type { GestureType, GestureEvent, GestureConfig, ButtonState } from './types.js';

interface ButtonContext {
  state: ButtonState;
  pressTime: number;
  longPressTimer: ReturnType<typeof setTimeout> | null;
  doublePressTimer: ReturnType<typeof setTimeout> | null;
}

export class GestureDetector extends EventEmitter {
  private config: GestureConfig;
  private buttons: Map<string, ButtonContext> = new Map();

  constructor(config: GestureConfig) {
    super();
    this.config = config;
  }

  updateConfig(config: GestureConfig): void {
    this.config = config;
  }

  handleButton(buttonId: string, pressed: boolean): void {
    let ctx = this.buttons.get(buttonId);
    if (!ctx) {
      ctx = {
        state: 'idle',
        pressTime: 0,
        longPressTimer: null,
        doublePressTimer: null,
      };
      this.buttons.set(buttonId, ctx);
    }

    if (pressed) {
      this.handlePress(buttonId, ctx);
    } else {
      this.handleRelease(buttonId, ctx);
    }
  }

  private handlePress(buttonId: string, ctx: ButtonContext): void {
    ctx.pressTime = Date.now();

    switch (ctx.state) {
      case 'idle':
        ctx.state = 'pressed';
        // Start long press timer
        ctx.longPressTimer = setTimeout(() => {
          if (ctx.state === 'pressed') {
            this.clearTimers(ctx);
            ctx.state = 'idle';
            this.emitGesture(buttonId, 'longPress');
          }
        }, this.config.longPressMs);
        break;

      case 'waitDouble':
        // Second press within double-press window
        this.clearTimers(ctx);
        ctx.state = 'doublePressed';
        break;

      default:
        // Ignore unexpected presses
        break;
    }
  }

  private handleRelease(buttonId: string, ctx: ButtonContext): void {
    switch (ctx.state) {
      case 'pressed':
        // Released before long press threshold
        this.clearTimers(ctx);
        ctx.state = 'waitDouble';
        // Start double press timer
        ctx.doublePressTimer = setTimeout(() => {
          if (ctx.state === 'waitDouble') {
            ctx.state = 'idle';
            this.emitGesture(buttonId, 'press');
          }
        }, this.config.doublePressMs);
        break;

      case 'doublePressed':
        // Released after second press
        this.clearTimers(ctx);
        ctx.state = 'idle';
        this.emitGesture(buttonId, 'doublePress');
        break;

      default:
        // Ignore unexpected releases
        break;
    }
  }

  private clearTimers(ctx: ButtonContext): void {
    if (ctx.longPressTimer) {
      clearTimeout(ctx.longPressTimer);
      ctx.longPressTimer = null;
    }
    if (ctx.doublePressTimer) {
      clearTimeout(ctx.doublePressTimer);
      ctx.doublePressTimer = null;
    }
  }

  private emitGesture(buttonId: string, gesture: GestureType): void {
    const event: GestureEvent = { buttonId, gesture };
    this.emit('gesture', event);
  }

  reset(): void {
    for (const ctx of this.buttons.values()) {
      this.clearTimers(ctx);
    }
    this.buttons.clear();
  }
}
