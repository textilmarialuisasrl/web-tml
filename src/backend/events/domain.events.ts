import { EventEmitter } from "events";

export const DOMAIN_EVENTS = {
  MOVEMENT_CREATED: "MOVEMENT_CREATED",
  STOCK_UPDATED: "STOCK_UPDATED",
  MOVEMENT_REVERSED: "MOVEMENT_REVERSED",
  LOW_STOCK_DETECTED: "LOW_STOCK_DETECTED",
  PDF_GENERATED: "PDF_GENERATED",
  USER_LOGGED_IN: "USER_LOGGED_IN",
} as const;

export type DomainEventType = typeof DOMAIN_EVENTS[keyof typeof DOMAIN_EVENTS];

class DomainEventBus extends EventEmitter {
  // Wrapper to safely emit events in a non-blocking way
  public emitSafe(event: DomainEventType, ...args: any[]): void {
    // defer execution using setImmediate to ensure event handlers don't block active transactions
    setImmediate(() => {
      try {
        this.emit(event, ...args);
      } catch (err) {
        console.error(`[EventBus Error] Failed to handle event "${event}":`, err);
      }
    });
  }
}

export const eventBus = new DomainEventBus();
// Set max listeners to avoid memory leak warnings in dev
eventBus.setMaxListeners(30);
