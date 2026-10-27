/**
 * Saving a photo on an iPhone or iPad. There a download link leaves the app for Safari's download
 * page, and an app on the home screen has no way back from it; the share sheet ("Bild sichern")
 * keeps the app where it is. Other browsers keep the plain download. The photo is fetched as soon
 * as it is shown: Safari only opens the share sheet straight from the tap, not after a fetch.
 */
import { useEffect, useState } from "react";

/** Only Safari on iOS and iPadOS knows -webkit-touch-callout (as in styles.css). */
export const isAppleTouch = (supports: (condition: string) => boolean): boolean =>
  supports("-webkit-touch-callout: none");

const sharesFiles = (): boolean =>
  typeof CSS !== "undefined" &&
  isAppleTouch((condition) => CSS.supports(condition)) &&
  typeof navigator.canShare === "function";

/** The file at `url` ready for the share sheet, or null where the download link is used. */
export const useSharedFile = (url: string | undefined, name: string, type: string) => {
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    setFile(null);
    if (!url || !sharesFiles()) return;
    let current = true;
    fetch(url)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        const shared = blob && new File([blob], name, { type: type || blob.type });
        if (current && shared && navigator.canShare({ files: [shared] })) setFile(shared);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [url, name, type]);
  return file;
};

/** Opens the share sheet for `file`; closing it without choosing is no error. */
export const shareFile = (file: File): void => {
  navigator.share({ files: [file] }).catch(() => {});
};
