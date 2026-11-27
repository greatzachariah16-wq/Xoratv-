CREATE TABLE IF NOT EXISTS xseries_titles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id INTEGER UNIQUE,
  media_type TEXT NOT NULL DEFAULT 'movie' CHECK (media_type IN ('movie', 'tv')),
  title TEXT NOT NULL,
  original_title TEXT,
  overview TEXT,
  release_date TEXT,
  release_year INTEGER,
  poster_path TEXT,
  backdrop_path TEXT,
  genres_json TEXT NOT NULL DEFAULT '[]',
  vote_average REAL,
  runtime_minutes INTEGER,
  category TEXT,
  match_status TEXT NOT NULL DEFAULT 'pending' CHECK (match_status IN ('pending', 'confirmed', 'manual', 'unmatched')),
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_xseries_titles_published ON xseries_titles(is_published, media_type);
CREATE INDEX IF NOT EXISTS idx_xseries_titles_year ON xseries_titles(release_year);
CREATE INDEX IF NOT EXISTS idx_xseries_titles_title ON xseries_titles(title COLLATE NOCASE);
