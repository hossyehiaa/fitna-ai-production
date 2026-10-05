-- Character Identity System: stable IDs, gender, nationality, dialect,
-- avatar key, voice provider/IDs per character. Persisted + deterministic.
ALTER TABLE "student_personas"
    ADD COLUMN "character_key" TEXT,
    ADD COLUMN "gender" TEXT NOT NULL DEFAULT 'male',
    ADD COLUMN "nationality" TEXT NOT NULL DEFAULT 'EG',
    ADD COLUMN "avatar_key" TEXT,
    ADD COLUMN "voice_provider" TEXT NOT NULL DEFAULT 'fish',
    ADD COLUMN "voice_id" TEXT,
    ADD COLUMN "edge_voice" TEXT,
    ADD COLUMN "personality" TEXT,
    ADD COLUMN "speaking_style" TEXT,
    ADD COLUMN "age_range" TEXT;

CREATE UNIQUE INDEX "student_personas_character_key_key" ON "student_personas"("character_key");

-- Account creation: explicit account type + nationality (never inferred)
ALTER TABLE "users"
    ADD COLUMN "country" TEXT,
    ADD COLUMN "account_type" TEXT;
