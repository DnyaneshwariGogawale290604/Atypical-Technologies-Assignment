CREATE TABLE IF NOT EXISTS orders (
  id            SERIAL PRIMARY KEY,
  customer_name TEXT        NOT NULL,
  product_name  TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'shipped', 'delivered')),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION notify_order_change()
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
  record_row orders%ROWTYPE;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    record_row := OLD;
  ELSE
    record_row := NEW;
  END IF;

  payload := json_build_object(
    'operation', TG_OP,
    'data', row_to_json(record_row)
  );

  PERFORM pg_notify('orders_changed', payload::TEXT);

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_changed_trigger ON orders;

CREATE TRIGGER orders_changed_trigger
  AFTER INSERT OR UPDATE OR DELETE
  ON orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_order_change();
