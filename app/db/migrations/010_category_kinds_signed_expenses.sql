ALTER TABLE categories ADD COLUMN kind varchar(7) NOT NULL DEFAULT 'expense'
    CHECK (kind IN ('expense', 'income'));
ALTER TABLE categories ADD CONSTRAINT categories_id_owner_kind_unique
    UNIQUE (id, owner_subject, kind);
DROP INDEX categories_owner_name_unique;
CREATE UNIQUE INDEX categories_owner_name_unique
    ON categories (owner_subject, kind, lower(btrim(name)));

INSERT INTO categories (owner_subject, name, colour, icon, preset_key, kind)
SELECT owners.owner_subject, p.name, '#21634b', p.icon, p.key, 'income'
FROM (SELECT DISTINCT owner_subject FROM transactions WHERE type = 'income') owners
CROSS JOIN (VALUES
    ('income-salary', 'Salary', 'landmark'),
    ('income-mealticket', 'MealTicket', 'utensils'),
    ('income-transfer', 'Transfer', 'landmark'),
    ('income-cash', 'Cash', 'landmark'),
    ('income-other', 'Other', 'circle-ellipsis')
) AS p(key, name, icon);

INSERT INTO subcategories (owner_subject, category_id, name, colour, icon)
SELECT owner_subject, id, child.name, colour, icon FROM categories
CROSS JOIN (VALUES ('refund'), ('private sell')) AS child(name)
WHERE kind = 'income' AND preset_key = 'income-other';

UPDATE transactions t SET category_id = c.id, subcategory_id = NULL
FROM categories c
WHERE t.type = 'income' AND c.owner_subject = t.owner_subject
    AND c.kind = 'income' AND c.preset_key = 'income-other';

ALTER TABLE transactions DROP CONSTRAINT transactions_amount_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_amount_check CHECK (
    amount <> 0 AND (type = 'expense' OR amount > 0)
    AND amount NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
);
ALTER TABLE transactions ADD COLUMN category_kind varchar(7)
    GENERATED ALWAYS AS (CASE WHEN type = 'income' THEN 'income' ELSE 'expense' END) STORED;
ALTER TABLE transactions ADD CONSTRAINT transactions_category_kind_fk
    FOREIGN KEY (category_id, owner_subject, category_kind)
    REFERENCES categories (id, owner_subject, kind);
