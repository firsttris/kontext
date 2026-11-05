/**
 * Settings → Verschlüsselung: one's own key (also for mails kept encrypted on the server) and
 * certificate, and those of others (docs/encryption.md).
 */
import { AtRestCard } from "../pgp/at-rest-card";
import { KnownKeysCard } from "../pgp/known-keys-card";
import { OwnKeyCard } from "../pgp/own-key-card";
import { KnownCertsCard, OwnCertCard } from "../smime/smime-cards";

export const EncryptionSection = () => (
  <>
    <OwnKeyCard />
    <AtRestCard />
    <KnownKeysCard />
    <OwnCertCard />
    <KnownCertsCard />
  </>
);
