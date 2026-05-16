const mongoose = require('mongoose');

async function debug() {
    try {
        await mongoose.connect('mongodb+srv://user:123@cluster0.xawpc.mongodb.net/Forge1?appName=Cluster0');
        console.log('Connected to DB');
        
        const db = mongoose.connection.db;
        const req = await db.collection('foodrequests').findOne({ 
            'requestedItems.bomId': { $ne: null } 
        });
        
        if (!req) {
            console.log('No requests with BOM items found in foodrequests collection.');
            const allReqs = await db.collection('foodrequests').find({}).limit(5).toArray();
            console.log('All requests sample:', JSON.stringify(allReqs, null, 2));
        } else {
            console.log('Sample request with BOM:', JSON.stringify(req, null, 2));
            console.log('bomId type:', typeof req.requestedItems[0].bomId);
        }
        
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debug();
