import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function planVideo(userMessage: string) {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
       content: `
You are an AI video planning agent.

Analyze the user's request and return ONLY valid JSON.

Detect:
- topic
- content type
- style
- tone
- duration
- where the generated video should be sent/published

Possible distribution targets:
- localDownload
- instagram
- linkedin
- facebook
- youtube
- whatsapp

If user does not mention a platform, default to:
localDownload = true

Return ONLY JSON.

Example:

{
  "topic": "OpenClaw AI agents",
  "contentType": "reel",
  "style": "futuristic",
  "duration": 60,
  "tone": "engaging",
  "distribution": {
    "localDownload": true,
    "instagram": true,
    "linkedin": false,
    "facebook": false,
    "youtube": false,
    "whatsapp": false
  }
}
`,
      },
      {
        role: "user",
        content: userMessage,
      },
    ],
    temperature: 0.7,
  });

  return response.choices[0].message.content;
}