import { groq, GROQ_MODEL } from "./aiClients.js";

export interface ScoreDetails {
  overall_score: number;
  company_name: string;
  dimensions: {
    skills: { score: number; reason: string };
    projects: { score: number; reason: string };
    experience: { score: number; reason: string };
    ai_cloud: { score: number; reason: string };
    leadership: { score: number; reason: string };
    domain: { score: number; reason: string };
    location_salary: { score: number; reason: string };
  };
  match_reasons: string[];
  gap_reasons: string[];
  company_tier: "MNC" | "MID_RANGE" | "STARTUP" | "UNKNOWN";
  recruiter_email: string | null;
}

/**
 * Uses Groq LLM to score a job description against the user's resume text.
 * Calculates an overall score and provides match/gap analysis.
 */
export async function scoreJobDescription(
  resumeText: string,
  jobDescriptionText: string,
  targetLocations: string[] = []
): Promise<ScoreDetails> {
  const locationsStr = targetLocations.length > 0 ? targetLocations.join(", ") : "Remote, Hyderabad, India";
  const systemPrompt = `You are an expert recruiter and job matching AI. Your job is to match a Candidate Resume against a Job Description (JD).
You must return ONLY a valid, raw JSON object matching the schema below. No markdown formatting, no code blocks, no trailing comments, no explanation.

JSON Schema:
{
  "overall_score": 92,
  "company_name": "True Company Name",
  "dimensions": {
    "skills": { "score": 98, "reason": "Reasoning here..." },
    "projects": { "score": 94, "reason": "Reasoning here..." },
    "experience": { "score": 80, "reason": "Reasoning here..." },
    "ai_cloud": { "score": 100, "reason": "Reasoning here..." },
    "leadership": { "score": 85, "reason": "Reasoning here..." },
    "domain": { "score": 90, "reason": "Reasoning here..." },
    "location_salary": { "score": 100, "reason": "Reasoning here..." }
  },
  "match_reasons": ["Reason 1", "Reason 2"],
  "gap_reasons": ["Gap 1", "Gap 2"],
  "company_tier": "MNC" | "MID_RANGE" | "STARTUP" | "UNKNOWN",
  "recruiter_email": "email@example.com" or null
}

Evaluation Criteria & Weights (Calculate "overall_score" strictly based on this):
1. Skills Match (35%): Check tech stack match.
2. Project Relevance (20%): Look for AI agents, multi-agent pipelines, RAG, and relevant fintech/SaaS products.
3. Experience Fit (15%): Align candidate's 2 years of experience against the JD requirements.
4. AI / Cloud Experience (10%): Match Claude/OpenAI APIs, Qdrant/vector DBs, AWS, Docker, MCP servers.
5. Leadership & Ownership (10%): Evidence of solo projects, CEO interaction, startup style ownership.
6. Domain Alignment (5%): Align with Fintech / BFSI domains.
7. Location & Salary (5%): Match location requirements. Preferred target locations are: [${locationsStr}].

CRITICAL LOCATION CONSTRAINT (CRITICAL PRIORITY):
The candidate's target location preferences are strictly: [${locationsStr}].
If the job location in the JD DOES NOT align with any of these preferred locations (e.g. they want Hyderabad or Remote, but the job is in Pune, Mumbai, Bangalore or New York with no remote option), you MUST deduct at least 25-30 points from the "overall_score" and lower the "location_salary" score to below 50, so that the match falls below the user's 80% matching gatekeeper. Be extremely strict on this.

Analyze the hiring context to extract:
* "company_name": Extract the actual, real hiring company name from the JD/title context (do NOT return job boards like "LinkedIn" or "Naukri", and do NOT return country codes like "IN" or "UK").
* "company_tier": Based on the JD context (MNC, MID_RANGE, or STARTUP).
* "recruiter_email": Search the JD text carefully to extract any recruiter contact email if listed (e.g. hr@company.com, careers@company.com, contact@company.com), otherwise set recruiter_email to null.`;

  const userPrompt = `CANDIDATE RESUME:
${resumeText}

---

JOB DESCRIPTION:
${jobDescriptionText}`;

  try {
    console.log(`🤖 Scoring Job Description using Groq (${GROQ_MODEL})...`);
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: GROQ_MODEL,
      response_format: { type: "json_object" }, // Groq supports JSON mode
      temperature: 0.1, // low temperature for consistent evaluation
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error("No response received from Groq scoring API");
    }

    const result = JSON.parse(responseContent.trim()) as ScoreDetails;
    console.log(`✅ Job Scored: ${result.overall_score}/100. Tier: ${result.company_tier}`);
    return result;
  } catch (error) {
    console.error("❌ Error scoring job description:", error);
    throw error;
  }
}

export interface ExtractedProfile {
  skills: string[];
  experience_years: number;
  target_roles: string[];
  target_locations: string[];
}

/**
 * Uses Groq to read a candidate's resume and automatically extract key skills, experience years, and suggested target roles.
 */
export async function extractProfileFromResume(resumeText: string): Promise<ExtractedProfile> {
  const systemPrompt = `You are an expert resume parsing AI. Your job is to extract profile parameters from a Candidate Resume.
You must return ONLY a valid, raw JSON object matching the schema below. No markdown formatting, no code blocks, no explanation.

JSON Schema:
{
  "skills": ["Skill 1", "Skill 2", ...],
  "experience_years": 2.5,
  "target_roles": ["Role 1", "Role 2", ...],
  "target_locations": ["Location 1", "Location 2", ...]
}

Guidelines:
1. Extract a clean list of key technical skills (programming languages, frameworks, AI tools, databases). Limit to the top 15 key skills.
2. Estimate the total years of professional software experience (as a number, e.g. 2.0 or 3.5).
3. Suggest 2-3 target job roles (e.g. "Full Stack Developer", "Software Engineer", "AI Engineer") that match the candidate's career level and history.
4. Extract the candidate's current city/country (e.g., "Hyderabad", "India") and always append "Remote" as an default preference.`;

  try {
    console.log(`🤖 AI: Extracting profile parameters from resume text using Groq...`);
    const response = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Candidate Resume:\n${resumeText}` }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const reply = response.choices[0]?.message?.content || "";
    const result = JSON.parse(reply.trim()) as ExtractedProfile;
    console.log("✅ AI: Extracted skills:", result.skills, "| Experience:", result.experience_years, "| Locations:", result.target_locations);
    return result;
  } catch (error) {
    console.error("❌ Error extracting profile from resume:", error);
    // Fallback default profile values
    return {
      skills: ["React", "TypeScript", "Node.js", "Java", "Spring Boot"],
      experience_years: 2.0,
      target_roles: ["Full Stack Developer", "Software Engineer", "Backend Developer"],
      target_locations: ["Hyderabad", "India", "Remote"]
    };
  }
}
