import { describe, expect, it } from "vitest";
import { printDocument } from "./print";

const mail = {
  subject: "Angebot <Wartung> 2027",
  from: [{ name: "Petra Keller", email: "petra@keller-elektro.test" }],
  to: [{ name: null, email: "jonas@weber-haustechnik.test" }],
  cc: [],
  date: "Sa., 24. Oktober 2026 um 14:46",
  body: "<p>Hallo Jonas,</p>",
  attachments: [{ name: "Angebot.pdf", size: "1,5 KB" }],
};

describe("printDocument", () => {
  it("prints the head, the text and the attachments, escaped", () => {
    const page = printDocument(mail);
    expect(page).toContain("<h1>Angebot &lt;Wartung&gt; 2027</h1>");
    expect(page).toContain("Petra Keller &lt;petra@keller-elektro.test&gt;");
    expect(page).toContain("<td>jonas@weber-haustechnik.test</td>");
    expect(page).toContain('<div class="body"><p>Hallo Jonas,</p></div>');
    expect(page).toContain("<li>Angebot.pdf (1,5 KB)</li>");
    expect(page).toContain("@page { size: A4;");
  });

  it("fetches nothing from outside", () => {
    expect(printDocument(mail)).toContain("img-src data: blob:;");
  });
  it("leaves out what is not there: Cc, mailbox, attachments", () => {
    const page = printDocument({ ...mail, attachments: [] });
    expect(page).not.toContain("<th>Cc</th>");
    expect(page).not.toContain("Postfach");
    expect(page).not.toContain('class="files"');
    expect(printDocument({ ...mail, mailbox: "info@weber-haustechnik.test" })).toContain(
      "<th>Postfach</th><td>info@weber-haustechnik.test</td>",
    );
  });
});
