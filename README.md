# Denture Maze

Un piccolo arcade in JavaScript puro: una dentiera attraversa un labirinto in bianco e nero, ripulisce tutti i corridoi e prova a non farsi raggiungere da uno spazzolino fin troppo zelante.

Il progetto è volutamente semplice da aprire e modificare: non usa framework, build tool o dipendenze esterne.

## Come si gioca

1. Raccogli tutte le palline del labirinto.
2. Quando i corridoi sono puliti, si apre la stanza centrale.
3. Prendi il sigillo al centro.
4. Parte la trasformazione con la dentiera che ruota da sinistra a destra e ritorno.
5. Raggiungi la porta d'uscita prima che lo spazzolino ti prenda.

### Comandi

- **Frecce** oppure **WASD** per muoversi
- **P** per mettere in pausa
- **Spazio** per saltare la trasformazione speciale
- **Prova trasformazione** per vedere subito l'animazione speciale
- **Audio: ON/OFF** per attivare o disattivare gli effetti sonori

Su telefono compaiono automaticamente i controlli touch.

## Avvio

Puoi aprire direttamente `index.html`.

Per evitare eventuali limitazioni del browser sui file locali, puoi anche avviare un server nella cartella del progetto:

```bash
python -m http.server 8080
```

Poi apri:

```text
http://localhost:8080
```

## Struttura

```text
denture-maze/
├── assets/
│   ├── favicon.svg
│   ├── mega_denture_user_rotation.png
│   └── player_bite_spritesheet_clean_bw.png
├── game.js
├── index.html
├── style.css
├── CHANGELOG.md
└── README.md
```

## Dettagli della versione attuale

- labirinto casuale ma percorribile;
- palline distribuite su tutti i corridoi;
- stanza centrale sempre quadrata e centrata;
- spazzolino nemico con inseguimento semplice;
- particelle alla raccolta delle palline;
- record salvato nel browser;
- effetti sonori sintetizzati via Web Audio, senza file audio esterni;
- spritesheet principale della dentiera;
- spritesheet speciale da **18 frame**, costruita sull'immagine approvata, con rotazione avanti e indietro;
- un solo serpente, sulla parte superiore della dentiera.

## Personalizzazione rapida

Le impostazioni principali sono all'inizio di `game.js`, dentro `CONFIG`:

```js
const CONFIG = {
  columns: 25,
  rows: 19,
  tileSize: 40,
  playerSpeed: 7.0,
  enemySpeed: 5.05,
};
```

Per cambiare le spritesheet basta aggiornare i percorsi e le dimensioni dei frame nelle sezioni `playerSprite` e `megaSprite`.

## Nota sugli asset

La dentiera e la trasformazione sono basate sulle immagini fornite e approvate per questo progetto. La nuova animazione speciale conserva le diverse prospettive della dentiera originale e le riproduce in sequenza avanti/indietro per rendere evidente il movimento tridimensionale.
