import { DisruptionEvent } from '../../types';

export interface DisruptionNotification {
  deliveryId: string;
  eventType: 'DISRUPTION_CREATED' | 'DISRUPTION_UPDATED' | 'DISRUPTION_RESOLVED';
  occurredAt: string;
  event: DisruptionEvent;
}

interface EventsClientConfig {
  realtimeUrl: string;
  httpUrl: string;
  apiKey: string;
  channel: string;
}

type SocketLike = Pick<
  WebSocket,
  'readyState' | 'onopen' | 'onmessage' | 'onerror' | 'onclose' | 'send' | 'close'
>;

type SocketFactory = (url: string, protocols: string[]) => SocketLike;

function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function operationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class AppSyncEventsClient {
  private socket: SocketLike | null = null;
  private subscriptionId: string | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepAliveTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private onNotification: ((notification: DisruptionNotification) => void) | null = null;
  private onError: ((error: Error) => void) | null = null;

  constructor(
    private readonly config: EventsClientConfig,
    private readonly socketFactory: SocketFactory = (url, protocols) => new WebSocket(url, protocols),
    private readonly random: () => number = Math.random,
  ) {
    const realtime = new URL(config.realtimeUrl);
    const http = new URL(config.httpUrl);
    if (realtime.protocol !== 'wss:' || http.protocol !== 'https:') {
      throw new Error('AppSync Events requires wss and https endpoints');
    }
    if (!config.apiKey || !config.channel.startsWith('/')) {
      throw new Error('AppSync Events API key and channel are required');
    }
  }

  start(
    onNotification: (notification: DisruptionNotification) => void,
    onError: (error: Error) => void = () => undefined,
  ): void {
    this.onNotification = onNotification;
    this.onError = onError;
    this.stopped = false;
    this.open();
  }

  close(): void {
    this.stopped = true;
    this.clearTimers();
    if (this.socket?.readyState === 1 && this.subscriptionId) {
      this.socket.send(JSON.stringify({ type: 'unsubscribe', id: this.subscriptionId }));
    }
    this.socket?.close();
    this.socket = null;
    this.subscriptionId = null;
  }

  private open(): void {
    if (this.stopped || this.socket) return;
    const auth = {
      host: new URL(this.config.httpUrl).host,
      'x-api-key': this.config.apiKey,
    };
    const protocol = `header-${base64Url(JSON.stringify(auth))}`;
    this.subscriptionId = operationId();
    const socket = this.socketFactory(this.config.realtimeUrl, [
      'aws-appsync-event-ws',
      protocol,
    ]);
    this.socket = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: 'connection_init' }));
    socket.onmessage = (event) => this.handleMessage(event.data, auth);
    socket.onerror = () => this.onError?.(new Error('AppSync Events WebSocket error'));
    socket.onclose = () => {
      this.socket = null;
      this.subscriptionId = null;
      this.clearKeepAliveTimer();
      this.scheduleReconnect();
    };
  }

  private handleMessage(data: unknown, authorization: Record<string, string>): void {
    if (typeof data !== 'string') return;
    let message: any;
    try {
      message = JSON.parse(data);
    } catch {
      this.onError?.(new Error('AppSync Events returned invalid JSON'));
      return;
    }
    if (message.type === 'connection_ack') {
      this.resetKeepAliveTimer(Number(message.connectionTimeoutMs) || 300_000);
      this.socket?.send(JSON.stringify({
        type: 'subscribe',
        id: this.subscriptionId,
        channel: this.config.channel,
        authorization,
      }));
      return;
    }
    if (message.type === 'ka') {
      this.resetKeepAliveTimer(300_000);
      return;
    }
    if (message.type === 'subscribe_success') {
      this.reconnectAttempt = 0;
      return;
    }
    if (message.type === 'data' && message.id === this.subscriptionId && Array.isArray(message.event)) {
      for (const raw of message.event) {
        try {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          this.onNotification?.(parsed as DisruptionNotification);
        } catch {
          this.onError?.(new Error('AppSync disruption event was invalid'));
        }
      }
      return;
    }
    if (message.type === 'subscribe_error' || message.type === 'broadcast_error') {
      this.onError?.(new Error(`AppSync Events ${message.type}`));
      this.socket?.close();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const ceiling = Math.min(1000 * (2 ** this.reconnectAttempt), 30_000);
    const delay = Math.max(250, Math.floor(this.random() * ceiling));
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private resetKeepAliveTimer(timeoutMs: number): void {
    this.clearKeepAliveTimer();
    this.keepAliveTimer = setTimeout(() => this.socket?.close(), timeoutMs);
  }

  private clearKeepAliveTimer(): void {
    if (this.keepAliveTimer) clearTimeout(this.keepAliveTimer);
    this.keepAliveTimer = null;
  }

  private clearTimers(): void {
    this.clearKeepAliveTimer();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}

export function appSyncEventsClientFromEnvironment(): AppSyncEventsClient | null {
  const realtimeUrl = import.meta.env.VITE_APPSYNC_EVENTS_REALTIME_URL;
  const httpUrl = import.meta.env.VITE_APPSYNC_EVENTS_HTTP_URL;
  const apiKey = import.meta.env.VITE_APPSYNC_EVENTS_API_KEY;
  if (!realtimeUrl || !httpUrl || !apiKey) return null;
  try {
    return new AppSyncEventsClient({
      realtimeUrl,
      httpUrl,
      apiKey,
      channel: import.meta.env.VITE_APPSYNC_EVENTS_CHANNEL || '/disruptions/network',
    });
  } catch {
    return null;
  }
}
