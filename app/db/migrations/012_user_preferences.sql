ALTER TABLE users
    ADD COLUMN theme varchar(5) NOT NULL DEFAULT 'light',
    ADD COLUMN sidebar_order text[] NOT NULL
        DEFAULT ARRAY['dashboard', 'wallets', 'transactions', 'summary', 'categories'],
    ADD CONSTRAINT users_theme_check CHECK (theme IN ('light', 'dark')),
    ADD CONSTRAINT users_sidebar_order_check CHECK (
        array_ndims(sidebar_order) = 1
        AND cardinality(sidebar_order) = 5
        AND sidebar_order @> ARRAY['dashboard', 'wallets', 'transactions', 'summary', 'categories']
    );
