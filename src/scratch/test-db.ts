import { supabase } from "../utils/supabaseClient.js";
import { groq, GROQ_MODEL } from "../ai/aiClients.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

async function testConnections() {
  console.log("🚦 Testing Career Agent Configured APIs...");

  // 1. Test Supabase Database Connection
  try {
    console.log("\n1. Testing Supabase database connection...");
    const { data, error } = await supabase.from("profile").select("*").limit(1);
    if (error) {
      if (error.code === "PGRST116" || error.message.includes("does not exist")) {
        console.warn("⚠️  Supabase connected, but tables do not exist yet. Did you run schema.sql in SQL Editor?");
      } else {
        throw error;
      }
    } else {
      console.log("✅ Supabase Database Connection OK!");
    }
  } catch (err: any) {
    console.error("❌ Supabase DB connection failed:", err.message || err);
  }

  // 2. Test Groq API Key
  try {
    console.log("\n2. Testing Groq API completion...");
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: "Test ping. Respond only with 'OK'." }],
      model: GROQ_MODEL,
    });
    const reply = completion.choices[0]?.message?.content?.trim();
    console.log(`✅ Groq Connection OK! Reply: "${reply}"`);
  } catch (err: any) {
    console.error("❌ Groq API failed:", err.message || err);
  }

  // 3. Test Serper API Key
  try {
    console.log("\n3. Testing Serper API search...");
    const serperKey = process.env.SERPER_API_KEY;
    if (!serperKey) throw new Error("SERPER_API_KEY missing");

    const res = await axios.post(
      "https://google.serper.dev/search",
      { q: "Google jobs", tbs: "qdr:d" },
      {
        headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
      }
    );
    console.log(`✅ Serper API Connection OK! Results found: ${res.data.organic?.length || 0}`);
  } catch (err: any) {
    console.error("❌ Serper API failed:", err.message || err);
  }

  console.log("\n🏁 Connectivity check complete.");
}

testConnections();
