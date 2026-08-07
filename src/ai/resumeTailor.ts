import { groq, GROQ_MODEL } from "./aiClients.js";

export interface TailoredAssets {
  highlights: string[];
  cover_letter: string;
}

/**
 * Uses Groq to generate a tailored highlights block and a 3-paragraph cover letter
 * tailored to a specific job description.
 */
export async function generateTailoredAssets(
  resumeText: string,
  jobTitle: string,
  companyName: string,
  jobDescriptionText: string,
  matchReasons: string[],
  gapReasons: string[]
): Promise<TailoredAssets> {
  const systemPrompt = `You are a career consultant and professional resume writer.
Your job is to read a candidate's resume and a target job description, then generate two assets:
1. A tailored list of 4-5 key highlights (bullet points) emphasizing the candidate's projects and skills most relevant to this specific role. These must be factual, based strictly on the candidate's resume (reordering and emphasizing relevant parts), and written in a strong action-oriented tone.
2. A personalized cover letter.
   - Style/Language: Natural Indian English (using British spelling conventions: colour, programme, centre, behaviour, etc.).
   - Tone: Exact, realistic human-generated professional pitch. Do NOT write generic, obvious AI phrases (such as "I am thrilled to apply", "exciting opportunity", "leverage my technical expertise", or "highly skilled professional"). Write in a direct, warm, concise, and authentic developer voice.
   - Contact Info: You MUST scan the provided CANDIDATE RESUME text to extract the candidate's name, email, phone number, LinkedIn link, and GitHub link. Format and list these contact links cleanly at the bottom of the cover letter. Do NOT use any hardcoded default contact info. If a specific contact link is missing in the resume text, simply omit that field.
   - Length: Exactly 3 short paragraphs.
   - Paragraph 1: Direct opening hook mentioning the specific company, role, and a warm direct intro.
   - Paragraph 2: Direct skill/project alignment showing how the candidate's background solves the target job requirements.
   - Paragraph 3: Closing sentence showing interview interest and referencing the contact details listed below it.

You must return ONLY a valid, raw JSON object matching the schema below. No markdown formatting, no code blocks, no trailing comments, no explanation.

JSON Schema:
{
  "highlights": [
    "Bullet point 1 detailing a highly relevant project...",
    "Bullet point 2 detailing relevant skills...",
    "Bullet point 3...",
    "Bullet point 4..."
  ],
  "cover_letter": "Dear hiring team,\\n\\n[Paragraph 1]\\n\\n[Paragraph 2]\\n\\n[Paragraph 3]\\n\\nBest regards,\\n[Extracted Candidate Name]\\nMobile: [Extracted Mobile] | Email: [Extracted Email]\\nLinkedIn: [Extracted LinkedIn]\\nGitHub: [Extracted GitHub]"
}`;

  const userPrompt = `CANDIDATE RESUME:
${resumeText}

---
TARGET JOB:
Role: ${jobTitle}
Company: ${companyName}
JD: ${jobDescriptionText}

---
MATCH REASONS:
${JSON.stringify(matchReasons)}

GAPS TO ADDRESS GENTLY:
${JSON.stringify(gapReasons)}`;

  try {
    console.log(`🎨 Generating tailored highlights and cover letter for ${jobTitle} at ${companyName}...`);
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: GROQ_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error("No response received from Groq tailoring API");
    }

    const result = JSON.parse(responseContent.trim()) as TailoredAssets;
    console.log("✅ Tailored highlights and cover letter generated successfully.");
    return result;
  } catch (error) {
    console.error("❌ Error generating tailored assets:", error);
    throw error;
  }
}
