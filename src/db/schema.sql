-- SQL Schema for Personal AI Career Agent Database

-- 1. Profile parameters (active target parameters)
CREATE TABLE IF NOT EXISTS public.profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skills JSONB NOT NULL DEFAULT '[]'::jsonb,
    experience_years NUMERIC(4, 2) NOT NULL DEFAULT 2.0,
    min_score_threshold INTEGER NOT NULL DEFAULT 75,
    target_roles TEXT[] NOT NULL DEFAULT '{}'::text[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Resume upload versions (linked to Supabase Storage)
CREATE TABLE IF NOT EXISTS public.resume_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    storage_url TEXT NOT NULL,       -- URL to Supabase Storage bucket item
    resume_text TEXT NOT NULL,       -- Parsed plain text of the PDF
    is_active BOOLEAN NOT NULL DEFAULT false,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Watchlist of dream companies to monitor
CREATE TABLE IF NOT EXISTS public.watchlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT UNIQUE NOT NULL,
    careers_url TEXT,
    last_checked TIMESTAMP WITH TIME ZONE,
    new_jobs_today INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Crawled and parsed job listings
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT,
    job_url TEXT UNIQUE NOT NULL,
    raw_jd TEXT,
    overall_score INTEGER,
    score_dimensions JSONB,          -- Details of the 7 weights
    match_reasons JSONB,             -- Array of matching strengths
    gap_reasons JSONB,               -- Array of gaps found
    company_tier TEXT,               -- MNC, MID_RANGE, STARTUP
    recruiter_email TEXT,            -- Contact email if parsed
    cover_letter TEXT,               -- Tailored cover letter
    tailored_highlights JSONB,       -- Tailored resume highlights array
    apply_status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL', -- PENDING_APPROVAL, EMAILED, AUTO_APPLIED, SKIPPED, APPLIED_MANUALLY
    applied_at TIMESTAMP WITH TIME ZONE,
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    notes TEXT
);

-- 5. Daily timeline/statistics
CREATE TABLE IF NOT EXISTS public.daily_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
    discovered_count INTEGER DEFAULT 0 NOT NULL,
    matched_count INTEGER DEFAULT 0 NOT NULL,
    applied_count INTEGER DEFAULT 0 NOT NULL,
    skipped_count INTEGER DEFAULT 0 NOT NULL,
    avg_score NUMERIC(5, 2) DEFAULT 0.00 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Storage bucket setup guidelines:
-- You will need to create a public storage bucket named "resumes" in your Supabase project dashboard.
