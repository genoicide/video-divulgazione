// Carica la configurazione: config.json (condivisa) + profilo scelto in config.local.json.
// Eventuali altri valori in config.local.json sovrascrivono quelli del profilo.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const radice = join(dirname(fileURLToPath(import.meta.url)), "..");

// Legge un file JSON ignorando le righe di commento che iniziano con //
const leggiJson = (file) =>
  JSON.parse(readFileSync(file, "utf8").split(/\r?\n/).filter((r) => !r.trim().startsWith("//")).join("\n"));

const unisci = (base, extra) => {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra ?? {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? unisci(base?.[k] ?? {}, v) : v;
  }
  return out;
};

export function caricaConfig() {
  const fileBase = join(radice, "config.json");
  const fileLocale = join(radice, "config.local.json");
  if (!existsSync(fileBase)) throw new Error("config.json non trovato nella cartella del progetto.");
  if (!existsSync(fileLocale))
    throw new Error('config.local.json non trovato: copia config.local.setup.json in config.local.json e scrivi il profilo ("studio" o "portatile").');

  const { profili = {}, _nota: _n1, ...base } = leggiJson(fileBase);
  const { profilo, _nota: _n2, ...extra } = leggiJson(fileLocale);
  if (!profilo) throw new Error('In config.local.json manca "profilo".');
  if (!profili[profilo])
    throw new Error(`Profilo "${profilo}" non valido: apri config.local.json e scrivi uno tra: ${Object.keys(profili).join(", ")}.`);

  return { profilo, ...unisci(unisci(base, profili[profilo]), extra) };
}
