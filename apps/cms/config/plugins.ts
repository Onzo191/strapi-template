/**
 * Plugin configuration (§4.6: "pure config → S3, i18n locales, RBAC, webhooks").
 *
 * - i18n: enabled; the vi + en locales are provisioned in `src/index.ts`
 *   bootstrap (locales are DB rows, not static config).
 * - upload: the AWS S3 provider is wired *by config only* and gated on
 *   `AWS_BUCKET`. Without S3 env vars the CMS falls back to the default local
 *   provider, so it boots cleanly in dev / CI. The real bucket is wired later.
 */
export default ({ env }) => ({
  i18n: {
    enabled: true,
  },

  // Local custom plugin (§4.5/§4.6): editorial workflow + immutable audit log.
  editorial: {
    enabled: true,
    resolve: "./src/plugins/editorial",
  },

  ...(env("AWS_BUCKET")
    ? {
        upload: {
          config: {
            provider: "aws-s3",
            providerOptions: {
              baseUrl: env("CDN_URL"),
              rootPath: env("AWS_ROOT_PATH"),
              s3Options: {
                credentials: {
                  accessKeyId: env("AWS_ACCESS_KEY_ID"),
                  secretAccessKey: env("AWS_ACCESS_SECRET"),
                },
                region: env("AWS_REGION", "ap-southeast-1"),
                params: {
                  ACL: env("AWS_ACL", "private"),
                  signedUrlExpires: env.int("AWS_SIGNED_URL_EXPIRES", 900),
                  Bucket: env("AWS_BUCKET"),
                },
              },
            },
            actionOptions: {
              upload: {},
              uploadStream: {},
              delete: {},
            },
          },
        },
      }
    : {}),
});
