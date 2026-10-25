import { describe, expect, it } from "vitest";
import type { BoxConfig } from "../../server/phone/protocol";
import { asteriskFiles, extensionsConf, managerConf, pjsipConf } from "./asterisk-config";

const config: BoxConfig = {
  line: { registrar: "fritz.box", username: "kontext620", password: "geheim" },
  extraLines: [],
  trunk: { host: "kontext.firma.de", port: 5060, username: "kontext-box", password: "trunk" },
  ringSeconds: 60,
  sounds: [],
  mailbox: null,
  hours: null,
  forward: null,
};
const paths = { sounds: "/data/sounds", recordings: "/data/recordings" };
const greeting = "a1b2c3d4e5f6a1b2c3d4e5f6";

describe("pjsipConf", () => {
  it("signs in at the Fritzbox as an IP phone and calls LiveKit SIP over TCP", () => {
    const conf = pjsipConf(config);
    expect(conf).toContain("[fritzbox-registration]\ntype=registration");
    expect(conf).toContain("server_uri=sip:fritz.box");
    expect(conf).toContain("client_uri=sip:kontext620@fritz.box");
    expect(conf).toContain("context=kontext-in");
    expect(conf).toContain("contact=sip:kontext.firma.de:5060;transport=tcp");
    expect(conf).toContain("rtp_symmetric=yes");
    expect(conf).toContain("username=kontext-box\npassword=trunk");
  });

  it("signs in further IP phones for direct numbers, at the same Fritzbox", () => {
    const conf = pjsipConf({
      ...config,
      extraLines: [{ id: "anna", username: "kontext621", password: "zwei" }],
    });
    expect(conf).toContain("[fritzbox-anna-registration]\ntype=registration");
    expect(conf).toContain("client_uri=sip:kontext621@fritz.box\ncontact_user=kontext621");
    expect(conf).toContain("[fritzbox-anna]\ntype=endpoint");
    expect(conf).toContain("from_user=kontext621");
    // Calls in come through the first line's endpoint (matched by address).
    expect(conf).not.toContain("[fritzbox-anna-identify]");
  });

  it("only listens while there is no line or trunk yet", () => {
    const conf = pjsipConf({ ...config, line: null, trunk: null });
    expect(conf).toContain("[transport-udp]");
    expect(conf).not.toContain("fritzbox");
    expect(conf).not.toContain("livekit");
  });

  it("lets no value open a new line or section", () => {
    const conf = pjsipConf({
      ...config,
      line: { ...config.line!, password: "x\n[evil]\ntype=endpoint;y" },
    });
    expect(conf).toContain("password=xeviltype=endpointy");
    expect(conf).not.toContain("[evil]");
  });
});

describe("extensionsConf", () => {
  it("rings until answered in Kontext, then dials the room at LiveKit", () => {
    const conf = extensionsConf(config, paths);
    expect(conf).toContain("Wait(60)");
    expect(conf).toContain("Hangup(19)");
    expect(conf).not.toContain("kontext-mailbox");
    expect(conf).toContain(`Set(__KONTEXT_CALL=\${UNIQUEID})`);
    expect(conf).toContain(`Dial(PJSIP/\${KONTEXT_ROOM}@livekit,30)`);
    expect(conf).toContain("exten => _**X.,1,Set(__KONTEXT_DIR=out)");
    expect(conf).toContain(`Dial(PJSIP/\${EXTEN}@\${KONTEXT_OUT},60`);
    expect(conf).toContain(`exten => _[+0-9a-zA-Z].,1,Set(__KONTEXT_LINE=\${EXTEN})`);
    expect(conf).toContain(`Line: \${KONTEXT_LINE})`);
    // The line outside reports its end wherever it is, by a hangup handler.
    expect(conf).toContain(
      `exten => ring,1,Set(__KONTEXT_CALL=\${UNIQUEID})\n same => n,Set(__KONTEXT_DIR=in)\n same => n,Set(CHANNEL(hangup_handler_push)=kontext-ended,s,1)`,
    );
    expect(conf).toMatch(
      /\[kontext-ended\]\nexten => s,1,UserEvent\(KontextCall,.*State: ended,Direction: \$\{KONTEXT_DIR\}/,
    );
    expect(conf).not.toContain("exten => h,");
  });
});

describe("the mailbox", () => {
  it("picks up after ringing, plays the greeting and records the message", () => {
    const conf = extensionsConf(
      { ...config, ringSeconds: 25, sounds: [greeting], mailbox: { greeting, maxSeconds: 120 } },
      paths,
    );
    expect(conf).toContain("Wait(25)\n same => n,Goto(kontext-mailbox,s,1)");
    expect(conf).toContain(`State: mailbox,Direction: in`);
    expect(conf).toContain(`Playback(/data/sounds/${greeting})`);
    expect(conf).toContain(`Record(/data/recordings/\${KONTEXT_CALL}.wav,4,120,k)`);
    expect(conf).toContain(`Recording: \${RECORDED_FILE})`);
  });

  it("only beeps without a greeting", () => {
    const conf = extensionsConf({ ...config, mailbox: { greeting: null, maxSeconds: 60 } }, paths);
    expect(conf).not.toContain("Playback(");
    expect(conf).toContain(",4,60,k)");
  });
});

describe("forwarding", () => {
  it("lets a mobile phone ring too after a while, and ends with it when it answered", () => {
    const conf = extensionsConf(
      { ...config, ringSeconds: 40, forward: { number: "01712345678", afterSeconds: 15 } },
      paths,
    );
    expect(conf).toContain(
      [
        " same => n,Wait(15)",
        " same => n,Dial(PJSIP/01712345678@fritzbox,25,U(kontext-forward-answered))",
        ` same => n,ExecIf($["\${DIALSTATUS}" = "ANSWER"]?Hangup(16))`,
        " same => n,Hangup(19)",
      ].join("\n"),
    );
    expect(conf).toContain("[kontext-forward-answered]\nexten => s,1,UserEvent(KontextCall,");
    expect(conf).toContain("State: answered,Direction: in,Forwarded: 1)");
  });
});

describe("opening hours", () => {
  const closedGreeting = "b1b2c3d4e5f6a1b2c3d4e5f6";
  const hours = {
    timezone: "Europe/Berlin",
    open: [
      { day: 1, from: "08:00", to: "12:00" },
      { day: 1, from: "13:00", to: "17:00" },
    ],
    closedDays: ["2026-12-24"],
    greeting: closedGreeting,
  };

  it("checks closed days, then the open ranges, in the company's time zone", () => {
    const conf = extensionsConf({ ...config, hours }, paths);
    expect(conf).toContain(
      [
        "Set(CHANNEL(hangup_handler_push)=kontext-ended,s,1)",
        " same => n,GotoIfTime(*,*,24,dec,Europe/Berlin?closed,1)",
        " same => n,GotoIfTime(08:00-12:00,mon,*,*,Europe/Berlin?ringing,1)",
        " same => n,GotoIfTime(13:00-17:00,mon,*,*,Europe/Berlin?ringing,1)",
        " same => n,Goto(closed,1)",
      ].join("\n"),
    );
    expect(conf).toContain(`State: closed,Direction: in`);
    expect(conf).toContain(`Playback(/data/sounds/${closedGreeting})\n same => n,Hangup(16)`);
  });

  it("takes a message outside the hours when the mailbox is on", () => {
    const conf = extensionsConf(
      { ...config, hours, mailbox: { greeting: null, maxSeconds: 120 } },
      paths,
    );
    expect(conf).toContain(
      `Playback(/data/sounds/${closedGreeting})\n same => n,Goto(kontext-record,s,1)`,
    );
  });

  it("rings straight away without hours", () => {
    expect(extensionsConf(config, paths)).toContain(
      "Set(CHANNEL(hangup_handler_push)=kontext-ended,s,1)\n same => n,Goto(ringing,1)",
    );
  });
});

describe("holding and calls out", () => {
  it("moves a held line to music and back into the room", () => {
    const conf = extensionsConf(config, paths);
    expect(conf).toContain("[kontext-hold]\nexten => s,1,MusicOnHold()");
    expect(conf).toContain(
      `[kontext-resume]\nexten => s,1,Dial(PJSIP/\${KONTEXT_ROOM}@livekit,30)`,
    );
  });

  it("reports an unanswered call out from the line into Kontext, an answered one from outside", () => {
    const conf = extensionsConf(config, paths);
    expect(conf).toContain(
      "exten => _X.,1,Set(__KONTEXT_DIR=out)\n same => n,Set(CHANNEL(hangup_handler_push)=kontext-out-ended,s,1)",
    );
    expect(conf).toContain(
      `[kontext-out-ended]\nexten => s,1,GotoIf($["\${DIALSTATUS}" = "ANSWER"]?done)`,
    );
    expect(conf).toContain(" same => n(done),Return()");
    expect(conf).toMatch(
      /\[kontext-callee-answered\]\n.*State: answered,Direction: out\)\n same => n,Set\(CHANNEL\(hangup_handler_push\)=kontext-ended,s,1\)/,
    );
  });
});

describe("managerConf", () => {
  it("opens the manager interface to localhost only", () => {
    const conf = managerConf({ username: "agent", secret: "s", port: 5038 });
    expect(conf).toContain("bindaddr=127.0.0.1");
    expect(conf).toContain("permit=127.0.0.1/255.255.255.255");
    expect(conf).toContain("write=system,call,originate");
  });
});

describe("asteriskFiles", () => {
  it("writes the three files Asterisk reads", () => {
    expect(
      Object.keys(asteriskFiles(config, { username: "a", secret: "s", port: 5038 }, paths)),
    ).toEqual(["pjsip.conf", "extensions.conf", "manager.conf"]);
  });
});
