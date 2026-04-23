import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

const MAX_BYTES = 2 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/csv": "csv",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const fileType = formData.get("type") as string | null;

    if (!file) return json({ ok: false, error: "No file provided" }, 400);
    if (!fileType || !["company_doc", "financial"].includes(fileType))
      return json({ ok: false, error: "Invalid type. Use company_doc or financial" }, 400);
    if (file.size > MAX_BYTES)
      return json({ ok: false, error: "File exceeds 2 MB limit" }, 400);

    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES[mimeType])
      return json({ ok: false, error: `Unsupported file type: ${mimeType}` }, 400);

    const admin = supabaseAdmin();
    const fileName = `${scope.org.id}/${fileType}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from("ai-context-files")
      .upload(fileName, buffer, { contentType: mimeType, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { data: inserted, error: dbError } = await admin
      .from("ai_context_files")
      .insert({
        org_id: scope.org.id,
        file_type: fileType,
        file_name: file.name,
        storage_path: fileName,
        mime_type: mimeType,
        size_bytes: file.size,
        uploaded_by: scope.userId,
        is_active: true,
      })
      .select("id,file_name,file_type,size_bytes,created_at")
      .single();
    if (dbError) throw new Error(dbError.message);

    return json({ ok: true, file: inserted });
  } catch (error: unknown) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Upload failed" }, 400);
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();

    const { data, error } = await admin
      .from("ai_context_files")
      .select("id,file_name,file_type,size_bytes,mime_type,created_at")
      .eq("org_id", scope.org.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return json({ ok: true, files: data ?? [] });
  } catch (error: unknown) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Failed to load files" }, 400);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const { id } = await req.json() as { id?: string };
    if (!id) return json({ ok: false, error: "File ID required" }, 400);

    const admin = supabaseAdmin();
    const { data: fileRow } = await admin
      .from("ai_context_files")
      .select("storage_path")
      .eq("id", id)
      .eq("org_id", scope.org.id)
      .single() as { data: { storage_path: string } | null };

    if (fileRow) {
      await admin.storage.from("ai-context-files").remove([fileRow.storage_path]);
    }
    await admin.from("ai_context_files").update({ is_active: false }).eq("id", id);
    return json({ ok: true });
  } catch (error: unknown) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Delete failed" }, 400);
  }
}
