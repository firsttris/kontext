import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageFiles } from "./message-files";

const photo = { id: "f1", name: "IMG_3639.jpg", type: "image/jpeg", size: 853_000 };
const urls = { f1: "blob:photo" };

const openPhoto = () => {
  render(<MessageFiles files={[photo]} urls={urls} />);
  fireEvent.click(screen.getByRole("button", { name: /IMG_3639/ }));
  return screen.getByRole("link", { name: "Herunterladen" });
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MessageFiles photo download", () => {
  it("opens the share sheet on an iPhone instead of leaving the app", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("CSS", { supports: (c: string) => c === "-webkit-touch-callout: none" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["jpg"]) }),
    );
    Object.assign(navigator, { canShare: () => true, share });
    const link = openPhoto();
    await waitFor(() => {
      fireEvent.click(link);
      expect(share).toHaveBeenCalledOnce();
    });
    expect(share.mock.calls[0]![0].files[0].name).toBe("IMG_3639.jpg");
  });

  it("keeps the plain download elsewhere", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("CSS", { supports: () => false });
    vi.stubGlobal("fetch", fetcher);
    const link = openPhoto();
    expect(link.getAttribute("download")).toBe("IMG_3639.jpg");
    expect(fireEvent.click(link)).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
