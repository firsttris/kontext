/** Seals secrets (the Stalwart tokens) at rest with AES-GCM; the key comes from the server secret. */

const encoder = new TextEncoder();

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");
const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(Buffer.from(text, "base64url"));

export type Sealer = {
  seal: (plain: string) => Promise<string>;
  open: (sealed: string) => Promise<string>;
};

export const createSealer = async (secret: string, purpose: string): Promise<Sealer> => {
  const material = await crypto.subtle.digest("SHA-256", encoder.encode(`${purpose}:${secret}`));
  const key = await crypto.subtle.importKey("raw", material, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  return {
    seal: async (plain) => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = new Uint8Array(
        await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plain)),
      );
      return `${toBase64(iv)}.${toBase64(cipher)}`;
    },
    open: async (sealed) => {
      const [iv, cipher] = sealed.split(".");
      if (!iv || !cipher) throw new Error("Versiegelter Wert ist kaputt");
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(iv) },
        key,
        fromBase64(cipher),
      );
      return new TextDecoder().decode(plain);
    },
  };
};
