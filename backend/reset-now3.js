require("dotenv").config({path:process.env.DOTENV_PATH||".env.production"});
const {PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
async function go(){
  const o=["QuoteItem","Quote","DespatchNoteItem","DespatchNote","RequestHistory","Movement","ProductRequest","Return","Payment","SaleItem","Sale","Notification","AuditLog","PurchaseNoteItem","PurchaseNote","Cost","ProductImporter","Inventory","Product","Category","Importer","Customer"];
  for(let i=0;i<o.length;i++){ try{const r=await p[o[i]].deleteMany({}); console.log(o[i]+":"+r.count);}catch(e){console.log("ERR:"+o[i]);} }
  await p.$disconnect();
}
go();
