/**
 * seed_test_db.js  —  Run from forgeBackend directory
 * node seed_test_db.js
 */
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://localhost:27017/forge_test';
const PASSWORD  = 'TestPass@123';

const User            = require('./modules/users/models/model');
const RawMaterial     = require('./modules/rawmaterials/models/rawMaterialModel');
const Vendor          = require('./modules/vendors/models/vendorModel');
const Bom             = require('./modules/boms/models/bomModel');
const Menu            = require('./modules/menus/models/menuModel');
const MenuRate        = require('./modules/menus/models/menuRateModel');
const Inventory       = require('./modules/inventory/models/inventoryModel');
const ExpenseCategory = require('./modules/expenses/models/expenseCategoryModel');

// Load Entity model — try multiple paths
let Entity;
try { Entity = require('./modules/entities/models/entityModel'); }
catch(e) { try { Entity = require('./modules/entities/models/Entity'); } catch(e2) { Entity = null; } }

async function main() {
  console.log('Connecting to forge_test …');
  await mongoose.connect(MONGO_URI);
  console.log('Connected to mongodb://localhost:27017/forge_test\n');

  // Wipe all collections
  const cols = await mongoose.connection.db.listCollections().toArray();
  for (const col of cols) {
    await mongoose.connection.db.collection(col.name).deleteMany({});
  }
  console.log('✔  All collections cleared');

  // ── Super Admin ──────────────────────────────────────────────────────────
  const superAdmin = await User.create({
    name: 'Test Super Admin', email: 'superadmin@forgetest.com',
    password: PASSWORD, role: 'SUPER_ADMIN', isActive: true,
  });
  console.log('✔  SUPER_ADMIN created');

  // ── Entity ────────────────────────────────────────────────────────────────
  let entity;
  const EID_PLACEHOLDER = superAdmin._id; // fallback if Entity model missing
  if (Entity) {
    entity = await Entity.create({
      username: 'testforge', name: 'Test Forge Entity', location: 'Test City',
    });
    console.log(`✔  Entity created: ${entity.name}`);
  } else {
    console.log('⚠  Entity model not found — users will have entity=SuperAdminId as placeholder');
  }
  const EID = entity?._id || EID_PLACEHOLDER;

  // ── Role users ────────────────────────────────────────────────────────────
  const mkUser = async (name, email, role, extra = {}) =>
    User.create({ name, email, password: PASSWORD, role, entity: EID, isActive: true, ...extra });

  const admin      = await mkUser('Test Admin',      'admin@forgetest.com',      'ADMIN');
  const kitchen    = await mkUser('Test Kitchen',    'kitchen@forgetest.com',    'KITCHEN');
  const center     = await mkUser('Test Center',     'center@forgetest.com',     'CENTERS');
  const coo        = await mkUser('Test COO',        'coo@forgetest.com',        'COO');
  const store      = await mkUser('Test Store',      'store@forgetest.com',      'STORE');
  const restaurant = await mkUser('Test Restaurant', 'restaurant@forgetest.com', 'RESTAURANT');
  const finance    = await mkUser('Test Finance',    'finance@forgetest.com',    'FINANCE');
  const hr         = await mkUser('Test HR',         'hr@forgetest.com',         'HR');
  const aggregate  = await mkUser('Test Aggregate',  'aggregate@forgetest.com',  'AGGREGATE', { aggregatorPercentage: 10 });
  console.log('✔  All role users created');

  // ── Link admin to entity ──────────────────────────────────────────────────
  if (Entity && entity) {
    await Entity.findByIdAndUpdate(EID, { $push: { admins: admin._id } });
  }

  // ── Raw Materials ─────────────────────────────────────────────────────────
  const wheatFlour = await RawMaterial.create({ name:'Test Wheat Flour', simpleCode:'1001', unit:'kg',  minimumStock:20, entity:EID });
  const salt       = await RawMaterial.create({ name:'Test Salt',        simpleCode:'1002', unit:'kg',  minimumStock:5,  entity:EID });
  const oil        = await RawMaterial.create({ name:'Test Oil',         simpleCode:'1003', unit:'ltr', minimumStock:5,  entity:EID });
  const rice       = await RawMaterial.create({ name:'Test Rice',        simpleCode:'1004', unit:'kg',  minimumStock:10, entity:EID });
  console.log('✔  Raw materials created (Wheat Flour, Salt, Oil, Rice)');

  // ── Vendor ────────────────────────────────────────────────────────────────
  const vendor = await Vendor.create({
    vendorName: 'Test Vendor Co.', vendorCode: 'V001',
    contactNumber: '9876543210', entity: EID,
  });
  console.log('✔  Vendor created: Test Vendor Co.');

  // ── BOMs ──────────────────────────────────────────────────────────────────
  const chapati = await Bom.create({
    dishName: 'Test Chapati', unit: 'pcs',
    preparationLocation: kitchen._id,
    items: [
      { itemName: wheatFlour.name, materialId: wheatFlour._id, quantity: 0.1,   unit: 'kg', type: 'Raw Material' },
      { itemName: salt.name,       materialId: salt._id,       quantity: 0.005, unit: 'kg', type: 'Raw Material' },
    ],
    entity: EID,
  });

  const salad = await Bom.create({
    dishName: 'Test Salad', unit: 'pcs',
    preparationLocation: kitchen._id,
    items: [
      { itemName: salt.name, materialId: salt._id, quantity: 0.002, unit: 'kg', type: 'Raw Material' },
    ],
    entity: EID,
  });
  console.log('✔  BOMs created: Test Chapati, Test Salad');

  // ── Menu Items ────────────────────────────────────────────────────────────
  await Menu.create({ name: 'Chapati', type: 'BOM', bom: chapati._id, unit: 'pcs', entity: EID });
  await Menu.create({ name: 'Salad',   type: 'BOM', bom: salad._id,   unit: 'pcs', entity: EID });
  console.log('✔  Menu items created');

  // ── Menu Rates ────────────────────────────────────────────────────────────
  await MenuRate.create({ bom: chapati._id, rate: 20, centerRate: 20, center: null, entity: EID });
  await MenuRate.create({ bom: salad._id,   rate: 15, centerRate: 15, center: null, entity: EID });
  console.log('✔  Menu rates set (Chapati=₹20, Salad=₹15)');

  // ── Inventory ─────────────────────────────────────────────────────────────
  await Inventory.create({ materialId: wheatFlour._id, locationId: kitchen._id, currentStock: 100, entity: EID });
  await Inventory.create({ materialId: salt._id,       locationId: kitchen._id, currentStock: 50,  entity: EID });
  await Inventory.create({ materialId: oil._id,        locationId: kitchen._id, currentStock: 20,  entity: EID });
  await Inventory.create({ materialId: rice._id,       locationId: kitchen._id, currentStock: 60,  entity: EID });
  console.log('✔  Baseline Kitchen inventory seeded');

  // ── Expense Category ──────────────────────────────────────────────────────
  await ExpenseCategory.create({ categoryName: 'Test Utilities', expenseType: 'Other', entity: EID });
  console.log('✔  Expense category created');

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═════════════════════════════════════════════════════');
  console.log('  forge_test database seeded successfully!');
  console.log('═════════════════════════════════════════════════════');
  console.log('\n  ALL USERS — password: TestPass@123');
  console.log('  superadmin@forgetest.com  (SUPER_ADMIN)');
  console.log('  admin@forgetest.com       (ADMIN)');
  console.log('  kitchen@forgetest.com     (KITCHEN)');
  console.log('  center@forgetest.com      (CENTERS)');
  console.log('  coo@forgetest.com         (COO)');
  console.log('  store@forgetest.com       (STORE)');
  console.log('  restaurant@forgetest.com  (RESTAURANT)');
  console.log('  finance@forgetest.com     (FINANCE)');
  console.log('  hr@forgetest.com          (HR)');
  console.log('  aggregate@forgetest.com   (AGGREGATE)\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
