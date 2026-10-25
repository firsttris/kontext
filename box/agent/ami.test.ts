// @vitest-environment node
import { describe, expect, it } from "vitest";
import { callEventOf, formatAction, parseFrames, registrationOf } from "./ami";

const now = new Date("2026-10-25T09:00:00.000Z");

describe("parseFrames", () => {
  it("splits what arrived into messages and keeps the unfinished rest", () => {
    const { frames, rest } = parseFrames(
      "Asterisk Call Manager/9.0.0\r\nResponse: Success\r\nActionID: kontext-1\r\n\r\nEvent: UserEvent\r\nUser",
    );
    expect(frames).toEqual([{ Response: "Success", ActionID: "kontext-1" }]);
    expect(rest).toBe("Event: UserEvent\r\nUser");
  });

  it("keeps a colon inside a value", () => {
    const { frames } = parseFrames(
      "Event: X\r\nChannel: PJSIP/fritzbox-00000001\r\nTime: 09:00:01\r\n\r\n",
    );
    expect(frames[0]?.Time).toBe("09:00:01");
  });
});

describe("formatAction", () => {
  it("writes lines and a blank line, without line breaks inside values", () => {
    expect(
      formatAction([
        ["Action", "Hangup"],
        ["Channel", "PJSIP/x\r\nAction: Originate"],
      ]),
    ).toBe("Action: Hangup\r\nChannel: PJSIP/xAction: Originate\r\n\r\n");
  });
});

describe("callEventOf", () => {
  it("turns the dialplan's user events into call events", () => {
    expect(
      callEventOf(
        {
          Event: "UserEvent",
          UserEvent: "KontextCall",
          Call: "1729850000.12",
          State: "ringing",
          Direction: "in",
          Remote: "07223123456",
          Local: "620",
          Channel: "PJSIP/fritzbox-00000001",
        },
        now,
      ),
    ).toEqual({
      call: "1729850000.12",
      state: "ringing",
      direction: "in",
      remote: "07223123456",
      local: "620",
      at: now.toISOString(),
    });
    expect(
      callEventOf(
        {
          Event: "UserEvent",
          UserEvent: "KontextCall",
          Call: "c",
          State: "ended",
          Direction: "out",
          Cause: "17",
        },
        now,
      ),
    ).toMatchObject({ state: "ended", cause: 17 });
  });

  it("ignores other events and broken ones", () => {
    expect(callEventOf({ Event: "Newchannel" }, now)).toBeNull();
    expect(callEventOf({ Event: "UserEvent", UserEvent: "Other", Call: "c" }, now)).toBeNull();
    expect(
      callEventOf(
        { Event: "UserEvent", UserEvent: "KontextCall", Call: "c", State: "x", Direction: "in" },
        now,
      ),
    ).toBeNull();
  });
});

describe("registrationOf", () => {
  it("reads whether the box is signed in at the Fritzbox", () => {
    expect(
      registrationOf({ Event: "Registry", ChannelType: "PJSIP", Status: "Registered" }),
    ).toEqual({
      registered: true,
      detail: "Registered",
    });
    expect(registrationOf({ Event: "OutboundRegistrationDetail", Status: "Rejected" })).toEqual({
      registered: false,
      detail: "Rejected",
    });
    expect(registrationOf({ Event: "Hangup" })).toBeNull();
  });
});
