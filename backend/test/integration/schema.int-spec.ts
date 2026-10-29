import { Client } from 'pg';

// Runs against a DISPOSABLE Postgres that already has every migration applied
// (CI: `prisma migrate deploy`; sandbox: test/support/apply-migrations.js).
// It checks that the migrated database really contains the structures the
// business rules we unit-test depend on, so a missing/renamed migration is
// caught before deployment.
const url = process.env.DATABASE_URL;
const describeDb = url && /localhost|127\.0\.0\.1|test/i.test(url) ? describe : describe.skip;

describeDb('migrated database schema', () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
  });
  afterAll(async () => {
    await db.end();
  });

  const columns = async (table: string) => {
    const r = await db.query(
      `SELECT column_name, is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    return new Map(r.rows.map((row) => [row.column_name as string, row]));
  };
  const enumValues = async (name: string) => {
    const r = await db.query(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = $1`,
      [name],
    );
    return r.rows.map((row) => row.enumlabel as string);
  };

  it('has the core workflow tables', async () => {
    const r = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const tables = new Set(r.rows.map((x) => x.table_name));
    for (const t of [
      'User', 'Role', 'Permission', 'Customer', 'Product', 'Lead', 'Quotation', 'QuotationItem',
      'SalesOrder', 'SalesOrderItem', 'ProformaInvoice', 'TaxInvoice', 'JobExecutionOrder',
      'Material', 'Supplier', 'Complaint', 'AuditLog', 'OverrideApprovalRequest',
    ]) {
      expect(tables.has(t)).toBe(true);
    }
  });

  it('stores quotation discount and the charges carried to the Sales Order', async () => {
    expect((await columns('Quotation')).has('discount')).toBe(true);
    const so = await columns('SalesOrder');
    for (const c of ['subtotal', 'tax', 'grandTotal', 'discount', 'installationCharge', 'transportationCharge']) {
      expect(so.has(c)).toBe(true);
    }
  });

  it('keeps advance and totals on the Proforma Invoice, advance defaulting to zero', async () => {
    const pi = await columns('ProformaInvoice');
    for (const c of ['subtotal', 'discount', 'tax', 'grandTotal', 'advanceReceived', 'bankName', 'ifscCode']) {
      expect(pi.has(c)).toBe(true);
    }
    expect(pi.get('advanceReceived')!.is_nullable).toBe('NO');
    expect(String(pi.get('advanceReceived')!.column_default)).toMatch(/^0/);
  });

  it('has CANCELLED as a status for Proforma Invoices, Tax Invoices and Sales Orders', async () => {
    expect(await enumValues('ProformaInvoiceStatus')).toContain('CANCELLED');
    expect(await enumValues('TaxInvoiceStatus')).toContain('CANCELLED');
    expect(await enumValues('SalesOrderStatus')).toContain('CANCELLED');
  });

  it('enforces unique document numbers', async () => {
    const r = await db.query(
      `SELECT tablename, indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND indexdef ILIKE 'CREATE UNIQUE%'`,
    );
    const defs = r.rows.map((x) => `${x.tablename}: ${x.indexdef}`).join('\n');
    expect(defs).toMatch(/ProformaInvoice.*invoiceNumber/);
    expect(defs).toMatch(/SalesOrder.*salesOrderNumber/);
    expect(defs).toMatch(/Quotation.*quotationNumber/);
  });

  it('has the standalone WhatsApp message history used for duplicate-send protection', async () => {
    const wa = await columns('WhatsAppMessage');
    for (const c of ['provider', 'useCase', 'documentId', 'destination', 'status', 'createdAt']) {
      expect(wa.get(c)?.is_nullable).toBe('NO');
    }
    for (const c of ['campaignName', 'errorMessage', 'sentBy']) {
      expect(wa.get(c)?.is_nullable).toBe('YES');
    }
    const fks = await db.query(
      `SELECT 1 FROM information_schema.table_constraints
       WHERE table_name = 'WhatsAppMessage' AND constraint_type = 'FOREIGN KEY'`,
    );
    expect(fks.rowCount).toBe(0);
    const idx = await db.query(`SELECT indexdef FROM pg_indexes WHERE tablename = 'WhatsAppMessage'`);
    expect(idx.rows.map((x) => x.indexdef).join('\n')).toMatch(/\("documentId", "useCase", destination, "createdAt"\)/);
  });
});
