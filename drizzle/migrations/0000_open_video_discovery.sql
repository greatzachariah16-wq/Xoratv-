-- Open Video Discovery: extend posts with external-source fields (creator rows untouched)

CREATE TYPE public.content_source AS ENUM ('creator','internet_archive','wikimedia_commons','nasa_svs');
CREATE TYPE public.approval_status AS ENUM ('approved','pending_review','rejected','hidden');
CREATE TYPE public.rights_status AS ENUM ('public_domain','cc0','cc_by','cc_by_sa','other_open','unknown','restricted');

ALTER TABLE public.posts ALTER COLUMN author_id DROP NOT NULL;

ALTER TABLE public.posts
  ADD COLUMN source public.content_source NOT NULL DEFAULT 'creator',
  ADD COLUMN external_id text,
  ADD COLUMN canonical_url text,
  ADD COLUMN playback_url text,
  ADD COLUMN thumbnail_url text,
  ADD COLUMN media_type text,
  ADD COLUMN license text,
  ADD COLUMN license_url text,
  ADD COLUMN rights_status public.rights_status NOT NULL DEFAULT 'unknown',
  ADD COLUMN rights_confidence numeric NOT NULL DEFAULT 0,
  ADD COLUMN resolution_height integer,
  ADD COLUMN frame_rate numeric,
  ADD COLUMN audio_info text,
  ADD COLUMN audio_quality text,
  ADD COLUMN is_color boolean,
  ADD COLUMN external_creator text,
  ADD COLUMN published_at timestamptz,
  ADD COLUMN category text,
  ADD COLUMN keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN quality_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN interestingness_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN recommendation_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN approval_status public.approval_status NOT NULL DEFAULT 'approved',
  ADD COLUMN home_eligible boolean NOT NULL DEFAULT true,
  ADD COLUMN shorts_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN featured boolean NOT NULL DEFAULT false,
  ADD COLUMN rejection_reason text,
  ADD COLUMN discovered_at timestamptz,
  ADD COLUMN source_metadata jsonb;

CREATE UNIQUE INDEX posts_source_external_idx ON public.posts (source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX posts_discovery_idx ON public.posts (source, approval_status, recommendation_score DESC);

-- public read: creator posts as before; external content only when approved
DROP POLICY IF EXISTS "posts_public_read" ON public.posts;
CREATE POLICY "posts_public_read" ON public.posts FOR SELECT
  USING (status <> 'removed' AND (source = 'creator' OR approval_status = 'approved'));

-- admins can read everything (review queues)
CREATE POLICY "posts_admin_read_all" ON public.posts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- Scoring configuration (admin editable)
CREATE TABLE public.discovery_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  weights jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.discovery_settings TO authenticated;
GRANT ALL ON public.discovery_settings TO service_role;
ALTER TABLE public.discovery_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "discovery_settings_admin_read" ON public.discovery_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

INSERT INTO public.discovery_settings (id, weights) VALUES (true, '{
  "res1080": 20, "res720": 15, "res480": 4,
  "picture": 15, "audio": 15, "color": 10,
  "genre": 10, "interesting": 20, "metadata": 5,
  "duration": 5, "recency": 5,
  "duplicate": -100, "bw_penalty": -25, "quality_penalty": -30,
  "min_publish_score": 55, "min_review_score": 30
}'::jsonb);

-- Per-source run log (admin only)
CREATE TABLE public.discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source public.content_source NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok boolean NOT NULL DEFAULT false,
  examined integer NOT NULL DEFAULT 0,
  inserted integer NOT NULL DEFAULT 0,
  pending integer NOT NULL DEFAULT 0,
  rejected integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  error text
);
CREATE INDEX discovery_runs_idx ON public.discovery_runs (source, started_at DESC);
GRANT SELECT ON public.discovery_runs TO authenticated;
GRANT ALL ON public.discovery_runs TO service_role;
ALTER TABLE public.discovery_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "discovery_runs_admin_read" ON public.discovery_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
