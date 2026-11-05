require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

const users = [
  {
    name: "Student One",
    email: "22STD001@university.edu",
    role: "student",
  },
  {
    name: "Student Two",
    email: "22STD002@university.edu",
    role: "student",
  },
  {
    name: "Student Three",
    email: "22STD003@university.edu",
    role: "student",
  },
  {
    name: "Lecturer One",
    email: "LEC001@university.edu",
    role: "lecturer",
  },
  {
    name: "Lecturer Two",
    email: "LEC002@university.edu",
    role: "lecturer",
  },
  {
    name: "Lecturer Three",
    email: "LEC003@university.edu",
    role: "lecturer",
  },
];

async function seedUsers() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from .env");
    }

    if (!process.env.SEED_USER_PASSWORD) {
      throw new Error("SEED_USER_PASSWORD is required in the environment");
    }

    await mongoose.connect(process.env.MONGODB_URI, { dbName: "examora" });
    console.log("Connected to MongoDB Atlas.");

    for (const userData of users) {
      const email = userData.email.toLowerCase();

      const existingUser = await User.findOne({ email });

      if (existingUser) {
        console.log(`Already exists: ${email}`);
        continue;
      }

      const hashedPassword = await bcrypt.hash(
        process.env.SEED_USER_PASSWORD,
        12
      );

      await User.create({
        name: userData.name,
        email,
        password: hashedPassword,
        role: userData.role,
      });

      console.log(`Created ${userData.role}: ${email}`);
    }

    console.log("User seeding completed.");
  } catch (error) {
    console.error("Seeding failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedUsers();