// Controles de expressão do After Effects (Expression Controls): não mudam a imagem — guardam um valor animável que
// as expressões leem com effect("Slider Control")("Slider"). Base de rigs de mograph (amplitude do bounce, atraso,
// contador, cor do tema…).
import { num, ang, bool, col, pos } from './common.js';

export default [
  { type: 'sliderControl', label: 'Slider Control', category: 'Controles de expressão', control: true, render: (src) => src, params: [num('Slider', 'Slider', 0, -1000, 1000, 0.01)] },
  { type: 'angleControl', label: 'Angle Control', category: 'Controles de expressão', control: true, render: (src) => src, params: [ang('Angle', 'Angle', 0)] },
  { type: 'checkboxControl', label: 'Checkbox Control', category: 'Controles de expressão', control: true, render: (src) => src, params: [bool('Checkbox', 'Checkbox', false)] },
  { type: 'colorControl', label: 'Color Control', category: 'Controles de expressão', control: true, render: (src) => src, params: [col('Color', 'Color', [1, 0, 0, 1])] },
  { type: 'pointControl', label: 'Point Control', category: 'Controles de expressão', control: true, render: (src) => src, params: [pos('Point', 'Point', [0.5, 0.5])] },
];
