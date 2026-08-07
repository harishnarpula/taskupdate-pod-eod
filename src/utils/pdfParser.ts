import axios from "axios";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

/**
 * Downloads a PDF file from a URL and extracts its text contents.
 */
export async function parsePdfFromUrl(pdfUrl: string): Promise<string> {
  try {
    console.log(`📥 Downloading PDF for parsing: ${pdfUrl}`);
    const response = await axios.get(pdfUrl, {
      responseType: "arraybuffer",
    });

    const buffer = Buffer.from(response.data);
    return await parsePdfFromBuffer(buffer);
  } catch (error) {
    console.error("❌ Error parsing PDF from URL:", error);
    throw error;
  }
}

/**
 * Directly parses a PDF buffer and extracts its text contents.
 * Supports standard pdf-parse, default ESM imports, and class-based imports.
 */
export async function parsePdfFromBuffer(buffer: Buffer): Promise<string> {
  try {
    let extractedText = "";

    // Case 1: Standard pdf-parse CJS function
    if (typeof pdf === "function") {
      console.log("ℹ️ Parsing PDF via standard function...");
      const data = await pdf(buffer);
      extractedText = data.text;
    } 
    // Case 2: Class-based PDFParse (alternative bundler/npm resolution)
    else if (pdf && pdf.PDFParse) {
      console.log("ℹ️ Parsing PDF via class-based PDFParse...");
      const parser = new pdf.PDFParse({ data: buffer });
      const result = await parser.getText();
      
      if (result && typeof result.text === "string") {
        extractedText = result.text;
      } else if (result && Array.isArray(result.pages)) {
        extractedText = result.pages.map((p: any) => p.text).join("\n");
      }
    } 
    // Case 3: Default export ES wrapper
    else if (pdf && pdf.default && typeof pdf.default === "function") {
      console.log("ℹ️ Parsing PDF via ESM default function...");
      const data = await pdf.default(buffer);
      extractedText = data.text;
    } 
    // Fallback error
    else {
      throw new Error("Loaded pdf-parse module has an unrecognized structure and cannot be executed.");
    }

    if (!extractedText) {
      throw new Error("Extracted text is empty");
    }

    console.log("✅ PDF parsed successfully. Character count:", extractedText.length);
    return extractedText;
  } catch (error) {
    console.error("❌ Error parsing PDF from buffer:", error);
    throw error;
  }
}
