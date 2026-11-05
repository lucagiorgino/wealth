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
