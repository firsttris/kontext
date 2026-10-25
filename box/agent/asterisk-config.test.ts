import { describe, expect, it } from "vitest";
import type { BoxConfig } from "../../server/phone/protocol";
import { asteriskFiles, extensionsConf, managerConf, pjsipConf } from "./asterisk-config";

const config: BoxConfig = {
  line: { registrar: "fritz.box", username: "kontext620", password: "geheim" },
  trunk: { host: "kontext.firma.de", port: 5060, username: "kontext-box", password: "trunk" },
  ringSeconds: 60,
  sounds: [],
  mailbox: null,
  hours: null,
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
    expect(conf).toContain(`Dial(PJSIP/\${EXTEN}@fritzbox,60,U(kontext-callee-answered))`);
    expect(conf).toContain("exten => _**X.,1,UserEvent(KontextCall");
    expect(conf).toMatch(/\[kontext-in\][\s\S]*exten => h,1,UserEvent\(KontextCall,.*State: ended/);
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
    expect(conf).toMatch(/\[kontext-mailbox\][\s\S]*exten => h,1,.*Recording: \$\{RECORDED_FILE\}/);
  });

  it("only beeps without a greeting", () => {
    const conf = extensionsConf({ ...config, mailbox: { greeting: null, maxSeconds: 60 } }, paths);
    expect(conf).not.toContain("Playback(");
    expect(conf).toContain(",4,60,k)");
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
        `exten => ring,1,Set(__KONTEXT_CALL=\${UNIQUEID})`,
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
      `exten => ring,1,Set(__KONTEXT_CALL=\${UNIQUEID})\n same => n,Goto(ringing,1)`,
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
