import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import express from "express";
import axios from "axios";
import cron from "node-cron";

import { planVideo } from "../ai/planner.js";
import { generateScript } from "../ai/scriptGenerator.js";
import { generateVoice } from "../voice/generateVoice.js";
import { generateImages } from "../images/generateImages.js";
import { buildVideo } from "../video/videoBuilder.js";
import { createWorkflow } from "../utils/workflow.js";
import { normalizeText } from "../ai/textNormalizer.js";
import { submitPOD, submitEOD } from "../api/podEodApi.js";
import { startScheduler } from "../scheduler/scheduler.js";
import {
    getSession,
    setMode,
    setPendingText,
    clearSession,
} from "../session/sessionState.js";
import {
    runJobDiscoveryFlow,
    sendDailySummary,
    handleTelegramApplyAction,
} from "../job-discovery/orchestrator.js";
import { addWatchlistCompany } from "../db/dbHelper.js";
import { createDashboardRouter } from "../api/routes.js";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    throw new Error("Telegram bot token missing");
}

const bot = new Telegraf(token);

bot.start(async (ctx) => {
    return ctx.reply("🚀 AI Content Engine Started");
});

bot.command("pod", async (ctx) => {
    const chatId = ctx.chat.id;
    setMode(chatId, "pod");
    await ctx.reply("📋 POD mode activated!\n\nPlease type your plan for today 👇");
});

bot.command("eod", async (ctx) => {
    const chatId = ctx.chat.id;
    setMode(chatId, "eod");
    await ctx.reply("📝 EOD mode activated!\n\nPlease type your end of day summary 👇");
});

// OWNER CHECK MIDDLEWARE HELPER
const checkOwner = async (ctx: any, next: () => Promise<void>) => {
    const chatId = ctx.chat?.id;
    if (chatId !== Number(process.env.MY_CHAT_ID)) {
        console.warn(`⚠️ Unauthorized access attempt from chatId: ${chatId}`);
        return ctx.reply("⛔ Unauthorized access.");
    }
    return next();
};

bot.command("discover", checkOwner, async (ctx) => {
    const text = ctx.message.text.trim();
    const parts = text.split(" ");
    let scope: "general" | "watchlist" | "all" = "all";
    
    if (parts.length >= 2) {
        const arg = parts[1].toLowerCase();
        if (arg === "general" || arg === "watchlist" || arg === "all") {
            scope = arg as any;
        }
    }

    await ctx.reply(`🔄 Manual job discovery run started (scope: ${scope})...`);
    runJobDiscoveryFlow(bot, scope).catch((err) => {
        console.error("❌ Discover command error:", err);
    });
});

bot.command("stats", checkOwner, async (ctx) => {
    await sendDailySummary(bot);
});

bot.command("watchlist", checkOwner, async (ctx) => {
    const text = ctx.message.text.trim();
    const parts = text.split(" ");
    if (parts.length < 2) {
        return ctx.reply("ℹ️ Usage: /watchlist <COMPANY_NAME>");
    }
    const company = parts.slice(1).join(" ");
    const success = await addWatchlistCompany(company);
    if (success) {
        return ctx.reply(`✅ Added *${company.toUpperCase()}* to your watchlist.`, { parse_mode: "Markdown" });
    } else {
        return ctx.reply("❌ Failed to add company to watchlist.");
    }
});

// APPROVAL BUTTON HANDLERS
bot.action("approve_pod", async (ctx) => {
    const chatId = ctx.chat!.id;
    const session = getSession(chatId);

    await ctx.answerCbQuery();

    if (!session.pendingCleanedText) {
        return ctx.reply("❌ No pending POD found.");
    }

    try {
        await ctx.reply("⏳ Submitting your POD...");
        await submitPOD(session.pendingCleanedText);
        clearSession(chatId);
        await ctx.reply("✅ POD submitted successfully!");
    } catch (error) {
        console.error("❌ POD API Error:", error);
        await ctx.reply("❌ Failed to submit POD. Please try again.");
    }
});

bot.action("reject_pod", async (ctx) => {
    const chatId = ctx.chat!.id;
    await ctx.answerCbQuery();
    setMode(chatId, "pod");
    await ctx.reply("🔄 Please re-enter your POD 👇");
});

bot.action("approve_eod", async (ctx) => {
    const chatId = ctx.chat!.id;
    const session = getSession(chatId);

    await ctx.answerCbQuery();

    if (!session.pendingCleanedText) {
        return ctx.reply("❌ No pending EOD found.");
    }

    try {
        await ctx.reply("⏳ Submitting your EOD...");
        await submitEOD(session.pendingCleanedText);
        clearSession(chatId);
        await ctx.reply("✅ EOD submitted successfully!");
    } catch (error) {
        console.error("❌ EOD API Error:", error);
        await ctx.reply("❌ Failed to submit EOD. Please try again.");
    }
});

bot.action("reject_eod", async (ctx) => {
    const chatId = ctx.chat!.id;
    await ctx.answerCbQuery();
    setMode(chatId, "eod");
    await ctx.reply("🔄 Please re-enter your EOD 👇");
});

// BUTTON MENU ACTION HANDLERS
bot.action("cmd_pod", checkOwner, async (ctx) => {
    const chatId = ctx.chat!.id;
    await ctx.answerCbQuery();
    setMode(chatId, "pod");
    await ctx.reply("📋 POD mode activated!\n\nPlease type your plan for today 👇");
});

bot.action("cmd_eod", checkOwner, async (ctx) => {
    const chatId = ctx.chat!.id;
    await ctx.answerCbQuery();
    setMode(chatId, "eod");
    await ctx.reply("📝 EOD mode activated!\n\nPlease type your end of day summary 👇");
});

bot.action("cmd_discover", checkOwner, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("🔄 Manual job discovery run started...");
    runJobDiscoveryFlow(bot).catch((err) => {
        console.error("❌ Discover command error:", err);
    });
});

bot.action("cmd_stats", checkOwner, async (ctx) => {
    await ctx.answerCbQuery();
    await sendDailySummary(bot);
});

// TEXT MESSAGE HANDLER
bot.on("text", async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text;
    const session = getSession(chatId);

    console.log("📩 User Message:", text, "| Mode:", session.mode);

    // GREETINGS & HELP menu interceptor
    const cleanedText = text.trim().toLowerCase();
    const greetings = ["hi", "hai", "hello", "hey", "help", "yo", "start"];
    
    if (greetings.includes(cleanedText)) {
        const welcomeMsg = `👋 <b>Welcome back! Here are the commands you can use with your AI Agent:</b>\n\n` +
            `📋 <b>/pod</b> — Activate POD mode to submit your Plan of Day.\n` +
            `📝 <b>/eod</b> — Activate EOD mode to submit your End of Day summary.\n` +
            `🔍 <b>/discover [scope]</b> — Trigger manual job discovery crawl (scopes: <code>general</code>, <code>watchlist</code>, <code>all</code>).\n` +
            `📈 <b>/stats</b> — View today's job discovery and application statistics.\n` +
            `🏢 <b>/watchlist [company]</b> — Add a company careers subdomain to target checks.`;
            
        return ctx.reply(welcomeMsg, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "📋 Submit POD", callback_data: "cmd_pod" },
                        { text: "📝 Submit EOD", callback_data: "cmd_eod" }
                    ],
                    [
                        { text: "🔍 Run Job Crawl", callback_data: "cmd_discover" },
                        { text: "📈 View Stats", callback_data: "cmd_stats" }
                    ]
                ]
            }
        });
    }

    // POD FLOW
    if (session.mode === "pod") {
        setMode(chatId, null);
        await ctx.reply("🔍 Checking and normalizing your POD...");

        try {
            const cleanedText = await normalizeText(text);
            setPendingText(chatId, cleanedText);

            await ctx.reply(
                `📋 *Your cleaned POD:*\n\n${cleanedText}\n\nDo you approve?`,
                {
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "✅ Approve", callback_data: "approve_pod" },
                                { text: "❌ Reject", callback_data: "reject_pod" },
                            ],
                        ],
                    },
                }
            );
        } catch (error) {
            console.error("❌ POD Normalize Error:", error);
            await ctx.reply("❌ Failed to process your POD. Please try again.");
        }

        return;
    }

    // EOD FLOW
    if (session.mode === "eod") {
        setMode(chatId, null);
        await ctx.reply("🔍 Checking and normalizing your EOD...");

        try {
            const cleanedText = await normalizeText(text);
            setPendingText(chatId, cleanedText);

            await ctx.reply(
                `📝 *Your cleaned EOD:*\n\n${cleanedText}\n\nDo you approve?`,
                {
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "✅ Approve", callback_data: "approve_eod" },
                                { text: "❌ Reject", callback_data: "reject_eod" },
                            ],
                        ],
                    },
                }
            );
        } catch (error) {
            console.error("❌ EOD Normalize Error:", error);
            await ctx.reply("❌ Failed to process your EOD. Please try again.");
        }

        return;
    }

    // VIDEO GENERATION FLOW (disabled for now)
    await ctx.reply("🤖 Send your POD or EOD when reminded by the scheduler.");
});

async function processReelGeneration(ctx: any, text: string) {
    try {
        const { workflowId, workflowDir } = createWorkflow();

        console.log("🧠 Workflow:", workflowId);

        // STEP 1
        const aiPlan = await planVideo(text);

        if (!aiPlan) {
            return ctx.reply("❌ Failed to generate AI plan");
        }

        const parsedPlan = JSON.parse(aiPlan);

        fs.writeFileSync(
            path.join(workflowDir, "plan.json"),
            JSON.stringify(parsedPlan, null, 2)
        );

        // STEP 2
        const script = await generateScript(parsedPlan);

        if (!script) {
            return ctx.reply("❌ Failed to generate script");
        }

        const parsedScript = JSON.parse(script);
        fs.writeFileSync(
            path.join(workflowDir, "script.json"),
            JSON.stringify(parsedScript, null, 2)
        );

        await ctx.reply("🎤 Generating voice...\n🖼️ Generating images...");

        // STEP 3 PARALLEL
        const [voiceFilePath, generatedImages] = await Promise.all([
            generateVoice(parsedScript.voiceover, "voice.mp3", workflowDir),
            generateImages(parsedScript.scenes),
        ]);

        // STEP 4 SEND AUDIO
        if (voiceFilePath) {
            await ctx.replyWithAudio({ source: voiceFilePath });
        }

        // STEP 5 SEND IMAGES
        for (const imagePath of generatedImages) {
            await ctx.replyWithPhoto({ source: imagePath });
        }

        await ctx.reply("✅ AI Reel Generated Successfully");
        await ctx.reply("🎬 Rendering final reel...");

        const videoPath = await buildVideo(generatedImages, voiceFilePath);
        await ctx.replyWithVideo({ source: videoPath });
    } catch (error) {
        console.error("❌ Reel Generation Error:", error);
        await ctx.reply("❌ Failed during reel generation");
    }
}

// Callback Actions matching jobId
bot.action(/^apply_email:(.+)$/, checkOwner, async (ctx) => {
    const jobId = ctx.match[1];
    await ctx.answerCbQuery();

    try {
        const { supabase } = await import("../utils/supabaseClient.js");
        const { data: job } = await supabase
            .from("jobs")
            .select("company, title, recruiter_email, cover_letter")
            .eq("id", jobId)
            .single();

        if (!job) {
            return ctx.reply("❌ Job match not found in database.");
        }

        const msgText = `📧 <b>Please approve the email content for:</b>\n` +
            `🏢 <b>Company</b>: ${job.company}\n` +
            `💼 <b>Role</b>: ${job.title}\n` +
            `📧 <b>Recruiter</b>: <code>${job.recruiter_email || "N/A"}</code>\n\n` +
            `📝 <b>Email Content:</b>\n` +
            `----------------------------------------\n` +
            `<code>${job.cover_letter || "No cover letter generated."}</code>\n` +
            `----------------------------------------`;

        await ctx.reply(msgText, {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "✅ Confirm & Send", callback_data: `send_email_now:${jobId}` },
                        { text: "❌ Cancel / Skip", callback_data: `skip_job:${jobId}` }
                    ]
                ]
            }
        });
    } catch (err: any) {
        console.error("Error loading email content for review:", err);
        await ctx.reply("❌ Error retrieving cover letter content.");
    }
});

bot.action(/^send_email_now:(.+)$/, checkOwner, async (ctx) => {
    const jobId = ctx.match[1];
    await ctx.answerCbQuery();
    await ctx.reply("⏳ Sending tailored resume & cover letter via email...");
    const msg = await handleTelegramApplyAction(bot, jobId, "email", ctx.chat!.id);
    await ctx.reply(msg);
});

bot.action(/^apply_auto:(.+)$/, checkOwner, async (ctx) => {
    const jobId = ctx.match[1];
    await ctx.answerCbQuery();
    await ctx.reply("⏳ Running Playwright auto-apply script...");
    const msg = await handleTelegramApplyAction(bot, jobId, "auto", ctx.chat!.id);
    await ctx.reply(msg);
});

bot.action(/^skip_job:(.+)$/, checkOwner, async (ctx) => {
    const jobId = ctx.match[1];
    await ctx.answerCbQuery();
    const msg = await handleTelegramApplyAction(bot, jobId, "skip", ctx.chat!.id);
    await ctx.reply(msg);
});

// GLOBAL ERROR HANDLER
bot.catch((err) => {
    console.error("❌ Global Telegram Error:", err);
});

bot.launch();

// START SCHEDULER
startScheduler(bot);

// HEALTH CHECK & PARSE SERVER
const app = express();
app.use(express.json());

// Enable CORS for frontend local development
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

// Register unified dashboard routes under /api
app.use("/api", createDashboardRouter(bot));

app.get("/health", (_, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Health server on port ${PORT}`));

// SELF-PING every 14 min, 8 AM to 11 PM
cron.schedule("*/14 8-22 * * *", async () => {
    const url = process.env.RENDER_URL;
    if (!url) return;
    try {
        await axios.get(`${url}/health`);
        console.log("🏓 Self-ping OK");
    } catch {
        console.error("❌ Self-ping failed");
    }
});

console.log("✅ Telegram Bot Running...");
