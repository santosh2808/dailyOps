import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// One-time data-population script — NOT run automatically. Creates or
// updates the 8 SPYRO HVLS fan-size Products with their exact Annexure-I
// technical specifications, taken directly from the customer's own
// "Format <N> ft dia.doc" reference documents (all 8 sizes: 8/10/12/14/16/
// 18/20/24 ft). Matched by `sku` (SPYRO-<size>) — safe to re-run; it
// updates the existing row instead of duplicating it if a product with
// that sku already exists.
//
// `price`/`standardPrice` are now set from the customer's revised price
// list effective 1st April 2026 (excludes installation, transportation, and
// GST — those are handled separately: installation is auto-computed by
// QuotationsService at Rs.8,000/fan, transportation is entered manually per
// quotation). `price` is what auto-fills unitPrice when this product is
// picked on a quotation; `standardPrice` is the reference the Approval
// Matrix's discount-% check compares against. `minPrice` is intentionally
// left unset — no floor price has been specified for these models yet, set
// it yourself via the Products screen if/when one is decided.
// A 22 ft size also appears on the new price list (Rs.1,43,000) but has no
// technical spec sheet yet, so it's deliberately NOT included here — add it
// once its Annexure-I spec sheet is available.
//
// Run with: npx ts-node prisma/seed-hvls-products.ts
// (or: npm run seed:hvls-products, if that script has been added to
// package.json)

interface HvlsProductSeed {
  sku: string;
  name: string;
  price: number;
  technicalSpec: Record<string, unknown>;
}

const COMMON = {
  frameStructure: 'M.S. (Powder Coated)',
  hangingStructure: 'M.S. (Powder Coated)',
  fasteners: 'High Tensile 10.9 Grade HEX Bolts (Unbrako / TVS make)',
  bladeDesign: 'Cambered Aerofoil Design',
  bladeMoc: 'Aluminium 6063 (Matte Silver Anodised)',
  driveType: 'Direct Driven PMSM Type',
  controlPanelMounting: 'Wall Mounting 3-5 Ft. from Floor Level',
  controlPanelEnclosure: 'IP 43, Power Coated Steel Cabinet',
  bmsCompatibility: 'BMS Compatibility',
  safetyCertification: 'Compliance to CE Requirements',
  boltedJoints:
    'All Nuts are self locking type Nylock Nuts or Thread Locked with Loctite. As additional Safety All bolted joints are wrapped with SS Wire Rope.',
  frequency: '50/60',
  noOfBlades: '5 Nos.',
  noise: '<45db',
};

const PRODUCTS: HvlsProductSeed[] = [
  {
    sku: 'SPYRO-8',
    name: 'HVLS Fan - SPYRO 8 (8 ft)',
    price: 104000,
    technicalSpec: {
      ...COMMON,
      modelNo: 'SPYRO 8',
      fanSize: '8 ft. (2.5 M)',
      airVolume: '3,250 CMM; (120,000 CFM)',
      coverageArea: '1,257 ft²',
      motorRating: '0.37 kw (0.5 HP)',
      speed: '125 rpm',
      weight: '90 kg',
      threePhaseVoltage: '410',
      threePhaseCurrent: '1.4',
      onePhaseVoltage: '235',
      onePhaseCurrent: '4.3',
      bladeSectionalWidth: '160 mm',
      controlPanelDrive: 'Reputed Make',
      warrantyMotor: '36 months from the date of erection',
      warrantyDrive: '12 months from the date of erection (Regulator)',
      warrantyOther: '60 months from the date of erection (Electrical cable & Wings)',
      scopeOfSupply: [
        { item: 'Hanging Pipe', quantityPerFan: '01 No. (2 Mtr length)' },
        { item: 'Motor', quantityPerFan: '01 No.' },
        { item: 'Blade Mounting Hub', quantityPerFan: '01 No.' },
        { item: 'Blades', quantityPerFan: '05 Nos.' },
        { item: 'Control Panel with VFD', quantityPerFan: '01 Set' },
        { item: 'Guy Wire', quantityPerFan: '100 Ft.' },
        { item: 'Power Cable', quantityPerFan: '50 Mtr.' },
        { item: 'Paint', quantityPerFan: 'Standard Aluminum metal coat' },
        { item: 'Hardware', quantityPerFan: '01 Set' },
      ],
    },
  },
  {
    sku: 'SPYRO-10',
    name: 'HVLS Fan - SPYRO 10 (10 ft)',
    price: 105600,
    technicalSpec: {
      ...COMMON,
      modelNo: 'SPYRO 10',
      fanSize: '10 ft. (3 M)',
      airVolume: '5100 CMM; (180,000 CFM)',
      coverageArea: '1,963 ft²',
      motorRating: '0.56 kw; (0.75 HP)',
      speed: '110 rpm',
      weight: '90 kg',
      threePhaseVoltage: '410',
      threePhaseCurrent: '1.8',
      onePhaseVoltage: '235',
      onePhaseCurrent: '5.5',
      bladeSectionalWidth: '220 mm',
      controlPanelDrive: 'CG Emotron / Veichi',
      warrantyMotor: '36 months from the date of erection',
      warrantyDrive: '12 months from the date of erection',
      warrantyOther: '60 months from the date of erection',
      scopeOfSupply: [
        { item: 'Hanging Pipe', quantityPerFan: '2 ft long' },
        { item: 'Hanging Structure', quantityPerFan: 'Customer to confirm' },
        { item: 'Motor', quantityPerFan: '01 No.' },
        { item: 'Blade Mounting Hub', quantityPerFan: '01 No.' },
        { item: 'Blades', quantityPerFan: '05 Nos.' },
        { item: 'Control Panel with VFD', quantityPerFan: '01 Set' },
        { item: 'Guy Wire', quantityPerFan: '100 Ft.' },
        { item: 'Power Cable', quantityPerFan: '25 RMT' },
        { item: 'Paint', quantityPerFan: 'Aluminum Metal color' },
        { item: 'Hardware', quantityPerFan: '01 Set' },
      ],
    },
  },
  {
    sku: 'SPYRO-12',
    name: 'HVLS Fan - SPYRO 12 (12 ft)',
    price: 111600,
    technicalSpec: {
      ...COMMON,
      modelNo: 'SPYRO 12',
      fanSize: '12 ft. (3.7 M)',
      airVolume: '5700 CMM; (200,000 CFM)',
      coverageArea: '2,827 ft²',
      motorRating: '0.56 kW; (0.75 HP)',
      speed: '92 rpm',
      weight: '95 kg',
      threePhaseVoltage: '410',
      threePhaseCurrent: '1.9',
      onePhaseVoltage: '235',
      onePhaseCurrent: '5.8',
      bladeSectionalWidth: '220 mm',
      controlPanelDrive: 'CG Emotron / Veichi',
      warrantyMotor: '36 months from the date of erection',
      warrantyDrive: '12 months from the date of erection',
      warrantyOther: '60 months from the date of erection',
      scopeOfSupply: [
        { item: 'Hanging Pipe', quantityPerFan: '01 No. (2 ft length)' },
        { item: 'Hanging Structure', quantityPerFan: 'Customer to confirm' },
        { item: 'Motor', quantityPerFan: '01 No.' },
        { item: 'Blade Mounting Hub', quantityPerFan: '01 No.' },
        { item: 'Blades', quantityPerFan: '05 Nos.' },
        { item: 'Control Panel with VFD', quantityPerFan: '01 Set' },
        { item: 'Guy Wire', quantityPerFan: '100 Ft.' },
        { item: 'Power Cable', quantityPerFan: '25 RMT' },
        { item: 'Paint', quantityPerFan: 'Aluminum Metal color' },
        { item: 'Hardware', quantityPerFan: '01 Set' },
      ],
    },
  },
  {
    sku: 'SPYRO-14',
    name: 'HVLS Fan - SPYRO 14 (14 ft)',
    price: 115200,
    technicalSpec: {
      ...COMMON,
      modelNo: 'SPYRO 14',
      fanSize: '14 ft. (4.3 M)',
      airVolume: '6650 CMM; (240,000 CFM)',
      coverageArea: '3,848 ft²',
      motorRating: '0.75 kw; (1 HP)',
      speed: '80 rpm',
      weight: '102 kg',
      threePhaseVoltage: '410',
      threePhaseCurrent: '2.3',
      onePhaseVoltage: '235',
      onePhaseCurrent: '7',
      bladeSectionalWidth: '220 mm',
      controlPanelDrive: 'Reputed Make',
      warrantyMotor: '36 months from the date of erection',
      warrantyDrive: '12 months from the date of erection',
      warrantyOther: '60 months from the date of erection',
      scopeOfSupply: [
        { item: 'Hanging Pipe', quantityPerFan: '01 No. (2 ft length)' },
        { item: 'Motor', quantityPerFan: '01 No.' },
        { item: 'Blade Mounting Hub', quantityPerFan: '01 No.' },
        { item: 'Blades', quantityPerFan: '05 Nos.' },
        { item: 'Control Panel with VFD', quantityPerFan: '01 Set' },
        { item: 'Guy Wire', quantityPerFan: '100 Ft.' },
        { item: 'Power Cable', quantityPerFan: '25 Mtrs' },
        { item: 'Paint', quantityPerFan: 'Standard Aluminum metal coat' },
        { item: 'Hardware', quantityPerFan: '01 Set' },
      ],
    },
  },
  {
    sku: 'SPYRO-16',
    name: 'HVLS Fan - SPYRO 16 (16 ft)',
    price: 122500,
    technicalSpec: {
      ...COMMON,
      modelNo: 'SPYRO 16',
      fanSize: '16 ft. (4.9 M)',
      airVolume: '7250 CMM; (260,000 CFM)',
      coverageArea: '5,027 ft²',
      motorRating: '1.1 kw; (1.5 HP)',
      speed: '70 rpm',
      weight: '110 kg',
      threePhaseVoltage: '410',
      threePhaseCurrent: '2.4',
      onePhaseVoltage: '235',
      onePhaseCurrent: '7.3',
      bladeSectionalWidth: '220 mm',
      controlPanelDrive: 'CG Emotron / Veichi',
      warrantyMotor: '36 months from the date of erection',
      warrantyDrive: '12 months from the date of erection',
      warrantyOther: '60 months from the date of erection',
      scopeOfSupply: [
        { item: 'Hanging Pipe (Down Rod)', quantityPerFan: '01 No. (2 ft length)' },
        { item: 'Hanging Structure', quantityPerFan: 'Customer to confirm' },
        { item: 'Motor', quantityPerFan: '01 No.' },
        { item: 'Blade Mounting Hub', quantityPerFan: '01 No.' },
        { item: 'Blades', quantityPerFan: '05 Nos.' },
        { item: 'Control Panel with VFD', quantityPerFan: '01 Set' },
        { item: 'Guy Wire', quantityPerFan: '100 Ft.' },
        { item: 'Power Cable', quantityPerFan: '25 RMT (Control Panel to Fan only)' },
        { item: 'Paint', quantityPerFan: 'BLACK COLOUR' },
        { item: 'Hardware', quantityPerFan: '01 Set' },
      ],
    },
  },
  {
    sku: 'SPYRO-18',
    name: 'HVLS Fan - SPYRO 18 (18 ft)',
    price: 125000,
    technicalSpec: {
      ...COMMON,
      modelNo: 'SPYRO 18',
      fanSize: '18 ft. (5.5 M)',
      airVolume: '11000 CMM; (390,000 CFM)',
      coverageArea: '6,362 ft²',
      motorRating: '1.1 kw; (1.5 HP)',
      speed: '70 rpm',
      weight: '120 kg',
      threePhaseVoltage: '410',
      threePhaseCurrent: '3.1',
      onePhaseVoltage: '235',
      onePhaseCurrent: '9.4',
      bladeSectionalWidth: '220 mm',
      controlPanelDrive: 'CG Emotron / Veichi',
      warrantyMotor: '36 months from the date of erection',
      warrantyDrive: '12 months from the date of erection',
      warrantyOther: '60 months from the date of erection',
      scopeOfSupply: [
        { item: 'Hanging Pipe', quantityPerFan: '01 No. (2 ft length)' },
        { item: 'Hanging Structure', quantityPerFan: 'Customer to confirm' },
        { item: 'Motor', quantityPerFan: '01 No.' },
        { item: 'Blade Mounting Hub', quantityPerFan: '01 No.' },
        { item: 'Blades', quantityPerFan: '05 Nos.' },
        { item: 'Control Panel with VFD', quantityPerFan: '01 Set' },
        { item: 'Guy Wire', quantityPerFan: '100 Ft.' },
        { item: 'Power Cable', quantityPerFan: '25 RMT' },
        { item: 'Paint', quantityPerFan: 'Aluminum Metal color' },
        { item: 'Hardware', quantityPerFan: '01 Set' },
      ],
    },
  },
  {
    sku: 'SPYRO-20',
    name: 'HVLS Fan - SPYRO 20 (20 ft)',
    price: 142000,
    technicalSpec: {
      ...COMMON,
      modelNo: 'SPYRO 20',
      fanSize: '20 ft. (6.1 M) Dia',
      airVolume: '11,900 CMM; (420,000 CFM)',
      coverageArea: '7,854 ft²',
      motorRating: '1.1 kW; (1.5 HP)',
      speed: '60 rpm',
      weight: '130 kg',
      threePhaseVoltage: '410',
      threePhaseCurrent: '3.2',
      onePhaseVoltage: '235',
      onePhaseCurrent: '9.7',
      bladeSectionalWidth: '220 mm',
      controlPanelDrive: 'CG Emotron / Veichi',
      warrantyMotor: '36 months from the date of erection',
      warrantyDrive: '12 months from the date of erection',
      warrantyOther: '60 months from the date of erection',
      scopeOfSupply: [
        { item: 'Hanging Pipe', quantityPerFan: '01 No. (2 ft length)' },
        { item: 'Hanging Structure', quantityPerFan: 'Customer to confirm' },
        { item: 'Motor', quantityPerFan: '01 No.' },
        { item: 'Blade Mounting Hub', quantityPerFan: '01 No.' },
        { item: 'Blades', quantityPerFan: '05 Nos.' },
        { item: 'Control Panel with VFD', quantityPerFan: '01 Set' },
        { item: 'Guy Wire', quantityPerFan: '100 Ft.' },
        { item: 'Power Cable', quantityPerFan: '25 RMT' },
        { item: 'Paint', quantityPerFan: 'Aluminum Metal color' },
        { item: 'Hardware', quantityPerFan: '01 Set' },
      ],
    },
  },
  {
    sku: 'SPYRO-24',
    name: 'HVLS Fan - SPYRO 24 (24 ft)',
    price: 146000,
    technicalSpec: {
      ...COMMON,
      modelNo: 'SPYRO 24',
      fanSize: '24 ft. (7.3 M)',
      airVolume: '15,500 CMM (550,000 CFM)',
      coverageArea: '11,310 ft²',
      motorRating: '1.5 kW; (2 HP)',
      // NOTE: the source "Format 24 ft dia.doc" has a row-shift error in its
      // own spec table (Speed/Noise/Weight/Vol/Current values are each
      // printed one row below their correct label). Values below are the
      // corrected ones — cross-checked against the smooth progression across
      // all 8 sizes (e.g. current climbs 1.4 -> 1.8 -> 1.9 -> 2.3 -> 2.4 ->
      // 3.1 -> 3.2 -> 4.1A; weight climbs 90 -> 90 -> 95 -> 102 -> 110 -> 120
      // -> 130 -> 160kg), not copied verbatim from the misaligned table.
      speed: '54 rpm',
      weight: '160 kg',
      threePhaseVoltage: '410',
      threePhaseCurrent: '4.1',
      onePhaseVoltage: '235',
      onePhaseCurrent: '12.4',
      bladeSectionalWidth: '220 mm',
      controlPanelDrive: 'CG Emotron / Veichi',
      warrantyMotor: '36 months from the date of erection',
      warrantyDrive: '12 months from the date of erection',
      warrantyOther: '60 months from the date of erection',
      scopeOfSupply: [
        { item: 'Hanging Pipe', quantityPerFan: '01 No. (2 ft length)' },
        { item: 'Motor', quantityPerFan: '01 No.' },
        { item: 'Blade Mounting Hub', quantityPerFan: '01 No.' },
        { item: 'Blades', quantityPerFan: '05 Nos.' },
        { item: 'Control Panel with VFD', quantityPerFan: '01 Set' },
        { item: 'Guy Wire', quantityPerFan: '100 Ft.' },
        { item: 'Power Cable', quantityPerFan: '25 Mtrs.' },
        { item: 'Paint', quantityPerFan: 'Standard Aluminum metal coat' },
        { item: 'Hardware', quantityPerFan: '01 Set' },
      ],
    },
  },
];

async function main() {
  for (const p of PRODUCTS) {
    const existing = await prisma.product.findFirst({ where: { sku: p.sku } });
    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          name: p.name,
          category: 'HVLS Fans',
          price: p.price,
          standardPrice: p.price,
          technicalSpec: p.technicalSpec as Prisma.InputJsonValue,
        },
      });
      console.log(`Updated ${p.sku} (${p.name}) — price Rs.${p.price}`);
    } else {
      await prisma.product.create({
        data: {
          sku: p.sku,
          name: p.name,
          category: 'HVLS Fans',
          price: p.price,
          standardPrice: p.price,
          technicalSpec: p.technicalSpec as Prisma.InputJsonValue,
        },
      });
      console.log(`Created ${p.sku} (${p.name}) — price Rs.${p.price}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
