ALTER TABLE users DROP CONSTRAINT users_sidebar_order_check;

UPDATE users
SET sidebar_order =
    sidebar_order[1:array_position(sidebar_order, 'summary')]
    || ARRAY['comparison']
    || sidebar_order[array_position(sidebar_order, 'summary') + 1:cardinality(sidebar_order)];

ALTER TABLE users
    ALTER COLUMN sidebar_order SET DEFAULT
        ARRAY['dashboard', 'wallets', 'transactions', 'summary', 'comparison', 'categories'],
    ADD CONSTRAINT users_sidebar_order_check CHECK (
        array_ndims(sidebar_order) = 1
        AND cardinality(sidebar_order) = 6
        AND sidebar_order @>
            ARRAY['dashboard', 'wallets', 'transactions', 'summary', 'comparison', 'categories']
    );
