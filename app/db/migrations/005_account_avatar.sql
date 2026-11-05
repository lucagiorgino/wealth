ALTER TABLE users ADD COLUMN avatar_png bytea CHECK (
    octet_length(avatar_png) BETWEEN 1 AND 327680
    AND substring(avatar_png FROM 1 FOR 8) = decode('89504e470d0a1a0a', 'hex')
);
