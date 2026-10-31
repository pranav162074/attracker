-- Up Migration

ALTER TABLE grid_slots DROP CONSTRAINT grid_slots_version_id_weekday_int4range_excl;
ALTER TABLE grid_slots ADD CONSTRAINT grid_slots_no_overlap
  EXCLUDE USING gist (version_id WITH =, weekday WITH =, int4range(start_minute, end_minute) WITH &&)
  DEFERRABLE INITIALLY IMMEDIATE;

-- Down Migration

ALTER TABLE grid_slots DROP CONSTRAINT grid_slots_no_overlap;
ALTER TABLE grid_slots ADD CONSTRAINT grid_slots_version_id_weekday_int4range_excl
  EXCLUDE USING gist (version_id WITH =, weekday WITH =, int4range(start_minute, end_minute) WITH &&);
