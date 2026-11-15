// Efeitos de ÁUDIO (como os do After Effects): não mexem na imagem — o reprodutor e a exportação montam a cadeia de
// filtros do Web Audio a partir deles (js/audio.js). Vieram dos presets OmarFX (End Muffled Audio, Reverb).
import { num } from './common.js';

export default [
  {
    type: 'audBassTreble', label: 'Graves e agudos (Bass & Treble)', category: 'Áudio', plugin: 'Bass & Treble (After Effects)', audio: true,
    description: 'Realça ou corta os graves e os agudos do som da camada. Agudos bem negativos = som abafado (“muffled”).',
    params: [num('bass', 'Bass (graves)', 0, -100, 100), num('treble', 'Treble (agudos)', 0, -100, 100)],
    render: (src) => src,
  },
  {
    type: 'audReverb', label: 'Reverb (eco de sala)', category: 'Áudio', plugin: 'Reverb (After Effects)', audio: true,
    description: 'Reverberação: tempo, difusão, decaimento, brilho e mistura seco/molhado, como no AE.',
    params: [num('time', 'Reverb Time (ms)', 100, 1, 3000), num('diffusion', 'Diffusion %', 75, 0, 100), num('decay', 'Decay %', 25, 0, 100),
      num('brightness', 'Brightness %', 10, 0, 100), num('dry', 'Dry Out %', 90, 0, 100), num('wet', 'Wet Out %', 10, 0, 100)],
    render: (src) => src,
  },
];
