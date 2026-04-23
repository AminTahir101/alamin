import { supabaseAdmin } from "@/lib/server/accessScope";

interface FileRow {
  id: string;
  file_name: string;
  file_type: string;
  mime_type: string;
  storage_path: string;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function extractText(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  if (mimeType === "text/plain" || mimeType === "text/csv" || mimeType === "application/csv") {
    const text = buffer.toString("utf-8");
    const lines = text.split("\n").filter((l) => l.trim());
    const preview = lines.slice(0, 21).join("\n");
    return `File: ${fileName}\n${preview}${lines.length > 21 ? `\n... (${lines.length - 21} more rows)` : ""}`;
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  ) {
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const lines: string[] = [`File: ${fileName}`];
      for (const sheetName of workbook.SheetNames.slice(0, 3)) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        const rows = csv.split("\n").filter((r) => r.replace(/,/g, "").trim());
        lines.push(`\nSheet: ${sheetName}`);
        lines.push(...rows.slice(0, 30));
        if (rows.length > 30) lines.push(`... (${rows.length - 30} more rows)`);
      }
      return lines.join("\n");
    } catch {
      return `File: ${fileName} (Excel — could not parse)`;
    }
  }

  if (mimeType === "application/pdf") {
    try {
      const pdfParse = await import("pdf-parse");
      const result = await pdfParse.default(buffer);
      const text = result.text?.slice(0, 3000) ?? "";
      return `File: ${fileName}\n${text}${(result.text?.length ?? 0) > 3000 ? "\n... (truncated)" : ""}`;
    } catch {
      return `File: ${fileName} (PDF — could not parse text)`;
    }
  }

  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value?.slice(0, 3000) ?? "";
      return `File: ${fileName}\n${text}${(result.value?.length ?? 0) > 3000 ? "\n... (truncated)" : ""}`;
    } catch {
      return `File: ${fileName} (DOCX — could not parse)`;
    }
  }

  return `File: ${fileName} (unsupported format)`;
}

export async function loadAiContextFiles(orgId: string): Promise<{ companyDocs: string; financialDocs: string }> {
  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("ai_context_files")
    .select("id,file_name,file_type,mime_type,storage_path")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(6);

  if (error || !data?.length) return { companyDocs: "none", financialDocs: "none" };

  const companyTexts: string[] = [];
  const financialTexts: string[] = [];

  for (const row of data as FileRow[]) {
    try {
      const { data: fileData, error: downloadErr } = await admin.storage
        .from("ai-context-files")
        .download(safeString(row.storage_path));
      if (downloadErr || !fileData) continue;
      const buffer = Buffer.from(await fileData.arrayBuffer());
      const text = await extractText(buffer, safeString(row.mime_type), safeString(row.file_name));
      if (safeString(row.file_type) === "company_doc") companyTexts.push(text);
      else financialTexts.push(text);
    } catch { continue; }
  }

  return {
    companyDocs: companyTexts.length ? companyTexts.join("\n\n---\n\n") : "none",
    financialDocs: financialTexts.length ? financialTexts.join("\n\n---\n\n") : "none",
  };
}
