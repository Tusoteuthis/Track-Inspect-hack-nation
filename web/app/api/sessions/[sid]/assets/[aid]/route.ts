import { putAsset } from "@/lib/backend/assets";
import { getConfig } from "@/lib/backend/config";
import { ApiError } from "@/lib/backend/errors";
import { handleRoute } from "@/lib/backend/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sid: string; aid: string }> };

async function readMeta(value: FormDataEntryValue | null): Promise<unknown> {
  if (value === null) throw new ApiError("validation_failed", "meta part is required.", { field: "meta" });
  const text = typeof value === "string" ? value : await value.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError("validation_failed", "meta must be valid JSON.", { field: "meta" });
  }
}

async function readImage(form: FormData, field: "original" | "highlighted"): Promise<Uint8Array | null> {
  const value = form.get(field);
  if (value === null) return null;
  if (!(value instanceof File)) throw new ApiError("validation_failed", `${field} must be a file.`, { field });
  return new Uint8Array(await value.arrayBuffer());
}

export async function PUT(request: Request, ctx: Ctx): Promise<Response> {
  const { sid, aid } = await ctx.params;
  return handleRoute({ component: "assets", op: "put", ids: { session_id: sid, asset_id: aid } }, async () => {
    const limit = 2 * getConfig().assetMaxBytes + 65536;
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > limit) {
      throw new ApiError("validation_failed", "Request body is too large.", { max_bytes: limit });
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError("validation_failed", "Request body must be multipart/form-data.");
    }
    const r = await putAsset(sid, aid, {
      meta: await readMeta(form.get("meta")),
      original: await readImage(form, "original"),
      highlighted: await readImage(form, "highlighted"),
    });
    return Response.json(r.status === 202 ? r.dropped : r.asset, { status: r.status });
  });
}
