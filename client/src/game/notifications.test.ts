import { describe, expect, it } from "vitest";
import type { Optin, Trigger } from "gnotif";
import { Notifications, notificationsMessage, optinsFor, type PushClient } from "./notifications";

const REALM = "gno.land/r/x/gnoslinger/v0";

function trigger(event: string, id: string, extra: Partial<Trigger> = {}): Trigger {
  return { id, target: REALM, event, filter: "", param: "to", title: "t", body: "b", link: "/", declarer: "g1d", verified: true, ...extra };
}

describe("optinsFor", () => {
  it("opts in for each notified event, by event, with the address", () => {
    const triggers = [trigger("PlanDue", "v1-0000003"), trigger("RevealDue", "v1-0000004"), trigger("ShowdownOver", "v1-0000005"), trigger("PlanCommitted", "v1-0000006")];
    expect(optinsFor(triggers, "g1me")).toEqual([
      { trigger: "v1-0000003", value: "g1me" },
      { trigger: "v1-0000004", value: "g1me" },
      { trigger: "v1-0000005", value: "g1me" },
    ]);
  });

  it("skips a trigger that is not verified, filtered, or keyed on another attribute", () => {
    const triggers = [trigger("PlanDue", "a", { verified: false }), trigger("RevealDue", "b", { filter: "turn=1" }), trigger("ShowdownOver", "c", { param: "winner" })];
    expect(optinsFor(triggers, "g1me")).toEqual([]);
  });
});

describe("notificationsMessage", () => {
  it("explains the browser's push service refusal, as Brave's", () => {
    expect(notificationsMessage(new Error("Registration failed - push service error"))).toMatch(/Brave/);
    expect(notificationsMessage(new Error("boom"))).toBe("Notifications: boom");
  });
});

describe("Notifications", () => {
  function fake(triggers: Trigger[]) {
    const calls: string[] = [];
    let sent: Optin[] = [];
    const client: PushClient = {
      triggers: async (target) => {
        calls.push(`triggers ${target}`);
        return triggers;
      },
      enable: async () => calls.push("enable"),
      disable: async () => {
        calls.push("disable");
      },
      enabled: async () => true,
      setOptins: async (optins) => {
        calls.push("setOptins");
        sent = optins;
      },
    };
    return { client, calls, sent: () => sent };
  }

  it("enable subscribes then sends the opt-ins for the address", async () => {
    const f = fake([trigger("PlanDue", "v1-0000001")]);
    await new Notifications(f.client, REALM).enable("g1me");
    expect(f.calls).toEqual(["enable", `triggers ${REALM}`, "setOptins"]);
    expect(f.sent()).toEqual([{ trigger: "v1-0000001", value: "g1me" }]);
  });

  it("optIn refuses a realm with no trigger declared", async () => {
    const f = fake([]);
    await expect(new Notifications(f.client, REALM).optIn("g1me")).rejects.toThrow("no notification trigger");
    expect(f.calls).toEqual([`triggers ${REALM}`]);
  });
});
