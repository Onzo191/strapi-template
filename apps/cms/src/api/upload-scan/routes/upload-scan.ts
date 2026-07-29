/**
 * Virus-scan verdict callback (Mode B — see `src/upload/virus-scan.ts`).
 *
 * `auth: false` because the caller is a Lambda, not a Strapi user or API token:
 * it authenticates with an HMAC over the raw body, verified in the controller.
 * That is the same envelope the revalidation webhook uses (§5.3), for the same
 * reason — a shared secret plus a replay window beats provisioning and rotating a
 * Strapi token inside a Lambda's environment.
 */
export default {
  routes: [
    {
      method: "POST",
      path: "/upload-scan/callback",
      handler: "upload-scan.callback",
      config: {
        auth: false,
      },
    },
  ],
};
