import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AppSyncEventsClient,
  DisruptionNotification,
} from '../src/services/realtime/appSyncEventsClient';

class FakeSocket {
  readyState = 0;
  onopen: WebSocket['onopen'] = null;
  onmessage: WebSocket['onmessage'] = null;
  onerror: WebSocket['onerror'] = null;
  onclose: WebSocket['onclose'] = null;
  sent: string[] = [];

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.sent.push(String(data));
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.call(this as unknown as WebSocket, new CloseEvent('close'));
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.call(this as unknown as WebSocket, new Event('open'));
  }

  message(payload: unknown): void {
    this.onmessage?.call(
      this as unknown as WebSocket,
      new MessageEvent('message', { data: JSON.stringify(payload) }),
    );
  }
}

function notification(): DisruptionNotification {
  return {
    deliveryId: 'delivery-1',
    eventType: 'DISRUPTION_CREATED',
    occurredAt: '2026-11-06T10:00:00Z',
    event: {
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
    },
  };
}

describe('AppSyncEventsClient', () => {
  afterEach(() => vi.useRealTimers());

  it('authenticates, subscribes, receives data, and unsubscribes', () => {
    const socket = new FakeSocket();
    let requestedUrl = '';
    let requestedProtocols: string[] = [];
    const received: DisruptionNotification[] = [];
    const client = new AppSyncEventsClient(
      {
        realtimeUrl: 'wss://abc.appsync-realtime-api.ap-south-1.amazonaws.com/event/realtime',
        httpUrl: 'https://abc.appsync-api.ap-south-1.amazonaws.com/event',
        apiKey: 'subscriber-key',
        channel: '/disruptions/network',
      },
      (url, protocols) => {
        requestedUrl = url;
        requestedProtocols = protocols;
        return socket;
      },
    );

    client.start((event) => received.push(event));
    socket.open();
    expect(JSON.parse(socket.sent[0])).toEqual({ type: 'connection_init' });
    expect(requestedUrl).toContain('appsync-realtime-api');
    expect(requestedProtocols[0]).toBe('aws-appsync-event-ws');
    expect(requestedProtocols[1]).toMatch(/^header-/);

    socket.message({ type: 'connection_ack', connectionTimeoutMs: 300_000 });
    const subscribe = JSON.parse(socket.sent[1]);
    expect(subscribe.type).toBe('subscribe');
    expect(subscribe.channel).toBe('/disruptions/network');
    expect(subscribe.authorization).toEqual({
      host: 'abc.appsync-api.ap-south-1.amazonaws.com',
      'x-api-key': 'subscriber-key',
    });

    socket.message({
      type: 'data',
      id: subscribe.id,
      event: [JSON.stringify(notification())],
    });
    expect(received).toEqual([notification()]);

    client.close();
    expect(JSON.parse(socket.sent[2])).toEqual({ type: 'unsubscribe', id: subscribe.id });
  });

  it('reconnects with bounded backoff after an unexpected close', () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const client = new AppSyncEventsClient(
      {
        realtimeUrl: 'wss://abc.appsync-realtime-api.ap-south-1.amazonaws.com/event/realtime',
        httpUrl: 'https://abc.appsync-api.ap-south-1.amazonaws.com/event',
        apiKey: 'subscriber-key',
        channel: '/disruptions/network',
      },
      () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      () => 0.5,
    );

    client.start(() => undefined);
    expect(sockets).toHaveLength(1);
    sockets[0].close();
    vi.advanceTimersByTime(499);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    client.close();
  });
});
