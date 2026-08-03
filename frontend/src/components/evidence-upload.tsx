"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, CheckCircle2, XCircle } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import type { ComplianceRequirement, EvidenceUploadResponse } from "@/lib/types";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface EvidenceUploadProps {
  auditId: string;
  requirements: ComplianceRequirement[];
  onUploaded: (result: EvidenceUploadResponse) => void;
}

export function EvidenceUpload({ auditId, requirements, onUploaded }: EvidenceUploadProps) {
  const [requirementCode, setRequirementCode] = useState(requirements[0]?.code ?? "");
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<
    { kind: "success" } | { kind: "error"; message: string; details?: string[] } | null
  >(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setUploading(true);
      setFeedback(null);

      const formData = new FormData();
      formData.append("file", file);
      if (requirementCode) formData.append("requirement_code", requirementCode);

      try {
        const res = await api.post<{ data: EvidenceUploadResponse }>(
          `/api/v1/audits/${auditId}/evidences`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        const result = res.data.data;

        if (result.validation_errors.length > 0) {
          setFeedback({ kind: "error", message: "El archivo se guardó pero tiene errores", details: result.validation_errors });
        } else {
          setFeedback({ kind: "success" });
        }
        onUploaded(result);
      } catch (err) {
        setFeedback({ kind: "error", message: getApiErrorMessage(err, "No se pudo subir el archivo") });
      } finally {
        setUploading(false);
      }
    },
    [auditId, requirementCode, onUploaded]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: uploading,
    maxFiles: 1,
    accept: {
      "application/pdf": [".pdf"],
      "application/json": [".json"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
  });

  return (
    <div className="flex flex-col gap-3">
      {requirements.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="requirement">Requisito que cubre esta evidencia</Label>
          <select
            id="requirement"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
            value={requirementCode}
            onChange={(e) => setRequirementCode(e.target.value)}
          >
            {requirements.map((r) => (
              <option key={r.code} value={r.code}>
                [{r.code}] {r.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
          isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50",
          uploading && "pointer-events-none opacity-60"
        )}
      >
        <input {...getInputProps()} />
        <UploadCloud className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">
          {uploading ? "Subiendo..." : isDragActive ? "Soltá el archivo acá" : "Arrastrá un archivo o hacé clic"}
        </p>
        <p className="text-xs text-muted-foreground">.xlsx, .pdf o .json — máx. 20MB</p>
      </div>

      {feedback?.kind === "success" && (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>Evidencia válida</AlertTitle>
          <AlertDescription>La cobertura se actualizó.</AlertDescription>
        </Alert>
      )}

      {feedback?.kind === "error" && (
        <Alert variant="destructive">
          <XCircle className="size-4" />
          <AlertTitle>{feedback.message}</AlertTitle>
          {feedback.details && feedback.details.length > 0 && (
            <AlertDescription>
              <ul className="list-disc pl-4">
                {feedback.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </AlertDescription>
          )}
        </Alert>
      )}
    </div>
  );
}
