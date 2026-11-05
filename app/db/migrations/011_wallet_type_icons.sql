ALTER TABLE wallets
    ADD COLUMN type varchar(8) NOT NULL DEFAULT 'bank'
        CHECK (type IN ('bank', 'trading', 'exchange')),
    ADD COLUMN favicon_png bytea
        CHECK (
            octet_length(favicon_png) BETWEEN 1 AND 327680
            AND substring(favicon_png FROM 1 FOR 8) = decode('89504e470d0a1a0a', 'hex')
        ),
    DROP CONSTRAINT wallets_icon_check,
    ADD CONSTRAINT wallets_icon_check
        CHECK (icon IN ('wallet', 'landmark', 'credit-card', 'piggy-bank', 'banknote', 'custom')),
    ADD CONSTRAINT wallets_custom_icon_check
        CHECK ((icon = 'custom') = (favicon_png IS NOT NULL)),
    DROP CONSTRAINT wallets_currency_check,
    ADD CONSTRAINT wallets_currency_check
        CHECK (currency IN (
            'AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BGN',
            'BHD','BIF','BMD','BND','BOB','BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF',
            'CLP','CNY','COP','CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB',
            'EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HTG',
            'HUF','IDR','ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF',
            'KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL','MGA',
            'MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO',
            'NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD',
            'RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE','SOS','SRD','SSP','STN',
            'SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX',
            'USD','UYU','UZS','VES','VND','VUV','WST','XAF','XCD','XCG','XOF','XPF','YER','ZAR',
            'ZMW','ZWG','BTC','ETH','ITL'
        ));
