import { z } from "zod";

// Zod probes `new Function` when it builds an object schema, at import time; the app's CSP (no
// 'unsafe-eval', server/headers.ts) blocks it, and the browser logs a violation although Zod
// catches the error. Jitless skips the probe (zod/v4/core/util.js `allowsEval`, read in
// schemas.js `$ZodObjectJIT`). The app takes `z` from here, so this runs before any schema is
// built, whatever chunk the bundler puts it in.
z.config({ jitless: true });

export { z };
