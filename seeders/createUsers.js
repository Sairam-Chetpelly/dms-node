const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const users = [
  {
    name: 'Admin User',
    email: 'admin@company.com',
    password: 'admin123',
    role: 'admin',
    department: 'it'
  },
  {
    name: 'HR Manager',
    email: 'hr.manager@company.com',
    password: 'manager123',
    role: 'manager',
    department: 'hr'
  },
  {
    name: 'Finance Manager',
    email: 'finance.manager@company.com',
    password: 'manager123',
    role: 'manager',
    department: 'finance'
  },
  {
    name: 'HR Employee',
    email: 'hr.employee@company.com',
    password: 'employee123',
    role: 'employee',
    department: 'hr'
  },
  {
    name: 'Finance Employee',
    email: 'finance.employee@company.com',
    password: 'employee123',
    role: 'employee',
    department: 'finance'
  },
  {
    name: 'IT Employee',
    email: 'it.employee@company.com',
    password: 'employee123',
    role: 'employee',
    department: 'it'
  }
];

async function createUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing users
    await User.deleteMany({});
    console.log('Cleared existing users');

    // Create new users
    for (const userData of users) {
      const user = new User(userData);
      await user.save();
      console.log(`Created user: ${user.name} (${user.role} - ${user.department})`);
    }

    console.log('All users created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error creating users:', error);
    process.exit(1);
  }
}

createUsers();