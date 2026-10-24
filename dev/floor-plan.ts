/** A floor plan as an SVG attachment for the seed (Thomas Lang's new house), for image previews. */
const room = (x: number, y: number, w: number, h: number, name: string, area: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fafaf9" stroke="#27272a" stroke-width="6"/>` +
  `<text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" font-size="22" font-weight="600">${name}</text>` +
  `<text x="${x + w / 2}" y="${y + h / 2 + 28}" text-anchor="middle" font-size="17" fill="#71717a">${area}</text>`;

export const FLOOR_PLAN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560" font-family="Helvetica, Arial, sans-serif" fill="#18181b">
<rect width="800" height="560" fill="#ffffff"/>
<text x="40" y="44" font-size="26" font-weight="700">Neubau Lang · Erdgeschoss</text>
<text x="760" y="44" font-size="18" text-anchor="end" fill="#71717a">M 1:100</text>
${room(40, 70, 440, 300, "Wohnen / Essen", "42,6 m²")}
${room(480, 70, 280, 180, "Küche", "14,8 m²")}
${room(480, 250, 160, 120, "WC", "3,9 m²")}
${room(640, 250, 120, 120, "Technik", "6,2 m²")}
${room(40, 370, 300, 150, "Büro", "11,4 m²")}
${room(340, 370, 420, 150, "Flur / Garderobe", "13,1 m²")}
<rect x="655" y="285" width="90" height="56" rx="6" fill="#dbeafe" stroke="#2563eb" stroke-width="3"/>
<text x="700" y="318" text-anchor="middle" font-size="14" fill="#1d4ed8">Wärmepumpe?</text>
</svg>
`;
