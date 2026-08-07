import { OpenAI } from "openai";
import dotenv from "dotenv";

dotenv.config();

// Groq Client setup (using the OpenAI SDK wrapper since Groq is fully compatible)
const groqApiKey = process.env.GROQ_API_KEY;
if (!groqApiKey) {
  console.warn("⚠️ GROQ_API_KEY is missing from environment variables.");
}

export const groq = new OpenAI({
  apiKey: groqApiKey || "",
  baseURL: "https://api.groq.com/openai/v1",
});

// OpenAI Client setup
const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.warn("⚠️ OPENAI_API_KEY is missing from environment variables.");
}

export const openai = new OpenAI({
  apiKey: openaiApiKey || "",
});

// Default models
export const GROQ_MODEL = "llama-3.3-70b-versatile"; // high quality, fast, and huge context
export const OPENAI_MODEL = "gpt-4o-mini"; // low cost, fast for small tasks
