import crypto from "crypto";

export async function verifyWebhookHmac(request) {
    const rawBody = await request.text();
    const hmacHeader = request.headers.get("x-shopify-hmac-sha256");

    if (!hmacHeader) return { ok: false };

    const digest = crypto
        .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
        .update(rawBody, "utf8")
        .digest("base64");

    const digestBuffer = Buffer.from(digest, "utf8");
    const hmacBuffer = Buffer.from(hmacHeader, "utf8");

    if (
        digestBuffer.length !== hmacBuffer.length ||
        !crypto.timingSafeEqual(digestBuffer, hmacBuffer)
    ) {
        return { ok: false };
    }

    return {
        ok: true,
        rawBody,
        payload: rawBody ? JSON.parse(rawBody) : {},
        shop: request.headers.get("x-shopify-shop-domain"),
        topic: request.headers.get("x-shopify-topic"),
    };
}