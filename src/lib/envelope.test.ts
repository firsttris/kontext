import { describe, expect, it } from "vitest";
import {
  DSN_NOTIFY,
  envelopeIdOf,
  fromXtext,
  requestedReportId,
  submissionEnvelope,
  xtext,
} from "./envelope";

describe("xtext (RFC 3461 §4)", () => {
  it("keeps printable ASCII and writes +, = and the rest as +HH", () => {
    expect(xtext("abc-1@w.test")).toBe("abc-1@w.test");
    expect(xtext("a+b=c d")).toBe("a+2Bb+3Dc+20d");
    expect(xtext("ü")).toBe("+C3+BC");
  });

  it("reads back what it wrote", () => {
    for (const value of ["a+b=c d", "ü ö", "plain"]) expect(fromXtext(xtext(value))).toBe(value);
  });
});

describe("envelopeIdOf", () => {
  it("is the local part of the Message-ID, at most 100 characters", () => {
    expect(envelopeIdOf("5f0c-41@weber-haustechnik.test")).toBe("5f0c-41");
    expect(envelopeIdOf(`${"x".repeat(150)}@w.test`)).toHaveLength(100);
  });
});

describe("submissionEnvelope", () => {
  const base = { from: "jonas@w.test", recipients: ["anna@w.test", "max@w.test"] };

  it("leaves the envelope to the server when nothing is asked", () => {
    expect(submissionEnvelope(base)).toBeUndefined();
  });

  it("holds the mail and leaves the recipients to the server (RFC 4865)", () => {
    expect(submissionEnvelope({ ...base, hold: { seconds: 10 } })).toEqual({
      mailFrom: { email: "jonas@w.test", parameters: { HOLDFOR: "10" } },
      rcptTo: [],
    });
    expect(
      submissionEnvelope({ ...base, hold: { until: "2026-11-02T07:00:00Z" } })?.mailFrom,
    ).toEqual({ email: "jonas@w.test", parameters: { HOLDUNTIL: "2026-11-02T07:00:00Z" } });
  });

  it("asks every recipient for a report, each once, with the envelope id", () => {
    expect(
      submissionEnvelope({
        ...base,
        recipients: ["anna@w.test", "max@w.test", "Anna@w.test"],
        reportId: "abc",
      }),
    ).toEqual({
      mailFrom: { email: "jonas@w.test", parameters: { RET: "HDRS", ENVID: "abc" } },
      rcptTo: [
        { email: "anna@w.test", parameters: { NOTIFY: DSN_NOTIFY } },
        { email: "max@w.test", parameters: { NOTIFY: DSN_NOTIFY } },
      ],
    });
  });

  it("holds and asks for a report together", () => {
    const envelope = submissionEnvelope({ ...base, hold: { seconds: 10 }, reportId: "abc" });
    expect(envelope?.mailFrom.parameters).toEqual({ HOLDFOR: "10", RET: "HDRS", ENVID: "abc" });
    expect(envelope?.rcptTo).toHaveLength(2);
  });
});

describe("requestedReportId", () => {
  it("is the ENVID of a submission that asked for success or failure", () => {
    expect(
      requestedReportId({
        mailFrom: { parameters: { RET: "HDRS", ENVID: "abc" } },
        rcptTo: [{ parameters: { NOTIFY: "SUCCESS,FAILURE" } }],
      }),
    ).toBe("abc");
  });

  it("is null without NOTIFY, with NOTIFY=NEVER or without ENVID", () => {
    expect(requestedReportId({ mailFrom: { parameters: null }, rcptTo: [{}] })).toBeNull();
    expect(
      requestedReportId({
        mailFrom: { parameters: { ENVID: "abc" } },
        rcptTo: [{ parameters: { NOTIFY: "NEVER" } }],
      }),
    ).toBeNull();
    expect(
      requestedReportId({ mailFrom: {}, rcptTo: [{ parameters: { NOTIFY: "SUCCESS" } }] }),
    ).toBeNull();
  });
});
