import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import OpenAI from "openai";
import pLimit from "p-limit";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const limit = pLimit(2); // reduce concurrency

export async function generateImages(scenes: any[]) {
  const imagesDir = path.resolve("./output/images");

  fs.mkdirSync(imagesDir, { recursive: true });

  const imagePromises = scenes.map((scene) =>
    limit(async () => {
      const sceneNumber = scene.sceneNumber;

      try {
        console.log(
          `🖼️ Generating image for scene ${sceneNumber}`
        );

        const result = await Promise.race([
          client.images.generate({
            model: "gpt-image-1",

            prompt: `
Cinematic futuristic vertical reel scene.

${scene.visualPrompt}

Ultra realistic cinematic lighting.
Instagram reel style.
            `,

            size:"1024x1024",
          }),

          // timeout protection
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Timeout for scene ${sceneNumber}`
                  )
                ),
              120000 // 2 minutes
            )
          ),
        ]);

        const imageBase64 =
          (result as any).data?.[0]?.b64_json;

        if (!imageBase64) {
          console.log(
            `❌ No image for scene ${sceneNumber}`
          );

          return null;
        }

        const imageBuffer = Buffer.from(
          imageBase64,
          "base64"
        );

        const imagePath = path.join(
          imagesDir,
          `scene-${sceneNumber}.png`
        );

        fs.writeFileSync(imagePath, imageBuffer);

        console.log(
          `✅ Image saved for scene ${sceneNumber}`
        );

        return imagePath;
      } catch (error) {
        console.error(
          `❌ Failed scene ${sceneNumber}`,
          error
        );

        return null;
      }
    })
  );

  // IMPORTANT
  const settledResults =
    await Promise.allSettled(imagePromises);

  const successfulImages = settledResults
    .filter(
      (result) =>
        result.status === "fulfilled" &&
        result.value
    )
    .map((result: any) => result.value);

  return successfulImages;
}