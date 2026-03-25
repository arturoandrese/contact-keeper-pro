ALTER TABLE licitaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on licitaciones" ON licitaciones
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);