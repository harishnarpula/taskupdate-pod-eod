import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function generateVoice(
    text: string,
    outputFileName: string = "voice.mp3",
    workflowDir: string
) {
    const speechFile = path.join(
        workflowDir,
        "voice.mp3"
    );

    if (!fs.existsSync("./output")) {
        fs.mkdirSync("./output");
    }

    const mp3 = await client.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: text,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    fs.writeFileSync(speechFile, buffer);

    console.log("🎤 Voice generated:", speechFile);

    return speechFile;
}