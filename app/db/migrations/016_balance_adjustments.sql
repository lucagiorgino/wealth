ALTER TABLE transactions DROP CONSTRAINT transactions_category_kind_fk;
ALTER TABLE transactions DROP COLUMN category_kind;

ALTER TABLE transactions DROP CONSTRAINT transactions_type_check;
ALTER TABLE transactions ALTER COLUMN type TYPE varchar(18);
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
    CHECK (type IN ('income', 'expense', 'transfer', 'balance_adjustment'));

ALTER TABLE transactions DROP CONSTRAINT transactions_amount_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_amount_check CHECK (
    amount <> 0 AND (type IN ('expense', 'balance_adjustment') OR amount > 0)
    AND amount NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
);

ALTER TABLE transactions ADD COLUMN category_kind varchar(7)
    GENERATED ALWAYS AS (
        CASE WHEN type = 'income' THEN 'income'
             WHEN type IN ('expense', 'transfer') THEN 'expense' END
    ) STORED;
ALTER TABLE transactions ADD CONSTRAINT transactions_category_kind_fk
    FOREIGN KEY (category_id, owner_subject, category_kind)
    REFERENCES categories (id, owner_subject, kind);

ALTER TABLE transactions ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE transactions ADD CONSTRAINT transactions_adjustment_check CHECK (
    (type = 'balance_adjustment'
        AND category_id IS NULL AND subcategory_id IS NULL
        AND recurrence IS NULL AND recurrence_count IS NULL
        AND date < '9999-12-01'::date)
    OR (type <> 'balance_adjustment' AND category_id IS NOT NULL)
);
