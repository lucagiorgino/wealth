ALTER TABLE transactions
    ADD COLUMN is_pinned boolean NOT NULL DEFAULT false;
