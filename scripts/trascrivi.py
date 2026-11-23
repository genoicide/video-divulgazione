# Trascrive un file audio con faster-whisper e salva segmenti e parole con i tempi in un file JSON.
# Si lancia da scripts/trascrivi.mjs (npm run trascrivi), non a mano.
import argparse
import json
import time

from faster_whisper import WhisperModel


def main():
    a = argparse.ArgumentParser()
    a.add_argument("audio")
    a.add_argument("uscita")
    a.add_argument("--modello", required=True)
    a.add_argument("--dispositivo", required=True)
    a.add_argument("--calcolo", required=True)
    a.add_argument("--lingua", required=True)
    args = a.parse_args()

    t0 = time.time()
    print(f"Carico il modello {args.modello} ({args.dispositivo}). La prima volta puo' scaricarlo (circa 1,5 GB).", flush=True)
    modello = WhisperModel(args.modello, device=args.dispositivo, compute_type=args.calcolo)
    print(f"Modello pronto in {round(time.time() - t0, 1)} s. Trascrivo...", flush=True)

    t1 = time.time()
    segmenti_it, info = modello.transcribe(
        args.audio,
        language=args.lingua,
        word_timestamps=True,
        vad_filter=True,
        beam_size=5,
    )
    durata = info.duration
    segmenti = []
    ultimo = -1
    for i, s in enumerate(segmenti_it):
        parole = [
            {"p": w.word.strip(), "inizio": round(w.start, 3), "fine": round(w.end, 3), "prob": round(w.probability, 3)}
            for w in (s.words or [])
        ]
        segmenti.append({"id": i, "inizio": round(s.start, 3), "fine": round(s.end, 3), "testo": s.text.strip(), "parole": parole})
        perc = int(min(s.end, durata) / durata * 100) if durata else 0
        if perc != ultimo:
            print(f"  {perc}%", flush=True)
            ultimo = perc

    risultato = {
        "lingua": args.lingua,
        "modello": args.modello,
        "dispositivo": args.dispositivo,
        "durata": round(durata, 3),
        "segmenti": segmenti,
    }
    with open(args.uscita, "w", encoding="utf-8") as f:
        json.dump(risultato, f, ensure_ascii=False, indent=1)
    print(f"Trascrizione finita in {round(time.time() - t1, 1)} s.", flush=True)


main()
