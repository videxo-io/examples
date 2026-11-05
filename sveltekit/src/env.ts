import { defineEnvVars } from '@sveltejs/kit/env';

// The server's settings, read through `$app/env/private`, which browser code cannot import.

const required = (name: string) => (value: string | undefined) => {
  if (!value) throw new Error(`Set ${name} in the server environment.`);
  return value;
};

export const variables = defineEnvVars({
  VIDEXO_API_URL: { schema: (value) => value || 'https://api.videxo.io' },
  VIDEXO_API_KEY: { schema: required('VIDEXO_API_KEY') },
  VIDEXO_WEBHOOK_SECRET: { schema: required('VIDEXO_WEBHOOK_SECRET') },
  VIDEXO_WEBHOOK_URL: {
    description: "A public https URL of this app's /webhooks/videxo (a tunnel in development); optional.",
    schema: (value) => value ?? '',
  },
});
