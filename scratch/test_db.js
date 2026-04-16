const mongoose = require('mongoose');
const uri = "mongodb://dhirajkumar9501445740_db_user:qzMRq88q6EKsTfaF@ac-uvtkyvu-shard-00-00.l2u06sf.mongodb.net:27017,ac-uvtkyvu-shard-00-01.l2u06sf.mongodb.net:27017,ac-uvtkyvu-shard-00-02.l2u06sf.mongodb.net:27017/hersafety?ssl=true&authSource=admin&retryWrites=true&w=majority";

console.log("Testing connection to Atlas...");
mongoose.connect(uri)
    .then(() => {
        console.log("✅ SUCCESS: Connected to Atlas!");
        process.exit(0);
    })
    .catch(err => {
        console.error("❌ FAILURE:", err.message);
        process.exit(1);
    });
