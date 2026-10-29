import type { Page } from "@playwright/test";

/**
 * The page handed to the browser's print dialog. Headless Chromium prints at once and the hidden
 * frame is gone right after, so its content is recorded when it is added.
 */
export const recordPrints = (page: Page) =>
  page.evaluate(() => {
    const record = window as unknown as { printed: string[] };
    record.printed = [];
    new MutationObserver((changes) => {
      for (const change of changes)
        for (const node of change.addedNodes)
          if (node instanceof HTMLIFrameElement && node.getAttribute("aria-hidden") === "true")
            record.printed.push(node.srcdoc);
    }).observe(document.body, { childList: true });
  });

export const printed = (page: Page) =>
  page.evaluate(() => (window as unknown as { printed: string[] }).printed);
