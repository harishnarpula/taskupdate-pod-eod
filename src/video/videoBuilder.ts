import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

export async function buildVideo(
  images: string[],
  audioPath: string
): Promise<string> {

  return new Promise((resolve, reject) => {

    const outputDir = path.resolve("./output");

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, {
        recursive: true,
      });
    }

    const outputVideo = path.join(
      outputDir,
      "final-reel.mp4"
    );

    // delete old file
    if (fs.existsSync(outputVideo)) {
      fs.unlinkSync(outputVideo);
    }

    // IMPORTANT:
    // create temporary concat file
    const concatFile = path.join(
      outputDir,
      "images.txt"
    );

    let concatContent = "";

    for (const image of images) {
      concatContent += `file '${image.replace(/\\/g, "/")}'\n`;
      concatContent += `duration 5\n`;
    }

    // repeat last image
    concatContent += `file '${images[
      images.length - 1
    ].replace(/\\/g, "/")}'\n`;

    fs.writeFileSync(concatFile, concatContent);

    ffmpeg()
      .input(concatFile)
      .inputOptions([
        "-f concat",
        "-safe 0",
      ])

      .input(audioPath)

      .videoCodec("libx264")
      .audioCodec("aac")

      .outputOptions([
        "-pix_fmt yuv420p",
        "-vf scale=1080:1920",
        "-shortest",
      ])

      .save(outputVideo)

      .on("start", (cmd) => {
        console.log("🎬 FFmpeg started");
        console.log(cmd);
      })

      .on("end", () => {
        console.log(
          "✅ Video rendering completed"
        );

        resolve(outputVideo);
      })

      .on("error", (err) => {
        console.error(
          "❌ FFmpeg error:",
          err
        );

        reject(err);
      });

  });
}