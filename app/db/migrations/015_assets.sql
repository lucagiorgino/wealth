CREATE TABLE assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_subject text NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    asset_group text NOT NULL CHECK (
        asset_group IN ('cash', 'stocks', 'crypto', 'bonds', 'other', 'liabilities')
    ),
    currency text NOT NULL CHECK (currency = ANY(string_to_array(
        'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD '
        'BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB '
        'EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK '
        'JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA '
        'MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK '
        'PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN '
        'SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST '
        'XAF XCD XCG XOF XPF YER ZAR ZMW ZWG BTC ETH ITL', ' '
    ))),
    UNIQUE (id, owner_subject)
);

CREATE INDEX assets_owner_idx ON assets(owner_subject);

CREATE TABLE asset_valuations (
    asset_id uuid NOT NULL,
    owner_subject text NOT NULL,
    date date NOT NULL,
    amount numeric NOT NULL CHECK (amount >= 0 AND amount NOT IN ('NaN', 'Infinity', '-Infinity')),
    PRIMARY KEY (asset_id, date),
    FOREIGN KEY (asset_id, owner_subject) REFERENCES assets(id, owner_subject) ON DELETE CASCADE
);

ALTER TABLE users DROP CONSTRAINT users_sidebar_order_check;

UPDATE users
SET sidebar_order =
    sidebar_order[1:array_position(sidebar_order, 'summary')]
    || ARRAY['assets']
    || sidebar_order[array_position(sidebar_order, 'summary') + 1:cardinality(sidebar_order)];

ALTER TABLE users
    ALTER COLUMN sidebar_order SET DEFAULT
        ARRAY['dashboard', 'wallets', 'transactions', 'summary', 'assets', 'comparison', 'categories'],
    ADD CONSTRAINT users_sidebar_order_check CHECK (
        array_ndims(sidebar_order) = 1
        AND cardinality(sidebar_order) = 7
        AND sidebar_order @>
            ARRAY['dashboard', 'wallets', 'transactions', 'summary', 'assets', 'comparison', 'categories']
    );
