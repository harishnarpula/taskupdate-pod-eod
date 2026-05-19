import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateScript(videoPlan: any) {
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `
You are an AI video script generator.

Generate structured JSON for short-form video creation.

Return ONLY valid JSON.

Example:

{
  "title": "",
  "hook": "",
  "voiceover": "",
  "scenes": [
    {
      "sceneNumber": 1,
      "duration": 5,
      "visualPrompt": "",
      "caption": ""
    }
  ],
  "hashtags": []
}
        `,
      },
      {
        role: "user",
        content: JSON.stringify(videoPlan),
      },
    ],
    temperature: 0.8,
  });

  return response.choices[0].message.content;
}