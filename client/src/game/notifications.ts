/**
 * Browser notifications of my moves, through gnotif (https://gnotif.xyz):
 * the realm emits an event naming the player at the moments it may have
 * the game closed (gno/r/v0/notify.gno) and declares a trigger per event
 * in the gnotif registry; a gnotif server pushes a Web Push notification
 * to every browser opted in with that address, which the service worker
 * (assets/sw.js, a copy of the gnotif package's) shows. The lobby's pill
 * turns them on (the browser asks for permission) or off.
 */
import { Gnotif, GnotifError, type Optin, type Trigger } from "gnotif";

/** The realm's events a browser is told about, each by a trigger whose param is the player's address. */
export const NOTIFIED_EVENTS = ["PlanDue", "RevealDue", "ShowdownOver"] as const;

/** The attribute of those events that names the player. */
export const RECIPIENT_PARAM = "to";

/** The notification's icon, a PNG the service worker shows. */
export const NOTIFICATION_ICON = import.meta.env.BASE_URL + "char_marshal.png";

/** The opt-ins for an address: one per notified event among the realm's verified triggers, by event since ids may change. */
export function optinsFor(triggers: Trigger[], address: string): Optin[] {
  return NOTIFIED_EVENTS.flatMap((event) => {
    const t = triggers.find((t) => t.verified && t.event === event && t.param === RECIPIENT_PARAM && t.filter === "");
    return t ? [{ trigger: t.id, value: address }] : [];
  });
}

/** What the lobby uses of the gnotif client (the whole of it in the app, a fake in tests). */
export interface PushClient {
  triggers(target: string): Promise<Trigger[]>;
  enable(): Promise<unknown>;
  disable(): Promise<void>;
  enabled(): Promise<boolean>;
  setOptins(optins: Optin[]): Promise<void>;
}

export class Notifications {
  constructor(
    private readonly client: PushClient,
    private readonly realmPath: string,
  ) {}

  /** Whether this browser is subscribed and allowed to show notifications. */
  enabled(): Promise<boolean> {
    return this.client.enabled();
  }

  /** Subscribes this browser (from a click: the browser asks for permission) and opts it in for address. */
  async enable(address: string): Promise<void> {
    await this.client.enable();
    await this.optIn(address);
  }

  /** Unsubscribes this browser; the server forgets it and its opt-ins. */
  disable(): Promise<void> {
    return this.client.disable();
  }

  /**
   * Sends the opt-ins for address, replacing the set the browser had: on
   * every load and account change, since the server cannot be asked for
   * them and the triggers' ids may change.
   */
  async optIn(address: string): Promise<void> {
    const optins = optinsFor(await this.client.triggers(this.realmPath), address);
    if (optins.length === 0) throw new Error("the realm has no notification trigger declared");
    await this.client.setOptins(optins);
  }
}

/** The notifications of the realm through the gnotif server at server (VITE_GNOTIF_SERVER). */
export function newNotifications(server: string, chainId: string, realmPath: string): Notifications {
  return new Notifications(new Gnotif({ network: chainId, server, serviceWorker: import.meta.env.BASE_URL + "sw.js", icon: NOTIFICATION_ICON }), realmPath);
}

/**
 * Whether the server does not know this browser's subscription: it was
 * subscribed but never registered (an enable that failed halfway), so the
 * notifications are off until enabled again.
 */
export function unregistered(e: unknown): boolean {
  return e instanceof GnotifError && e.status === 404;
}

/** What to tell the player when the notifications fail. */
export function notificationsMessage(e: unknown): string {
  if (e instanceof GnotifError) {
    switch (e.code) {
      case "unsupported":
        return "This browser cannot show push notifications";
      case "denied":
        return "Notifications are blocked for this site: allow them in the browser's site settings";
      case "network":
        return "The notification server cannot be reached";
      default:
        return `Notifications: ${e.message}`;
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  // The browser's own refusal to subscribe: Brave ships with Google's push service off.
  if (/push service error/i.test(msg)) {
    return "The browser could not subscribe to push: on Brave, turn on \"Use Google services for push messaging\" in its privacy settings";
  }
  return `Notifications: ${msg}`;
}
