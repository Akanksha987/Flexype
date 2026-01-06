const mongoose = require('mongoose');

async function connect(uri) {
  const mongoUri = uri || process.env.DB_URL;
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  console.log('Connected to MongoDB');
  return mongoose;
}

module.exports = { connect, mongoose };
