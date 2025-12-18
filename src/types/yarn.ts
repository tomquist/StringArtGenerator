
export type YarnType =
  | 'ticket'
  | 'nm'
  | 'tex'
  | 'dtex'
  | 'denier'
  | 'length_weight'
  | 'diameter_mm';

export type YarnMaterial = 'polyester' | 'cotton' | 'nylon' | 'unknown';

export type YarnSpec = {
  type: YarnType;
  material: YarnMaterial;
  k?: number; // Visual thickness multiplier (default 1.10)
  overrideDiameterMM?: number; // Optional override

  // Values based on type
  ticketNo?: number;
  nm?: number;
  ply?: number; // Used for Nm, dtex, Denier
  tex?: number;
  dtex?: number;
  denier?: number;
  meters?: number;
  grams?: number;
  diameterMM?: number;
};
