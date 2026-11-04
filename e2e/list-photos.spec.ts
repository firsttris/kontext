import { expect, type Page, test } from "@playwright/test";
import { createContact, deleteContact, listAddressBooks } from "../src/jmap/contacts";
import { addMail, address, jmapAs, login, longPress, personalAccountId, unique } from "./helpers";
import { deliverMail } from "./protocols";

/** A small picture (1×1, red), as a contact photo carried in the card. */
const PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

/** A contact with a photo in the user's own address book, behind the UI's back. */
const addContactWithPhoto = async (user: string, email: string) => {
  const client = jmapAs(user);
  const accountId = await personalAccountId(user);
  const book = (await listAddressBooks(client, accountId)).find((b) => b.isDefault)!;
  const id = await createContact(client, accountId, book.id, {
    name: { components: [{ kind: "given", value: "Ida" }], isOrdered: true },
    emails: { e: { "@type": "EmailAddress", address: email } },
    media: { photo: { "@type": "Media", kind: "photo", uri: PHOTO, mediaType: "image/png" } },
  });
  return () => deleteContact(client, accountId, id);
};

const rowOf = (page: Page, subject: string) =>
  page
    .getByRole("list", { name: "Posteingang" })
    .getByRole("listitem")
    .filter({ hasText: subject });
const photoIn = (row: ReturnType<typeof rowOf>) => row.locator(`img[src="${PHOTO}"]`);
const boxIn = (row: ReturnType<typeof rowOf>, subject: string) =>
  row.getByRole("checkbox", { name: `„${subject}“ auswählen` });

test.describe("Fotos in der Liste", () => {
  test("zeigt das Foto des Absenders, beim Darüberfahren das Kästchen", async ({ page }) => {
    const email = `ida-${Date.now().toString(36)}@ida-liste.test`;
    const removeContact = await addContactWithPhoto("jonas", email);
    const subject = unique("Foto Liste");
    const forged = unique("Foto Liste gefälscht");
    try {
      await addMail("jonas", "jonas", subject, { name: "Ida", email });
      // Over the internet, with nothing that confirms the sender: no photo, only the initials.
      await deliverMail({
        from: email,
        fromName: "Ida",
        to: address("jonas"),
        subject: forged,
        body: "Nicht von Ida.",
      });
      await login(page);
      const row = rowOf(page, subject);
      await expect(photoIn(row)).toBeVisible();
      await expect(rowOf(page, forged)).toBeVisible();
      await expect(rowOf(page, forged).locator("img")).toHaveCount(0);

      await page.mouse.move(0, 0);
      await expect(boxIn(row, subject)).toHaveCSS("opacity", "0");
      await row.hover();
      await expect(boxIn(row, subject)).toHaveCSS("opacity", "1");
      await boxIn(row, subject).click();
      await expect(page.getByText("1 ausgewählt")).toBeVisible();
      await expect(boxIn(row, subject)).toBeChecked();
      // While picking, every line shows its box instead of the picture.
      await expect(photoIn(row)).toHaveCount(0);
      await expect(page).not.toHaveURL(/email=/);
    } finally {
      await removeContact();
    }
  });
});

test.describe("Fotos in der Liste am Handy @phone", () => {
  test("zeigt das Foto, langes Drücken wählt weiter aus @phone", async ({ page }) => {
    const email = `ida-${Date.now().toString(36)}@ida-handy.test`;
    const removeContact = await addContactWithPhoto("max", email);
    const subject = unique("Foto Handy");
    try {
      await addMail("max", "max", subject, { name: "Ida", email });
      await login(page, "max");
      // The narrowest phone in use: the picture fits beside the line, nothing sticks out sideways.
      await page.setViewportSize({ width: 375, height: 812 });
      const row = rowOf(page, subject);
      await expect(photoIn(row)).toBeVisible();
      const list = page.getByRole("list", { name: "Posteingang" });
      expect(
        await list.evaluate((element) => {
          const scroller = element.parentElement!;
          return (
            document.documentElement.scrollWidth <= window.innerWidth &&
            scroller.scrollWidth <= scroller.clientWidth
          );
        }),
      ).toBe(true);

      await longPress(page.getByRole("link", { name: new RegExp(subject) }));
      await expect(page.getByText("1 ausgewählt")).toBeVisible();
      await expect(boxIn(row, subject)).toBeChecked();
      await expect(photoIn(row)).toHaveCount(0);
    } finally {
      await removeContact();
    }
  });
});
