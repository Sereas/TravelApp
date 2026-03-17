-- RPC: move_option_to_day
-- Moves a specific option from its current day to a target day.
-- On the target day the moved option becomes main (index 1);
-- existing target-day options are bumped by 1.
-- On the source day the remaining options are renumbered so
-- option_index stays contiguous starting at 1.
-- If the source day has no remaining options a fresh empty main is created.

DROP FUNCTION IF EXISTS public.reassign_day_main_option(uuid, uuid);

CREATE OR REPLACE FUNCTION public.move_option_to_day(
    p_option_id     uuid,
    p_source_day_id uuid,
    p_target_day_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Park the option at index 0 so it doesn't conflict
    UPDATE day_options
    SET option_index = 0
    WHERE option_id = p_option_id;

    -- 2. Renumber remaining source-day options starting from 1
    WITH ranked AS (
        SELECT option_id,
               ROW_NUMBER() OVER (ORDER BY option_index) AS new_index
        FROM day_options
        WHERE day_id = p_source_day_id
          AND option_id != p_option_id
          AND option_index > 0
    )
    UPDATE day_options d
    SET option_index = -(r.new_index)          -- negative to avoid conflicts
    FROM ranked r
    WHERE d.option_id = r.option_id;

    UPDATE day_options
    SET option_index = -option_index
    WHERE day_id = p_source_day_id
      AND option_id != p_option_id
      AND option_index < 0;

    -- 3. If source day has no remaining options, create an empty main
    IF NOT EXISTS (
        SELECT 1 FROM day_options
        WHERE day_id = p_source_day_id AND option_id != p_option_id
    ) THEN
        INSERT INTO day_options (day_id, option_index)
        VALUES (p_source_day_id, 1);
    END IF;

    -- 4. Bump all target-day option indexes by 1 (negate trick for uniqueness)
    UPDATE day_options
    SET option_index = -option_index
    WHERE day_id = p_target_day_id;

    UPDATE day_options
    SET option_index = (-option_index) + 1
    WHERE day_id = p_target_day_id AND option_index < 0;

    -- 5. Move the option to the target day as main (index 1)
    UPDATE day_options
    SET day_id = p_target_day_id, option_index = 1
    WHERE option_id = p_option_id;
END;
$$;
