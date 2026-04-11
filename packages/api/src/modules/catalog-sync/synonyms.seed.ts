/**
 * Seed list of synonyms for Dominican Republic pharmacy context.
 * Maps brand names to generic names so customers asking for "dolex"
 * also find products containing "acetaminofen".
 *
 * Bidirectional: Meilisearch treats each key's synonyms as interchangeable,
 * so "dolex" → ["acetaminofen", "paracetamol", ...] means querying any of
 * those terms will find results for the others.
 */
export const PHARMACY_SYNONYMS: Record<string, string[]> = {
  // Acetaminofén / Paracetamol
  acetaminofen: ['paracetamol', 'dolex', 'panadol', 'tempra', 'tylenol', 'dolomate'],
  paracetamol: ['acetaminofen', 'dolex', 'panadol', 'tempra', 'tylenol'],
  dolex: ['acetaminofen', 'paracetamol'],
  panadol: ['acetaminofen', 'paracetamol'],
  tempra: ['acetaminofen', 'paracetamol'],
  tylenol: ['acetaminofen', 'paracetamol'],

  // Ibuprofeno
  ibuprofeno: ['advil', 'motrin', 'dolanex', 'brufen'],
  advil: ['ibuprofeno', 'motrin'],
  motrin: ['ibuprofeno', 'advil'],
  brufen: ['ibuprofeno'],

  // Naproxeno
  naproxeno: ['flanax', 'apronax'],
  flanax: ['naproxeno'],
  apronax: ['naproxeno'],

  // Aspirina
  aspirina: ['acido acetilsalicilico', 'bayer'],

  // Diclofenac
  diclofenac: ['voltaren', 'cataflam', 'diclofenaco'],
  voltaren: ['diclofenac', 'diclofenaco'],

  // Loratadina
  loratadina: ['clarityne', 'claritin', 'alerfast'],
  clarityne: ['loratadina'],
  claritin: ['loratadina'],

  // Cetirizina
  cetirizina: ['zyrtec', 'reactine'],
  zyrtec: ['cetirizina'],

  // Desloratadina
  desloratadina: ['aerius', 'claramax'],
  aerius: ['desloratadina'],

  // Omeprazol
  omeprazol: ['prilosec', 'gastec', 'prazol'],
  prilosec: ['omeprazol'],
  gastec: ['omeprazol'],

  // Esomeprazol
  esomeprazol: ['nexium'],
  nexium: ['esomeprazol'],

  // Ranitidina
  ranitidina: ['zantac', 'ranisen'],
  zantac: ['ranitidina'],

  // Metoclopramida
  metoclopramida: ['plasil', 'primperan'],
  plasil: ['metoclopramida'],

  // Loperamida
  loperamida: ['imodium', 'diarsed'],
  imodium: ['loperamida'],

  // Amoxicilina
  amoxicilina: ['amoxil', 'amoxi'],
  amoxil: ['amoxicilina'],

  // Azitromicina
  azitromicina: ['zithromax', 'azimax', 'azitro'],
  zithromax: ['azitromicina'],

  // Ciprofloxacino
  ciprofloxacino: ['cipro', 'ciproxina'],
  cipro: ['ciprofloxacino'],

  // Metformina
  metformina: ['glucophage', 'glucofage', 'diabex'],
  glucophage: ['metformina'],
  glucofage: ['metformina'],

  // Enalapril
  enalapril: ['renitec', 'vasotec'],
  renitec: ['enalapril'],

  // Losartan
  losartan: ['cozaar', 'lorsacor'],
  cozaar: ['losartan'],

  // Amlodipino
  amlodipino: ['norvasc', 'amlor'],
  norvasc: ['amlodipino'],

  // Atorvastatina
  atorvastatina: ['lipitor', 'atorvas'],
  lipitor: ['atorvastatina'],

  // Simvastatina
  simvastatina: ['zocor'],
  zocor: ['simvastatina'],

  // Atenolol
  atenolol: ['tenormin'],

  // Clopidogrel
  clopidogrel: ['plavix'],
  plavix: ['clopidogrel'],

  // Warfarina
  warfarina: ['coumadin'],
  coumadin: ['warfarina'],

  // Levotiroxina
  levotiroxina: ['synthroid', 'eutirox'],
  synthroid: ['levotiroxina'],
  eutirox: ['levotiroxina'],

  // Sildenafil
  sildenafil: ['viagra'],
  viagra: ['sildenafil'],

  // Tadalafilo
  tadalafilo: ['cialis', 'tadal'],
  cialis: ['tadalafilo'],

  // Montelukast
  montelukast: ['singulair', 'telekast'],
  singulair: ['montelukast'],
  telekast: ['montelukast'],

  // Salbutamol
  salbutamol: ['ventolin', 'albuterol'],
  ventolin: ['salbutamol'],

  // Vitaminas
  'vitamina c': ['acido ascorbico', 'cebion'],
  cebion: ['vitamina c', 'acido ascorbico'],

  'complejo b': ['vitamina b', 'bedoyecta', 'neurobion'],
  bedoyecta: ['complejo b', 'vitamina b'],
  neurobion: ['complejo b', 'vitamina b'],

  hierro: ['sulfato ferroso', 'ferroso'],

  // Antimicóticos
  fluconazol: ['diflucan'],
  diflucan: ['fluconazol'],

  ketoconazol: ['nizoral'],
  nizoral: ['ketoconazol'],

  // Antihelmínticos
  albendazol: ['zentel'],
  zentel: ['albendazol'],

  mebendazol: ['vermox'],
  vermox: ['mebendazol'],

  // Colloquial / slang dominicano
  'pastilla dolor': ['analgesico', 'acetaminofen', 'ibuprofeno'],
  'pastilla presion': ['losartan', 'enalapril', 'amlodipino', 'hipertension'],
  'pastilla diabetes': ['metformina', 'glucofage'],
  'pastilla colesterol': ['atorvastatina', 'simvastatina', 'lipitor'],
  'jarabe tos': ['broncol', 'mucolitico', 'ambroxol'],
  'gotas niño': ['pediatric', 'pediatrico', 'infantil'],
  'crema pañal': ['pañalitis', 'dermatitis'],
};
