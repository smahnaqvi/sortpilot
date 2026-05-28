import { verifyWebhookHmac } from "../utils/verify-webhook.server";

export const action = async ({ request }) => {
  const webhook = await verifyWebhookHmac(request);

  if (!webhook.ok) {
    return new Response("Unauthorized", { status: 401 });
  }

  return new Response("OK", { status: 200 });
};