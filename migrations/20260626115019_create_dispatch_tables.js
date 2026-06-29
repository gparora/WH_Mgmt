/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // 1. Enums for Dispatch Status
  await knex.raw(`
    CREATE TYPE dispatch_status AS ENUM (
      'pending_dispatch', 'ready_for_dispatch', 'dispatched', 'cancelled'
    );
  `);

  // 2. Upload Batches (Replaces dispatch_upload_batches)
  await knex.schema.createTable('dispatch_batches', (table) => {
    table.string('id', 26).primary(); // ULID
    table.string('tenant_id', 26).notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.string('report_type', 50).notNullable(); // 'df' or 'sellerflex'
    table.date('operational_date').notNullable();
    table.string('site_code', 50);
    table.string('original_filename', 255);
    table.integer('source_row_count').defaultTo(0);
    table.integer('imported_order_count').defaultTo(0);
    table.string('uploaded_by', 26).references('id').inTable('users');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    table.index(['tenant_id', 'operational_date'], 'idx_dispatch_batches_tenant_date');
  });

  // 3. Dispatch Orders (Replaces dispatch_orders)
  await knex.schema.createTable('dispatch_orders', (table) => {
    table.string('id', 26).primary(); // ULID
    table.string('tenant_id', 26).notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.string('batch_id', 26).references('id').inTable('dispatch_batches').onDelete('CASCADE');
    table.string('awb', 100).notNullable();
    table.string('order_id', 100);
    table.string('report_type', 50).notNullable();
    table.string('site_code', 50).notNullable();
    table.date('operational_date').notNullable();
    table.timestamp('expected_dispatch_at', { useTz: true });
    
    table.specificType('status', 'dispatch_status').notNullable().defaultTo('pending_dispatch');
    table.string('ready_by', 26).references('id').inTable('users');
    table.timestamp('ready_at', { useTz: true });
    
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Strict constraint to prevent duplicate AWBs within a tenant
    table.unique(['tenant_id', 'awb'], { indexName: 'idx_dispatch_orders_tenant_awb' });
    table.index(['tenant_id', 'status'], 'idx_dispatch_orders_tenant_status');
    table.index(['tenant_id', 'operational_date'], 'idx_dispatch_orders_tenant_date');
  });

  // 4. Dispatch Order Lines (Replaces dispatch_order_lines)
  await knex.schema.createTable('dispatch_lines', (table) => {
    table.string('id', 26).primary(); // ULID
    table.string('tenant_id', 26).notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.string('order_id', 26).notNullable().references('id').inTable('dispatch_orders').onDelete('CASCADE');
    table.string('asin', 20);
    table.string('sku', 100);
    table.text('product_title');
    table.integer('quantity').notNullable().defaultTo(1);
    table.integer('source_row_number');

    table.index(['tenant_id', 'order_id'], 'idx_dispatch_lines_tenant_order');
  });

  // 5. Scan Events (Replaces dispatch_scan_events)
  await knex.schema.createTable('dispatch_scans', (table) => {
    table.increments('id').primary(); // Keeping bigserial for massive log tables
    table.string('tenant_id', 26).notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.string('order_id', 26).references('id').inTable('dispatch_orders').onDelete('CASCADE');
    table.string('awb', 100).notNullable();
    table.string('scan_type', 50).notNullable(); // 'dispatch_ready', 'packing_lookup', etc.
    table.string('user_id', 26).references('id').inTable('users');
    table.jsonb('details').notNullable().defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['tenant_id', 'awb'], 'idx_dispatch_scans_tenant_awb');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('dispatch_scans');
  await knex.schema.dropTableIfExists('dispatch_lines');
  await knex.schema.dropTableIfExists('dispatch_orders');
  await knex.schema.dropTableIfExists('dispatch_batches');
  await knex.raw('DROP TYPE IF EXISTS dispatch_status;');
};