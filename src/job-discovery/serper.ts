import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

export interface DiscoveredJob {
  title: string;
  company: string;
  url: string;
  source: string;
}

const serperApiKey = process.env.SERPER_API_KEY;

/**
 * Parses a company name from a standard job URL or ATS URL (Greenhouse, Lever, etc.).
 */
export function extractCompanyFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();

    // Case 1: Greenhouse (e.g. boards.greenhouse.io/company/jobs/123)
    if (hostname.includes("greenhouse.io")) {
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length > 0) {
        return parts[0].toUpperCase();
      }
    }

    // Case 2: Lever (e.g. jobs.lever.co/company/abc-123)
    if (hostname.includes("lever.co")) {
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length > 0) {
        return parts[0].toUpperCase();
      }
    }

    // Case 3: Subdomain career pages (e.g. careers.razorpay.com or razorpay.careers)
    if (hostname.startsWith("careers.") || hostname.endsWith(".careers")) {
      const company = hostname.replace("careers.", "").replace(".careers", "").split(".")[0];
      return company.toUpperCase();
    }

    // Default fallback: Domain name
    const domainParts = hostname.replace("www.", "").split(".");
    if (domainParts.length > 0) {
      return domainParts[0].toUpperCase();
    }
  } catch (error) {
    // Ignore error
  }
  return "UNKNOWN";
}

/**
 * Searches Google using Serper API for new job openings.
 * Restricted to the last 7 days using tbs:qdr:w parameter.
 */
export async function searchJobsWithSerper(
  query: string,
  sourceLabel = "SERPER"
): Promise<DiscoveredJob[]> {
  if (!serperApiKey) {
    console.warn("⚠️ SERPER_API_KEY is missing from environment variables.");
    return [];
  }

  try {
    console.log(`🔍 Querying Serper API for: "${query}"`);
    const response = await axios.post(
      "https://google.serper.dev/search",
      {
        q: query,
        tbs: "qdr:w", // past week only
      },
      {
        headers: {
          "X-API-KEY": serperApiKey,
          "Content-Type": "application/json",
        },
      }
    );

    const organicResults = response.data.organic || [];
    const jobs: DiscoveredJob[] = organicResults.map((result: any) => {
      const company = extractCompanyFromUrl(result.link);
      return {
        title: result.title || "Job Opportunity",
        company: company,
        url: result.link,
        source: sourceLabel,
      };
    });

    console.log(`✅ Serper found ${jobs.length} jobs for query: "${query}"`);
    return jobs;
  } catch (error) {
    console.error(`❌ Error in Serper search for query "${query}":`, error);
    return [];
  }
}

/**
 * Runs default job search queries based on target roles.
 */
export async function discoverJobs(
  targetRoles: string[],
  watchlistCompanies: string[],
  scope: "general" | "watchlist" | "all" = "all"
): Promise<DiscoveredJob[]> {
  const allJobs: DiscoveredJob[] = [];
  const queries: string[] = [];

  // Generate ATS & Job Portal Queries (General Search)
  if (scope === "general" || scope === "all") {
    for (const role of targetRoles) {
      queries.push(`site:greenhouse.io "${role}" India`);
      queries.push(`site:lever.co "${role}" India`);
      queries.push(`site:linkedin.com/jobs/view "${role}" India`);
      queries.push(`site:naukri.com/job-listings "${role}" India`);
    }
  }

  // Generate Watchlist queries (Watchlist Portals Search)
  if (scope === "watchlist" || scope === "all") {
    for (const company of watchlistCompanies) {
      for (const role of targetRoles) {
        queries.push(`site:careers.${company.toLowerCase()}.com "${role}"`);
      }
    }
  }

  // Execute up to 5 queries in parallel (simple rate limiting)
  for (let i = 0; i < queries.length; i += 5) {
    const chunk = queries.slice(i, i + 5);
    const results = await Promise.all(
      chunk.map((q) => searchJobsWithSerper(q))
    );
    allJobs.push(...results.flat());
  }

  // Deduplicate by URL
  const uniqueJobs = Array.from(
    new Map(allJobs.map((item) => [item.url, item])).values()
  );

  console.log(`🚀 Total unique discovered jobs: ${uniqueJobs.length}`);
  return uniqueJobs;
}
