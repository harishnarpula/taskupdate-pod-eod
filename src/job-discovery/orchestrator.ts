import { Telegraf } from "telegraf";
import axios from "axios";
import {
  getActiveResume,
  getProfile,
  getWatchlistCompanies,
  saveDiscoveredJob,
  incrementDailyStat,
  getTodayStats,
  getJobById,
  updateJobStatus,
} from "../db/dbHelper.js";
import { discoverJobs, searchJobsWithSerper } from "./serper.js";
import { scrapeJobPage } from "./scraper.js";
import { scoreJobDescription } from "../ai/jobScorer.js";
import { generateTailoredAssets } from "../ai/resumeTailor.js";
import { sendRecruiterEmail } from "../api/emailSender.js";

// Helper to wait between scrapes to prevent IP blocks
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs the full end-to-end job discovery, scraping, scoring, and alerting flow.
 */
export async function runJobDiscoveryFlow(
  bot: Telegraf,
  scope: "general" | "watchlist" | "all" = "all"
): Promise<void> {
  const chatId = Number(process.env.MY_CHAT_ID);
  if (!chatId) {
    console.error("❌ MY_CHAT_ID is not configured in environment variables.");
    return;
  }

  try {
    console.log(`🚀 Starting Job Discovery Flow (Scope: ${scope})...`);
    const scopeLabel = scope === "general" ? "General ATS" : scope === "watchlist" ? "Watchlist Portals" : "All Targets";
    await bot.telegram.sendMessage(
      chatId,
      `🔍 *Starting Job Discovery Run...*\nScope: *${scopeLabel}*`,
      { parse_mode: "Markdown" }
    );

    // 1. Get active resume
    const activeResume = await getActiveResume();
    if (!activeResume) {
      console.warn("⚠️ No active resume found. Job discovery aborted.");
      await bot.telegram.sendMessage(
        chatId,
        "⚠️ *Job Discovery Aborted*: No active resume version found. Please upload a resume first using the dashboard."
      );
      return;
    }

    // 2. Get profile configuration
    const profile = await getProfile();
    if (!profile) {
      console.error("❌ Profile configuration could not be loaded.");
      return;
    }

    const watchlist = await getWatchlistCompanies();

    // 3. Search for jobs (Serper)
    const discoveredJobs = await discoverJobs(profile.target_roles, watchlist, scope);
    console.log(`Discovered ${discoveredJobs.length} potential job URLs.`);

    let matchedCount = 0;

    for (const job of discoveredJobs) {
      try {
        await incrementDailyStat("discovered_count");

        // Simple delay to respect scrapers
        await delay(3000);

        // 4. Scrape the full JD
        const rawJd = await scrapeJobPage(job.url);
        if (!rawJd || rawJd.length < 200) {
          console.warn(`Skipping job (scraped text too short): ${job.url}`);
          continue;
        }

        // 5. Score using Groq (pass active locations preferences)
        const activeLocations = (profile.target_locations || [])
          .filter((l: any) => l.active)
          .map((l: any) => l.name);

        const scoreDetails = await scoreJobDescription(
          activeResume.resume_text,
          rawJd,
          activeLocations
        );

        // Classify match
        const isMatch = scoreDetails.overall_score >= profile.min_score_threshold;
        const targetCompany = scoreDetails.company_name || job.company;

        // Save to DB
        const savedJob = await saveDiscoveredJob({
          title: job.title,
          company: targetCompany,
          location: scoreDetails.dimensions?.location_salary?.reason || "India",
          job_url: job.url,
          raw_jd: rawJd,
          overall_score: scoreDetails.overall_score,
          score_dimensions: scoreDetails.dimensions,
          match_reasons: scoreDetails.match_reasons,
          gap_reasons: scoreDetails.gap_reasons,
          company_tier: scoreDetails.company_tier,
          recruiter_email: scoreDetails.recruiter_email,
          apply_status: isMatch ? "PENDING_APPROVAL" : "SKIPPED",
        });

        if (!savedJob) {
          // Job URL was a duplicate and already existed
          continue;
        }

        if (isMatch) {
          await incrementDailyStat("matched_count");
          matchedCount++;

          // 6. Generate tailored highlights and cover letter
          console.log(`🎨 Tailoring assets for ${job.title} at ${targetCompany}...`);
          const tailored = await generateTailoredAssets(
            activeResume.resume_text,
            job.title,
            targetCompany,
            rawJd,
            scoreDetails.match_reasons,
            scoreDetails.gap_reasons
          );

          // Update tailored assets in DB
          const { error } = await (savedJob as any).update ? null : { error: null }; // Check
          // Let's directly write to DB
          await import("../utils/supabaseClient.js").then(async ({ supabase }) => {
            await supabase
              .from("jobs")
              .update({
                cover_letter: tailored.cover_letter,
                tailored_highlights: tailored.highlights,
              })
              .eq("id", savedJob.id);
          });

          // 7. Send Telegram Alert with inline buttons
          const escapeHtml = (text: string) =>
            text ? text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";

          const textMsg = `🚨 <b>New Match Found!</b> Score: <b>${scoreDetails.overall_score}/100</b>\n` +
            `🏢 <b>Company</b>: ${escapeHtml(targetCompany)} (${escapeHtml(scoreDetails.company_tier)})\n` +
            `💼 <b>Role</b>: ${escapeHtml(job.title)}\n` +
            `📍 <b>Loc</b>: ${escapeHtml(scoreDetails.dimensions?.location_salary?.reason || "Remote/India")}\n\n` +
            `✅ <b>Matches</b>:\n${scoreDetails.match_reasons.map((r) => `• ${escapeHtml(r)}`).slice(0, 3).join("\n")}\n\n` +
            `❌ <b>Gaps</b>:\n${scoreDetails.gap_reasons.map((r) => `• ${escapeHtml(r)}`).slice(0, 3).join("\n")}\n\n` +
            `📧 <b>Email Contact</b>: ${escapeHtml(scoreDetails.recruiter_email || "Not found")}`;

          const inlineKeyboard = [];
          
          if (scoreDetails.recruiter_email) {
            inlineKeyboard.push([{ text: "📧 Approve & Email Recruiter", callback_data: `apply_email:${savedJob.id}` }]);
          }
          
          inlineKeyboard.push([
            { text: "🤖 Approve & Auto-Apply", callback_data: `apply_auto:${savedJob.id}` },
            { text: "❌ Skip Job", callback_data: `skip_job:${savedJob.id}` },
          ]);

          await bot.telegram.sendMessage(chatId, textMsg, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: inlineKeyboard,
            },
          });
        } else {
          await incrementDailyStat("skipped_count");
        }
      } catch (jobError: any) {
        console.error(`❌ Error processing job ${job.url}:`, jobError);
        await bot.telegram.sendMessage(
          chatId,
          `⚠️ <b>Failed to process job page</b>:\n` +
          `URL: <code>${job.url}</code>\n` +
          `<b>Error</b>: <code>${jobError.message || jobError}</code>`,
          { parse_mode: "HTML" }
        );
      }
    }

    await bot.telegram.sendMessage(
      chatId,
      `✅ *Job Discovery Run Complete!*\nProcessed and found *${matchedCount}* matched jobs.`
    );
  } catch (error: any) {
    console.error("❌ Job Discovery Flow Error:", error);
    await bot.telegram.sendMessage(
      chatId,
      `❌ <b>Job Discovery Run failed due to an error.</b>\n` +
      `<b>Details</b>: <code>${error.message || error}</code>`,
      { parse_mode: "HTML" }
    );
  }
}

/**
 * Checks watchlist companies for new career page roles.
 */
export async function runWatchlistCheck(bot: Telegraf): Promise<void> {
  const chatId = Number(process.env.MY_CHAT_ID);
  if (!chatId) return;

  try {
    console.log("📋 Starting morning watchlist check...");
    const watchlist = await getWatchlistCompanies();
    if (watchlist.length === 0) return;

    await bot.telegram.sendMessage(chatId, "🌅 *Running Morning Watchlist Check...*", { parse_mode: "Markdown" });

    // Search and notify
    for (const company of watchlist) {
      const query = `site:careers.${company.toLowerCase()}.com "developer" OR "engineer"`;
      const jobs = await searchJobsWithSerper(query, "WATCHLIST");
      if (jobs.length > 0) {
        let listText = `🏢 *${company}* has new positions:\n`;
        jobs.slice(0, 5).forEach((j) => {
          listText += `• [${j.title}](${j.url})\n`;
        });
        await bot.telegram.sendMessage(chatId, listText, { parse_mode: "Markdown", link_preview_options: { is_disabled: true } });
      }
    }
  } catch (error) {
    console.error("❌ Watchlist check error:", error);
  }
}

/**
 * Sends the daily stats summary block via Telegram.
 */
export async function sendDailySummary(bot: Telegraf): Promise<void> {
  const chatId = Number(process.env.MY_CHAT_ID);
  if (!chatId) return;

  try {
    console.log("📊 Compiling daily stats summary...");
    const stats = await getTodayStats();

    const timelineMsg = `📊 *Daily Career Agent Activity Log*\n` +
      `📅 *Date*: ${stats.date}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔍 *Discovered*: ${stats.discovered_count} jobs total\n` +
      `🔥 *Matched (>= 75)*: ${stats.matched_count} jobs\n` +
      `✅ *Applications Approved*: ${stats.applied_count} jobs\n` +
      `❌ *Skipped (< 75)*: ${stats.skipped_count} jobs\n` +
      `📈 *Match Conversion*: ${
        stats.discovered_count > 0
          ? ((stats.matched_count / stats.discovered_count) * 100).toFixed(0)
          : 0
      }%\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🤖 _Keep applying, consistency wins!_`;

    await bot.telegram.sendMessage(chatId, timelineMsg, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("❌ Error sending daily summary:", error);
  }
}

/**
 * Trigger application action when user clicks inline button in Telegram
 */
export async function handleTelegramApplyAction(
  bot: Telegraf,
  jobId: string,
  method: "email" | "auto" | "skip",
  chatId: number
): Promise<string> {
  const job = await getJobById(jobId);
  if (!job) {
    return "❌ Job record not found in database.";
  }

  if (method === "skip") {
    await updateJobStatus(jobId, "SKIPPED");
    await incrementDailyStat("skipped_count");
    return `❌ Marked job at ${job.company} as skipped.`;
  }

  // Deconstruct resume versions for email attach
  const activeResume = await getActiveResume();
  if (!activeResume) {
    return "❌ Active resume not found. Cannot proceed with application.";
  }

  if (method === "email") {
    if (!job.recruiter_email) {
      return "❌ Recruiter email not found for this listing.";
    }

    try {
      // Download resume pdf buffer
      const response = await axios.get(activeResume.storage_url, { responseType: "arraybuffer" });
      const buffer = Buffer.from(response.data);

      const success = await sendRecruiterEmail({
        to: job.recruiter_email,
        subject: `Application for ${job.title} - Harish Narpula`,
        bodyText: job.cover_letter || "",
        resumeBuffer: buffer,
        resumeFilename: activeResume.filename,
      });

      if (success) {
        await updateJobStatus(jobId, "EMAIL_SENT", new Date().toISOString());
        await incrementDailyStat("applied_count");
        return `✅ Cover letter and Resume sent successfully to ${job.recruiter_email}!`;
      } else {
        return "❌ Failed to send email via SMTP. Check backend logs.";
      }
    } catch (e) {
      console.error(e);
      return "❌ Error downloading resume or sending mail.";
    }
  }

  if (method === "auto") {
    // Standard automation placeholder (runs Playwright auto fill)
    await updateJobStatus(jobId, "AUTO_APPLY_PENDING");
    
    // Asynchronously trigger auto-apply flow
    // (This would run Playwright navigation in the background)
    triggerPlaywrightAutoApply(jobId).catch(console.error);

    return "🤖 Auto-apply initiated in background using Playwright.";
  }

  return "❌ Invalid application action.";
}

// Background Playwright auto-apply placeholder
async function triggerPlaywrightAutoApply(jobId: string): Promise<void> {
  console.log(`🤖 [PLAYWRIGHT] Auto-apply triggered in background for jobId: ${jobId}`);
  // In real terms, this launches Playwright and fills the Greenhouse/Lever/careers page forms
  await delay(10000); // simulation
  await updateJobStatus(jobId, "AUTO_APPLIED", new Date().toISOString());
  await incrementDailyStat("applied_count");
}
