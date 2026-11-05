CREATE TABLE categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_subject text NOT NULL REFERENCES users(subject) ON DELETE CASCADE,
    name varchar(100) NOT NULL CHECK (length(btrim(name)) > 0),
    colour varchar(7) NOT NULL CHECK (colour ~ '^#[0-9A-Fa-f]{6}$'),
    icon varchar(32) NOT NULL CHECK (icon IN (
        'house', 'heart-pulse', 'shopping-basket', 'utensils', 'train-front',
        'shirt', 'gamepad-2', 'gift', 'landmark', 'circle-ellipsis',
        'plane', 'car', 'book-open', 'coffee'
    )),
    preset_key varchar(32),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_subject, preset_key),
    UNIQUE (id, owner_subject)
);

CREATE INDEX categories_owner_name_idx ON categories (owner_subject, name, id);

CREATE TABLE subcategories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_subject text NOT NULL,
    category_id uuid NOT NULL,
    name varchar(100) NOT NULL CHECK (length(btrim(name)) > 0),
    colour varchar(7) NOT NULL CHECK (colour ~ '^#[0-9A-Fa-f]{6}$'),
    icon varchar(32) NOT NULL CHECK (icon IN (
        'house', 'heart-pulse', 'shopping-basket', 'utensils', 'train-front',
        'shirt', 'gamepad-2', 'gift', 'landmark', 'circle-ellipsis',
        'plane', 'car', 'book-open', 'coffee'
    )),
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (category_id, owner_subject)
        REFERENCES categories (id, owner_subject) ON DELETE CASCADE
);

CREATE INDEX subcategories_owner_parent_idx ON subcategories (owner_subject, category_id, name, id);
