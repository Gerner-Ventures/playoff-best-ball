// Placeholder branding — real icon design is an open spec item.
// Update the SVG below and re-run this script when final assets are available.
import sharp from "sharp";

const svg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
     <rect width="512" height="512" rx="96" fill="#15803d"/>
     <text x="256" y="330" font-family="Arial, Helvetica, sans-serif" font-size="220"
           font-weight="bold" fill="white" text-anchor="middle">PB</text>
   </svg>`,
);

for (const size of [192, 512]) {
  await sharp(svg).resize(size, size).png().toFile(`public/icon-${size}.png`);
  console.log(`wrote public/icon-${size}.png`);
}
