CREATE TABLE users (
    subject text PRIMARY KEY CHECK (length(btrim(subject)) > 0)
);

CREATE TABLE wallets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_subject text NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
    name varchar(100) NOT NULL CHECK (length(btrim(name)) > 0),
    colour varchar(7) NOT NULL CHECK (colour ~ '^#[0-9A-Fa-f]{6}$'),
    icon varchar(32) NOT NULL
        CHECK (icon IN ('wallet', 'landmark', 'credit-card', 'piggy-bank', 'banknote')),
    initial_amount numeric NOT NULL DEFAULT 0
        CHECK (initial_amount NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wallets_owner_created_idx ON wallets (owner_subject, created_at, id);
