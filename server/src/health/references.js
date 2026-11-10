/**
 * Evidence layer. Every indicator carries (a) the BASIS of its thresholds, (b) the published work it leans on,
 * and (c) the drift-detection parameters. Thresholds here are DEFAULTS chosen from the literature and clinical
 * convention; real mission limits from a flight surgeon always override them (see docs/VALIDATION.md).
 *
 * basis:
 *   'clinical'      Earth clinical convention (e.g. SpO2 < 92 %, fasting glucose bands).
 *   'nasa-informed' range or direction informed by spaceflight literature; exact cut-offs are Astra defaults.
 *   'heuristic'     Astra default with no published spaceflight limit — shown as such in the UI.
 */
export const REFERENCES = {
  R1: { cite: 'NASA Human Research Program. Human Research Roadmap — Hazards of Human Spaceflight (RIDGE).', url: 'https://www.nasa.gov/hrp/hazards' },
  R2: { cite: 'Garrett-Bakelman FE, et al. The NASA Twins Study: a multidimensional analysis of a year-long human spaceflight. Science 364(6436):eaau8650, 2019.' },
  R3: { cite: 'Lang T, et al. Cortical and trabecular bone mineral loss from the spine and hip in long-duration spaceflight. J Bone Miner Res 19(6):1006–1012, 2004.' },
  R4: { cite: 'Smith SM, et al. Benefits for bone from resistance exercise and nutrition in long-duration spaceflight: evidence from biochemistry and densitometry. J Bone Miner Res 27(9):1896–1906, 2012.' },
  R5: { cite: 'Barger LK, et al. Prevalence of sleep deficiency and use of hypnotic drugs in astronauts before, during, and after spaceflight. Lancet Neurol 13(9):904–912, 2014.' },
  R6: { cite: 'Law J, et al. Relationship between carbon dioxide levels and reported headaches on the International Space Station. J Occup Environ Med 56(5):477–483, 2014.' },
  R7: { cite: 'Mader TH, et al. Optic disc edema, globe flattening, choroidal folds, and hyperopic shifts observed in astronauts after long-duration space flight. Ophthalmology 118(10):2058–2069, 2011.' },
  R8: { cite: 'Cucinotta FA, et al. Space radiation cancer risks and uncertainties for Mars missions. Radiat Res 156(5):682–688, 2001.' },
  R9: { cite: 'Mehta SK, et al. Latent virus reactivation in astronauts on the International Space Station. npj Microgravity 3:11, 2017.' },
  R10: { cite: 'Smith SM, Zwart SR, Heer M (eds). Human Adaptation to Spaceflight: The Role of Nutrition. NASA, 2014.' },
  R11: { cite: 'Norsk P, et al. Fluid shifts, vasodilatation and ambulatory blood pressure reduction during long duration spaceflight. J Appl Physiol, 2015.' },
  R12: { cite: 'Smith SM, et al. Vitamin D supplementation during long-duration spaceflight. Am J Clin Nutr 89(4):1092–1098, 2009.' },
  R14: { cite: 'Crucian BE, et al. Immune system dysregulation during spaceflight: potential countermeasures for deep space exploration missions. Front Immunol 9:1437, 2018.' },
  R15: { cite: 'Trudel G, et al. Hemolysis contributes to anemia during long-duration space flight. Nat Med 28:59–62, 2022.' },
  R16: { cite: 'NASA Open Science Data Repository, study OSD-569 (Inspiration4 whole blood, complete blood count). Reference ranges as printed in the dataset.', url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569' },
  R13: { cite: 'Stahn AC, et al. Increased core body temperature in astronauts during long-duration space missions. Sci Rep 7:16180, 2017.' },
};

export const EVIDENCE = {
  recovery: { basis: 'heuristic', refs: [], drift: { bad: 'low', minPct: 15 }, note: 'WHOOP recovery is a proprietary score and is not validated in microgravity — Astra only judges its change against your own baseline.' },
  hrv:      { basis: 'heuristic', refs: ['R2'], drift: { bad: 'low', minPct: 5 }, note: 'No published spaceflight HRV limit exists, so Astra uses no absolute HRV threshold — only % change from your own baseline.' },
  rhr:      { basis: 'clinical', refs: [], drift: { bad: 'high', minPct: 4 }, note: 'Earth clinical resting-HR range; trend vs your baseline is the early signal.' },
  spo2:     { basis: 'clinical', refs: [], drift: { bad: 'low', minPct: 1.5 }, note: 'SpO₂ < 92 % is the standard clinical hypoxaemia cut-off.' },
  sleep:    { basis: 'nasa-informed', refs: ['R5'], drift: { bad: 'low', minPct: 6 }, note: 'Barger et al. report astronauts averaging about 6 h of sleep in flight; 7 h+ is the Earth adult target.' },
  strain:   { basis: 'heuristic', refs: ['R4'], drift: null, note: 'Used as a proxy for whether the exercise countermeasure was performed.' },
  bp:       { basis: 'nasa-informed', refs: ['R11'], drift: { bad: 'high', minPct: 4 }, note: '≥ 140/90 is the clinical hypertension cut-off. In flight, blood pressure is often lower than on Earth, so a rise vs your own baseline matters.' },
  glucose:  { basis: 'clinical', refs: ['R2'], drift: { bad: 'high', minPct: 6 }, note: 'Fasting-glucose bands follow Earth clinical convention.' },
  temp:     { basis: 'nasa-informed', refs: ['R13'], drift: { bad: 'high', minPct: 0.5 }, note: 'Stahn et al. found core temperature rises during long-duration missions, so a resting reading above your baseline is watched closely.' },
  weight:   { basis: 'nasa-informed', refs: ['R10'], drift: { bad: 'low', minPct: 1.5 }, note: 'Spaceflight nutrition research links inadequate intake to body-mass loss; > 5 % loss from baseline is the red line.' },
  mood:     { basis: 'heuristic', refs: ['R1'], drift: { bad: 'low', minPct: 10 }, note: 'Behavioural health is a NASA hazard (isolation & confinement). Self-rated mood is judged mainly by trend; low scores prompt a private conference.' },
  ntx:      { basis: 'nasa-informed', refs: ['R4', 'R3'], drift: { bad: 'high', minPct: 5 }, note: 'Urinary NTx is a bone-resorption marker that rises in flight; Lang et al. report roughly 1–1.5 % hip/spine bone loss per month.' },
  vitd:     { basis: 'nasa-informed', refs: ['R12'], drift: { bad: 'low', minPct: 15 }, note: 'No sunlight on board, so status depends on supplements (Smith et al.). 30 ng/mL sufficiency and 20 ng/mL deficiency follow clinical convention.' },
  radiation:{ basis: 'nasa-informed', refs: ['R8', 'R1'], drift: { bad: 'high', minPct: 40 }, note: 'Typical ISS dose is below 1 mSv/day; limits here are daily alert levels, not NASA career limits.' },
  co2:      { basis: 'nasa-informed', refs: ['R6', 'R7'], drift: { bad: 'high', minPct: 12 }, note: 'Law et al. link ISS CO₂ levels to reported headaches; CO₂ is also discussed as a contributor to SANS. The 3/4 mmHg cut-offs are Astra defaults — replace with mission limits.' },
  hgb:      { basis: 'clinical', refs: ['R15', 'R16'], drift: { bad: 'low', minPct: 5 }, note: 'Green range follows the lab reference ranges printed in OSD-569 (male and female ranges combined); Trudel et al. show red-cell destruction rises in long-duration flight.' },
  wbc:      { basis: 'clinical', refs: ['R14', 'R16'], drift: null, note: 'Reference range from the OSD-569 lab report. Judged against the range only: the count can move either way, and short real datasets have too few points for trend detection.' },
  lymph:    { basis: 'clinical', refs: ['R14', 'R16'], drift: { bad: 'low', minPct: 15 }, note: 'Reference range from the OSD-569 lab report; Crucian et al. review immune-cell changes in flight.' },
  plt:      { basis: 'clinical', refs: ['R16'], drift: null, note: 'Reference range from the OSD-569 lab report.' },
  exercise: { basis: 'nasa-informed', refs: ['R4'], drift: null, note: 'Daily resistive + aerobic exercise is the main bone and muscle countermeasure (Smith et al.).' },
};

export const BASIS_LABEL = {
  clinical: 'Earth clinical convention',
  'nasa-informed': 'Informed by spaceflight research',
  heuristic: 'Astra default (no published limit)',
};
