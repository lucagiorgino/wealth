ALTER TABLE transactions DROP CONSTRAINT transactions_description_check;
ALTER TABLE transactions ALTER COLUMN description SET DEFAULT '';
