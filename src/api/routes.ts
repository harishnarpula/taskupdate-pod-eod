import express from "express";
import multer from "multer";
import { supabase } from "../utils/supabaseClient.js";
import { parsePdfFromBuffer } from "../utils/pdfParser.js";
import {
  saveResumeVersion,
  getResumeVersions,
  getProfile,
  getWatchlistCompanies,
  addWatchlistCompany,
  getTodayStats,
} from "../db/dbHelper.js";
import {
  runJobDiscoveryFlow,
  handleTelegramApplyAction,
} from "../job-discovery/orchestrator.js";
import { Telegraf } from "telegraf";

export function createDashboardRouter(bot: Telegraf): express.Router {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage() });

  // 1. GET /jobs - Fetch all matched jobs from Supabase
  router.get("/jobs", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .order("discovered_at", { ascending: false });

      if (error) throw error;
      return res.json(data || []);
    } catch (err: any) {
      console.error("❌ REST: Failed to fetch jobs:", err);
      return res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // 2. GET /stats - Fetch today's crawl statistics
  router.get("/stats", async (req, res) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("daily_stats")
        .select("*")
        .eq("date", today)
        .maybeSingle();

      if (error) throw error;
      return res.json(
        data || {
          date: today,
          discovered_count: 0,
          matched_count: 0,
          applied_count: 0,
          skipped_count: 0,
        }
      );
    } catch (err: any) {
      console.error("❌ REST: Failed to fetch stats:", err);
      return res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // 3. GET /watchlist - Fetch watchlisted companies
  router.get("/watchlist", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("watchlist")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return res.json(data || []);
    } catch (err: any) {
      console.error("❌ REST: Failed to fetch watchlist:", err);
      return res.status(500).json({ error: "Failed to fetch watchlist" });
    }
  });

  // 4. POST /watchlist - Add a new company to the watchlist
  router.post("/watchlist", async (req, res) => {
    const { companyName } = req.body;
    if (!companyName) {
      return res.status(400).json({ error: "Missing companyName in request body" });
    }
    try {
      const companyUpper = companyName.trim().toUpperCase();
      const { data, error } = await supabase
        .from("watchlist")
        .insert([{ company_name: companyUpper }])
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.json({ success: true, message: "Company already on watchlist" });
        }
        throw error;
      }
      return res.json({ success: true, company: data });
    } catch (err: any) {
      console.error("❌ REST: Failed to add company to watchlist:", err);
      return res.status(500).json({ error: "Failed to add company" });
    }
  });

  // 5. GET /resumes - List all uploaded resume versions
  router.get("/resumes", async (req, res) => {
    try {
      const list = await getResumeVersions();
      return res.json(list);
    } catch (err: any) {
      console.error("❌ REST: Failed to fetch resumes list:", err);
      return res.status(500).json({ error: "Failed to fetch resumes" });
    }
  });

  // 6. POST /resume/upload - Handle file upload, parsing, and storage mapping
  router.post("/resume/upload", upload.single("resume"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded in form data 'resume'" });
    }

    try {
      console.log(`📡 REST: Uploading resume PDF "${req.file.originalname}" to Supabase storage...`);
      const uniqueId = crypto.randomUUID();
      const filePath = `resumes/${uniqueId}.pdf`;

      // Upload file buffer directly to Supabase storage bucket
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, req.file.buffer, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("resumes")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      // Extract plain text from PDF buffer
      const parsedText = await parsePdfFromBuffer(req.file.buffer);

      // Save record as active
      const savedVersion = await saveResumeVersion(
        req.file.originalname,
        publicUrl,
        parsedText
      );

      // AI Profile Synchronization
      try {
        console.log("🤖 AI: Extracting profile metrics from the newly uploaded resume...");
        const { extractProfileFromResume } = await import("../ai/jobScorer.js");
        const extracted = await extractProfileFromResume(parsedText);

        const { getProfile } = await import("../db/dbHelper.js");
        const profileData = await getProfile();
        if (profileData) {
          const locPrefixed = (extracted.target_locations || []).map((l: string) => `loc:active:${l}`);
          await supabase
            .from("profile")
            .update({
              skills: [...extracted.skills, ...locPrefixed],
              experience_years: extracted.experience_years,
              target_roles: extracted.target_roles,
            })
            .eq("id", profileData.id);
          console.log("✅ AI: Profile settings synchronized with resume skills, locations & experience!");
        }
      } catch (extractErr) {
        console.error("❌ AI Profile sync failed (non-blocking):", extractErr);
      }

      return res.json({
        success: true,
        message: "Resume uploaded, parsed, and set as active.",
        version: savedVersion,
      });
    } catch (err: any) {
      console.error("❌ REST: Resume upload/parse failed:", err);
      return res.status(500).json({ error: err.message || "Failed to process resume upload" });
    }
  });

  // 7. POST /resume/active - Toggle the active resume version
  router.post("/resume/active", async (req, res) => {
    const { id, active } = req.body;
    if (!id) {
      return res.status(400).json({ error: "Missing resume version id" });
    }
    try {
      // Deactivate all first
      await supabase
        .from("resume_versions")
        .update({ is_active: false })
        .eq("is_active", true);

      if (active !== false) {
        // Activate selected
        const { error } = await supabase
          .from("resume_versions")
          .update({ is_active: true })
          .eq("id", id);
        if (error) throw error;
        console.log(`✅ REST: Resume ${id} set as active.`);

        // Fetch resume text to synchronize profile settings
        const { data: activatedCV } = await supabase
          .from("resume_versions")
          .select("resume_text")
          .eq("id", id)
          .single();

        if (activatedCV && activatedCV.resume_text) {
          try {
            console.log(`🤖 AI: Synchronizing profile config for newly activated resume ${id}...`);
            const { extractProfileFromResume } = await import("../ai/jobScorer.js");
            const extracted = await extractProfileFromResume(activatedCV.resume_text);

            const { getProfile } = await import("../db/dbHelper.js");
            const profileData = await getProfile();
            if (profileData) {
              const locPrefixed = (extracted.target_locations || []).map((l: string) => `loc:active:${l}`);
              await supabase
                .from("profile")
                .update({
                  skills: [...extracted.skills, ...locPrefixed],
                  experience_years: extracted.experience_years,
                  target_roles: extracted.target_roles,
                })
                .eq("id", profileData.id);
              console.log("✅ AI: Profile settings synchronized with active resume!");
            }
          } catch (syncErr) {
            console.error("❌ AI: Profile activation sync failed:", syncErr);
          }
        }
      } else {
        console.log(`✅ REST: Resume ${id} deactivated.`);
      }
      return res.json({ success: true, message: "Active resume status updated" });
    } catch (err: any) {
      console.error("❌ REST: Failed to set active resume:", err);
      return res.status(500).json({ error: "Failed to update active state" });
    }
  });

  // 8. POST /action - Apply action (Approve & Email, Apply, or Skip)
  router.post("/action", async (req, res) => {
    const { jobId, action, emailBody } = req.body;
    if (!jobId || !action) {
      return res.status(400).json({ error: "Missing jobId or action" });
    }
    try {
      console.log(`📡 REST: Triggering action "${action}" for jobId: ${jobId}`);
      if (emailBody && action === "email") {
        console.log("📝 REST: Custom email body received. Updating database...");
        const { supabase } = await import("../utils/supabaseClient.js");
        await supabase
          .from("jobs")
          .update({ cover_letter: emailBody })
          .eq("id", jobId);
      }
      const chatId = Number(process.env.MY_CHAT_ID);
      const resultMessage = await handleTelegramApplyAction(bot, jobId, action, chatId);
      return res.json({ success: true, message: resultMessage });
    } catch (err: any) {
      console.error("❌ REST: Action execution failed:", err);
      return res.status(500).json({ error: "Failed to process apply action" });
    }
  });

  // 9. POST /discover - Trigger discovery crawl run
  router.post("/discover", async (req, res) => {
    const { scope } = req.body;
    try {
      console.log(`📡 REST: Manual discovery trigger received. Scope: ${scope || "all"}`);
      runJobDiscoveryFlow(bot, scope || "all").catch((err) => {
        console.error("❌ REST: Background job discovery failed:", err);
      });
      return res.json({ success: true, message: "Job discovery run triggered in backend background." });
    } catch (err: any) {
      console.error("❌ REST: Discovery trigger failed:", err);
      return res.status(500).json({ error: "Failed to trigger discovery run" });
    }
  });

  // 10. GET /profile - Fetch current profile settings
  router.get("/profile", async (req, res) => {
    try {
      const { getProfile } = await import("../db/dbHelper.js");
      const profile = await getProfile();
      return res.json(profile || {});
    } catch (err: any) {
      console.error("❌ REST: Failed to fetch profile:", err);
      return res.status(500).json({ error: "Failed to load profile settings" });
    }
  });

  // 11. POST /profile - Update profile settings
  router.post("/profile", async (req, res) => {
    const { target_roles, min_score_threshold, experience_years, skills, target_locations } = req.body;
    try {
      const { getProfile } = await import("../db/dbHelper.js");
      const profile = await getProfile();
      if (!profile) {
        return res.status(404).json({ error: "Profile config not found in DB." });
      }

      const updates: any = {};
      if (Array.isArray(target_roles)) updates.target_roles = target_roles;
      if (typeof min_score_threshold === "number") updates.min_score_threshold = min_score_threshold;
      if (typeof experience_years === "number") updates.experience_years = experience_years;

      // Merge skills and target_locations
      const updatedSkills = Array.isArray(skills) ? skills : (profile.skills || []);
      const updatedLocations = Array.isArray(target_locations) ? target_locations : (profile.target_locations || []);
      const locPrefixed = updatedLocations.map((l: any) => {
        const name = typeof l === "string" ? l : l.name;
        const active = typeof l === "string" ? true : l.active !== false;
        return active ? `loc:active:${name}` : `loc:inactive:${name}`;
      });
      updates.skills = [...updatedSkills, ...locPrefixed];

      const { data, error } = await supabase
        .from("profile")
        .update(updates)
        .eq("id", profile.id)
        .select()
        .single();

      if (error) throw error;
      console.log("✅ REST: Updated profile configuration:", data);
      return res.json({ success: true, profile: data });
    } catch (err: any) {
      console.error("❌ REST: Failed to update profile:", err);
      return res.status(500).json({ error: "Failed to save profile settings" });
    }
  });

  // 12. DELETE /watchlist/:id - Remove company from watchlist
  router.delete("/watchlist/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await supabase
        .from("watchlist")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return res.json({ success: true, message: "Removed company from watchlist" });
    } catch (err: any) {
      console.error("❌ REST: Failed to delete watchlist item:", err);
      return res.status(500).json({ error: "Failed to remove company" });
    }
  });

  return router;
}
