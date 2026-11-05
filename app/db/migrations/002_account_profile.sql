ALTER TABLE users
    ADD COLUMN display_name varchar(100)
        CHECK (length(btrim(display_name)) > 0),
    ADD COLUMN icon varchar(32) NOT NULL DEFAULT 'user-round'
        CHECK (icon IN ('user-round', 'smile', 'cat', 'rocket'));
