LOCK TABLE categories, subcategories IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
    item record;
    suffix text;
    candidate text;
    number integer;
BEGIN
    FOR item IN
        SELECT * FROM (
            SELECT id, owner_subject, name,
                row_number() OVER (
                    PARTITION BY owner_subject, lower(btrim(name))
                    ORDER BY created_at, id
                ) AS position
            FROM categories
        ) AS ranked
        WHERE position > 1
        ORDER BY owner_subject, lower(btrim(name)), position
    LOOP
        number := 2;
        LOOP
            suffix := ' (' || number || ')';
            candidate := left(btrim(item.name), 100 - length(suffix)) || suffix;
            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM categories
                WHERE owner_subject = item.owner_subject
                    AND lower(btrim(name)) = lower(candidate)
            );
            number := number + 1;
        END LOOP;
        UPDATE categories SET name = candidate WHERE id = item.id;
    END LOOP;

    FOR item IN
        SELECT * FROM (
            SELECT id, owner_subject, category_id, name,
                row_number() OVER (
                    PARTITION BY owner_subject, category_id, lower(btrim(name))
                    ORDER BY created_at, id
                ) AS position
            FROM subcategories
        ) AS ranked
        WHERE position > 1
        ORDER BY owner_subject, category_id, lower(btrim(name)), position
    LOOP
        number := 2;
        LOOP
            suffix := ' (' || number || ')';
            candidate := left(btrim(item.name), 100 - length(suffix)) || suffix;
            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM subcategories
                WHERE owner_subject = item.owner_subject
                    AND category_id = item.category_id
                    AND lower(btrim(name)) = lower(candidate)
            );
            number := number + 1;
        END LOOP;
        UPDATE subcategories SET name = candidate WHERE id = item.id;
    END LOOP;
END $$;

CREATE UNIQUE INDEX categories_owner_name_unique
    ON categories (owner_subject, lower(btrim(name)));

CREATE UNIQUE INDEX subcategories_owner_parent_name_unique
    ON subcategories (owner_subject, category_id, lower(btrim(name)));
