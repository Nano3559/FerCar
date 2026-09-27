const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.$queryRawUnsafe("SELECT 1 AS ok")
  .then(async (r) => { console.log("DB OK", JSON.stringify(r)); await p.$disconnect(); })
  .catch(async (e) => { console.log("DB FAIL code:", e.errorCode, "|", String(e.message)); await p.$disconnect(); process.exit(1); });
