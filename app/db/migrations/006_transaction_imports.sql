CREATE TABLE transaction_imports (
    owner_subject text NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
    id uuid NOT NULL,
    payload_hash varchar(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
    imported integer NOT NULL CHECK (imported BETWEEN 1 AND 500),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_subject, id)
);
