const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const User = require('./modules/users/models/model');
const RawMaterial = require('./modules/rawmaterials/models/rawMaterialModel');
const Bom = require('./modules/boms/models/bomModel');
const FoodRequest = require('./modules/foodrequests/models/foodRequestModel');

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    const admin = await User.findOne({ email: 'manoj@gmail.com' });
    const entityId = admin.entity;

    // Find users to act as locations
    const kitchen = await User.findOne({ role: 'KITCHEN', entity: entityId });
    const restaurant = await User.findOne({ role: 'CENTERS', entity: entityId }); // Usually centers are restaurants

    if (!kitchen || !restaurant) {
       console.log('Need a kitchen and center user. Exiting.');
       process.exit(1);
    }

    // 1. Create Raw Material (Salt)
    let salt = await RawMaterial.findOne({ name: 'Test Salt' });
    if (!salt) {
      salt = await RawMaterial.create({
        name: 'Test Salt',
        simpleCode: '9999',
        unit: 'kg',
        minimumStock: 5,
        currentStock: 0,
        entity: entityId
      });
    }

    // 2. Create BOMs
    let batterBom = await Bom.findOne({ dishName: 'Test Dosa Batter' });
    if (!batterBom) {
      batterBom = await Bom.create({
        dishName: 'Test Dosa Batter',
        unit: 'kg',
        preparationLocation: kitchen._id,
        items: [{
          itemName: salt.name,
          materialId: salt._id,
          quantity: 0.1,
          unit: 'kg',
          type: 'Raw Material'
        }],
        entity: entityId
      });
    }

    let dosaBom = await Bom.findOne({ dishName: 'Test Dosa' });
    if (!dosaBom) {
      dosaBom = await Bom.create({
        dishName: 'Test Dosa',
        unit: 'pcs',
        preparationLocation: restaurant._id,
        items: [{
          itemName: batterBom.dishName,
          materialId: batterBom._id,
          quantity: 0.2, // 200g batter per dosa
          unit: 'kg',
          type: 'BOM Item'
        }],
        entity: entityId
      });
    }

    // 3. Create Food Request from Restaurant for Dosa
    await FoodRequest.create({
      centerName: restaurant.name,
      centerId: restaurant._id,
      status: 'PENDING',
      deliveryDate: new Date(new Date().setDate(new Date().getDate() + 1)),
      requestedItems: [{
        materialName: dosaBom.dishName,
        bomId: dosaBom._id,
        requestedQty: 100,
        unit: 'pcs',
        isMenuItem: true
      }],
      entity: entityId
    });

    console.log('Test data created successfully! (100 Dosas requested)');
    process.exit(0);

  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
