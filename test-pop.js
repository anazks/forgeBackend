const mongoose = require('mongoose');
const FoodRequest = require('./modules/foodrequests/models/foodRequestModel');
const Bom = require('./modules/boms/models/bomModel');

mongoose.connect('mongodb+srv://user:123@cluster0.xawpc.mongodb.net/Forge1?appName=Cluster0')
.then(async () => {
    const req = await FoodRequest.findOne({'requestedItems.bomId': { $ne: null }}).populate('requestedItems.bomId');
    console.log(JSON.stringify(req.requestedItems, null, 2));
    process.exit();
}).catch(console.error);
