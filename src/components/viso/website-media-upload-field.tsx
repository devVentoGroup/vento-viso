"use client";

import { useState } from "react";

const UPLOAD_ENDPOINT = "/api/viso/upload-website-media";

type WebsiteMediaUploadFieldProps = {
  label: string;
  name: string;
  defaultValue?: string;
  scope: string;
  accept: string;
};

export function WebsiteMediaUploadField({
  label,
  name,
  defaultValue = "",
  scope,
  accept,
}: WebsiteMediaUploadFieldProps) {
  const [value, setValue] = useState(defaultValue);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    setStatus("uploading");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("scope", scope);

      const response = await fetch(UPLOAD_ENDPOINT, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Error subiendo archivo.");
      }

      const url = String(payload?.url ?? "");
      setValue(url);
      setStatus("done");
      setMessage("Archivo cargado.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error subiendo archivo.";
      setStatus("error");
      setMessage(msg);
    }
  };

  return (
    <div className="space-y-2">
      <span className="ui-label">{label}</span>
      <input
        name={name}
        className="ui-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="https://..."
      />
      <input
        type="file"
        accept={accept}
        className="ui-input"
        onChange={(event) => handleUpload(event.target.files?.[0] ?? null)}
      />
      <div className="ui-caption">
        {status === "uploading" ? "Subiendo archivo..." : message}
      </div>
    </div>
  );
}
