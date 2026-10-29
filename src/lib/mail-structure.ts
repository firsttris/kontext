/**
 * The MIME tree of a mail sent over JMAP (RFC 8621 §4.6, `bodyStructure`): text and HTML as
 * alternatives, the HTML in multipart/related with the images it shows (Content-ID, inline), the
 * files after it in multipart/mixed. Stalwart builds no multipart/related from `attachments`
 * with a `cid` alone (it puts them into the mixed part, where Outlook lists them as files), so
 * the tree is given whole. Pure.
 */

export type StructureFile = { blobId: string; name: string; type: string };
export type StructureImage = StructureFile & { cid: string };

/** The parts `bodyValues` holds: "text" and "html". */
export const bodyStructureOf = (files: StructureFile[], images: StructureImage[] = []) => {
  const html = { partId: "html", type: "text/html" };
  const alternative = {
    type: "multipart/alternative",
    subParts: [
      { partId: "text", type: "text/plain" },
      images.length
        ? {
            type: "multipart/related",
            subParts: [
              html,
              ...images.map(({ blobId, name, type, cid }) => ({
                blobId,
                name,
                type,
                cid,
                disposition: "inline",
              })),
            ],
          }
        : html,
    ],
  };
  return files.length
    ? {
        type: "multipart/mixed",
        subParts: [
          alternative,
          ...files.map(({ blobId, name, type }) => ({
            blobId,
            name,
            type,
            disposition: "attachment",
          })),
        ],
      }
    : alternative;
};
