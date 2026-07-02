/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('mrp_templates', table => {
    table.string('id', 32).primary(); // 32 chars to fit 'tpl_' prefix + 26 char ULID
    table.string('tenant_id', 32).notNullable(); 
    table.string('name', 255).notNullable();
    table.string('brand_name', 255).notNullable();
    table.text('address_line1').notNullable();
    table.text('address_line2');
    table.string('city', 100);
    table.string('pincode', 10);
    table.string('cust_care_number', 20).notNullable();
    table.string('support_hours', 100).notNullable();
    table.boolean('is_default').notNullable().defaultTo(false);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.string('created_by', 32); // 32 chars to fit 'usr_' prefix + 26 char ULID
    table.timestamps(true, true); // Automatically adds created_at and updated_at
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('mrp_templates');
};