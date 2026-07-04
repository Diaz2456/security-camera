const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'CommandeR48';

  const existing = await User.findOne({ username });
  if (existing) {
    return;
  }

  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);

  await User.create({ username, passwordHash });
  console.log('Admin user seeded');
}

module.exports = { seedAdmin };
