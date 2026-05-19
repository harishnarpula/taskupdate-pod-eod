import cron from "node-cron";
import { Telegraf } from "telegraf";
import { setMode } from "../session/sessionState.js";

export function startScheduler(bot: Telegraf) {
    const chatId = Number(process.env.MY_CHAT_ID);

    if (!chatId) {
        console.error("❌ MY_CHAT_ID not set in .env");
        return;
    }

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
            "🌆 Good Evening!\n\n📝 Time for your *End of Day (EOD)*.\n\nPlease type your end of day summary 👇",
            { parse_mode: "Markdown" }
        );
    });

    console.log("✅ Scheduler started — POD: 9:30 AM | EOD: 7:10 PM");
}
