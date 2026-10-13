import sharp from "sharp";

const DIGITS = "0123456789";

export function genCode(len = 6): string {
  let out = "";

  for (let i = 0; i < len; i++) {
    out += DIGITS[Math.floor(Math.random() * DIGITS.length)];
  }

  return out;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

export async function renderCaptcha(
  code: string,
  opts: {
    width?: number;
    height?: number;
  } = {}
): Promise<Buffer> {
  const w = opts.width ?? 388;
  const h = opts.height ?? 200;
  const background = `
    <defs>

      <linearGradient
        id="bg"
        x1="0"
        y1="0"
        x2="1"
        y2="1"
      >
        <stop offset="0%" stop-color="#183679"/>
        <stop offset="22%" stop-color="#0d214e"/>
        <stop offset="58%" stop-color="#091630"/>
        <stop offset="100%" stop-color="#080e1e"/>
      </linearGradient>

      <radialGradient
        id="light"
        cx="8%"
        cy="0%"
        r="95%"
      >
        <stop
          offset="0%"
          stop-color="#3265d0"
          stop-opacity="0.34"
        />

        <stop
          offset="28%"
          stop-color="#183a83"
          stop-opacity="0.20"
        />

        <stop
          offset="70%"
          stop-color="#0c1835"
          stop-opacity="0.05"
        />

        <stop
          offset="100%"
          stop-color="#080e1e"
          stop-opacity="0"
        />
      </radialGradient>

      <radialGradient
        id="lightRight"
        cx="100%"
        cy="0%"
        r="75%"
      >
        <stop
          offset="0%"
          stop-color="#284d9b"
          stop-opacity="0.16"
        />

        <stop
          offset="65%"
          stop-color="#0c1835"
          stop-opacity="0"
        />
      </radialGradient>

      <filter id="blur">
        <feGaussianBlur stdDeviation="0.7"/>
      </filter>

    </defs>

    <rect
      x="0"
      y="0"
      width="${w}"
      height="${h}"
      fill="url(#bg)"
    />

    <rect
      x="0"
      y="0"
      width="${w}"
      height="${h}"
      fill="url(#light)"
    />

    <rect
      x="0"
      y="0"
      width="${w}"
      height="${h}"
      fill="url(#lightRight)"
    />
  `;
  let backgroundCurves = "";

  for (let i = 0; i < 13; i++) {
    const y = -15 + i * 18;

    const a = rand(20, 60);
    const b = rand(35, 85);
    const c = rand(25, 65);

    backgroundCurves += `
      <path
        d="
          M -25 ${y}

          C 20 ${y - a},
            65 ${y + a},
            118 ${y + rand(-12, 12)}

          C 170 ${y + rand(-35, 35)},
            205 ${y + rand(-35, 35)},
            258 ${y + rand(-20, 25)}

          C 312 ${y + rand(-40, 40)},
            348 ${y + b},
            418 ${y + rand(-20, 20)}
        "
        fill="none"
        stroke="#28467e"
        stroke-width="${rand(0.45, 1.1).toFixed(2)}"
        stroke-opacity="${rand(0.10, 0.25).toFixed(2)}"
      />
    `;
  }

  for (let i = 0; i < 5; i++) {
    const x = rand(110, 360);

    backgroundCurves += `
      <path
        d="
          M ${x} -20

          C ${x - 55} 35,
            ${x + 65} 74,
            ${x - 25} 115

          C ${x - 70} 147,
            ${x + 55} 178,
            ${x + 15} 220
        "
        fill="none"
        stroke="#1f396a"
        stroke-width="${rand(0.4, 0.9).toFixed(2)}"
        stroke-opacity="${rand(0.08, 0.18).toFixed(2)}"
      />
    `;
  }
  let blueShapes = "";

  const bars = [
    { x: -36, y: 24, w: 82, h: 16, r: -7 },
    { x: -42, y: 54, w: 112, h: 17, r: -7 },
    { x: -38, y: 86, w: 99, h: 17, r: -7 },
    { x: -40, y: 117, w: 91, h: 17, r: -7 },
    { x: -47, y: 147, w: 82, h: 17, r: -7 },
  ];

  for (const bar of bars) {
    blueShapes += `
      <rect
        x="${bar.x}"
        y="${bar.y}"
        width="${bar.w}"
        height="${bar.h}"
        rx="2"
        fill="#2b63ff"
        transform="
          rotate(
            ${bar.r}
            ${bar.x + bar.w / 2}
            ${bar.y + bar.h / 2}
          )
        "
      />
    `;
  }

  blueShapes += `
    <path
      d="
        M 0 135
        L 45 110
        L 56 126
        L 0 161
        Z
      "
      fill="#1f52f3"
    />

    <path
      d="
        M 0 153
        L 57 119
        L 50 138
        L 0 175
        Z
      "
      fill="#245cff"
    />

    <path
      d="
        M 0 170
        L 42 143
        L 54 152
        L 0 190
        Z
      "
      fill="#1c50f3"
    />
  `;

  blueShapes += `
    <path
      d="
        M 0 77
        L 48 69
        L 61 75
        L 0 91
        Z
      "
      fill="#2f69ff"
      opacity="0.9"
    />
  `;
  const count = code.length;

  const positions: {
    x: number;
    y: number;
    size: number;
    rotate: number;
    sx: number;
    sy: number;
  }[] = [];

  for (let i = 0; i < count; i++) {
    const baseX =
      24 +
      (i / Math.max(1, count - 1)) * (w - 46);

    let x = baseX;

    x += rand(-18, 18);

    const y = rand(82, 135);

    const finalY =
      Math.random() < 0.30
        ? rand(125, 170)
        : y;

    positions.push({
      x,
      y: finalY,
      size: randInt(65, 88),
      rotate: rand(-18, 18),
      sx: rand(0.78, 0.94),
      sy: rand(0.93, 1.10),
    });
  }

  let digitsSvg = "";

  for (let i = 0; i < count; i++) {
    const digit = code[i];
    const p = positions[i]!;

    digitsSvg += `
      <g
        transform="
          translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})
          rotate(${p.rotate.toFixed(2)})
          scale(${p.sx.toFixed(3)} ${p.sy.toFixed(3)})
        "
      >

        <text
          x="0"
          y="0"
          text-anchor="middle"
          font-family="Arial, Helvetica, sans-serif"
          font-size="${p.size}px"
          font-weight="400"
          fill="#ffffff"
        >
          ${digit}
        </text>

      </g>
    `;
  }
  let interference = "";

  for (let i = 0; i < 4; i++) {
    const y = 72 + i * 11;

    const p1 = rand(15, 55);
    const p2 = rand(75, 125);
    const p3 = rand(145, 195);
    const p4 = rand(210, 255);
    const p5 = rand(275, 325);
    const p6 = rand(345, 395);

    interference += `
      <path
        d="
          M -20 ${y}

          C ${p1} ${y + rand(-12, 12)},
            ${p2} ${y + rand(-13, 13)},
            ${p3} ${y + rand(-10, 10)}

          C ${p4} ${y + rand(-24, 24)},
            ${p5} ${y + rand(-20, 20)},
            ${p6} ${y + rand(-14, 14)}

          C ${w + 22} ${y + rand(-16, 16)},
            ${w + 35} ${y + rand(-5, 5)},
            ${w + 45} ${y + rand(-15, 15)}
        "
        fill="none"
        stroke="#ffffff"
        stroke-width="${i === 1 ? 1.8 : rand(0.8, 1.35).toFixed(2)}"
        stroke-opacity="${i === 1 ? 0.92 : rand(0.55, 0.78).toFixed(2)}"
        stroke-linecap="round"
      />
    `;
  }

  interference += `
    <path
      d="
        M -15 96

        C 28 92,
          55 102,
          84 94

        C 112 87,
          139 91,
          165 100

        C 191 109,
          203 130,
          228 134

        C 251 138,
          270 126,
          291 119

        C 318 110,
          338 120,
          360 113

        C 375 108,
          386 101,
          404 101
      "
      fill="none"
      stroke="#ffffff"
      stroke-width="1.8"
      stroke-opacity="0.95"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  `;

  interference += `
    <path
      d="
        M 125 73

        C 168 62,
          198 71,
          224 79

        C 253 88,
          282 79,
          309 89

        C 335 99,
          362 87,
          398 92
      "
      fill="none"
      stroke="#ffffff"
      stroke-width="1.05"
      stroke-opacity="0.78"
      stroke-linecap="round"
    />
  `;
  let dots = "";

  for (let i = 0; i < 18; i++) {
    const cx = rand(0, w);
    const cy = rand(0, h);
    const r = rand(0.25, 0.7);

    dots += `
      <circle
        cx="${cx.toFixed(2)}"
        cy="${cy.toFixed(2)}"
        r="${r.toFixed(2)}"
        fill="#5f78ad"
        fill-opacity="${rand(0.05, 0.12).toFixed(2)}"
      />
    `;
  }
  const svg = `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${w}"
      height="${h}"
      viewBox="0 0 ${w} ${h}"
    >

      ${background}

      <g filter="url(#blur)">
        ${backgroundCurves}
      </g>

      <g>
        ${blueShapes}
      </g>

      <g>
        ${dots}
      </g>

      <g>
        ${digitsSvg}
      </g>

      <g>
        ${interference}
      </g>

    </svg>
  `;

  return sharp(Buffer.from(svg))
    .png()
    .toBuffer();
}
