export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   */
  register(/* { strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * The publish-webhook lifecycle wiring (§5.3) lands in phase P3.
   */
  bootstrap(/* { strapi } */) {},
};
