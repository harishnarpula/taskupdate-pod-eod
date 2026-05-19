import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function normalizeText(text: string): Promise<string> {
    const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: `You are a professional text editor.
Fix all spelling mistakes, grammar issues, and normalize the text properly.
Format the output as clean bullet points, one task per bullet.
Keep the original meaning intact.
Return ONLY the bullet points, nothing else.`,
            },
            {
                role: "user",
                content: text,
            },
        ],
        temperature: 0.3,
    });

    return response.choices[0].message.content ?? text;
}
