const mongoose = require('mongoose');
const RawMaterial = require('./modules/rawmaterials/models/rawMaterialModel');
const Menu = require('./modules/menus/models/menuModel');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const ids = [
    '6a0b1a07f0cbebb261b79bbb',
    '6a0b195cf0cbebb261b79bb6',
    '6a0b1b0af0cbebb261b79be5',
    '6a0b196df0cbebb261b79bb7',
    '6a0b1981f0cbebb261b79bb8',
    '6a0b199af0cbebb261b79bb9'
  ];
  const rms = await RawMaterial.find({ _id: { $in: ids } }).lean();
  console.log('RawMaterials:', JSON.stringify(rms, null, 2));
  const menus = await Menu.find({ _id: { $in: ids } }).lean();
  console.log('Menus:', JSON.stringify(menus, null, 2));
  process.exit(0);
}
run();
