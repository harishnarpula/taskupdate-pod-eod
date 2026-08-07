import { supabase } from "../utils/supabaseClient.js";

export interface DBJob {
  id?: string;
  title: string;
  company: string;
  location?: string;
  job_url: string;
  raw_jd?: string;
  overall_score?: number;
  score_dimensions?: any;
  match_reasons?: string[];
  gap_reasons?: string[];
  company_tier?: string;
  recruiter_email?: string | null;
  cover_letter?: string;
  tailored_highlights?: string[];
  apply_status?: string;
  applied_at?: string;
  notes?: string;
}

export interface DBProfile {
  id?: string;
  skills: string[];
  experience_years: number;
  min_score_threshold: number;
  target_roles: string[];
  target_locations?: { name: string; active: boolean }[];
}

export interface DBResume {
  id: string;
  filename: string;
  storage_url: string;
  resume_text: string;
  is_active: boolean;
  uploaded_at: string;
}

/**
 * Fetches the active resume from resume_versions table.
 */
export async function getActiveResume(): Promise<DBResume | null> {
  const { data, error } = await supabase
    .from("resume_versions")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("❌ Error fetching active resume:", error);
    return null;
  }
  return data;
}

/**
 * Lists all uploaded resume versions.
 */
export async function getResumeVersions(): Promise<DBResume[]> {
  const { data, error } = await supabase
    .from("resume_versions")
    .select("*")
    .order("uploaded_at", { ascending: false });

  if (error) {
    console.error("❌ Error listing resume versions:", error);
    return [];
  }
  return data || [];
}

/**
 * Inserts a new resume version, making it the active version.
 */
export async function saveResumeVersion(
  filename: string,
  storageUrl: string,
  resumeText: string
): Promise<DBResume | null> {
  // First, deactivate any active resumes
  await supabase
    .from("resume_versions")
    .update({ is_active: false })
    .eq("is_active", true);

  // Insert the new active resume
  const { data, error } = await supabase
    .from("resume_versions")
    .insert([
      {
        filename,
        storage_url: storageUrl,
        resume_text: resumeText,
        is_active: true,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("❌ Error saving new resume version:", error);
    return null;
  }
  return data;
}

/**
 * Fetches the candidate profile. If not found, creates a default one.
 */
export async function getProfile(): Promise<DBProfile | null> {
  const { data, error } = await supabase
    .from("profile")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("❌ Error fetching profile:", error);
    return null;
  }

  if (!data) {
    // Create a default profile
    const defaultProfile = {
      skills: ["React", "TypeScript", "Node.js", "Java", "Spring Boot", "Docker"],
      experience_years: 2.0,
      min_score_threshold: 80,
      target_roles: ["Full Stack Developer", "Software Engineer", "Backend Developer"],
    };

    const { data: newProfile, error: createError } = await supabase
      .from("profile")
      .insert([defaultProfile])
      .select()
      .single();

    if (createError || !newProfile) {
      console.error("❌ Error creating default profile:", createError);
      return null;
    }

    const allSkills = Array.isArray(newProfile.skills) ? newProfile.skills : [];
    const target_locations = allSkills
      .filter((s: string) => s.startsWith("loc:"))
      .map((s: string) => {
        if (s.startsWith("loc:active:")) {
          return { name: s.replace("loc:active:", ""), active: true };
        } else if (s.startsWith("loc:inactive:")) {
          return { name: s.replace("loc:inactive:", ""), active: false };
        } else {
          return { name: s.replace("loc:", ""), active: true };
        }
      });
    const skills = allSkills.filter((s: string) => !s.startsWith("loc:"));

    return {
      ...newProfile,
      skills,
      target_locations,
    };
  }

  // Force minimum threshold to 80 if it's currently set lower
  if (data.min_score_threshold !== 80) {
    console.log("🔄 Updating DB profile score threshold to 80...");
    const { error: updateError } = await supabase
      .from("profile")
      .update({ min_score_threshold: 80 })
      .eq("id", data.id);
  }

  const allSkills = Array.isArray(data.skills) ? data.skills : [];
  const target_locations = allSkills
    .filter((s: string) => s.startsWith("loc:"))
    .map((s: string) => {
      if (s.startsWith("loc:active:")) {
        return { name: s.replace("loc:active:", ""), active: true };
      } else if (s.startsWith("loc:inactive:")) {
        return { name: s.replace("loc:inactive:", ""), active: false };
      } else {
        return { name: s.replace("loc:", ""), active: true };
      }
    });
  const skills = allSkills.filter((s: string) => !s.startsWith("loc:"));

  return {
    ...data,
    skills,
    target_locations,
  };
}

/**
 * Saves a discovered job to the jobs table.
 * If the URL is already present, ignores.
 */
export async function saveDiscoveredJob(job: DBJob): Promise<DBJob | null> {
  const { data, error } = await supabase
    .from("jobs")
    .insert([job])
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      // Duplicate URL code in PostgreSQL
      console.log(`ℹ️ Job URL already exists: ${job.job_url}`);
      return null;
    }
    console.error("❌ Error saving job:", error);
    return null;
  }
  return data;
}

/**
 * Updates a job's application status.
 */
export async function updateJobStatus(
  jobId: string,
  status: string,
  appliedAt?: string
): Promise<boolean> {
  const updates: any = { apply_status: status };
  if (appliedAt) {
    updates.applied_at = appliedAt;
  }

  const { error } = await supabase
    .from("jobs")
    .update(updates)
    .eq("id", jobId);

  if (error) {
    console.error(`❌ Error updating job status for ${jobId}:`, error);
    return false;
  }
  return true;
}

/**
 * Gets a specific job by ID.
 */
export async function getJobById(jobId: string): Promise<DBJob | null> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    console.error(`❌ Error fetching job by ID ${jobId}:`, error);
    return null;
  }
  return data;
}

/**
 * Lists all watchlist companies.
 */
export async function getWatchlistCompanies(): Promise<string[]> {
  const { data, error } = await supabase
    .from("watchlist")
    .select("company_name");

  if (error) {
    console.error("❌ Error fetching watchlist:", error);
    return [];
  }
  return (data || []).map((row) => row.company_name);
}

/**
 * Adds a company to the watchlist.
 */
export async function addWatchlistCompany(companyName: string): Promise<boolean> {
  const { error } = await supabase
    .from("watchlist")
    .insert([{ company_name: companyName.toUpperCase() }]);

  if (error) {
    if (error.code === "23505") return true; // Already exists
    console.error(`❌ Error adding company ${companyName} to watchlist:`, error);
    return false;
  }
  return true;
}

/**
 * Increments daily metrics stats.
 */
export async function incrementDailyStat(columnName: "discovered_count" | "matched_count" | "applied_count" | "skipped_count"): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  
  // Try to insert first
  const { error: insertError } = await supabase
    .from("daily_stats")
    .insert([{ date: today }])
    .select();

  // Update logic (runs if insert succeeds or fails due to unique constraint)
  const { data: currentStats } = await supabase
    .from("daily_stats")
    .select("*")
    .eq("date", today)
    .single();

  if (currentStats) {
    const currentValue = currentStats[columnName] || 0;
    await supabase
      .from("daily_stats")
      .update({ [columnName]: currentValue + 1 })
      .eq("date", today);
  }
}

/**
 * Fetches the daily stats for today.
 */
export async function getTodayStats(): Promise<any> {
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("daily_stats")
    .select("*")
    .eq("date", today)
    .maybeSingle();

  if (error) {
    console.error("❌ Error fetching daily stats:", error);
    return null;
  }
  return data || { date: today, discovered_count: 0, matched_count: 0, applied_count: 0, skipped_count: 0 };
}
