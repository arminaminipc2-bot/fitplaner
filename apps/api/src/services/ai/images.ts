import { env } from "../../env.js";
import { AppError } from "../../http.js";
import { fetchBytes, guard } from "./http.js";
import type { ImageInput } from "./types.js";

/**
 * Image refs are resolved server-side and bounded: a data URL or a public
 * http(s) URL can be read, anything else is refused. Shared by chat and food
 * analysis so both routes enforce the same limits.
 */

const IMAGE_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export type AttachmentRef = { kind: "image" | "file"; ref: string };

export async function resolveImages(attachments: AttachmentRef[] | undefined): Promise<ImageInput[]> {
  if (!attachments?.length) return [];
  const out: ImageInput[] = [];

  for (const image of attachments.filter((a) => a.kind === "image")) {
    const dataUrl = /^data:(image\/[a-z0-9+.-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(image.ref);
    if (dataUrl) {
      const bytes = Math.floor((dataUrl[2].length * 3) / 4);
      if (bytes > env.AI_MAX_IMAGE_BYTES) {
        throw new AppError(
          422,
          "ai_image_too_large",
          `حجم تصویر از ${Math.round(env.AI_MAX_IMAGE_BYTES / 1_000_000)} مگابایت بیشتر است. تصویر کوچک‌تری بفرستید.`,
        );
      }
      const mediaType = dataUrl[1].toLowerCase();
      if (!IMAGE_MEDIA_TYPES.has(mediaType)) {
        throw new AppError(
          422,
          "ai_image_unreadable",
          "فقط تصویر png، jpeg، webp یا gif قابل تحلیل است.",
        );
      }
      out.push({ mediaType, base64: dataUrl[2] });
      continue;
    }

    if (/^https?:\/\//i.test(image.ref)) {
      const g = guard({ provider: "custom", label: "تصویر", maxBytes: env.AI_MAX_IMAGE_BYTES });
      const fetched = await fetchBytes(image.ref, { method: "GET", redirect: "follow" }, g);
      if (!fetched.ok || fetched.bytes.byteLength === 0) {
        throw new AppError(
          422,
          "ai_image_unreadable",
          "تصویر از آدرس ارسال‌شده خوانده نشد. ممکن است لینک عمومی نباشد یا منقضی شده باشد.",
        );
      }
      const type = fetched.contentType.split(";")[0].trim().toLowerCase();
      if (!IMAGE_MEDIA_TYPES.has(type)) {
        throw new AppError(
          422,
          "ai_image_unreadable",
          "آدرس یک تصویر پشتیبانی‌شده (png، jpeg، webp یا gif) نبود.",
        );
      }
      out.push({ mediaType: type, base64: fetched.bytes.toString("base64") });
      continue;
    }

    throw new AppError(
      422,
      "ai_image_unreadable",
      "این مرجع تصویر در سرور خوانده نمی‌شود. لینک مستقیم تصویر یا دادهٔ base64 را بفرستید.",
    );
  }

  return out;
}
