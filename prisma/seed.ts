import { PrismaClient } from "@prisma/client";
import {
  ROLE,
  PRODUCT_STATUS,
  INVOICE_STATUS,
  ORDER_STATUS,
  LEAD_STATUS,
  CALL_STATUS,
  DISCOUNT_TYPE,
  BUNDLE_STATUS,
  DEFAULT_PACKING_CHECKLIST,
} from "../src/lib/constants";

const prisma = new PrismaClient();

const PASSWORD = "luxe2026";
const day = 86_400_000;
const hour = 3_600_000;
const now = Date.now();
const from = (ms: number) => new Date(now + ms);
const gallery = (label: string) => JSON.stringify([
  `${label} — three-quarter view`,
  `${label} — detail`,
  `${label} — maker's mark`,
  `${label} — interior`,
  `${label} — scale reference`,
]);

async function main() {
  // ---- wipe (order matters for FKs) ----
  await prisma.fulfillmentTask.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.order.deleteMany();
  await prisma.videoCallRequest.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.product.deleteMany();
  await prisma.bundle.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  // ---- reps + manager + fulfillment ----
  const adele = await prisma.user.create({
    data: {
      email: "rep@luxesupply.co", password: PASSWORD, name: "Adele Fontaine",
      initials: "AF", role: ROLE.REP, title: "senior specialist", isSenior: true,
      statSalesQuarter: 241000, statInvoices: 58, statAov: 4155, statConversion: 34,
      statCalls: 41, statDeltaSales: 12,
      statMonthly: JSON.stringify([132, 148, 141, 168, 150, 176, 182, 198, 191, 214, 205, 241]),
    },
  });
  const jonas = await prisma.user.create({
    data: {
      email: "jonas@luxesupply.co", password: PASSWORD, name: "Jonas Keller",
      initials: "JK", role: ROLE.REP, title: "senior specialist", isSenior: true,
      statSalesQuarter: 204000, statInvoices: 44, statAov: 4636, statConversion: 31,
      statCalls: 36, statDeltaSales: 9,
      statMonthly: JSON.stringify([120, 128, 136, 140, 151, 149, 162, 170, 178, 185, 196, 204]),
    },
  });
  const marcus = await prisma.user.create({
    data: {
      email: "marcus@luxesupply.co", password: PASSWORD, name: "Marcus Webb",
      initials: "MW", role: ROLE.REP, title: "specialist", isSenior: false,
      statSalesQuarter: 157000, statInvoices: 51, statAov: 3078, statConversion: 26,
      statCalls: 29, statDeltaSales: 4,
      statMonthly: JSON.stringify([98, 104, 110, 118, 121, 130, 128, 139, 142, 148, 150, 157]),
    },
  });
  const priya = await prisma.user.create({
    data: {
      email: "priya@luxesupply.co", password: PASSWORD, name: "Priya Nair",
      initials: "PN", role: ROLE.REP, title: "specialist", isSenior: false,
      statSalesQuarter: 136000, statInvoices: 47, statAov: 2894, statConversion: 24,
      statCalls: 22, statDeltaSales: 7,
      statMonthly: JSON.stringify([88, 92, 99, 104, 108, 112, 118, 121, 124, 128, 131, 136]),
    },
  });
  const ruth = await prisma.user.create({
    data: {
      email: "ruth@luxesupply.co", password: PASSWORD, name: "Ruth Alvarez",
      initials: "RA", role: ROLE.REP, title: "junior specialist", isSenior: false,
      statSalesQuarter: 81000, statInvoices: 28, statAov: 2893, statConversion: 19,
      statCalls: 14, statDeltaSales: 22,
      statMonthly: JSON.stringify([40, 44, 48, 52, 55, 60, 63, 67, 70, 74, 78, 81]),
    },
  });
  const reps = [adele, jonas, marcus, priya, ruth];

  await prisma.user.create({
    data: {
      email: "manager@luxesupply.co", password: PASSWORD, name: "Dana Osei",
      initials: "DO", role: ROLE.MANAGER, title: "sales director", isSenior: true,
    },
  });
  await prisma.user.create({
    data: {
      email: "fulfillment@luxesupply.co", password: PASSWORD, name: "Theo Keady",
      initials: "TK", role: ROLE.FULFILLMENT, title: "vault & fulfillment",
    },
  });

  // ---- accounts + buyers ----
  const meridian = await prisma.account.create({
    data: {
      company: "Meridian Interiors Ltd.", email: "accounts@meridianinteriors.com",
      addressLines: JSON.stringify(["412 Greene Street, Floor 3", "New York, NY 10012"]),
      industry: "interior design", trailing12Spend: 68400, assignedRepId: adele.id,
    },
  });
  const aurelia = await prisma.account.create({
    data: {
      company: "Hotel Aurelia Group", email: "procurement@aureliagroup.com",
      addressLines: JSON.stringify(["1 Promenade des Anglais", "06000 Nice, France"]),
      industry: "hospitality", trailing12Spend: 121500, assignedRepId: adele.id,
    },
  });
  const castellane = await prisma.account.create({
    data: {
      company: "Castellane & Co.", email: "studio@castellane.co",
      addressLines: JSON.stringify(["8 Rue de Verneuil", "75007 Paris, France"]),
      industry: "interior design", trailing12Spend: 34200, assignedRepId: marcus.id,
    },
  });

  const buyerMeridian = await prisma.user.create({
    data: {
      email: "buyer@luxesupply.co", password: PASSWORD, name: "Mara Iselin",
      initials: "MI", role: ROLE.BUYER, title: "head of procurement", accountId: meridian.id,
    },
  });
  const buyerAurelia = await prisma.user.create({
    data: {
      email: "aurelia@luxesupply.co", password: PASSWORD, name: "Luca Renaud",
      initials: "LR", role: ROLE.BUYER, title: "design director", accountId: aurelia.id,
    },
  });
  await prisma.user.create({
    data: {
      email: "castellane@luxesupply.co", password: PASSWORD, name: "Inès Castellane",
      initials: "IC", role: ROLE.BUYER, title: "principal", accountId: castellane.id,
    },
  });

  // ---- products ----
  type PDef = {
    sku: string; name: string; category: string; era: string; material: string;
    origin: string; price: number; rl: number; rh: number; prov: string; cond: string;
    marks?: string; dim?: string; loc: string; label: string;
  };
  const OBJ = "Objets & Decorative", SILVER = "Silver & Metalwork",
    GLASS = "Glass & Crystal", FURN = "Furniture", LIGHT = "Lighting";

  const defs: PDef[] = [
    { sku: "LX-0231", name: "Meiji Bronze Censer", category: OBJ, era: "Meiji · c.1890", material: "Bronze", origin: "Japan", price: 3850, rl: 6400, rh: 7600, prov: "Private collection, Kyoto; acquired at Zecchin, Milan (1998)", cond: "Excellent. Rich original patina; no restoration.", marks: "Signed to base with artist's seal", dim: "H 28 × Ø 19 cm", loc: "VAULT B · SHELF 07 · BIN 2", label: "bronze censer" },
    { sku: "LX-0198", name: "Louis XVI Gilt Mirror", category: OBJ, era: "Louis XVI · c.1785", material: "Gilt wood", origin: "France", price: 6200, rl: 9800, rh: 12000, prov: "Château de Vaux estate; Galerie Marchand, Paris (1971)", cond: "Very good. Minor regilding to crest; original plate.", marks: "—", dim: "132 × 74 cm", loc: "VAULT A · SHELF 11 · BIN 1", label: "gilt mirror" },
    { sku: "LX-0402", name: "Verrier Crystal Decanter", category: GLASS, era: "Art Deco · c.1928", material: "Crystal", origin: "Bohemia", price: 2400, rl: 3900, rh: 4800, prov: "Documented in the Verrier factory ledger, 1928", cond: "Excellent. No chips or fleabites; original stopper.", marks: "Acid-etched factory mark", dim: "H 32 cm", loc: "VAULT C · SHELF 03 · BIN 9", label: "crystal decanter" },
    { sku: "LX-0417", name: "Sèvres Porcelain Coffret with Ormolu Mounts", category: OBJ, era: "Louis XV · c.1770", material: "Porcelain", origin: "France", price: 4300, rl: 7200, rh: 8500, prov: "Private collection, Lyon; Galerie Marchand, Paris (1962); documented in the Verlet inventory", cond: "Excellent. Minor gilt wear to lower mounts; no restoration. Full report available.", marks: "Interlaced L's enclosing date letter R; painter's mark for Dodin", dim: "24 × 18 × 14 cm", loc: "VAULT B · SHELF 14 · BIN 3", label: "porcelain coffret" },
    { sku: "LX-0355", name: "Georgian Silver Candlesticks, Pair", category: SILVER, era: "Georgian · c.1760", material: "Silver", origin: "England", price: 2150, rl: 3400, rh: 4100, prov: "Estate of Lady Ashcombe; Christie's London (2004)", cond: "Very good. Loaded bases; light wear consistent with age.", marks: "Sterling; London hallmarks, maker EC", dim: "H 27 cm", loc: "VAULT A · SHELF 05 · BIN 4", label: "silver candlesticks" },
    { sku: "LX-0290", name: "Biedermeier Writing Box", category: FURN, era: "Biedermeier · c.1825", material: "Walnut", origin: "Vienna", price: 1750, rl: 2800, rh: 3400, prov: "Viennese private collection; Dorotheum (2011)", cond: "Good. Ebonized inlay intact; interior fittings complete.", marks: "—", dim: "42 × 30 × 18 cm", loc: "VAULT D · SHELF 02 · BIN 1", label: "writing box" },
    { sku: "LX-0288", name: "Art Deco Cocktail Set", category: SILVER, era: "Art Deco · c.1932", material: "Silver plate", origin: "England", price: 1650, rl: 2600, rh: 3200, prov: "London trade; single-owner since 1970s", cond: "Very good. Bakelite handles crisp; even plate.", marks: "Maker's stamp to shaker", dim: "shaker H 24 cm", loc: "VAULT A · SHELF 02 · BIN 11", label: "cocktail set" },
    { sku: "LX-0341", name: "Silver Cigarette Case, Engine-Turned", category: SILVER, era: "Art Deco · c.1930", material: "Silver", origin: "England", price: 870, rl: 1400, rh: 1700, prov: "Private collection, London", cond: "Excellent. Crisp engine-turning; gilt interior.", marks: "Sterling; Birmingham hallmarks", dim: "9 × 7 cm", loc: "VAULT A · SHELF 03 · BIN 6", label: "cigarette case" },
    { sku: "LX-0466", name: "Murano Sommerso Vase", category: GLASS, era: "Mid-century · c.1965", material: "Glass", origin: "Italy", price: 980, rl: 1500, rh: 1900, prov: "Seguso atelier provenance", cond: "Excellent. No damage.", marks: "—", dim: "H 24 cm", loc: "VAULT C · SHELF 08 · BIN 2", label: "sommerso vase" },
    { sku: "LX-0503", name: "Regency Bronze Inkstand", category: OBJ, era: "Regency · c.1815", material: "Bronze", origin: "England", price: 2950, rl: 4600, rh: 5600, prov: "Country house sale, Wiltshire (2019)", cond: "Very good. Original glass wells.", marks: "—", dim: "34 × 20 cm", loc: "VAULT B · SHELF 07 · BIN 5", label: "bronze inkstand" },
    { sku: "LX-0512", name: "Venetian Girandole Mirror", category: OBJ, era: "Rococo · c.1750", material: "Glass", origin: "Italy", price: 5400, rl: 8600, rh: 10500, prov: "Palazzo estate, Venice", cond: "Good. Some replaced elements; sparkling plate.", marks: "—", dim: "150 × 90 cm", loc: "VAULT A · SHELF 12 · BIN 2", label: "girandole mirror" },
    { sku: "LX-0288B", name: "Meissen Snuff Box", category: OBJ, era: "Rococo · c.1755", material: "Porcelain", origin: "Germany", price: 2900, rl: 4700, rh: 5800, prov: "German private collection", cond: "Excellent. Gilt-metal mounts; painted reserves.", marks: "Crossed swords in underglaze blue", dim: "8 × 6 cm", loc: "VAULT B · SHELF 14 · BIN 7", label: "snuff box" },
    { sku: "LX-0521", name: "Empire Ormolu Casket", category: OBJ, era: "Empire · c.1810", material: "Bronze", origin: "France", price: 3650, rl: 5900, rh: 7200, prov: "Paris trade", cond: "Very good. Rich gilding; silk lining renewed.", marks: "—", dim: "26 × 16 × 14 cm", loc: "VAULT B · SHELF 15 · BIN 1", label: "ormolu casket" },
    { sku: "LX-0530", name: "Sèvres Bleu Céleste Vase", category: OBJ, era: "Louis XVI · c.1780", material: "Porcelain", origin: "France", price: 5100, rl: 8200, rh: 9900, prov: "Documented Sèvres production", cond: "Excellent. Signature ground colour; gilt intact.", marks: "Interlaced L's; date letters", dim: "H 34 cm", loc: "VAULT B · SHELF 16 · BIN 3", label: "bleu céleste vase" },
    { sku: "LX-0544", name: "George III Tea Caddy", category: FURN, era: "Georgian · c.1795", material: "Walnut", origin: "England", price: 1850, rl: 2900, rh: 3600, prov: "English private collection", cond: "Very good. Original lock and key; foil intact.", marks: "—", dim: "18 × 14 × 12 cm", loc: "VAULT D · SHELF 03 · BIN 2", label: "tea caddy" },
    { sku: "LX-0556", name: "Brass Library Compass", category: OBJ, era: "Victorian · c.1870", material: "Brass", origin: "England", price: 680, rl: 1100, rh: 1400, prov: "Instrument-maker's estate", cond: "Excellent. Smooth action; original case.", marks: "Signed to dial", dim: "Ø 14 cm", loc: "VAULT B · SHELF 09 · BIN 4", label: "library compass" },
    { sku: "LX-0560", name: "Edwardian Card Tray", category: SILVER, era: "Edwardian · c.1905", material: "Silver", origin: "England", price: 420, rl: 680, rh: 850, prov: "London trade", cond: "Very good. Pierced gallery; light wear.", marks: "Sterling; Sheffield hallmarks", dim: "Ø 22 cm", loc: "VAULT A · SHELF 04 · BIN 8", label: "card tray" },
    { sku: "LX-0571", name: "Cut-Glass Perfume Bottle", category: GLASS, era: "Art Deco · c.1925", material: "Crystal", origin: "France", price: 310, rl: 500, rh: 640, prov: "French trade", cond: "Excellent. Silver-gilt collar; original stopper.", marks: "—", dim: "H 12 cm", loc: "VAULT C · SHELF 05 · BIN 6", label: "perfume bottle" },
    { sku: "LX-0588", name: "Boulle Marquetry Coffret", category: FURN, era: "Louis XIV · c.1700", material: "Tortoiseshell", origin: "France", price: 7800, rl: 12500, rh: 15200, prov: "Aristocratic collection, Bordeaux", cond: "Good. Brass inlay stable; minor lifting.", marks: "—", dim: "32 × 24 × 20 cm", loc: "VAULT D · SHELF 06 · BIN 1", label: "boulle coffret" },
    { sku: "LX-0595", name: "Chinese Cloisonné Bowl", category: OBJ, era: "Qing · c.1880", material: "Enamel", origin: "China", price: 1450, rl: 2300, rh: 2900, prov: "Estate collection, Hong Kong", cond: "Excellent. Vivid enamels; gilt rim.", marks: "—", dim: "Ø 26 cm", loc: "VAULT B · SHELF 18 · BIN 2", label: "cloisonné bowl" },
    { sku: "LX-0602", name: "Daum Nancy Cameo Lamp", category: LIGHT, era: "Art Nouveau · c.1905", material: "Glass", origin: "France", price: 6900, rl: 11000, rh: 13500, prov: "Documented Daum production", cond: "Excellent. Acid-etched landscape; rewired.", marks: "Daum Nancy with cross of Lorraine", dim: "H 46 cm", loc: "VAULT C · SHELF 12 · BIN 1", label: "cameo lamp" },
    { sku: "LX-0610", name: "Wiener Werkstätte Silver Bowl", category: SILVER, era: "Secession · c.1910", material: "Silver", origin: "Vienna", price: 4200, rl: 6700, rh: 8200, prov: "Viennese private collection", cond: "Very good. Hammered surface; maker's mark clear.", marks: "WW monogram; Vienna hallmarks", dim: "Ø 24 cm", loc: "VAULT A · SHELF 06 · BIN 3", label: "silver bowl" },
    { sku: "LX-0623", name: "Baccarat Crystal Chandelier", category: LIGHT, era: "Napoleon III · c.1870", material: "Crystal", origin: "France", price: 9200, rl: 14800, rh: 18000, prov: "Château provenance, Loire Valley", cond: "Very good. Fully restrung; twelve lights.", marks: "—", dim: "H 110 × Ø 80 cm", loc: "VAULT C · SHELF 20 · BIN 1", label: "crystal chandelier" },
    { sku: "LX-0631", name: "Fabergé Silver Kovsh", category: SILVER, era: "Imperial · c.1900", material: "Silver", origin: "Russia", price: 8600, rl: 13800, rh: 16900, prov: "Continental private collection", cond: "Excellent. Enamel intact; workmaster mark.", marks: "Fabergé; workmaster initials", dim: "L 18 cm", loc: "VAULT A · SHELF 08 · BIN 1", label: "silver kovsh" },
    { sku: "LX-0640", name: "Lalique Opalescent Coupe", category: GLASS, era: "Art Deco · c.1930", material: "Glass", origin: "France", price: 2650, rl: 4200, rh: 5200, prov: "French trade", cond: "Excellent. Strong opalescence; no chips.", marks: "R. Lalique, moulded", dim: "Ø 30 cm", loc: "VAULT C · SHELF 06 · BIN 3", label: "opalescent coupe" },
    { sku: "LX-0655", name: "Directoire Bronze Clock", category: OBJ, era: "Directoire · c.1798", material: "Bronze", origin: "France", price: 4750, rl: 7600, rh: 9300, prov: "Paris estate", cond: "Very good. Movement serviced; original dial.", marks: "Movement signed", dim: "H 42 cm", loc: "VAULT B · SHELF 21 · BIN 1", label: "bronze clock" },
    { sku: "LX-0668", name: "Chinese Export Punch Bowl", category: OBJ, era: "Qing · c.1790", material: "Porcelain", origin: "China", price: 3200, rl: 5100, rh: 6200, prov: "English country house", cond: "Good. Hairline stabilised; gilt worn.", marks: "—", dim: "Ø 36 cm", loc: "VAULT B · SHELF 22 · BIN 2", label: "punch bowl" },
    { sku: "LX-0672", name: "Georgian Mahogany Wine Cooler", category: FURN, era: "Georgian · c.1785", material: "Mahogany", origin: "England", price: 5600, rl: 9000, rh: 11000, prov: "Estate of a Yorkshire house", cond: "Very good. Brass banding; original liner.", marks: "—", dim: "62 × 48 × 46 cm", loc: "VAULT D · SHELF 09 · BIN 1", label: "wine cooler" },
    { sku: "LX-0685", name: "Tiffany Favrile Vase", category: GLASS, era: "Art Nouveau · c.1902", material: "Glass", origin: "United States", price: 5900, rl: 9400, rh: 11500, prov: "American private collection", cond: "Excellent. Iridescent surface; signed.", marks: "L.C. Tiffany-Favrile", dim: "H 30 cm", loc: "VAULT C · SHELF 09 · BIN 4", label: "favrile vase" },
    { sku: "LX-0690", name: "Empire Gilt Bronze Candelabra, Pair", category: LIGHT, era: "Empire · c.1810", material: "Bronze", origin: "France", price: 6400, rl: 10200, rh: 12500, prov: "French château", cond: "Very good. Rich mercury gilding; six lights each.", marks: "—", dim: "H 58 cm", loc: "VAULT C · SHELF 15 · BIN 2", label: "candelabra" },
    { sku: "LX-0704", name: "Georgian Silver Tea Service", category: SILVER, era: "Georgian · c.1815", material: "Silver", origin: "England", price: 7200, rl: 11500, rh: 14000, prov: "Single-family provenance, three generations", cond: "Excellent. Four pieces; armorial engraving.", marks: "Sterling; London hallmarks, Paul Storr", dim: "teapot H 16 cm", loc: "VAULT A · SHELF 10 · BIN 1", label: "tea service" },
    { sku: "LX-0715", name: "Bohemian Ruby Overlay Goblet", category: GLASS, era: "Biedermeier · c.1850", material: "Crystal", origin: "Bohemia", price: 890, rl: 1400, rh: 1750, prov: "Central European collection", cond: "Excellent. Deep ruby cased; wheel-engraved.", marks: "—", dim: "H 18 cm", loc: "VAULT C · SHELF 04 · BIN 7", label: "ruby goblet" },
    { sku: "LX-0722", name: "Louis XV Bombé Commode", category: FURN, era: "Louis XV · c.1755", material: "Kingwood", origin: "France", price: 12800, rl: 20500, rh: 25000, prov: "Documented Parisian ébéniste", cond: "Good. Marble top original; mounts regilt.", marks: "Stamped JME", dim: "88 × 130 × 60 cm", loc: "VAULT D · SHELF 12 · BIN 1", label: "bombé commode" },
    { sku: "LX-0736", name: "Japanese Satsuma Koro", category: OBJ, era: "Meiji · c.1900", material: "Porcelain", origin: "Japan", price: 1650, rl: 2600, rh: 3200, prov: "Japanese export collection", cond: "Excellent. Fine gilt decoration; pierced cover.", marks: "Signed to base", dim: "H 22 cm", loc: "VAULT B · SHELF 24 · BIN 1", label: "satsuma koro" },
    { sku: "LX-0748", name: "Art Deco Onyx Table Lamp", category: LIGHT, era: "Art Deco · c.1928", material: "Onyx", origin: "France", price: 2300, rl: 3700, rh: 4500, prov: "French trade", cond: "Very good. Marble base; rewired to code.", marks: "—", dim: "H 40 cm", loc: "VAULT C · SHELF 16 · BIN 3", label: "onyx lamp" },
    { sku: "LX-0755", name: "Charles X Cut-Glass Vase", category: GLASS, era: "Restoration · c.1825", material: "Crystal", origin: "France", price: 1250, rl: 2000, rh: 2500, prov: "French private collection", cond: "Excellent. Gilt-bronze mounts; brilliant cutting.", marks: "—", dim: "H 28 cm", loc: "VAULT C · SHELF 07 · BIN 2", label: "cut-glass vase" },
    { sku: "LX-0763", name: "Regency Rosewood Games Table", category: FURN, era: "Regency · c.1820", material: "Rosewood", origin: "England", price: 4100, rl: 6600, rh: 8000, prov: "English country house", cond: "Very good. Swivel top; original baize.", marks: "—", dim: "74 × 90 × 45 cm", loc: "VAULT D · SHELF 14 · BIN 1", label: "games table" },
    { sku: "LX-0770", name: "Silver Vinaigrette, Cast Top", category: SILVER, era: "Georgian · c.1830", material: "Silver", origin: "England", price: 540, rl: 860, rh: 1080, prov: "English collection", cond: "Excellent. Gilt interior; pierced grille intact.", marks: "Sterling; Birmingham, Nathaniel Mills", dim: "4 × 3 cm", loc: "VAULT A · SHELF 03 · BIN 9", label: "vinaigrette" },
    { sku: "LX-0781", name: "Gallé Marquetry Side Table", category: FURN, era: "Art Nouveau · c.1900", material: "Walnut", origin: "France", price: 6700, rl: 10700, rh: 13100, prov: "Documented École de Nancy", cond: "Very good. Floral marquetry crisp; signed.", marks: "Gallé, inlaid signature", dim: "72 × 55 × 40 cm", loc: "VAULT D · SHELF 16 · BIN 1", label: "side table" },
    { sku: "LX-0796", name: "Chinese Famille Rose Charger", category: OBJ, era: "Qing · c.1760", material: "Porcelain", origin: "China", price: 2750, rl: 4400, rh: 5400, prov: "European private collection", cond: "Very good. Vibrant enamels; rim fritting.", marks: "—", dim: "Ø 40 cm", loc: "VAULT B · SHELF 25 · BIN 1", label: "famille rose charger" },
    { sku: "LX-0803", name: "Vienna Bronze Inkwell", category: OBJ, era: "Historicist · c.1890", material: "Bronze", origin: "Vienna", price: 1150, rl: 1850, rh: 2300, prov: "Viennese trade", cond: "Excellent. Cold-painted detail; hinged cover.", marks: "—", dim: "16 × 12 cm", loc: "VAULT B · SHELF 26 · BIN 2", label: "bronze inkwell" },
    { sku: "LX-0812", name: "Georgian Sheffield Wine Coasters", category: SILVER, era: "Georgian · c.1800", material: "Silver plate", origin: "England", price: 760, rl: 1200, rh: 1520, prov: "English trade", cond: "Very good. Pair; turned mahogany bases.", marks: "—", dim: "Ø 14 cm", loc: "VAULT A · SHELF 04 · BIN 12", label: "wine coasters" },
  ];

  const products: Record<string, { id: string; price: number }> = {};
  for (const d of defs) {
    const p = await prisma.product.create({
      data: {
        sku: d.sku, name: d.name, category: d.category, era: d.era, material: d.material,
        origin: d.origin, wholesalePrice: d.price, estRetailLow: d.rl, estRetailHigh: d.rh,
        provenance: d.prov, condition: d.cond, marks: d.marks ?? null, dimensions: d.dim ?? null,
        location: d.loc, status: PRODUCT_STATUS.AVAILABLE, images: gallery(d.label), imageLabel: d.label,
        createdAt: from(-Math.floor(Math.random() * 120) * day),
      },
    });
    products[d.sku] = { id: p.id, price: d.price };
  }
  const pid = (sku: string) => products[sku].id;

  // ---- live bundle: The Collector's Edit (Adele) ----
  const bundleSkus = ["LX-0231", "LX-0530", "LX-0640", "LX-0521", "LX-0355"];
  const bundle = await prisma.bundle.create({
    data: {
      name: "The Collector's Edit", repId: adele.id, discountType: DISCOUNT_TYPE.PERCENT,
      discountValue: 8, status: BUNDLE_STATUS.LIVE,
      products: { connect: bundleSkus.map((s) => ({ id: pid(s) })) },
    },
  });
  await prisma.product.updateMany({
    where: { id: { in: bundleSkus.map(pid) } },
    data: { status: PRODUCT_STATUS.BUNDLED, bundleId: bundle.id },
  });

  // A second, DRAFT bundle for the builder demo
  await prisma.bundle.create({
    data: {
      name: "Vienna Study", repId: adele.id, discountType: DISCOUNT_TYPE.PERCENT,
      discountValue: 6, status: BUNDLE_STATUS.DRAFT,
    },
  });

  // ---- one product on hold for "another buyer" (catalog signal) ----
  await prisma.product.update({
    where: { id: pid("LX-0417") },
    data: { status: PRODUCT_STATUS.ON_HOLD, holdExpiresAt: from(24 * hour) },
  });

  // ---- Meridian active CART (below the $2,500 minimum) ----
  const cart = await prisma.order.create({
    data: {
      number: "ORD-1855", accountId: meridian.id, buyerId: buyerMeridian.id,
      status: ORDER_STATUS.CART,
      items: {
        create: [
          { productId: pid("LX-0288"), priceAtAdd: 1650, holdExpiresAt: from(46 * hour) },
          { productId: pid("LX-0736"), priceAtAdd: 1650, holdExpiresAt: from(41 * hour) },
        ],
      },
    },
  });
  await prisma.product.updateMany({
    where: { id: { in: [pid("LX-0288"), pid("LX-0736")] } },
    data: { status: PRODUCT_STATUS.ON_HOLD, holdExpiresAt: from(46 * hour) },
  });

  // ---- helper to make a checked-out order + invoice + fulfillment task ----
  async function makeFulfilledOrder(opts: {
    orderNo: string; invNo: string; account: string; buyerId: string;
    accountId: string; skus: string[]; orderStatus: string; invStatus: string;
    fulStatus: string; shipByMs: number; dueMs: number | null; poNumber?: string;
    carrier?: string; tracking?: string; shippedMs?: number; verifiedIdx?: number[];
    checklistDone?: number; paidMs?: number | null;
  }) {
    const items = opts.skus.map((s) => ({ sku: s, price: products[s].price }));
    const subtotal = items.reduce((a, b) => a + b.price, 0);
    const shipping = 185;
    const total = subtotal + shipping;

    const order = await prisma.order.create({
      data: {
        number: opts.orderNo, accountId: opts.accountId, buyerId: opts.buyerId,
        status: opts.orderStatus, poNumber: opts.poNumber ?? null, shipBy: from(opts.shipByMs),
        items: {
          create: items.map((it, i) => ({
            productId: pid(it.sku), priceAtAdd: it.price,
            pickVerifiedAt: opts.verifiedIdx?.includes(i) ? from(-2 * hour) : null,
          })),
        },
      },
    });

    // Products in a checked-out order are SOLD (removed from catalog, kept for history).
    await prisma.product.updateMany({
      where: { id: { in: items.map((it) => pid(it.sku)) } },
      data: { status: PRODUCT_STATUS.SOLD, soldToId: opts.accountId, soldAt: from(-3 * day) },
    });

    await prisma.invoice.create({
      data: {
        number: opts.invNo, accountId: opts.accountId, orderId: order.id, status: opts.invStatus,
        poNumber: opts.poNumber ?? null, subtotal, shipping, total,
        dueDate: opts.dueMs != null ? from(opts.dueMs) : null,
        paidAt: opts.paidMs != null ? from(opts.paidMs) : null,
        lineItems: JSON.stringify(items.map((it) => {
          const d = defs.find((x) => x.sku === it.sku)!;
          return { name: d.name, sku: it.sku, price: it.price };
        })),
      },
    });

    const checklist = DEFAULT_PACKING_CHECKLIST.map((c, i) => ({
      ...c, done: i < (opts.checklistDone ?? 0),
    }));
    await prisma.fulfillmentTask.create({
      data: {
        orderId: order.id, status: opts.fulStatus, packingChecklist: JSON.stringify(checklist),
        carrier: opts.carrier ?? null, trackingNumber: opts.tracking ?? null,
        shippedAt: opts.shippedMs != null ? from(opts.shippedMs) : null,
      },
    });
    return order;
  }

  // Orders across every fulfillment status
  await makeFulfilledOrder({
    orderNo: "ORD-1847", invNo: "INV-2381", account: "Meridian", accountId: meridian.id,
    buyerId: buyerMeridian.id, skus: ["LX-0402", "LX-0341"], orderStatus: ORDER_STATUS.PICKING,
    invStatus: INVOICE_STATUS.SENT, fulStatus: "PICKING", shipByMs: 1 * day, dueMs: 11 * day,
    poNumber: "MI-2026-0142", verifiedIdx: [0], checklistDone: 0,
  });
  await makeFulfilledOrder({
    orderNo: "ORD-1848", invNo: "INV-2379", account: "Aurelia", accountId: aurelia.id,
    buyerId: buyerAurelia.id, skus: ["LX-0623", "LX-0690", "LX-0704", "LX-0631", "LX-0602"],
    orderStatus: ORDER_STATUS.TO_PICK, invStatus: INVOICE_STATUS.SENT, fulStatus: "TO_PICK",
    shipByMs: 2 * day, dueMs: 20 * day, poNumber: "HA-8841",
  });
  await makeFulfilledOrder({
    orderNo: "ORD-1849", invNo: "INV-2384", account: "Castellane", accountId: castellane.id,
    buyerId: (await prisma.user.findFirstOrThrow({ where: { accountId: castellane.id } })).id,
    skus: ["LX-0512"], orderStatus: ORDER_STATUS.TO_PICK, invStatus: INVOICE_STATUS.DRAFT,
    fulStatus: "TO_PICK", shipByMs: 2 * day, dueMs: null,
  });
  await makeFulfilledOrder({
    orderNo: "ORD-1846", invNo: "INV-2377", account: "Meridian", accountId: meridian.id,
    buyerId: buyerMeridian.id, skus: ["LX-0503", "LX-0655"], orderStatus: ORDER_STATUS.PACKING,
    invStatus: INVOICE_STATUS.SENT, fulStatus: "PACKING", shipByMs: 12 * hour, dueMs: 9 * day,
    poNumber: "MI-2026-0139", checklistDone: 2,
  });
  await makeFulfilledOrder({
    orderNo: "ORD-1842", invNo: "INV-2374", account: "Meridian", accountId: meridian.id,
    buyerId: buyerMeridian.id, skus: ["LX-0198", "LX-0521"], orderStatus: ORDER_STATUS.SHIPPED,
    invStatus: INVOICE_STATUS.OVERDUE, fulStatus: "SHIPPED", shipByMs: -6 * day, dueMs: -7 * day,
    poNumber: "MI-2026-0131", carrier: "FERRARI GRP", tracking: "FG-4471-8890-X1",
    shippedMs: -8 * day, checklistDone: 4,
  });

  // A PAID historical invoice (the bundle) + a couple more paid, for dashboard stats
  await makeFulfilledOrder({
    orderNo: "ORD-1820", invNo: "INV-2350", account: "Meridian", accountId: meridian.id,
    buyerId: buyerMeridian.id, skus: ["LX-0466", "LX-0571", "LX-0560"], orderStatus: ORDER_STATUS.SHIPPED,
    invStatus: INVOICE_STATUS.PAID, fulStatus: "SHIPPED", shipByMs: -40 * day, dueMs: -12 * day,
    carrier: "MALCA-AMIT", tracking: "MA-2231-7788", shippedMs: -42 * day, checklistDone: 4,
    paidMs: -18 * day,
  });
  await makeFulfilledOrder({
    orderNo: "ORD-1798", invNo: "INV-2331", account: "Meridian", accountId: meridian.id,
    buyerId: buyerMeridian.id, skus: ["LX-0763", "LX-0781"], orderStatus: ORDER_STATUS.SHIPPED,
    invStatus: INVOICE_STATUS.PAID, fulStatus: "SHIPPED", shipByMs: -70 * day, dueMs: -44 * day,
    carrier: "FERRARI GRP", tracking: "FG-1180-3321", shippedMs: -72 * day, checklistDone: 4,
    paidMs: -50 * day,
  });

  // A pure DRAFT invoice for Meridian (pieces on hold, no fulfillment)
  const draftOrder = await prisma.order.create({
    data: {
      number: "ORD-1856", accountId: meridian.id, buyerId: buyerMeridian.id,
      status: ORDER_STATUS.CART, poNumber: null,
      items: { create: [] },
    },
  });
  await prisma.invoice.create({
    data: {
      number: "INV-2344", accountId: meridian.id, orderId: draftOrder.id, status: INVOICE_STATUS.DRAFT,
      subtotal: 5725, shipping: 185, total: 5910, dueDate: null,
      lineItems: JSON.stringify([
        { name: "Boulle Marquetry Coffret", sku: "LX-0588", price: 7800 },
      ]),
    },
  });

  // ---- video call requests (pending, for Adele) ----
  await prisma.videoCallRequest.createMany({
    data: [
      {
        productId: pid("LX-0417"), buyerId: buyerMeridian.id, repId: adele.id,
        requestedSlot: "Tue 14 · 11:30 EST",
        note: "Client is interested in the interior fitting — please show the hinge detail and painter's mark.",
        status: CALL_STATUS.PENDING,
      },
      {
        productId: pid("LX-0512"), buyerId: buyerAurelia.id, repId: adele.id,
        requestedSlot: "Wed 15 · 09:00 EST", note: "Assessing for a lobby installation.",
        status: CALL_STATUS.PENDING,
      },
      {
        productId: pid("LX-0231"), buyerId: buyerMeridian.id, repId: adele.id,
        requestedSlot: "proposed 3 times", note: "Patina questions.", status: CALL_STATUS.RESCHEDULE,
      },
    ],
  });

  // ---- leads (every tier + status), auto-routed ----
  const leadRows: Array<[string, string, number, number, string, string, string]> = [
    // [account, industry, estAnnual, tier, status, repEmail, reason]
    ["Hotel Aurelia Group", "hospitality", 120000, 1, LEAD_STATUS.NEW, "rep@luxesupply.co", "Tier 1 → senior rep (Adele Fontaine)"],
    ["Atelier Rousseau", "gallery", 61000, 1, LEAD_STATUS.WON, "jonas@luxesupply.co", "Tier 1 → senior rep (Jonas Keller)"],
    ["Castellane & Co.", "interior design", 34000, 2, LEAD_STATUS.CONTACTED, "marcus@luxesupply.co", "Tier 2 → round-robin (Marcus Webb)"],
    ["Blackwood Estates", "private buyer", 8000, 3, LEAD_STATUS.QUALIFYING, "priya@luxesupply.co", "Tier 3 → round-robin (Priya Nair)"],
    ["Maison Lévêque", "gallery", 74000, 1, LEAD_STATUS.CONTACTED, "rep@luxesupply.co", "Tier 1 → senior rep (Adele Fontaine)"],
    ["The Ashford Hotel", "hospitality", 22000, 2, LEAD_STATUS.NEW, "ruth@luxesupply.co", "Tier 2 → round-robin (Ruth Alvarez)"],
    ["Corbet Design Studio", "interior design", 6500, 3, LEAD_STATUS.LOST, "priya@luxesupply.co", "Tier 3 → round-robin (Priya Nair)"],
    ["Vanterpool Collection", "private buyer", 15500, 2, LEAD_STATUS.QUALIFYING, "marcus@luxesupply.co", "Tier 2 → round-robin (Marcus Webb)"],
    ["Delacroix Interiors", "interior design", 52000, 1, LEAD_STATUS.NEW, "jonas@luxesupply.co", "Tier 1 → senior rep (Jonas Keller)"],
    ["Harlow & Finch", "gallery", 4200, 3, LEAD_STATUS.NEW, "ruth@luxesupply.co", "Tier 3 → round-robin (Ruth Alvarez)"],
  ];
  const repByEmail = Object.fromEntries(reps.map((r) => [r.email, r.id]));
  for (const [account, industry, spend, tier, status, repEmail, reason] of leadRows) {
    await prisma.lead.create({
      data: {
        accountName: account, industry, estAnnualSpend: spend, tier, status,
        assignedRepId: repByEmail[repEmail], routedReason: reason,
        createdAt: from(-Math.floor(Math.random() * 6) * day - Math.floor(Math.random() * 20) * hour),
      },
    });
  }

  console.log("Seed complete.");
  const counts = {
    users: await prisma.user.count(),
    accounts: await prisma.account.count(),
    products: await prisma.product.count(),
    bundles: await prisma.bundle.count(),
    orders: await prisma.order.count(),
    invoices: await prisma.invoice.count(),
    leads: await prisma.lead.count(),
    calls: await prisma.videoCallRequest.count(),
    fulfillment: await prisma.fulfillmentTask.count(),
  };
  console.table(counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
