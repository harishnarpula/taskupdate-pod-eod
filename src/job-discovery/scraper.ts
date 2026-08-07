import { chromium } from "playwright";

/**
 * Common selectors for major ATS and Job Board platforms to extract clean description text.
 */
const ATS_SELECTORS = [
  // Greenhouse
  "#content",
  ".main-fields",
  ".section",
  // Lever
  ".section-wrapper",
  ".content",
  // LinkedIn
  ".description__text",
  ".show-more-less-html__markup",
  ".jobs-description",
  // Naukri
  ".jd-desc",
  ".job-desc",
  // Generic / Fallback containers
  "main",
  "article",
  "#job-description",
  ".job-description",
];

/**
 * Playwright scraper with bot-evasion parameters.
 * Extracts plain text from job URLs.
 */
export async function scrapeJobPage(url: string): Promise<string> {
  let browser;
  try {
    console.log(`🌐 Scraping page: ${url}`);
    
    // Launch chromium with anti-detection args
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--use-fake-ui-for-media-stream",
        "--window-size=1280,800",
      ],
    });

    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });

    const page = await context.newPage();

    // Stealth script to hide webdriver properties
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
    });

    // Navigate with a timeout of 30 seconds
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Random delay to simulate human eyes (1.5 - 3 seconds)
    const delay = Math.floor(Math.random() * 1500) + 1500;
    await page.waitForTimeout(delay);

    let jdText = "";

    // 1. Try common ATS selectors
    for (const selector of ATS_SELECTORS) {
      const element = await page.$(selector);
      if (element) {
        const text = await element.innerText();
        if (text && text.trim().length > 200) {
          jdText = text.trim();
          console.log(`🎯 Extracted JD using selector: "${selector}" (${jdText.length} chars)`);
          break;
        }
      }
    }

    // 2. Fallback: Get body text if selector extraction failed or returned too little content
    if (!jdText || jdText.length < 200) {
      console.log("⚠️ Selector extraction yielded poor results. Falling back to body text...");
      const bodyText = await page.evaluate(() => document.body.innerText);
      jdText = bodyText.trim();
      console.log(`📄 Body text fallback: (${jdText.length} chars)`);
    }

    // Clean up empty lines or excessive whitespaces
    jdText = jdText.replace(/\n\s*\n/g, "\n").replace(/ +/g, " ");

    return jdText;
  } catch (error) {
    console.error(`❌ Playwright scrape error on ${url}:`, error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
