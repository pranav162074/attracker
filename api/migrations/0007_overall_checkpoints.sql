-- Up Migration

ALTER TABLE checkpoints ADD COLUMN overall_bp INTEGER CHECK (overall_bp BETWEEN 0 AND 10000);

-- Down Migration

ALTER TABLE checkpoints DROP COLUMN overall_bp;
