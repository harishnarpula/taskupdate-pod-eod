import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
// Replace these with your actual Supabase URL and Anon Key in your frontend project's configuration
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface ResumeVersion {
  id: string;
  filename: string;
  storage_url: string;
  uploaded_at: string;
  is_active: boolean;
}

export default function ResumeManager() {
  const [resumes, setResumes] = useState<ResumeVersion[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error" | null; text: string }>({
    type: null,
    text: "",
  });

  // Fetch upload history
  const fetchResumeHistory = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("resume_versions")
        .select("id, filename, storage_url, uploaded_at, is_active")
        .order("uploaded_at", { ascending: false });

      if (error) throw error;
      setResumes(data || []);
    } catch (err: any) {
      console.error("Error fetching resumes:", err);
      setStatusMsg({ type: "error", text: "Failed to load resume upload history." });
    }
  }, []);

  useEffect(() => {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      fetchResumeHistory();
    } else {
      setStatusMsg({
        type: "error",
        text: "Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your env variables.",
      });
    }
  }, [fetchResumeHistory]);

  // Set selected resume as active
  const handleSetActive = async (id: string) => {
    try {
      // Deactivate all
      await supabase
        .from("resume_versions")
        .update({ is_active: false })
        .eq("is_active", true);

      // Activate selected
      const { error } = await supabase
        .from("resume_versions")
        .update({ is_active: true })
        .eq("id", id);

      if (error) throw error;

      setStatusMsg({ type: "success", text: "Active resume updated successfully!" });
      fetchResumeHistory();
    } catch (err: any) {
      console.error(err);
      setStatusMsg({ type: "error", text: "Failed to activate resume." });
    }
  };

  // Drag and drop event handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Parse PDF resume text via backend call helper
  const triggerBackendPdfParsing = async (storageUrl: string, filename: string) => {
    try {
      // Calls your Node backend to download, parse, and store the resume text
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || "http://localhost:3000"}/api/parse-resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageUrl, filename }),
      });
      
      if (!response.ok) {
        throw new Error("Backend parsing service failed.");
      }
    } catch (err) {
      console.error("Backend PDF text extraction failed:", err);
      // Even if backend triggers fail, the file is safely stored in Supabase Storage.
    }
  };

  // Upload file logic
  const uploadResumeFile = async (file: File) => {
    if (file.type !== "application/pdf") {
      setStatusMsg({ type: "error", text: "Please upload a valid PDF document." });
      return;
    }

    setUploading(true);
    setStatusMsg({ type: null, text: "" });

    try {
      const fileExt = file.name.split(".").pop();
      const uniqueId = crypto.randomUUID();
      const filePath = `resumes/${uniqueId}.${fileExt}`;

      // 1. Upload PDF to Supabase Storage Bucket
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, file, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      // 2. Fetch public URL
      const { data: urlData } = supabase.storage
        .from("resumes")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      // 3. Register resume version in database
      // Temporary stub for resume_text while parser runs
      const { error: dbError } = await supabase.from("resume_versions").insert([
        {
          filename: file.name,
          storage_url: publicUrl,
          resume_text: "Parsing in progress...", // will be updated by parser
          is_active: false,
        },
      ]);

      if (dbError) throw dbError;

      // 4. Trigger backend parser asynchronously
      await triggerBackendPdfParsing(publicUrl, file.name);

      setStatusMsg({ type: "success", text: `"${file.name}" uploaded successfully!` });
      fetchResumeHistory();
    } catch (err: any) {
      console.error("Upload error:", err);
      setStatusMsg({ type: "error", text: err.message || "Failed to upload resume." });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadResumeFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      uploadResumeFile(e.target.files[0]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-teal-400 to-indigo-500 bg-clip-text text-transparent">
              Resume Upload Center
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Upload your resume versions. The AI agent will parse the active document to find matches.
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center gap-3">
            <span className="text-xs text-slate-400">Total Uploads:</span>
            <span className="bg-slate-800 text-teal-400 px-3 py-1 rounded-full text-sm font-semibold border border-slate-700">
              {resumes.length}
            </span>
          </div>
        </div>

        {/* Status Notification Alerts */}
        {statusMsg.type && (
          <div
            className={`p-4 rounded-xl border text-sm flex items-center transition-all ${
              statusMsg.type === "success"
                ? "bg-teal-950/40 text-teal-300 border-teal-800/80"
                : "bg-red-950/40 text-red-300 border-red-900/80"
            }`}
          >
            <span className="mr-2">{statusMsg.type === "success" ? "✓" : "⚠"}</span>
            {statusMsg.text}
          </div>
        )}

        {/* Drag & Drop Window Container */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md">
          <form
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onSubmit={(e) => e.preventDefault()}
            className={`relative rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center p-8 min-h-[220px] ${
              dragActive ? "border-teal-400 bg-teal-950/10" : "border-slate-700 hover:border-slate-600 bg-slate-950/40"
            }`}
          >
            <input
              type="file"
              id="file-upload"
              accept=".pdf"
              onChange={handleFileChange}
              className="hidden"
              disabled={uploading}
            />

            <div className="text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                📁
              </div>
              <div className="text-slate-300">
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer font-semibold text-teal-400 hover:text-teal-300 underline"
                >
                  Upload your CV
                </label>{" "}
                or drag and drop it here.
              </div>
              <p className="text-xs text-slate-500">PDF documents only. Size limit up to 10MB.</p>
            </div>

            {uploading && (
              <div className="absolute inset-0 bg-slate-950/80 rounded-xl flex flex-col items-center justify-center space-y-3">
                <div className="h-8 w-8 border-4 border-teal-400 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm font-medium text-slate-300">Uploading and storing to Supabase Storage...</p>
              </div>
            )}
          </form>
        </div>

        {/* Resume Version History Table */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-md">
          <div className="px-6 py-4 bg-slate-900/80 border-b border-slate-800">
            <h2 className="text-lg font-bold text-slate-200">Upload Versions & Status</h2>
          </div>

          {resumes.length === 0 ? (
            <div className="text-center p-12 text-slate-500">No resumes uploaded yet. Upload your first PDF above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 text-xs tracking-wider uppercase border-b border-slate-800">
                    <th className="p-4">Filename</th>
                    <th className="p-4">Upload Date</th>
                    <th className="p-4">Action Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {resumes.map((resume) => (
                    <tr
                      key={resume.id}
                      className={`hover:bg-slate-800/20 transition-all ${
                        resume.is_active ? "bg-teal-950/10" : ""
                      }`}
                    >
                      <td className="p-4 font-medium text-slate-200">
                        <div className="flex items-center gap-2">
                          <span className="text-red-400">📄</span>
                          <span className="truncate max-w-[240px]">{resume.filename}</span>
                        </div>
                      </td>
                      <td className="p-4 text-slate-400">
                        {new Date(resume.uploaded_at).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="p-4">
                        {resume.is_active ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-950/80 text-teal-300 border border-teal-800/80">
                            ● Active CV
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right space-x-3">
                        <a
                          href={resume.storage_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-400 hover:text-slate-200 text-xs font-semibold underline"
                        >
                          Download
                        </a>
                        {!resume.is_active && (
                          <button
                            onClick={() => handleSetActive(resume.id)}
                            className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold px-3 py-1 rounded-lg text-xs transition-colors"
                          >
                            Set Active
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
