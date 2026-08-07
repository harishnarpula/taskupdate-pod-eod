import cron from "node-cron";
import { Telegraf } from "telegraf";
import { setMode } from "../session/sessionState.js";
import {
  runJobDiscoveryFlow,
  runWatchlistCheck,
  sendDailySummary,
} from "../job-discovery/orchestrator.js";

export function startScheduler(bot: Telegraf) {
  const chatId = Number(process.env.MY_CHAT_ID);

  if (!chatId) {
    console.error("❌ MY_CHAT_ID not set in .env");
    return;
  }

  // ================= EXISTING POD/EOD FLOWS =================

  // 9:30 AM — POD Reminder
  cron.schedule("30 9 * * *", async () => {
    console.log("⏰ Sending POD reminder...");
    setMode(chatId, "pod");
    await bot.telegram.sendMessage(
      chatId,
      "🌅 Good Morning!\n\n📋 Time for your *Plan of Day (POD)*.\n\nPlease type your plan for today 👇",
      { parse_mode: "Markdown" }
    );
  });

  // 7:10 PM — EOD Reminder
  cron.schedule("10 19 * * *", async () => {
    console.log("⏰ Sending EOD reminder...");
    setMode(chatId, "eod");
    await bot.telegram.sendMessage(
      chatId,
      "`🌆 Good Evening!\n\n📝 Time for your *End of Day (EOD)*.\n\nPlease type your end of day summary 👇",
      { parse_mode: "Markdown" }
    );
  });

  // ================= NEW CAREER AGENT JOBS =================

  // 8:00 AM — Watchlist Agent morning check
  cron.schedule("0 8 * * *", async () => {
    console.log("⏰ Running scheduled watchlist check...");
    try {
      await runWatchlistCheck(bot);
    } catch (err) {
      console.error("❌ Scheduled watchlist check error:", err);
    }
  });

  // 9:00 AM — Job Discovery Run 1
  cron.schedule("0 9 * * *", async () => {
    console.log("⏰ Running scheduled job discovery (morning run)...");
    try {
      await runJobDiscoveryFlow(bot);
    } catch (err) {
      console.error("❌ Scheduled job discovery run 1 error:", err);
    }
  });

  // 6:00 PM — Job Discovery Run 2
  cron.schedule("0 18 * * *", async () => {
    console.log("⏰ Running scheduled job discovery (evening run)...");
    try {
      await runJobDiscoveryFlow(bot);
    } catch (err) {
      console.error("❌ Scheduled job discovery run 2 error:", err);
    }
  });

  // 8:00 PM — Daily Stats Timeline
  cron.schedule("0 20 * * *", async () => {
    console.log("⏰ Sending scheduled daily career summary...");
    try {
      await sendDailySummary(bot);
    } catch (err) {
      console.error("❌ Scheduled daily summary error:", err);
    }
  });

  console.log("✅ Scheduler started — POD: 9:30 AM | EOD: 7:10 PM");
  console.log("💼 Job Agent crons scheduled — Watchlist: 8 AM | Discover: 9 AM & 6 PM | Stats: 8 PM");
}
