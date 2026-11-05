CREATE TABLE asset_snapshot_state (
    owner_subject text PRIMARY KEY REFERENCES users(subject) ON DELETE CASCADE,
    started_month date NOT NULL CHECK (extract(day FROM started_month) = 1),
    through_month date CHECK (extract(day FROM through_month) = 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (through_month IS NULL OR through_month >= started_month)
);

CREATE TABLE asset_balance_snapshots (
    owner_subject text NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
    source text NOT NULL CHECK (source IN ('wallet', 'asset')),
    source_id uuid NOT NULL,
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
    month date NOT NULL CHECK (extract(day FROM month) = 1),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    asset_group text NOT NULL CHECK (
        asset_group IN ('cash', 'stocks', 'crypto', 'bonds', 'other', 'liabilities')
        AND (source <> 'wallet' OR asset_group = 'cash')
    ),
    amount numeric CHECK (
        amount NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
        AND (source = 'wallet' OR amount >= 0)
    ),
    captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK (source <> 'wallet' OR amount IS NOT NULL),
    PRIMARY KEY (owner_subject, source, source_id, currency, month)
);

CREATE FUNCTION refuse_balance_snapshot_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Month-end balances are immutable' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER immutable_balance_snapshot
    BEFORE UPDATE ON asset_balance_snapshots
    FOR EACH ROW EXECUTE FUNCTION refuse_balance_snapshot_update();
