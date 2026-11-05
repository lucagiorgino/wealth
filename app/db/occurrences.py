# Both history and balances derive repeats independently from the original date.
# The four parameters are the same fixed UTC horizon.
OCCURRENCES = """
    SELECT definitions.*, n + 1 AS occurrence_number, n,
        CASE recurrence
            WHEN 'weekly' THEN date + n * 7
            WHEN 'monthly' THEN (date + make_interval(months => n))::date
            WHEN 'annually' THEN (date + make_interval(years => n))::date
            ELSE date
        END AS occurrence_date
    FROM definitions
    CROSS JOIN LATERAL generate_series(0, LEAST(
        COALESCE(recurrence_count - 1, 2147483647),
        CASE recurrence
            WHEN 'weekly' THEN GREATEST(0, (%s::date - date) / 7)
            WHEN 'monthly' THEN GREATEST(0,
                (EXTRACT(YEAR FROM %s::date)::int - EXTRACT(YEAR FROM date)::int) * 12
                + EXTRACT(MONTH FROM %s::date)::int - EXTRACT(MONTH FROM date)::int)
            WHEN 'annually' THEN GREATEST(0,
                EXTRACT(YEAR FROM %s::date)::int - EXTRACT(YEAR FROM date)::int)
            ELSE 0
        END
    )) AS n
"""

WALLET_MOVEMENTS = """
    SELECT source_wallet_id AS wallet_id,
        CASE WHEN type IN ('income', 'balance_adjustment') THEN amount ELSE -amount END AS amount,
        CASE WHEN type = 'balance_adjustment'
            THEN (date_trunc('month', occurrence_date) + interval '1 month')::date
            ELSE occurrence_date END AS movement_date
    FROM occurrences
    UNION ALL
    SELECT destination_wallet_id AS wallet_id, amount, occurrence_date AS movement_date
    FROM occurrences WHERE type = 'transfer'
"""
