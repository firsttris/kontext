import { cleanup, render, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { m } from "@/paraglide/messages";
import { type Locale, overwriteGetLocale } from "@/paraglide/runtime";
import { ComposerFields } from "./composer-fields";
import { richText, spellChecked } from "./rich-text";

const none = () => {};

const subjectField = () => {
  render(
    <ComposerFields
      identities={[]}
      identityId=""
      onIdentity={none}
      to={[]}
      onTo={none}
      cc={[]}
      onCc={none}
      bcc={[]}
      onBcc={none}
      showCopies={false}
      onShowCopies={none}
      replyTo={[]}
      onReplyTo={none}
      showReplyTo={false}
      onShowReplyTo={none}
      subject=""
      onSubject={none}
      suggestions={[]}
      autoFocusTo={false}
    />,
  );
  return screen.getByRole("textbox", { name: m.mail_subject() });
};

const mailText = () =>
  new Editor({ extensions: richText(), editorProps: { attributes: spellChecked() } }).view.dom;

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => "de"); // test-setup.ts's language for the other tests
});

describe.each<Locale>(["de", "en"])("spell checking in %s", (locale) => {
  it("is on for the mail text and the subject, in the app's language", () => {
    overwriteGetLocale(() => locale);
    const text = mailText();
    expect(text.getAttribute("spellcheck")).toBe("true");
    expect(text.getAttribute("lang")).toBe(locale);
    const subject = subjectField();
    expect(subject.getAttribute("spellcheck")).toBe("true");
    expect(subject.getAttribute("lang")).toBe(locale);
  });
});
