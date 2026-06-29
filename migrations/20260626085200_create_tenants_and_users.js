/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // 1. Create the ENUM type first 
  await knex.raw(`
    CREATE TYPE user_role AS ENUM (
      'superadmin', 'tenant_owner', 'warehouse_manager', 'warehouse_worker'
    );
  `);

  // 2. Create the 'tenants' table [cite: 27]
  await knex.schema.createTable('tenants', (table) => {
    table.string('id', 26).primary(); // ULID [cite: 27]
    table.string('slug', 63).notNullable().unique();
    table.string('display_name', 255).notNullable();
    table.text('logo_url');
    table.specificType('primary_color', 'CHAR(7)').defaultTo('#1A6B5A');
    table.string('timezone', 64).notNullable().defaultTo('Asia/Kolkata');
    table.specificType('site_codes', 'TEXT[]').notNullable().defaultTo('{}');
    table.string('subscription_tier', 32).notNullable().defaultTo('trial');
    table.text('webhook_url');
    table.string('webhook_secret', 64);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('trial_ends_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Indexes [cite: 27]
    table.index('slug', 'idx_tenants_slug');
    table.index('is_active', 'idx_tenants_active');
  });

  // 3. Create the 'users' table [cite: 29]
  await knex.schema.createTable('users', (table) => {
    table.string('id', 26).primary(); // ULID [cite: 29]
    table.string('tenant_id', 26).notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    table.string('email', 255).notNullable();
    table.string('password_hash', 255).notNullable();
    table.string('display_name', 255).notNullable();
    
    // Use the native ENUM type we created above [cite: 29]
    table.specificType('role', 'user_role').notNullable();
    
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('last_login_at', { useTz: true });
    table.integer('failed_login_count').notNullable().defaultTo(0);
    table.timestamp('locked_until', { useTz: true });
    
    table.string('created_by', 26).references('id').inTable('users');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Indexes [cite: 29]
    table.unique(['tenant_id', 'email'], { indexName: 'idx_users_email_tenant' });
    table.index(['tenant_id', 'is_active'], 'idx_users_tenant_active');
    table.index(['tenant_id', 'role'], 'idx_users_tenant_role');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  // Drop in reverse order of creation
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('tenants');
  await knex.raw('DROP TYPE IF EXISTS user_role;');
};