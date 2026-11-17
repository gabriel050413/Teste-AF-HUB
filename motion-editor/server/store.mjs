// Loja de pontos: o que se compra com pontos (cosméticos, impulsos, pacotes). Preços em pontos.
export const DAY = 24 * 3600 * 1000;

export const STORE = [
  { id: 'boost_post', name: 'Impulsionar post', icon: '🚀', desc: 'Seu post sobe para o topo do feed por 24 horas.', price: 30, kind: 'target', target: 'post' },
  { id: 'pin_post', name: 'Fixar post no perfil', icon: '📌', desc: 'Mantém um post fixo no começo do seu perfil.', price: 20, kind: 'target', target: 'post' },
  { id: 'feature_listing', name: 'Preset em destaque', icon: '⭐', desc: 'Seu preset aparece em “Destaque de hoje” por 24 horas.', price: 50, kind: 'target', target: 'listing' },
  { id: 'badge_verified', name: 'Selo Verificado', icon: '✔️', desc: 'Selo azul de editor verificado ao lado do seu nome.', price: 80, kind: 'cosmetic', slot: 'badge', value: 'verified' },
  { id: 'ai_pack_5', name: 'Pacote IA (5 interfaces)', icon: '🧠', desc: 'Cinco gerações da IA de interfaces por menos pontos (usa o pacote antes dos pontos).', price: 100, kind: 'pack', item: 'ai_use', qty: 5 },
  { id: 'cloud_slot_3', name: '+3 vagas de backup na nuvem', icon: '☁️', desc: 'Guarde mais projetos na nuvem e abra em qualquer aparelho.', price: 60, kind: 'pack', item: 'cloud_slot', qty: 3 },
  { id: 'badge_fire', name: 'Selo Fogo', icon: '🔥', desc: 'Selo ao lado do seu nome em todo o app.', price: 120, kind: 'cosmetic', slot: 'badge', value: 'fire' },
  { id: 'badge_gold', name: 'Selo Ouro', icon: '🏆', desc: 'Selo dourado ao lado do seu nome.', price: 200, kind: 'cosmetic', slot: 'badge', value: 'gold' },
  { id: 'badge_diamond', name: 'Selo Diamante', icon: '💎', desc: 'O selo mais raro do MotionFrame.', price: 500, kind: 'cosmetic', slot: 'badge', value: 'diamond' },
  { id: 'frame_neon', name: 'Moldura Neon', icon: '🟢', desc: 'Moldura neon animada na sua foto.', price: 150, kind: 'cosmetic', slot: 'frame', value: 'neon' },
  { id: 'frame_glitch', name: 'Moldura Glitch', icon: '📺', desc: 'Moldura glitch RGB na sua foto.', price: 180, kind: 'cosmetic', slot: 'frame', value: 'glitch' },
];
export const STORE_BY_ID = new Map(STORE.map((s) => [s.id, s]));

export const FREE_CLOUD_SLOTS = 2;
export const DAILY_BONUS = [10, 10, 15, 15, 20, 25, 40]; // bônus por dia seguido (o 7º dia paga mais)
