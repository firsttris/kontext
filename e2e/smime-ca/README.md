A certificate authority for the e2e tests only (e2e/smime.spec.ts): the server trusts it via
SMIME_ROOTS. Its key is public on purpose; never trust it anywhere else.
