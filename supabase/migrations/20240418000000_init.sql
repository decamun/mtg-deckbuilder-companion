-- Supabase Schema for MTG Deckbuilder Companion

-- Create the decks table
CREATE TABLE public.decks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  format text NULL,
  cover_image_scryfall_id text,
  commander_scryfall_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT decks_pkey PRIMARY KEY (id)
);

-- Create the deck_cards table
CREATE TABLE public.deck_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL,
  scryfall_id text NOT NULL,
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  zone text NOT NULL DEFAULT 'mainboard'::text,
  tags text[] DEFAULT '{}'::text[],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT deck_cards_pkey PRIMARY KEY (id),
  CONSTRAINT deck_cards_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
);

-- Enable Realtime for the deck_cards table
ALTER PUBLICATION supabase_realtime ADD TABLE public.deck_cards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.decks;
