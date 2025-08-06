// src/index.ts
import "reflect-metadata"; // Required for TypeORM
import app from "./app";
import { AppDataSource } from "./config/data-source";

const PORT = process.env.PORT || 5000;

AppDataSource.initialize()
  .then(() => {
    console.log("📦 Database connected successfully");
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("❌ Database connection failed:", error);
  });