import { describe, expect, it, vi } from 'vitest';
import { DisruptionEvent } from '../src/types';
import { DisruptionNotification } from '../src/services/realtime/appSyncEventsClient';
import {
  EventsSubscriptionClient,
  LiveEventsService,
} from '../src/services/realtime/liveEvents';

const activeEvent: DisruptionEvent = {
  id: 'event-1',
  entityId: 'lift-a1',
  entityName: 'Elevator A1',
  type: 'elevator_outage',
  severity: 'critical',
  reason: 'Elevator unavailable',
  effectiveStart: '2026-11-06T10:00:00Z',
  affectedLinesOrStops: [],
  impactOnAccessibility: 'Step-free access unavailable',
  isActive: true,
};

class FakeEventsClient implements EventsSubscriptionClient {
  callback: ((notification: DisruptionNotification) => void) | null = null;
  closed = false;

  start(callback: (notification: DisruptionNotification) => void): void {
    this.callback = callback;
  }

  emit(notification: DisruptionNotification): void {
    this.callback?.(notification);
  }

  close(): void {
    this.closed = true;
  }
}

describe('LiveEventsService', () => {
  it('combines the active snapshot with deduplicated socket updates', async () => {
    const eventsClient = new FakeEventsClient();
    const apiClient = { getActiveEvents: vi.fn().mockResolvedValue([activeEvent]) };
    const service = new LiveEventsService({
      demoMode: false,
      apiClient,
      eventsClient,
      pollIntervalMs: 60_000,
    });
    const snapshots: DisruptionEvent[][] = [];
    const unsubscribe = service.subscribe((events) => snapshots.push(events));

    await vi.waitFor(() => expect(snapshots.at(-1)).toEqual([activeEvent]));

    const secondEvent = { ...activeEvent, id: 'event-2', entityId: 'path-2' };
    const created: DisruptionNotification = {
      deliveryId: 'delivery-2',
      eventType: 'DISRUPTION_CREATED',
      occurredAt: '2026-11-06T10:05:00Z',
      event: secondEvent,
    };
    eventsClient.emit(created);
    const countAfterCreate = snapshots.length;
    expect(snapshots.at(-1)).toEqual([activeEvent, secondEvent]);

    eventsClient.emit(created);
    expect(snapshots).toHaveLength(countAfterCreate);

    eventsClient.emit({
      ...created,
      deliveryId: 'delivery-3',
      eventType: 'DISRUPTION_RESOLVED',
      event: { ...secondEvent, isActive: false },
    });
    expect(snapshots.at(-1)).toEqual([activeEvent]);

    unsubscribe();
    expect(eventsClient.closed).toBe(true);
  });
});
