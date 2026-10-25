/** Settings → Verschlüsselung: one's own key and certificate, and those of others (docs/encryption.md). */
import { KnownKeysCard } from "../pgp/known-keys-card";
import { OwnKeyCard } from "../pgp/own-key-card";
import { KnownCertsCard, OwnCertCard } from "../smime/smime-cards";

export const EncryptionSection = () => (
  <>
    <OwnKeyCard />
    <KnownKeysCard />
    <OwnCertCard />
    <KnownCertsCard />
  </>
);
