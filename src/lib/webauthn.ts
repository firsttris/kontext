/**
 * Passkeys (WebAuthn) between the browser and Stalwart, which keeps them (since 1.1.0). Stalwart
 * hands out the options with base64url strings and takes the browser's answers back the same way
 * (PasskeyAssertion in crates/common/src/auth/passkey/assertion.rs, PasskeyRegistration in
 * crates/registry/src/schema/structs.rs, PasskeyCreationOptions in
 * crates/jmap-proto/src/method/passkey.rs); the browser works with ArrayBuffers. Pure, apart from
 * `passkeysSupported`.
 */

/** Whether this browser can sign in with a passkey at all. */
export const passkeysSupported = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.PublicKeyCredential === "function" &&
  Boolean(navigator.credentials);

export const toBase64url = (buffer: ArrayBuffer | ArrayBufferView): string => {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const fromBase64url = (text: string): Uint8Array<ArrayBuffer> => {
  const padded = text
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(text.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

/** Stalwart's challenge for a sign-in (POST /api/auth/sign-in/stalwart/passkey-options). */
export type SignInOptions = { challenge: string; rpId: string; timeout: number };

/**
 * The request for any passkey of this site: no list of keys, the browser offers the ones it has
 * (Stalwart registers them as discoverable, `residentKey: "required"`).
 */
export const requestOptions = (options: SignInOptions): PublicKeyCredentialRequestOptions => ({
  challenge: fromBase64url(options.challenge),
  rpId: options.rpId,
  timeout: options.timeout,
  userVerification: "required",
});

/** The browser's answer, as Stalwart reads it (PasskeyAssertion). */
export type AssertionJson = {
  rawId: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
};

export const assertionJson = (credential: PublicKeyCredential): AssertionJson => {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    rawId: toBase64url(credential.rawId),
    response: {
      clientDataJSON: toBase64url(response.clientDataJSON),
      authenticatorData: toBase64url(response.authenticatorData),
      signature: toBase64url(response.signature),
      ...(response.userHandle ? { userHandle: toBase64url(response.userHandle) } : {}),
    },
  };
};

/** Stalwart's options for a new passkey (x:Passkey/registrationOptions, `publicKey`). */
export type CreationOptionsJson = {
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: { type: "public-key"; alg: number }[];
  timeout: number;
  excludeCredentials: { type: "public-key"; id: string }[];
  authenticatorSelection: AuthenticatorSelectionCriteria;
  attestation: AttestationConveyancePreference;
};

export const creationOptions = (
  options: CreationOptionsJson,
): PublicKeyCredentialCreationOptions => ({
  ...options,
  user: { ...options.user, id: fromBase64url(options.user.id) },
  challenge: fromBase64url(options.challenge),
  excludeCredentials: options.excludeCredentials.map((key) => ({
    type: key.type,
    id: fromBase64url(key.id),
  })),
});

/** The new passkey, as Stalwart stores it (`registration` of x:Passkey). */
export type RegistrationJson = { clientDataJson: string; attestationObject: string };

export const registrationJson = (credential: PublicKeyCredential): RegistrationJson => {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    clientDataJson: toBase64url(response.clientDataJSON),
    attestationObject: toBase64url(response.attestationObject),
  };
};

/** The person closed the browser's dialog or it timed out: no error worth showing. */
export const isCancelled = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === "NotAllowedError" || error.name === "AbortError");
