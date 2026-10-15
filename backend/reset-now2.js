const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const order = [
    "QuoteItem","Quote","DespatchNoteItem","DespatchNote","RequestHistory","Movement",
    "ProductRequest","Return","Payment","SaleItem","Sale",
    "Notification","AuditLog",
    "PurchaseNoteItem","PurchaseNote","Cost","ProductImporter",
    "Inventory","Product",
    "Category","Importer","Customer"
  ];
  for (let i=0;i<order.length;i++){ try{ const r=await prisma[order[i]].deleteMany({}); console.log(order[i]+":"+r.count); }catch(e){ console.log("ERR:"+order[i]); } }
  await prisma.$disconnect();
})();