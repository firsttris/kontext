/**
 * The company's Pflichtangaben under the composer's text: shown as they will be added on sending,
 * outside the editor, so nobody changes or drops them and no draft carries them.
 */
import { m } from "@/paraglide/messages";

export const LegalFooterPreview = ({ footer }: { footer: string }) =>
  footer ? (
    <section
      aria-label={m.mail_legal_footer()}
      title={m.mail_legal_footer()}
      data-testid="legal-footer"
      className="mx-4 mb-2 max-h-28 shrink-0 cursor-default select-none overflow-y-auto whitespace-pre-line border-t border-border pt-2 text-[12px] leading-relaxed text-muted"
    >
      {footer}
    </section>
  ) : null;
