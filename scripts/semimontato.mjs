// Prepara il semimontato per DaVinci Resolve (o Filmora 16+): video gia' tagliato (timeline XML) e sottotitoli.
//   npm run semimontato -- 2026-11-23_prova
// Prerequisito: npm run trascrivi e npm run tagli
// Legge   <driveDir>\Girato\<episodio>\<video>  e  <driveDir>\Export\<episodio>\dati\  trascrizione.json, tagli.json (solo "attivo": true)
// Scrive  <driveDir>\Export\<episodio>\semimontato\  <episodio>.xml (timeline FCP7/XMEML) e <episodio>.srt (sottotitoli con i tempi del video tagliato)
// Il video originale non viene copiato ne' modificato: la timeline lo richiama dal suo percorso su Drive. Se il frame rate non e' standard, usa invece una copia a frame rate costante in workDir.
// In Filmora: File > Importa media > Importa timeline XML, poi importa l'SRT.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { caricaConfig } from "./config.mjs";

const fine = (m) => { console.error("\nERRORE: " + m); process.exit(1); };
const episodio = process.argv[2];
if (!episodio) fine("manca il nome dell'episodio. Esempio: npm run semimontato -- 2026-11-23_prova");

let c;
try { c = caricaConfig(); } catch (e) { fine(e.message); }
const sc = { caratteriMax: 40, durataMax: 3.5, pausaDivide: 0.5, ...(c.sottotitoli ?? {}) };

const dati = join(c.driveDir, "Export", episodio, "dati");
const fileTagli = join(dati, "tagli.json");
const fileTrascr = join(dati, "trascrizione.json");
if (!existsSync(fileTagli) || !existsSync(fileTrascr))
  fine(`mancano trascrizione o tagli: prima lancia npm run trascrivi -- ${episodio} e poi npm run tagli -- ${episodio}`);
const trascr = JSON.parse(readFileSync(fileTrascr, "utf8"));
const { tagli } = JSON.parse(readFileSync(fileTagli, "utf8"));
const videoOriginale = join(c.driveDir, "Girato", episodio, trascr.file);
if (!existsSync(videoOriginale)) fine(`video non trovato: ${videoOriginale}`);

// 1. Informazioni sul video (FFmpeg/ffprobe)
const pr = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,channels,sample_rate", "-of", "json", videoOriginale], { encoding: "utf8" });
if (pr.status !== 0) fine("ffprobe non riesce a leggere il video.");
const flussi = JSON.parse(pr.stdout).streams;
const v = flussi.find((s) => s.codec_type === "video");
const a = flussi.find((s) => s.codec_type === "audio");
if (!v) fine("il file non ha una traccia video.");
const [num, den] = v.r_frame_rate.split("/").map(Number);
let fps = num / (den || 1);
// XMEML sa descrivere solo frame rate standard (24, 25, 30, 50, 60 e i loro 1000/1001). Con un valore diverso
// (es. 31.579 fps, tipico di registrazioni da schermo o da telefono) i punti di taglio scivolerebbero:
// in quel caso si usa una copia a frame rate costante, in workDir (mai su Drive), e la timeline richiama quella.
const standard = [23.976, 24, 25, 29.97, 30, 47.952, 48, 50, 59.94, 60];
let video = videoOriginale;
if (!standard.some((f) => Math.abs(f - fps) < 0.01)) {
  const bersaglio = [24, 25, 30, 50, 60].reduce((m, f) => (Math.abs(f - fps) < Math.abs(m - fps) ? f : m));
  const copia = join(c.workDir, episodio, `${trascr.file.replace(/\.[^.]+$/, "")}_${bersaglio}fps.mp4`);
  console.log(`Frame rate non standard (${fps.toFixed(3)} fps): preparo una copia a ${bersaglio} fps costanti in ${copia}`);
  if (!existsSync(copia) || statSync(copia).mtimeMs < statSync(videoOriginale).mtimeMs) {
    mkdirSync(join(c.workDir, episodio), { recursive: true });
    const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", videoOriginale, "-vf", `fps=${bersaglio}`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", copia], { stdio: "inherit" });
    if (r.status !== 0) fine("la conversione a frame rate costante non e' riuscita.");
  }
  video = copia;
  fps = bersaglio;
}
const timebase = Math.round(fps);
const ntsc = Math.abs(timebase - fps) > 0.01;
const larghezza = v.width, altezza = v.height;
const canali = a ? Math.min(a.channels || 1, 2) : 0;
const campionamento = a ? Number(a.sample_rate) || 48000 : 48000;
const durataSorgente = Math.round(trascr.durata * fps);
console.log(`Video: ${larghezza}x${altezza}, ${fps.toFixed(3)} fps, audio ${canali ? canali + " can." : "assente"}`);

// 2. Parti da tenere, in fotogrammi (tutto cio' che sta fuori dai tagli attivi)
const attivi = tagli.filter((t) => t.attivo !== false).sort((x, y) => x.inizio - y.inizio);
const intervalli = [];
let cursore = 0;
for (const t of attivi) {
  if (t.inizio - cursore > 0.01) intervalli.push([cursore, t.inizio]);
  cursore = Math.max(cursore, t.fine);
}
if (trascr.durata - cursore > 0.01) intervalli.push([cursore, trascr.durata]);
const clip = [];
let t0 = 0;
for (const [x, y] of intervalli) {
  const dentro = Math.round(x * fps), fuori = Math.min(Math.round(y * fps), durataSorgente);
  if (fuori - dentro < 1) continue;
  clip.push({ dentro, fuori, inizio: t0, fine: t0 + (fuori - dentro) });
  t0 += fuori - dentro;
}
if (clip.length === 0) fine("tutti i tagli cancellano l'episodio intero: controlla tagli.json.");
const totale = t0;

// 3. Tempo del video originale -> tempo del video tagliato (in secondi, allineato ai fotogrammi)
const mappa = (sec) => {
  const f = sec * fps;
  for (const k of clip) {
    if (f < k.dentro) return k.inizio / fps;       // cade in una parte tagliata: va all'inizio della parte successiva
    if (f < k.fuori) return (k.inizio + (f - k.dentro)) / fps;
  }
  return totale / fps;
};

// 4. File XML (FCP7 / XMEML versione 4)
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rate = `<rate><timebase>${timebase}</timebase><ntsc>${ntsc ? "TRUE" : "FALSE"}</ntsc></rate>`;
const nomeVideo = video.split(/[\\/]/).pop();
const percorso = "file://localhost/" + video.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/").replace(/^([A-Za-z])%3A/, "$1:");
const fileDef = `<file id="file-1"><name>${esc(nomeVideo)}</name><pathurl>${esc(percorso)}</pathurl>${rate}<duration>${durataSorgente}</duration>` +
  `<timecode>${rate}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>` +
  `<media><video><samplecharacteristics>${rate}<width>${larghezza}</width><height>${altezza}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>` +
  (canali ? `<audio><samplecharacteristics><depth>16</depth><samplerate>${campionamento}</samplerate></samplecharacteristics><channelcount>${canali}</channelcount></audio>` : "") +
  `</media></file>`;

const collegamenti = (i) => {
  let s = `<link><linkclipref>clipitem-v-${i + 1}</linkclipref><mediatype>video</mediatype><trackindex>1</trackindex><clipindex>${i + 1}</clipindex></link>`;
  for (let ch = 1; ch <= canali; ch++)
    s += `<link><linkclipref>clipitem-a${ch}-${i + 1}</linkclipref><mediatype>audio</mediatype><trackindex>${ch}</trackindex><clipindex>${i + 1}</clipindex></link>`;
  return s;
};
const voce = (id, i, k, tipo, traccia) =>
  `<clipitem id="${id}"><masterclipid>masterclip-1</masterclipid><name>${esc(nomeVideo)}</name><enabled>TRUE</enabled>` +
  `<duration>${durataSorgente}</duration>${rate}<start>${k.inizio}</start><end>${k.fine}</end><in>${k.dentro}</in><out>${k.fuori}</out>` +
  (tipo === "video" && i === 0 ? fileDef : `<file id="file-1"/>`) +
  `<sourcetrack><mediatype>${tipo}</mediatype><trackindex>${traccia}</trackindex></sourcetrack>${collegamenti(i)}</clipitem>`;

const tracciaVideo = `<track>${clip.map((k, i) => voce(`clipitem-v-${i + 1}`, i, k, "video", 1)).join("")}</track>`;
let tracceAudio = "";
for (let ch = 1; ch <= canali; ch++)
  tracceAudio += `<track>${clip.map((k, i) => voce(`clipitem-a${ch}-${i + 1}`, i, k, "audio", ch)).join("")}</track>`;

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="4">` +
  `<sequence id="sequence-1"><name>${esc(episodio)}</name><duration>${totale}</duration>${rate}` +
  `<timecode>${rate}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>` +
  `<media><video><format><samplecharacteristics>${rate}<width>${larghezza}</width><height>${altezza}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format>${tracciaVideo}</video>` +
  (canali ? `<audio><numOutputChannels>${canali}</numOutputChannels><format><samplecharacteristics><depth>16</depth><samplerate>${campionamento}</samplerate></samplecharacteristics></format>${tracceAudio}</audio>` : "") +
  `</media></sequence></xmeml>\n`;

// 5. Sottotitoli: parole raggruppate in frasi brevi, con i tempi del video tagliato
const parole = trascr.segmenti.flatMap((s) => s.parole).filter((w) => w.p);
const gruppi = [];
let g = [];
const chiudi = () => { if (g.length) gruppi.push(g); g = []; };
parole.forEach((w, i) => {
  const testoCorrente = g.map((x) => x.p).join(" ");
  const supera = g.length && ((testoCorrente + " " + w.p).length > sc.caratteriMax || w.fine - g[0].inizio > sc.durataMax);
  const pausa = g.length && w.inizio - g[g.length - 1].fine > sc.pausaDivide;
  if (supera || pausa) chiudi();
  g.push(w);
  if (/[.?!]$/.test(w.p) && testoCorrente.length >= 12) chiudi();
});
chiudi();
const tempo = (s) => {
  const ms = Math.round(s * 1000), p = (n, l = 2) => String(n).padStart(l, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const righe = [];
for (const gr of gruppi) {
  const ini = mappa(gr[0].inizio), fin = mappa(gr[gr.length - 1].fine);
  if (fin - ini < 0.05) continue;
  righe.push(`${righe.length + 1}\n${tempo(ini)} --> ${tempo(fin)}\n${gr.map((x) => x.p).join(" ")}\n`);
}

// 6. Scrittura
const cartella = join(c.driveDir, "Export", episodio, "semimontato");
mkdirSync(cartella, { recursive: true });
writeFileSync(join(cartella, `${episodio}.xml`), xml, "utf8");
writeFileSync(join(cartella, `${episodio}.srt`), righe.join("\n"), "utf8");
console.log(`\nFatto: ${clip.length} clip, durata ${(totale / fps).toFixed(1)} s (originale ${trascr.durata.toFixed(1)} s), ${righe.length} sottotitoli.`);
console.log(`Risultati in: ${cartella}\n  ${episodio}.xml   timeline da importare (DaVinci Resolve: File > Import > Timeline)\n  ${episodio}.srt   sottotitoli con i tempi del video tagliato`);
