ALTER TABLE wallets ADD CONSTRAINT wallets_id_owner_unique UNIQUE (id, owner_subject);
ALTER TABLE subcategories ADD CONSTRAINT subcategories_id_parent_owner_unique
    UNIQUE (id, category_id, owner_subject);

CREATE TABLE transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_subject text NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
    description varchar(500) NOT NULL CHECK (length(btrim(description)) > 0),
    amount numeric NOT NULL CHECK (
        amount > 0 AND amount NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    ),
    date date NOT NULL CHECK (date BETWEEN '0001-01-01'::date AND '9999-12-31'::date),
    type varchar(8) NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
    source_wallet_id uuid NOT NULL,
    destination_wallet_id uuid,
    category_id uuid NOT NULL,
    subcategory_id uuid,
    recurrence varchar(8) CHECK (recurrence IN ('weekly', 'monthly', 'annually')),
    recurrence_count integer CHECK (recurrence_count BETWEEN 1 AND 10000),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (type = 'transfer' AND destination_wallet_id IS NOT NULL
            AND source_wallet_id <> destination_wallet_id)
        OR (type <> 'transfer' AND destination_wallet_id IS NULL)
    ),
    CHECK (recurrence IS NOT NULL OR recurrence_count IS NULL),
    FOREIGN KEY (source_wallet_id, owner_subject) REFERENCES wallets (id, owner_subject),
    FOREIGN KEY (destination_wallet_id, owner_subject) REFERENCES wallets (id, owner_subject),
    FOREIGN KEY (category_id, owner_subject) REFERENCES categories (id, owner_subject),
    FOREIGN KEY (subcategory_id, category_id, owner_subject)
        REFERENCES subcategories (id, category_id, owner_subject)
);

CREATE INDEX transactions_owner_date_idx ON transactions (owner_subject, date DESC, id);
CREATE INDEX transactions_source_idx ON transactions (source_wallet_id, owner_subject);
CREATE INDEX transactions_destination_idx ON transactions (destination_wallet_id, owner_subject);
CREATE INDEX transactions_category_idx ON transactions (category_id, owner_subject);
CREATE INDEX transactions_subcategory_idx ON transactions (subcategory_id, category_id, owner_subject);
