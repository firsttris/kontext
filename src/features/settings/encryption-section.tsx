/** Settings → Verschlüsselung: one's own key and the keys of others (docs/encryption.md). */
import { KnownKeysCard } from "../pgp/known-keys-card";
import { OwnKeyCard } from "../pgp/own-key-card";

export const EncryptionSection = () => (
  <>
    <OwnKeyCard />
    <KnownKeysCard />
  </>
);
