import { getApiClient } from '../api';
import { DisruptionEvent } from '../../types';
import {
  DisruptionNotification,
  appSyncEventsClientFromEnvironment,
} from './appSyncEventsClient';
import { isDemoMode } from '../../config/runtime';

export type DisruptionListener = (events: DisruptionEvent[]) => void;

interface ActiveEventsClient {
  getActiveEvents(): Promise<DisruptionEvent[]>;
}

export interface EventsSubscriptionClient {
  start(
    onNotification: (notification: DisruptionNotification) => void,
    onError?: (error: Error) => void,
  ): void;
  close(): void;
}

interface LiveEventsOptions {
  demoMode?: boolean;
  apiClient?: ActiveEventsClient;
  eventsClient?: EventsSubscriptionClient | null;
  pollIntervalMs?: number;
}

export function applyDisruptionNotification(
  current: DisruptionEvent[],
  notification: DisruptionNotification,
): DisruptionEvent[] {
  const remaining = current.filter((event) => event.id !== notification.event.id);
  if (notification.eventType === 'DISRUPTION_RESOLVED' || !notification.event.isActive) {
    return remaining;
  }
  return [...remaining, notification.event];
}

export class LiveEventsService {
  private broadcastChannel: BroadcastChannel | null = null;
  private listeners = new Set<DisruptionListener>();
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private activeEvents: DisruptionEvent[] = [];
  private seenDeliveries = new Set<string>();
  private readonly demoMode: boolean;
  private readonly apiClient: ActiveEventsClient | null;
  private readonly eventsClient: EventsSubscriptionClient | null;
  private readonly pollIntervalMs: number;

  constructor(options: LiveEventsOptions = {}) {
    this.demoMode = options.demoMode ?? isDemoMode;
    this.apiClient = this.demoMode ? null : (options.apiClient ?? getApiClient());
    this.eventsClient = this.demoMode
      ? null
      : (options.eventsClient === undefined ? appSyncEventsClientFromEnvironment() : options.eventsClient);
    this.pollIntervalMs = options.pollIntervalMs ?? (this.demoMode ? 5000 : 15_000);

    if (this.demoMode && typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.broadcastChannel = new BroadcastChannel('accesspath_network_events');
      this.broadcastChannel.onmessage = (event) => {
        if (event.data?.type === 'DISRUPTION_UPDATE') this.notifyDemoListeners();
      };
    }
  }

  subscribe(callback: DisruptionListener): () => void {
    const wasEmpty = this.listeners.size === 0;
    this.listeners.add(callback);
    if (wasEmpty) this.start();

    return () => {
      this.listeners.delete(callback);
      if (this.listeners.size === 0) this.stop();
    };
  }

  broadcastUpdate(): void {
    if (this.demoMode) {
      this.broadcastChannel?.postMessage({ type: 'DISRUPTION_UPDATE', timestamp: Date.now() });
      this.notifyDemoListeners();
    } else {
      void this.refreshAwsEvents();
    }
  }

  private start(): void {
    if (this.demoMode) {
      this.notifyDemoListeners();
    } else {
      void this.refreshAwsEvents();
      this.eventsClient?.start((notification) => this.handleAwsNotification(notification));
    }
    if (!this.pollingTimer && typeof window !== 'undefined') {
      this.pollingTimer = setInterval(() => {
        if (this.demoMode) this.notifyDemoListeners();
        else void this.refreshAwsEvents();
      }, this.pollIntervalMs);
    }
  }

  private stop(): void {
    this.eventsClient?.close();
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = null;
  }

  private handleAwsNotification(notification: DisruptionNotification): void {
    if (!notification.deliveryId || this.seenDeliveries.has(notification.deliveryId)) return;
    this.seenDeliveries.add(notification.deliveryId);
    if (this.seenDeliveries.size > 500) {
      const oldest = this.seenDeliveries.values().next().value;
      if (oldest) this.seenDeliveries.delete(oldest);
    }
    this.activeEvents = applyDisruptionNotification(this.activeEvents, notification);
    this.notifyListeners(this.activeEvents);
  }

  private async refreshAwsEvents(): Promise<void> {
    if (!this.apiClient) return;
    try {
      this.activeEvents = (await this.apiClient.getActiveEvents()).filter((event) => event.isActive);
      this.notifyListeners(this.activeEvents);
    } catch {
      // Retain the last known snapshot; the next poll or socket event can recover.
    }
  }

  private notifyDemoListeners(): void {
    try {
      const raw = localStorage.getItem('accesspath_demo_disruptions');
      const events: DisruptionEvent[] = raw ? JSON.parse(raw) : [];
      this.notifyListeners(events.filter((event) => event.isActive));
    } catch {
      this.notifyListeners([]);
    }
  }

  private notifyListeners(events: DisruptionEvent[]): void {
    for (const listener of this.listeners) listener(events);
  }
}

export const liveEventsService = new LiveEventsService();
