import { describe, expect, it } from "vitest";
import type { BoxConfig } from "../../server/phone/protocol";
import { asteriskFiles, extensionsConf, managerConf, pjsipConf } from "./asterisk-config";

const config: BoxConfig = {
  line: { registrar: "fritz.box", username: "kontext620", password: "geheim" },
  trunk: { host: "kontext.firma.de", port: 5060, username: "kontext-box", password: "trunk" },
  ringSeconds: 60,
};

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
    const conf = extensionsConf(config);
    expect(conf).toContain("Wait(60)");
    expect(conf).toContain(`Set(__KONTEXT_CALL=\${UNIQUEID})`);
    expect(conf).toContain(`Dial(PJSIP/\${KONTEXT_ROOM}@livekit,30)`);
    expect(conf).toContain(`Dial(PJSIP/\${EXTEN}@fritzbox,60,U(kontext-callee-answered))`);
    expect(conf).toMatch(/\[kontext-in\][\s\S]*exten => h,1,UserEvent\(KontextCall,.*State: ended/);
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
    expect(Object.keys(asteriskFiles(config, { username: "a", secret: "s", port: 5038 }))).toEqual([
      "pjsip.conf",
      "extensions.conf",
      "manager.conf",
    ]);
  });
});
